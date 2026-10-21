import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { apiGet } from "./api";
import { useAuth } from "./AuthContext";
import { buildStyle, ensureMapLibre } from "./gisMap";
import { BGY_LINE, type BasemapStatus } from "./gisShared";
import { STANDPIPE_FAR_M, formatDistance } from "./standpipeCheck";

/**
 * "Location on the map" on an account's page: a small map zoomed in on the
 * account's GIS pin, with a link to the full GIS Map at that account. Shown
 * to roles that have the GIS Map; nothing when the account isn't placed.
 */

type Loc = { lat: number; lng: number; source: string; updatedMs: number };
/** The stand pipe the account is tagged with, where it is on the GIS map. */
type StandpipePoint = { name: string; lat: number; lng: number; distanceM: number | null };

export default function AccountLocation({ acctId, accountNo }: { acctId: number; accountNo: string }) {
  const { can } = useAuth();
  const { data } = useQuery<{ location: Loc | null; standpipe: StandpipePoint | null; basemap: BasemapStatus }>({
    queryKey: ["gis", "account-location", acctId],
    queryFn: () => apiGet(`/api/gis/accounts/${acctId}/location`),
    enabled: can("gis"),
    retry: false,
  });
  if (!can("gis") || !data) return null;
  const loc = data.location;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Location on the map</h2>
        <Link to={`/map?account=${acctId}`} className="link-button">
          {loc ? "Open in GIS Map" : "Place it on the GIS Map"}
        </Link>
      </div>
      {loc ? (
        <>
          <MiniMap loc={loc} basemap={data.basemap} label={accountNo} standpipe={data.standpipe} />
          <p className="count" style={{ marginTop: 6 }}>
            {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)} · {loc.source === "reader" ? "from the reader's phone GPS" : "placed on the map"}
            {loc.updatedMs ? `, ${new Date(loc.updatedMs).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}` : ""}
          </p>
          {data.standpipe?.distanceM != null && (
            <p className="count" style={{ marginTop: 2 }}>
              Stand pipe {data.standpipe.name}:{" "}
              <span className={data.standpipe.distanceM > STANDPIPE_FAR_M ? "sp-far" : undefined}>
                {formatDistance(data.standpipe.distanceM)} from the meter
              </span>{" "}
              (the dashed line)
            </p>
          )}
        </>
      ) : (
        <p className="muted">Not placed on the map yet.</p>
      )}
    </section>
  );
}

function MiniMap({ loc, basemap, label, standpipe }: { loc: Loc; basemap: BasemapStatus; label: string; standpipe: StandpipePoint | null }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!holder.current) return;
    ensureMapLibre();
    const map = new maplibregl.Map({
      container: holder.current,
      style: buildStyle(basemap),
      center: [loc.lng, loc.lat],
      zoom: 16,
      attributionControl: { compact: true },
      cooperativeGestures: true, // scrolling the page doesn't zoom the map by accident
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("load", () => {
      if (basemap.boundaries) {
        map.addSource("boundaries", { type: "geojson", data: `${window.location.origin}/map-data/boundaries.geojson` });
        map.addLayer({
          id: "bgy-line", type: "line", source: "boundaries", filter: ["==", ["get", "kind"], "barangay"],
          paint: { "line-color": BGY_LINE.color, "line-width": BGY_LINE.width, "line-dasharray": BGY_LINE.dash, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "bgy-labels", type: "symbol", source: "boundaries", filter: ["==", ["get", "kind"], "label"],
          layout: { "text-field": ["upcase", ["get", "name"]], "text-font": ["Noto Sans Medium"], "text-size": 13, "text-letter-spacing": 0.08 },
          paint: { "text-color": BGY_LINE.color, "text-halo-color": "#fff", "text-halo-width": 1.6 },
        });
      }
      // The account's stand pipe and a dashed line to it — red when it's far.
      if (standpipe) {
        const far = (standpipe.distanceM ?? 0) > STANDPIPE_FAR_M;
        map.addSource("sp", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [
              { type: "Feature", geometry: { type: "LineString", coordinates: [[loc.lng, loc.lat], [standpipe.lng, standpipe.lat]] }, properties: {} },
              { type: "Feature", geometry: { type: "Point", coordinates: [standpipe.lng, standpipe.lat] }, properties: { label: `Stand pipe ${standpipe.name}` } },
            ],
          },
        });
        map.addLayer({
          id: "sp-line", type: "line", source: "sp", filter: ["==", ["geometry-type"], "LineString"],
          paint: { "line-color": far ? "#d7301f" : "#5a6b78", "line-width": 2.5, "line-dasharray": [2, 1.5] },
        });
        map.addLayer({
          id: "sp-point", type: "circle", source: "sp", filter: ["==", ["geometry-type"], "Point"],
          paint: { "circle-radius": 7, "circle-color": "#0e9aa7", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 },
        });
        map.addLayer({
          id: "sp-label", type: "symbol", source: "sp", filter: ["==", ["geometry-type"], "Point"],
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.3], "text-anchor": "top" },
          paint: { "text-color": "#0b5f67", "text-halo-color": "#fff", "text-halo-width": 1.6 },
        });
        // Show both, unless they're on top of each other.
        if ((standpipe.distanceM ?? 0) > 30) {
          map.fitBounds(new maplibregl.LngLatBounds([loc.lng, loc.lat], [loc.lng, loc.lat]).extend([standpipe.lng, standpipe.lat]), { padding: 50, maxZoom: 17, duration: 0 });
        }
      }
      map.addSource("pin", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "Point", coordinates: [loc.lng, loc.lat] }, properties: { label } },
      });
      map.addLayer({
        id: "pin-halo", type: "circle", source: "pin",
        paint: { "circle-radius": 16, "circle-color": "rgba(22,104,168,0.18)" },
      });
      map.addLayer({
        id: "pin", type: "circle", source: "pin",
        paint: { "circle-radius": 8, "circle-color": "#1668a8", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 },
      });
      map.addLayer({
        id: "pin-label", type: "symbol", source: "pin",
        layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top", "text-max-width": 12 },
        paint: { "text-color": "#1a1d21", "text-halo-color": "#fff", "text-halo-width": 1.6 },
      });
    });
    return () => map.remove();
  }, [loc.lat, loc.lng, basemap, label, standpipe]);

  return <div ref={holder} style={{ height: 300, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border, #ddd)" }} />;
}
