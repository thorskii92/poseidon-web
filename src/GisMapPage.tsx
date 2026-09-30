import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LayerSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Protocol } from "pmtiles";
import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
import { apiGet, apiPut } from "./api";
import { useAuth } from "./AuthContext";
import {
  BAND_ORDER, BGY_LINE, COLOR_BY, MASK_FILL, MUNI_LINE, NO_FILTERS, SAVED_FILTERS_KEY, activeFilterCount, legendOf, matches, toCsv,
  type BasemapStatus, type ColorBy, type Filters, type MapAccount, type MapArea,
} from "./gisShared";

/**
 * GIS Map — every account's meter on a street map of the LGU, coloured by
 * status, classification, balance, consumption or reading, with filters.
 *
 * The street map is the offline copy the server keeps (poseidon-api
 * scripts/download-basemap.mjs → maps/); until it is downloaded the page
 * falls back to the online OpenStreetMap tiles. Satellite is online only.
 * Accounts get a location by being placed on the map here (the reader app
 * will fill them in from the phone's GPS later). The municipal and barangay
 * boundaries are PSA's, downloaded with the street map.
 */

type Settings = { area: MapArea; basemap: BasemapStatus };
type Base = "street" | "satellite";

let pmtilesReady = false;
function ensurePmtiles() {
  if (pmtilesReady) return;
  // MapLibre 6 looks for its worker beside its own file, which isn't there
  // once Vite has bundled the app — the map then stays grey ("Worker failed
  // to load"). Vite bundles the worker separately and says where it is.
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  pmtilesReady = true;
}

const ONLINE_GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

function buildStyle(b: BasemapStatus): StyleSpecification {
  const origin = window.location.origin;
  const offline = b.installed;
  const sources: StyleSpecification["sources"] = {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256, maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
  };
  let base: LayerSpecification[];
  if (offline) {
    sources.protomaps = {
      type: "vector", url: `pmtiles://${origin}/map-data/basemap.pmtiles`,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
    base = protomapsLayers("protomaps", namedFlavor("light"), { lang: "en" }) as LayerSpecification[];
  } else {
    sources.osm = {
      type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19,
      attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
    base = [{ id: "osm", type: "raster", source: "osm" }];
  }
  return {
    version: 8,
    glyphs: offline && b.fonts ? `${origin}/map-data/fonts/{fontstack}/{range}.pbf` : ONLINE_GLYPHS,
    ...(offline && b.sprites ? { sprite: `${origin}/map-data/sprites/v4/light` } : {}),
    sources,
    layers: [...base, { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } }],
  };
}

function loadSaved(): Record<string, Filters> {
  try {
    return JSON.parse(localStorage.getItem(SAVED_FILTERS_KEY) ?? "{}") as Record<string, Filters>;
  } catch {
    return {};
  }
}

export default function GisMapPage() {
  const { data: settings, error } = useQuery<Settings>({ queryKey: ["gis", "settings"], queryFn: () => apiGet("/api/gis/settings") });
  if (error) return <div className="settings-page"><p className="form-error">{(error as Error).message}</p></div>;
  if (!settings) return <div className="settings-page"><p className="count">Loading the map…</p></div>;
  return <GisMap settings={settings} />;
}

function GisMap({ settings }: { settings: Settings }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const holder = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [base, setBase] = useState<Base>("street");
  const [showAccounts, setShowAccounts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showMuni, setShowMuni] = useState(true);
  const [fadeOutside, setFadeOutside] = useState(true);
  const [showBarangays, setShowBarangays] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [saved, setSaved] = useState<Record<string, Filters>>(loadSaved);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [placing, setPlacing] = useState<MapAccount | null>(null);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  const { data } = useQuery<{ rows: MapAccount[]; latestPeriod: number }>({
    queryKey: ["gis", "accounts"],
    queryFn: () => apiGet("/api/gis/accounts"),
  });
  const all = useMemo(() => data?.rows ?? [], [data]);

  const classOrder = useMemo(() => [...new Set(all.map((a) => a.classId))].sort((x, y) => x - y), [all]);
  const matching = useMemo(() => all.filter((a) => matches(a, filters)), [all, filters]);
  const located = useMemo(() => matching.filter((a) => a.lat != null && a.lng != null), [matching]);
  const unlocated = useMemo(() => matching.filter((a) => a.lat == null || a.lng == null), [matching]);
  const selected = all.find((a) => a.id === selectedId) ?? null;

  const legend = useMemo(() => {
    const m = new Map<string, { label: string; color: string; count: number }>();
    for (const a of located) {
      const l = legendOf(a, colorBy, classOrder);
      const e = m.get(l.key);
      if (e) e.count++;
      else m.set(l.key, { label: l.label, color: l.color, count: 1 });
    }
    const items = [...m.entries()].map(([key, v]) => ({ key, ...v }));
    return colorBy === "status" || colorBy === "classification"
      ? items.sort((x, y) => y.count - x.count)
      : items.sort((x, y) => (BAND_ORDER[x.key] ?? 99) - (BAND_ORDER[y.key] ?? 99));
  }, [located, colorBy, classOrder]);

  // Options that depend on what else is chosen.
  const barangays = useMemo(() => [...new Map(all.map((a) => [a.barangayId, a.barangay])).entries()].filter(([id]) => id).sort((x, y) => x[1].localeCompare(y[1])), [all]);
  const clusters = useMemo(
    () => [...new Map(all.filter((a) => a.barangayId === filters.barangayId).map((a) => [a.clusterId, a.cluster])).entries()].filter(([id]) => id).sort((x, y) => x[1].localeCompare(y[1])),
    [all, filters.barangayId],
  );
  const standpipes = useMemo(
    () => [...new Set(all.filter((a) => a.barangayId === filters.barangayId && (!filters.clusterId || a.clusterId === filters.clusterId)).map((a) => a.standpipe.trim()).filter(Boolean))].sort(),
    [all, filters.barangayId, filters.clusterId],
  );
  const classes = useMemo(() => [...new Map(all.map((a) => [a.classId, a.classification || "No classification"])).entries()].sort((x, y) => x[0] - y[0]), [all]);
  const statuses = useMemo(() => [...new Map(all.map((a) => [a.statusId, a.status || "No status"])).entries()].sort((x, y) => x[0] - y[0]), [all]);

  /* ---- The map itself: created once, then kept in step with state. ---- */

  // Handlers registered once read the latest state through these.
  const placingRef = useRef<MapAccount | null>(null);
  const saveRef = useRef<(a: MapAccount, lng: number, lat: number) => void>(() => {});
  useEffect(() => {
    placingRef.current = placing;
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = placing ? "crosshair" : "";
  }, [placing]);
  useEffect(() => {
    saveRef.current = (a, lng, lat) => {
      apiPut(`/api/gis/accounts/${a.id}/location`, { lat, lng })
        .then(() => {
          setNotice(`${a.accountNo} placed on the map.`);
          setPlacing(null);
          setSelectedId(a.id);
          qc.invalidateQueries({ queryKey: ["gis", "accounts"] });
        })
        .catch((e: Error) => setErr(e.message));
    };
  }, [qc]);

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    ensurePmtiles();
    const a = settings.area;
    const map = new maplibregl.Map({
      container: holder.current,
      style: buildStyle(settings.basemap),
      center: [a.centerLng, a.centerLat],
      zoom: a.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

    map.on("load", () => {
      if (settings.basemap.boundaries) {
        // Absolute: MapLibre fetches it from a worker, which can't resolve a relative URL.
        map.addSource("boundaries", { type: "geojson", data: `${window.location.origin}/map-data/boundaries.geojson` });
        map.addLayer({
          id: "muni-mask", type: "fill", source: "boundaries", filter: ["==", ["get", "kind"], "mask"],
          paint: { "fill-color": MASK_FILL.color, "fill-opacity": MASK_FILL.opacity },
        });
        map.addLayer({
          id: "bgy-line", type: "line", source: "boundaries", filter: ["==", ["get", "kind"], "barangay"],
          paint: { "line-color": BGY_LINE.color, "line-width": BGY_LINE.width, "line-dasharray": BGY_LINE.dash, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "muni-casing", type: "line", source: "boundaries", filter: ["==", ["get", "kind"], "municipality"],
          paint: { "line-color": "#fff", "line-width": MUNI_LINE.width + 3, "line-opacity": 0.7 },
        });
        map.addLayer({
          id: "muni-line", type: "line", source: "boundaries", filter: ["==", ["get", "kind"], "municipality"],
          paint: { "line-color": MUNI_LINE.color, "line-width": MUNI_LINE.width, "line-dasharray": MUNI_LINE.dash },
        });
        map.addLayer({
          id: "bgy-labels", type: "symbol", source: "boundaries", minzoom: 9, filter: ["==", ["get", "kind"], "label"],
          layout: {
            "text-field": ["upcase", ["get", "name"]], "text-font": ["Noto Sans Medium"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 14],
            "text-letter-spacing": 0.08, "text-max-width": 8,
          },
          paint: { "text-color": BGY_LINE.color, "text-halo-color": "#fff", "text-halo-width": 1.6 },
        });
      }
      map.addSource("accounts", {
        type: "geojson", data: { type: "FeatureCollection", features: [] },
        cluster: true, clusterMaxZoom: 15, clusterRadius: 40,
      });
      map.addLayer({
        id: "acct-clusters", type: "circle", source: "accounts", filter: ["has", "point_count"],
        paint: {
          "circle-color": "#1b4f8a", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 23, 500, 28],
        },
      });
      map.addLayer({
        id: "acct-cluster-count", type: "symbol", source: "accounts", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Medium"], "text-size": 12 },
        paint: { "text-color": "#fff" },
      });
      map.addLayer({
        id: "acct-points", type: "circle", source: "accounts", filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 6, 18, 10],
        },
      });
      map.addLayer({
        id: "acct-selected", type: "circle", source: "accounts", filter: ["==", ["get", "id"], -1],
        paint: { "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111", "circle-stroke-width": 3, "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 18, 15] },
      });
      map.addLayer({
        id: "acct-labels", type: "symbol", source: "accounts", minzoom: 16, filter: ["!", ["has", "point_count"]],
        layout: {
          "text-field": ["get", "accountNo"], "text-font": ["Noto Sans Regular"], "text-size": 11,
          "text-offset": [0, 1.2], "text-anchor": "top", "text-optional": true,
        },
        paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.5 },
      });

      map.on("click", "acct-clusters", async (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.cluster_id;
        if (f?.geometry.type !== "Point" || id == null) return;
        const zoom = await (map.getSource("accounts") as GeoJSONSource).getClusterExpansionZoom(id);
        map.easeTo({ center: f.geometry.coordinates as [number, number], zoom });
      });
      map.on("click", "acct-points", (e) => {
        if (placingRef.current) return;
        const id = Number(e.features?.[0]?.properties?.id);
        if (id) setSelectedId(id);
      });
      map.on("click", (e) => {
        const p = placingRef.current;
        if (p) saveRef.current(p, Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6);
      });
      for (const layer of ["acct-clusters", "acct-points"]) {
        map.on("mouseenter", layer, () => { if (!placingRef.current) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = placingRef.current ? "crosshair" : ""; });
      }
      setReady(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [settings]);

  // Pins, coloured by the chosen scheme.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("accounts") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: located.map((a) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [a.lng!, a.lat!] },
        properties: { id: a.id, accountNo: a.accountNo, color: legendOf(a, colorBy, classOrder).color },
      })),
    });
  }, [ready, located, colorBy, classOrder]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty("satellite", "visibility", vis(base === "satellite"));
    for (const id of ["acct-clusters", "acct-cluster-count", "acct-points", "acct-selected"]) map.setLayoutProperty(id, "visibility", vis(showAccounts));
    map.setLayoutProperty("acct-labels", "visibility", vis(showAccounts && showLabels));
    if (map.getLayer("muni-line")) {
      for (const id of ["muni-casing", "muni-line"]) map.setLayoutProperty(id, "visibility", vis(showMuni));
      map.setLayoutProperty("muni-mask", "visibility", vis(fadeOutside));
      for (const id of ["bgy-line", "bgy-labels"]) map.setLayoutProperty(id, "visibility", vis(showBarangays));
    }
    map.setFilter("acct-selected", ["==", ["get", "id"], selectedId ?? -1]);
  }, [ready, base, showAccounts, showLabels, showMuni, fadeOutside, showBarangays, selectedId]);

  /* ---- Actions ---- */

  function zoomToShown() {
    const map = mapRef.current;
    if (!map || !located.length) return;
    const b = new maplibregl.LngLatBounds();
    for (const a of located) b.extend([a.lng!, a.lat!]);
    map.fitBounds(b, { padding: 60, maxZoom: 17 });
  }

  function flyTo(a: MapAccount) {
    setSelectedId(a.id);
    if (a.lat != null && a.lng != null) mapRef.current?.flyTo({ center: [a.lng, a.lat], zoom: Math.max(mapRef.current.getZoom(), 17) });
  }

  function exportCsv() {
    const blob = new Blob(["﻿" + toCsv(matching)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `map-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function storeSaved(next: Record<string, Filters>) {
    setSaved(next);
    try {
      localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    } catch {
      /* private window: kept for this visit only */
    }
  }

  async function removePin(a: MapAccount) {
    if (!window.confirm(`Remove ${a.accountNo}'s pin from the map?`)) return;
    try {
      await apiPut(`/api/gis/accounts/${a.id}/location`, { lat: null, lng: null });
      setNotice(`${a.accountNo}'s pin removed.`);
      qc.invalidateQueries({ queryKey: ["gis", "accounts"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function saveHomeView() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const b = map.getBounds();
    const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
    try {
      await apiPut("/api/gis/settings", {
        centerLat: r6(c.lat), centerLng: r6(c.lng), zoom: Math.round(map.getZoom() * 10) / 10,
        minLat: r6(b.getSouth()), minLng: r6(b.getWest()), maxLat: r6(b.getNorth()), maxLng: r6(b.getEast()),
      });
      setNotice("Saved: the map now opens here, and this is the area the street map download covers.");
      qc.invalidateQueries({ queryKey: ["gis", "settings"] });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const toggle = (k: "classIds" | "statusIds", id: number) =>
    setFilters((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));
  const nFilters = activeFilterCount(filters);
  const bm = settings.basemap;
  const area = settings.area;
  const bboxArg = `${area.minLng},${area.minLat},${area.maxLng},${area.maxLat}`;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 32px)", gap: 12, padding: "0 4px" }}>
      {/* ---------- Side panel ---------- */}
      <aside style={{ width: 320, flex: "0 0 320px", overflowY: "auto", paddingRight: 4 }}>
        <h1 style={{ margin: "4px 0 2px" }}>GIS Map</h1>
        <p className="count" style={{ marginTop: 0 }}>
          {located.length} on the map · {matching.length} of {all.length} match{nFilters ? ` (${nFilters} filter${nFilters > 1 ? "s" : ""})` : ""} · {unlocated.length} without a location
        </p>

        <label className="field-input">
          <span>Find an account</span>
          <input value={filters.search} onChange={(e) => set("search", e.target.value)} placeholder="Account no., name, meter no., street" />
        </label>
        {filters.search.trim() && matching.length > 0 && matching.length <= 8 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 8px" }}>
            {matching.map((a) => (
              <li key={a.id}>
                <button className="clear-filters" style={{ textAlign: "left", width: "100%" }} onClick={() => flyTo(a)}>
                  {a.accountNo} — {a.name}{a.lat == null ? " (no location)" : ""}
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="field-input">
          <span>Color by</span>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            {COLOR_BY.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>

        <fieldset style={{ border: "1px solid var(--border, #ddd)", borderRadius: 8, padding: "6px 10px", margin: "10px 0" }}>
          <legend className="count">Layers</legend>
          <label style={{ display: "block" }}><input type="radio" checked={base === "street"} onChange={() => setBase("street")} /> Street map{bm.installed ? " (offline)" : " (online)"}</label>
          <label style={{ display: "block" }}><input type="radio" checked={base === "satellite"} onChange={() => setBase("satellite")} /> Satellite (needs internet)</label>
          <label style={{ display: "block", marginTop: 6 }}><input type="checkbox" checked={showAccounts} onChange={(e) => setShowAccounts(e.target.checked)} /> Accounts</label>
          <label style={{ display: "block" }}><input type="checkbox" checked={showLabels} disabled={!showAccounts} onChange={(e) => setShowLabels(e.target.checked)} /> Account no. labels (zoomed in)</label>
          {bm.boundaries ? (
            <>
              <label style={{ display: "block", marginTop: 6 }}><input type="checkbox" checked={showMuni} onChange={(e) => setShowMuni(e.target.checked)} /> Municipal boundary</label>
              <label style={{ display: "block" }}><input type="checkbox" checked={fadeOutside} onChange={(e) => setFadeOutside(e.target.checked)} /> Fade outside the municipality</label>
              <label style={{ display: "block" }}><input type="checkbox" checked={showBarangays} onChange={(e) => setShowBarangays(e.target.checked)} /> Barangay boundaries & names</label>
            </>
          ) : (
            <div className="count" style={{ marginTop: 6 }}>Boundaries: not downloaded yet</div>
          )}
        </fieldset>

        <details open={nFilters > 0}>
          <summary style={{ cursor: "pointer", fontWeight: 600, margin: "6px 0" }}>Filters{nFilters ? ` (${nFilters})` : ""}</summary>
          <label className="field-input">
            <span>Barangay</span>
            <select value={filters.barangayId} onChange={(e) => setFilters((f) => ({ ...f, barangayId: Number(e.target.value), clusterId: 0, standpipe: "" }))}>
              <option value={0}>All</option>
              {barangays.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
          {filters.barangayId > 0 && clusters.length > 0 && (
            <label className="field-input">
              <span>Cluster</span>
              <select value={filters.clusterId} onChange={(e) => setFilters((f) => ({ ...f, clusterId: Number(e.target.value), standpipe: "" }))}>
                <option value={0}>All</option>
                {clusters.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            </label>
          )}
          {filters.barangayId > 0 && standpipes.length > 0 && (
            <label className="field-input">
              <span>Stand pipe</span>
              <select value={filters.standpipe} onChange={(e) => set("standpipe", e.target.value)}>
                <option value="">All</option>
                {standpipes.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          <div className="count" style={{ marginTop: 8 }}>Classification</div>
          {classes.map(([id, n]) => (
            <label key={id} style={{ display: "block" }}><input type="checkbox" checked={filters.classIds.includes(id)} onChange={() => toggle("classIds", id)} /> {n}</label>
          ))}
          <div className="count" style={{ marginTop: 8 }}>Status</div>
          {statuses.map(([id, n]) => (
            <label key={id} style={{ display: "block" }}><input type="checkbox" checked={filters.statusIds.includes(id)} onChange={() => toggle("statusIds", id)} /> {n}</label>
          ))}
          <label className="field-input" style={{ marginTop: 8 }}>
            <span>Meter</span>
            <select value={filters.meter} onChange={(e) => set("meter", e.target.value as Filters["meter"])}>
              <option value="all">All</option><option value="with">With a meter no.</option><option value="without">No meter no.</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="field-input" style={{ flex: 1 }}>
              <span>Unpaid at least ₱</span>
              <input type="number" min={0} value={filters.minBalance} onChange={(e) => set("minBalance", e.target.value)} />
            </label>
            <label className="field-input" style={{ flex: 1 }}>
              <span>Unpaid bills at least</span>
              <input type="number" min={0} value={filters.minBills} onChange={(e) => set("minBills", e.target.value)} />
            </label>
          </div>
          <label className="field-input">
            <span>Latest billing</span>
            <select value={filters.read} onChange={(e) => set("read", e.target.value as Filters["read"])}>
              <option value="all">All</option><option value="read">Read</option><option value="notread">Not read</option>
            </select>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="field-input" style={{ flex: 1 }}>
              <span>Last consumption</span>
              <select value={filters.consumption} onChange={(e) => set("consumption", e.target.value as Filters["consumption"])}>
                <option value="all">All</option><option value="zero">Zero</option><option value="high">High</option>
              </select>
            </label>
            {filters.consumption === "high" && (
              <label className="field-input" style={{ width: 100 }}>
                <span>Over (m³)</span>
                <input type="number" min={0} value={filters.highOver} onChange={(e) => set("highOver", e.target.value)} />
              </label>
            )}
          </div>
          <div className="form-actions" style={{ marginTop: 6 }}>
            <button className="clear-filters" disabled={!nFilters} onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
            <button
              className="clear-filters"
              disabled={!nFilters}
              onClick={() => {
                const name = window.prompt("Name these filters (e.g. Disconnection – Poblacion):")?.trim();
                if (name) storeSaved({ ...saved, [name]: filters });
              }}
            >
              Save filters…
            </button>
          </div>
        </details>
        {Object.keys(saved).length > 0 && (
          <label className="field-input">
            <span>Saved filters</span>
            <select value="" onChange={(e) => { const f = saved[e.target.value]; if (f) setFilters({ ...NO_FILTERS, ...f }); }}>
              <option value="">— use saved filters —</option>
              {Object.keys(saved).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {Object.keys(saved).length > 0 && (
          <details>
            <summary className="count" style={{ cursor: "pointer" }}>Delete saved filters</summary>
            {Object.keys(saved).map((n) => (
              <button key={n} className="clear-filters" style={{ margin: 2 }} onClick={() => { const next = { ...saved }; delete next[n]; storeSaved(next); }}>✕ {n}</button>
            ))}
          </details>
        )}

        <div className="form-actions">
          <button className="clear-filters" disabled={!located.length} onClick={zoomToShown}>Zoom to shown</button>
          <button className="clear-filters" disabled={!matching.length} onClick={exportCsv}>Export list (CSV)</button>
        </div>

        {unlocated.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Without a location ({unlocated.length})</summary>
            <p className="count">Click Place, then click where the meter is on the map.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {unlocated.slice(0, 100).map((a) => (
                <li key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "3px 0", borderBottom: "1px solid var(--border, #eee)" }}>
                  <span style={{ minWidth: 0 }}>{a.accountNo}<div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div></span>
                  <button className={placing?.id === a.id ? "primary small" : "clear-filters"} onClick={() => setPlacing(placing?.id === a.id ? null : a)}>
                    {placing?.id === a.id ? "Cancel" : "Place"}
                  </button>
                </li>
              ))}
            </ul>
            {unlocated.length > 100 && <p className="count">Showing 100 — narrow it with the filters or search.</p>}
          </details>
        )}

        {can("settings") && (
          <details style={{ marginTop: 12 }}>
            <summary className="count" style={{ cursor: "pointer" }}>Map area & offline street map</summary>
            <p className="count">
              Offline street map: {bm.installed ? `installed (${(bm.sizeBytes / 1e6).toFixed(1)} MB${bm.updated ? `, ${new Date(bm.updated).toLocaleDateString()}` : ""})` : "not downloaded yet — using the online map"}.
            </p>
            <p className="count">Boundaries: {bm.boundaries ? "installed (PSA, 31 Dec 2023)" : "not downloaded yet"}.</p>
            <p className="count">To download or refresh both, run this on the server in the poseidon-api folder. It's set for Rizal, Palawan; another LGU adds --psgc= with its 10-digit PSGC code.</p>
            <code style={{ display: "block", fontSize: 11, wordBreak: "break-all", padding: 6, background: "var(--surface-2, #f4f4f4)", borderRadius: 6 }}>
              npm run map:download{area.saved ? ` -- --bbox=${bboxArg}` : ""}
            </code>
            <p className="count">To change the area: zoom the map so the whole LGU fits, then</p>
            <button className="clear-filters" onClick={saveHomeView}>Use this view as the map area</button>
          </details>
        )}
      </aside>

      {/* ---------- Map ---------- */}
      <div style={{ position: "relative", flex: 1, minWidth: 0, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border, #ddd)" }}>
        <div ref={holder} style={{ position: "absolute", inset: 0 }} />

        {!bm.installed && (
          <div className="action-notice" style={{ position: "absolute", top: 8, left: 8, right: 60, animation: "none", zIndex: 2 }}>
            The offline street map isn't downloaded yet, so this uses the online map (needs internet).
          </div>
        )}
        {notice && (
          <div className="action-notice" style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 3 }} onAnimationEnd={() => setNotice("")}>
            {notice}
          </div>
        )}
        {err && (
          <div className="form-error" style={{ position: "absolute", top: 52, left: 8, right: 60, zIndex: 3 }} onClick={() => setErr("")}>{err}</div>
        )}
        {placing && (
          <div className="action-notice" style={{ position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", animation: "none", zIndex: 3 }}>
            Click where {placing.accountNo}'s meter is. <button className="clear-filters" onClick={() => setPlacing(null)}>Cancel</button>
          </div>
        )}

        {/* Legend */}
        {((showAccounts && legend.length > 0) || (bm.boundaries && (showMuni || showBarangays))) && (
          <div style={{ position: "absolute", left: 8, bottom: 28, zIndex: 2, background: "var(--surface, #fff)", color: "var(--text, #111)", borderRadius: 8, padding: "8px 10px", boxShadow: "0 1px 6px rgba(0,0,0,.2)", maxHeight: "45%", overflowY: "auto", fontSize: 13 }}>
            {showAccounts && legend.length > 0 && <div style={{ fontWeight: 600, marginBottom: 4 }}>{COLOR_BY.find((c) => c.id === colorBy)?.label}</div>}
            {showAccounts && legend.map((l) => (
              <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: l.color, border: "1.5px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.25)" }} />
                <span style={{ flex: 1 }}>{l.label}</span>
                <span className="muted">{l.count}</span>
              </div>
            ))}
            {showAccounts && legend.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#1b4f8a", color: "#fff", fontSize: 9, display: "grid", placeItems: "center" }}>n</span>
                <span className="muted">Group of n accounts — click to zoom in</span>
              </div>
            )}
            {bm.boundaries && (showMuni || showBarangays) && <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>Boundaries</div>}
            {bm.boundaries && showMuni && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke={MUNI_LINE.color} strokeWidth={MUNI_LINE.width} strokeDasharray="5 3" /></svg>
                <span>Municipal boundary</span>
              </div>
            )}
            {bm.boundaries && showBarangays && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke={BGY_LINE.color} strokeWidth={BGY_LINE.width + 0.4} strokeDasharray="4 3" /></svg>
                <span>Barangay boundary</span>
              </div>
            )}
          </div>
        )}

        {/* Selected account */}
        {selected && (
          <div style={{ position: "absolute", top: 8, right: 50, zIndex: 2, width: 290, background: "var(--surface, #fff)", color: "var(--text, #111)", borderRadius: 8, padding: 12, boxShadow: "0 1px 8px rgba(0,0,0,.25)", fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{selected.accountNo}</strong>
              <button className="clear-filters" onClick={() => setSelectedId(null)} aria-label="Close">✕</button>
            </div>
            <div style={{ fontWeight: 600 }}>{selected.name}</div>
            <div className="muted">{[selected.street, selected.cluster, selected.barangay].filter(Boolean).join(", ")}</div>
            <table style={{ marginTop: 6, fontSize: 12 }}>
              <tbody>
                <tr><td>Status</td><td>{selected.status}</td></tr>
                <tr><td>Classification</td><td>{selected.classification}</td></tr>
                <tr><td>Meter no.</td><td>{selected.meterNo || "—"}</td></tr>
                <tr><td>Stand pipe</td><td>{selected.standpipe || "—"}</td></tr>
                <tr><td>Unpaid</td><td>₱{selected.balance.toLocaleString("en-PH", { minimumFractionDigits: 2 })}{selected.unpaidBills ? ` (${selected.unpaidBills} bill${selected.unpaidBills > 1 ? "s" : ""})` : ""}</td></tr>
                <tr><td>Last consumption</td><td>{selected.lastConsumption == null ? "—" : `${selected.lastConsumption} m³`}{selected.readLatest ? "" : " · not in the latest billing"}</td></tr>
                <tr><td>Location</td><td>{selected.lat == null ? "not placed" : `${selected.lat.toFixed(5)}, ${selected.lng!.toFixed(5)}${selected.locSource === "reader" ? " (reader GPS)" : ""}`}</td></tr>
              </tbody>
            </table>
            <div className="form-actions" style={{ marginTop: 8 }}>
              <button className="primary small" onClick={() => navigate(`/accounts/${selected.id}`)}>Open account</button>
              <button className="clear-filters" onClick={() => setPlacing(selected)}>{selected.lat == null ? "Place" : "Move pin"}</button>
              {selected.lat != null && <button className="clear-filters" onClick={() => removePin(selected)}>Remove pin</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
