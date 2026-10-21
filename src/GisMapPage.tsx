import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { buildStyle, ensureMapLibre } from "./gisMap";
import { apiGet, apiPut } from "./api";
import { useAuth } from "./AuthContext";
import {
  BAND_ORDER, BGY_LINE, COLOR_BY, MASK_FILL, MUNI_LINE, NO_FILTERS, SAVED_FILTERS_KEY, activeFilterCount, legendOf, matches, toCsv,
  type BasemapStatus, type ColorBy, type Filters, type MapAccount, type MapArea,
} from "./gisShared";
import { GROUPS, addFeatureLayers, spKey, standpipeIndex, type FeatureGroup, type MapFeature } from "./gisFeatures";
import GisDrawing, { FeatureLegend, type GisDrawingHandle } from "./GisDrawing";

/**
 * GIS Map — every account's meter on a street map of the LGU, coloured by
 * status, classification, balance, consumption or reading, with filters.
 *
 * The street map is the offline copy the server keeps (poseidon-api
 * scripts/download-basemap.mjs → maps/); until it is downloaded the page
 * falls back to the online OpenStreetMap tiles. Satellite is online only.
 * Accounts get a location by being placed on the map here (the reader app
 * will fill them in from the phone's GPS later). The municipal and barangay
 * boundaries are PSA's, downloaded with the street map. The water system
 * (pipes, stand pipes, valves…) and notes/areas are drawn with the tools in
 * GisDrawing.tsx, by roles with the "Edit the GIS map" permission.
 */

type Settings = { area: MapArea; basemap: BasemapStatus; canEdit: boolean };
const ALL_GROUPS = Object.fromEntries(GROUPS.map((g) => [g.id, true])) as Record<FeatureGroup, boolean>;
type Base = "street" | "satellite";

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
  // The pointer's coordinates, written straight into this element on every
  // mouse move — a state update per move would re-render the whole page.
  const coordsRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [mapObj, setMapObj] = useState<maplibregl.Map | null>(null);
  const [groups, setGroups] = useState<Record<FeatureGroup, boolean>>(ALL_GROUPS);
  const [featureId, setFeatureId] = useState<number | null>(null);
  const drawingRef = useRef(false);
  const drawTools = useRef<GisDrawingHandle>(null);
  const [spSearch, setSpSearch] = useState("");

  const [colorBy, setColorBy] = useState<ColorBy>("status");
  const [base, setBase] = useState<Base>("street");
  const [showAccounts, setShowAccounts] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showMuni, setShowMuni] = useState(true);
  const [fadeOutside, setFadeOutside] = useState(true);
  const [showBarangays, setShowBarangays] = useState(true);
  const [showReaders, setShowReaders] = useState(true);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [saved, setSaved] = useState<Record<string, Filters>>(loadSaved);
  const [searchParams] = useSearchParams();
  const linkedAccount = Number(searchParams.get("account")) || null;
  const [selectedId, setSelectedId] = useState<number | null>(linkedAccount);
  const flownTo = useRef<number | null>(null);
  const [placing, setPlacing] = useState<MapAccount | null>(null);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  const { data } = useQuery<{ rows: MapAccount[]; latestPeriod: number }>({
    queryKey: ["gis", "accounts"],
    queryFn: () => apiGet("/api/gis/accounts"),
  });
  const all = useMemo(() => data?.rows ?? [], [data]);
  const { data: featureData } = useQuery<{ rows: MapFeature[] }>({
    queryKey: ["gis", "features"],
    queryFn: () => apiGet("/api/gis/features"),
  });
  const features = useMemo(() => featureData?.rows ?? [], [featureData]);
  // Meter readers' phones, while their app is open and online.
  const { data: readerData } = useQuery<{ now: number; rows: { uid: number; name: string; lat: number; lng: number; accuracyM: number | null; seenMs: number; area: string }[] }>({
    queryKey: ["gis", "readers"],
    queryFn: () => apiGet("/api/gis/readers"),
    refetchInterval: 30_000,
  });
  const onBusy = useCallback((b: boolean) => {
    drawingRef.current = b;
  }, []);
  const selectFeature = useCallback((id: number | null) => {
    setFeatureId(id);
    if (id != null) setSelectedId(null);
  }, []);

  // The stand pipes the accounts name (distinct per barangay), and which are on the map.
  const spIndex = useMemo(() => standpipeIndex(all), [all]);
  const spFeatures = useMemo(
    () => new Map(features.filter((f) => f.kind === "standpipe").map((f) => [spKey(f.name, f.props.barangayId), f])),
    [features],
  );
  const spList = useMemo(() => {
    const q = spSearch.trim().toUpperCase();
    return [...spIndex.values()]
      .filter((sp) => (!filters.barangayId || sp.barangayId === filters.barangayId) && (!q || sp.name.toUpperCase().includes(q)))
      .sort((a, b) => a.barangay.localeCompare(b.barangay) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [spIndex, spSearch, filters.barangayId]);
  const spPlacedCount = [...spIndex.keys()].filter((k) => spFeatures.has(k)).length;

  const classOrder = useMemo(() => [...new Set(all.map((a) => a.classId))].sort((x, y) => x - y), [all]);
  const matching = useMemo(() => all.filter((a) => matches(a, filters)), [all, filters]);
  const located = useMemo(() => matching.filter((a) => a.lat != null && a.lng != null), [matching]);
  const unlocated = useMemo(() => matching.filter((a) => a.lat == null || a.lng == null), [matching]);

  // Mapped accounts whose pin is far from the stand pipe they're tagged with —
  // a wrong stand pipe number, or a pin dropped in the wrong place.
  const [farMeters, setFarMeters] = useState(100);
  const [showFarLines, setShowFarLines] = useState(true);
  const farCheck = useMemo(() => {
    const far: { a: MapAccount; sp: MapFeature; meters: number }[] = [];
    let unchecked = 0;
    for (const a of located) {
      const name = a.standpipe.trim();
      if (!name) continue;
      const sp = spFeatures.get(spKey(name, a.barangayId)) ?? spFeatures.get(spKey(name, 0));
      if (!sp || sp.geometry.type !== "Point") {
        unchecked++;
        continue;
      }
      const [lng, lat] = sp.geometry.coordinates as [number, number];
      const meters = distanceM(a.lat!, a.lng!, lat, lng);
      if (meters > farMeters) far.push({ a, sp, meters });
    }
    far.sort((x, y) => y.meters - x.meters);
    return { far, unchecked };
  }, [located, spFeatures, farMeters]);
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
    ensureMapLibre();
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

    // Where the pointer is (lat, lng — the order Google Maps and GPS apps use),
    // and right-click to copy it: handy when drawing or checking a location.
    const showCoords = (lngLat: maplibregl.LngLat | null) => {
      const el = coordsRef.current;
      if (!el) return;
      el.style.visibility = lngLat ? "visible" : "hidden";
      if (lngLat) el.firstChild!.textContent = formatLatLng(lngLat.lat, lngLat.lng);
    };
    map.on("mousemove", (e) => showCoords(e.lngLat));
    map.on("mouseout", () => showCoords(null));
    map.on("contextmenu", (e) => {
      const text = `${e.lngLat.lat.toFixed(6)}, ${e.lngLat.lng.toFixed(6)}`;
      navigator.clipboard?.writeText(text).then(
        () => setNotice(`Copied ${text}`),
        () => setNotice(text),
      );
    });

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
      addFeatureLayers(map);
      // Account → its stand pipe, for accounts far from it (under the pins).
      map.addSource("sp-far", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "sp-far-lines", type: "line", source: "sp-far",
        paint: {
          "line-color": "#d7301f", "line-dasharray": [2, 1.5], "line-opacity": 0.85,
          "line-width": ["case", ["get", "sel"], 4, 2],
        },
      });
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

      // Meter readers, on top of everything.
      map.addSource("readers", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "readers-dot", type: "circle", source: "readers",
        paint: {
          "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 3,
          "circle-color": ["case", ["get", "live"], "#e6550d", "#9e9e9e"],
        },
      });
      map.addLayer({
        id: "readers-label", type: "symbol", source: "readers",
        layout: {
          "text-field": ["concat", ["get", "name"], "\n", ["get", "ago"]], "text-font": ["Noto Sans Medium"], "text-size": 12,
          "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true,
        },
        paint: { "text-color": ["case", ["get", "live"], "#a33a06", "#666"], "text-halo-color": "#fff", "text-halo-width": 1.8 },
      });

      map.on("click", "acct-clusters", async (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.cluster_id;
        if (f?.geometry.type !== "Point" || id == null) return;
        const zoom = await (map.getSource("accounts") as GeoJSONSource).getClusterExpansionZoom(id);
        map.easeTo({ center: f.geometry.coordinates as [number, number], zoom });
      });
      map.on("click", "acct-points", (e) => {
        if (placingRef.current || drawingRef.current) return;
        const id = Number(e.features?.[0]?.properties?.id);
        if (id) {
          setSelectedId(id);
          setFeatureId(null);
        }
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
      setMapObj(map);
    });
    return () => {
      setMapObj(null);
      map.remove();
      mapRef.current = null;
    };
  }, [settings]);

  // Opened from an account's page: go to its pin, once.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !linkedAccount || flownTo.current === linkedAccount) return;
    const a = all.find((x) => x.id === linkedAccount);
    if (!a) return;
    flownTo.current = linkedAccount;
    if (a.lat != null && a.lng != null) map.flyTo({ center: [a.lng, a.lat], zoom: 17 });
  }, [ready, all, linkedAccount]);

  // Readers' positions ("live" = seen in the last 15 minutes).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !readerData) return;
    const ago = (ms: number) => {
      const m = Math.round((readerData.now - ms) / 60_000);
      return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
    };
    (map.getSource("readers") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: showReaders
        ? readerData.rows.map((r) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [r.lng, r.lat] },
          properties: { name: r.name, ago: ago(r.seenMs), live: readerData.now - r.seenMs < 15 * 60_000 },
        }))
        : [],
    });
  }, [ready, readerData, showReaders]);

  // Lines from far-off accounts to their stand pipe.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("sp-far") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: showFarLines
        ? farCheck.far.map(({ a, sp }) => ({
          type: "Feature" as const,
          geometry: { type: "LineString" as const, coordinates: [[a.lng!, a.lat!], sp.geometry.coordinates as [number, number]] },
          properties: { id: a.id, sel: a.id === selectedId },
        }))
        : [],
    });
  }, [ready, farCheck, showFarLines, selectedId]);

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
    setFeatureId(null);
    if (a.lat != null && a.lng != null) mapRef.current?.flyTo({ center: [a.lng, a.lat], zoom: Math.max(mapRef.current.getZoom(), 17) });
  }

  function showFeature(f: MapFeature) {
    selectFeature(f.id);
    if (f.geometry.type === "Point") mapRef.current?.flyTo({ center: f.geometry.coordinates, zoom: Math.max(mapRef.current.getZoom(), 16) });
  }

  /**
   * The selected account's stand pipe: click it to jump to the stand pipe on
   * the map (selecting it), or place it if it isn't drawn yet. A stand pipe
   * drawn without a barangay matches by its number alone.
   */
  function standpipeCell() {
    const name = selected?.standpipe.trim() ?? "";
    if (!selected || !name) return <>—</>;
    const placed = spFeatures.get(spKey(name, selected.barangayId)) ?? spFeatures.get(spKey(name, 0));
    if (placed) {
      return (
        <button className="link-button" title="Show this stand pipe on the map" onClick={() => showFeature(placed)}>
          {name} ›
        </button>
      );
    }
    const sp = spIndex.get(spKey(name, selected.barangayId));
    return (
      <>
        {name}{" "}
        {settings.canEdit && sp ? (
          <button className="link-button" title="Click Place, then click where it is on the map" onClick={() => drawTools.current?.placeStandpipe(sp)}>
            Place it
          </button>
        ) : (
          <span className="muted" style={{ fontSize: 11 }}>not on the map</span>
        )}
      </>
    );
  }

  /** Selects the account and frames it with its stand pipe. */
  function showFar(a: MapAccount, sp: MapFeature) {
    setSelectedId(a.id);
    setFeatureId(null);
    const [lng, lat] = sp.geometry.coordinates as [number, number];
    mapRef.current?.fitBounds(new maplibregl.LngLatBounds([a.lng!, a.lat!], [a.lng!, a.lat!]).extend([lng, lat]), { padding: 80, maxZoom: 18 });
  }

  function exportFarCsv() {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Account no.", "Name", "Barangay", "Cluster", "Stand pipe", "Metres from stand pipe", "Pin from", "Latitude", "Longitude"].map(q).join(","),
      ...farCheck.far.map(({ a, meters }) =>
        [a.accountNo, a.name, a.barangay, a.cluster, a.standpipe.trim(), Math.round(meters), a.locSource === "reader" ? "reader GPS" : "office", a.lat, a.lng].map(q).join(","),
      ),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `far-from-stand-pipe-${farMeters}m.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * The map exactly as it is on screen — drawings, area labels and all — as a
   * PNG, with a title and date above it, the accounts' legend in the corner
   * and the map credits below. MapLibre clears its canvas after each frame,
   * so the picture is taken inside a render, while the frame is still there.
   */
  function saveImage() {
    const map = mapRef.current;
    if (!map) return;
    map.once("render", () => {
      const src = map.getCanvas();
      const k = src.width / Math.max(1, src.clientWidth); // device pixels per CSS pixel
      const head = Math.round(46 * k);
      const foot = Math.round(22 * k);
      const out = document.createElement("canvas");
      out.width = src.width;
      out.height = src.height + head + foot;
      const c = out.getContext("2d");
      if (!c) return;
      const font = (size: number, weight = 400) => `${weight} ${Math.round(size * k)}px "Segoe UI", system-ui, sans-serif`;

      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, out.width, out.height);
      c.drawImage(src, 0, head);

      // Title and when.
      const now = new Date();
      c.fillStyle = "#0d3b66";
      c.font = font(17, 700);
      c.textBaseline = "middle";
      c.fillText("POSEIDON — GIS Map", 14 * k, head / 2 - 6 * k);
      c.fillStyle = "#555";
      c.font = font(11.5);
      const n = activeFilterCount(filters);
      c.fillText(
        `${showAccounts ? `${located.length.toLocaleString()} account${located.length === 1 ? "" : "s"} shown` : "Accounts hidden"}` +
          `${n ? ` · ${n} filter${n === 1 ? "" : "s"} on` : ""} · coloured by ${COLOR_BY.find((x) => x.id === colorBy)?.label.toLowerCase() ?? colorBy}`,
        14 * k, head / 2 + 11 * k,
      );
      c.textAlign = "right";
      c.fillText(now.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }), out.width - 14 * k, head / 2 - 6 * k);
      c.textAlign = "left";

      // The accounts' legend, bottom-left over the map.
      if (showAccounts && legend.length) {
        const rows = legend.slice(0, 14);
        const lh = 17 * k;
        c.font = font(12);
        const w = Math.max(...rows.map((l) => c.measureText(`${l.label}  ${l.count}`).width)) + 44 * k;
        const h = (rows.length + 1) * lh + 12 * k;
        const x = 10 * k;
        const y = head + src.height - h - 10 * k;
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.beginPath();
        c.roundRect(x, y, w, h, 7 * k);
        c.fill();
        c.fillStyle = "#111";
        c.font = font(12, 600);
        c.fillText(COLOR_BY.find((x2) => x2.id === colorBy)?.label ?? "", x + 10 * k, y + 6 * k + lh / 2);
        c.font = font(12);
        rows.forEach((l, i) => {
          const cy = y + 6 * k + lh * (i + 1) + lh / 2;
          c.fillStyle = l.color;
          c.beginPath();
          c.arc(x + 16 * k, cy, 5.5 * k, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#111";
          c.fillText(l.label, x + 28 * k, cy);
          c.fillStyle = "#777";
          c.textAlign = "right";
          c.fillText(String(l.count), x + w - 10 * k, cy);
          c.textAlign = "left";
        });
      }

      // Credits the map's sources require.
      c.fillStyle = "#666";
      c.font = font(10.5);
      c.fillText(
        "© OpenStreetMap contributors" + (base === "satellite" ? " · Imagery © Esri, Maxar, Earthstar Geographics" : ""),
        14 * k, head + src.height + foot / 2,
      );

      try {
        out.toBlob((blob) => {
          if (!blob) return setErr("Could not make the image.");
          const a = document.createElement("a");
          const stamp = now.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
          a.href = URL.createObjectURL(blob);
          a.download = `gis-map-${stamp}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        }, "image/png");
      } catch {
        setErr("The browser blocked saving this view as an image (a map layer came from a site that doesn't allow it).");
      }
    });
    map.triggerRepaint();
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
          <label style={{ display: "block", marginTop: 6 }}>
            <input type="checkbox" checked={showReaders} onChange={(e) => setShowReaders(e.target.checked)} /> Meter readers
            {readerData && <span className="muted"> ({readerData.rows.filter((r) => readerData.now - r.seenMs < 15 * 60_000).length} online)</span>}
          </label>
          <div style={{ marginTop: 6 }}>
            {GROUPS.map((g) => (
              <label key={g.id} style={{ display: "block" }}>
                <input type="checkbox" checked={groups[g.id]} onChange={(e) => setGroups((x) => ({ ...x, [g.id]: e.target.checked }))} /> {g.label}
              </label>
            ))}
          </div>
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
          <button className="clear-filters" onClick={saveImage} title="Download what the map is showing right now as a picture">Save map image</button>
        </div>

        {spIndex.size > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Stand pipes ({spPlacedCount} of {spIndex.size} on the map)</summary>
            <p className="count">
              From the accounts' stand pipe numbers{filters.barangayId ? " in the chosen barangay" : ""}.{settings.canEdit ? " Click Place, then click where it is on the map." : ""}
            </p>
            <input className="table-input" style={{ width: "100%", marginBottom: 6 }} value={spSearch} placeholder="Search a stand pipe no." onChange={(e) => setSpSearch(e.target.value)} />
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {spList.slice(0, 100).map((sp) => {
                const placed = spFeatures.get(sp.key);
                return (
                  <li key={sp.key} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "3px 0", borderBottom: "1px solid var(--border, #eee)" }}>
                    <span style={{ minWidth: 0 }}>
                      {sp.name}
                      <div className="muted" style={{ fontSize: 11 }}>{sp.barangay} · {sp.accountIds.length} account{sp.accountIds.length === 1 ? "" : "s"}</div>
                    </span>
                    {placed ? (
                      <button className="clear-filters" onClick={() => showFeature(placed)}>Show</button>
                    ) : settings.canEdit ? (
                      <button className="clear-filters" onClick={() => drawTools.current?.placeStandpipe(sp)}>Place</button>
                    ) : (
                      <span className="muted" style={{ fontSize: 11 }}>not on the map</span>
                    )}
                  </li>
                );
              })}
            </ul>
            {spList.length > 100 && <p className="count">Showing 100 of {spList.length} — search, or pick a barangay under Filters.</p>}
            {!spList.length && <p className="count">No stand pipe matches.</p>}
          </details>
        )}

        {spFeatures.size > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Far from their stand pipe ({farCheck.far.length})</summary>
            <p className="count">
              Mapped accounts more than
              <select value={farMeters} onChange={(e) => setFarMeters(Number(e.target.value))} style={{ margin: "0 4px" }} aria-label="Distance">
                {[50, 100, 200, 300, 500, 1000].map((m) => <option key={m} value={m}>{m} m</option>)}
              </select>
              from the stand pipe they're tagged with — the stand pipe number or the pin may be wrong.
              {farCheck.unchecked > 0 && ` ${farCheck.unchecked} more can't be checked until their stand pipe is placed on the map.`}
            </p>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={showFarLines} onChange={(e) => setShowFarLines(e.target.checked)} />
              Show red lines to their stand pipe
            </label>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {farCheck.far.slice(0, 100).map(({ a, sp, meters }) => (
                <li key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "3px 0", borderBottom: "1px solid var(--border, #eee)" }}>
                  <span style={{ minWidth: 0 }}>
                    {a.accountNo}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {a.standpipe.trim()} · {meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`} away
                      {a.locSource === "reader" ? " · reader GPS" : ""}
                    </div>
                  </span>
                  <button className="clear-filters" onClick={() => showFar(a, sp)}>Show</button>
                </li>
              ))}
            </ul>
            {farCheck.far.length > 100 && <p className="count">Showing the 100 farthest of {farCheck.far.length} — pick a barangay under Filters to narrow it.</p>}
            {!farCheck.far.length && <p className="count">None — every checked account is within {farMeters} m of its stand pipe.</p>}
            {farCheck.far.length > 0 && (
              <div className="form-actions">
                <button className="clear-filters" onClick={exportFarCsv}>Export list (CSV)</button>
              </div>
            )}
          </details>
        )}

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

        {/* Set-up help only while something is missing; afterwards just the starting view. */}
        {can("settings") && bm.installed && bm.boundaries && (
          <div style={{ marginTop: 12 }}>
            <button className="clear-filters" onClick={saveHomeView} title="The map will open at this position and zoom">
              Use this view as the map's starting view
            </button>
          </div>
        )}
        {can("settings") && !(bm.installed && bm.boundaries) && (
          <details open style={{ marginTop: 12 }}>
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
          <div className="action-notice" style={{ position: "absolute", top: 96, left: 8, right: 360, animation: "none", zIndex: 2 }}>
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

        {/* Pointer coordinates (hidden until the mouse is over the map). */}
        <div
          ref={coordsRef}
          style={{
            position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", zIndex: 2,
            visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap",
            background: "rgba(13, 31, 51, 0.82)", color: "#fff", borderRadius: 6, padding: "4px 10px",
            fontSize: 12, fontVariantNumeric: "tabular-nums", boxShadow: "0 1px 4px rgba(0,0,0,.25)",
          }}
        >
          <span />
          <span style={{ opacity: 0.7, marginLeft: 8 }}>right-click to copy</span>
        </div>

        {/* Legend */}
        {((showAccounts && legend.length > 0) || (bm.boundaries && (showMuni || showBarangays)) || features.length > 0 || (showReaders && !!readerData?.rows.length)) && (
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
            <FeatureLegend features={features} groups={groups} />
            {showReaders && !!readerData?.rows.length && (
              <>
                <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>Meter readers</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#e6550d", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.25)" }} />
                  <span>Online (seen in the last 15 min)</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#9e9e9e", border: "2px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,.25)" }} />
                  <span>Last seen earlier today</span>
                </div>
              </>
            )}
          </div>
        )}

        <GisDrawing
          ref={drawTools}
          map={mapObj}
          canEdit={settings.canEdit}
          features={features}
          groups={groups}
          accounts={all}
          selectedId={featureId}
          onSelect={selectFeature}
          onBusy={onBusy}
          onChanged={() => qc.invalidateQueries({ queryKey: ["gis", "features"] })}
          onNotice={setNotice}
          onError={setErr}
          onFilterStandpipe={({ name, barangayId }) => setFilters({ ...NO_FILTERS, standpipe: name, barangayId: barangayId ?? 0 })}
          onShowAccount={(id) => {
            const a = all.find((x) => x.id === id);
            if (a) flyTo(a);
          }}
        />

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
                <tr><td>Stand pipe</td><td>{standpipeCell()}</td></tr>
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

/** Straight-line distance in metres between two points (haversine). */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** "8.712345° N, 117.423456° E" — six decimals is about 10 cm. */
function formatLatLng(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(6)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(6)}° ${lng >= 0 ? "E" : "W"}`;
}
