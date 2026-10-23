import { useEffect, useMemo, useState } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { apiPost } from "./api";
import type { MapFeature } from "./gisFeatures";
import type { MapAccount } from "./gisShared";
import { purokOutlines, type OutlineResult } from "./purokOutlines";

/**
 * GIS sidebar: draft purok outlines from the account pins (purokOutlines.ts),
 * previewed dashed on the map, then saved as ordinary map areas — labelled
 * with their account count — for staff to reshape against the barangay's own
 * map. Nothing is saved until "Save as areas".
 */

const REACHES = [60, 100, 150, 250, 400];
const LAYERS = ["purok-fill", "purok-line", "purok-label"];

export default function GisPurokOutlines({
  map, accounts, features, canEdit, onChanged, onNotice, onError,
}: {
  map: MlMap | null;
  accounts: MapAccount[];
  features: MapFeature[];
  canEdit: boolean;
  onChanged: () => void;
  onNotice: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [barangayId, setBarangayId] = useState(0);
  const [reachM, setReachM] = useState(60);
  const [result, setResult] = useState<OutlineResult | null>(null);
  const [saving, setSaving] = useState(false);

  const barangays = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of accounts) if (a.lat != null && a.clusterId) m.set(a.barangayId, a.barangay);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [accounts]);

  // Each saved piece: its name (barangay added when two puroks share a name,
  // "1 of 3" when a purok comes in pieces) and outline.
  const pieces = useMemo(() => {
    if (!result) return [];
    const nameCount = new Map<string, number>();
    for (const o of result.outlines) nameCount.set(o.cluster.trim().toUpperCase(), (nameCount.get(o.cluster.trim().toUpperCase()) ?? 0) + 1);
    return result.outlines.flatMap((o) => {
      const base = (nameCount.get(o.cluster.trim().toUpperCase()) ?? 0) > 1 ? `${o.cluster.trim()} (${o.barangay})` : o.cluster.trim();
      return o.rings.map((ring, i) => ({
        name: o.rings.length > 1 ? `${base} (${i + 1} of ${o.rings.length})` : base,
        color: o.color,
        ring,
        purok: o,
      }));
    });
  }, [result]);

  // The draft on the map, dashed, under the account pins.
  useEffect(() => {
    if (!map) return;
    const put = () => {
      if (!map.getSource("purok-preview")) {
        map.addSource("purok-preview", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const before = map.getStyle().layers.find((l) => l.id.startsWith("acct-"))?.id;
        map.addLayer({ id: "purok-fill", type: "fill", source: "purok-preview", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.14 } }, before);
        map.addLayer({ id: "purok-line", type: "line", source: "purok-preview", paint: { "line-color": ["get", "color"], "line-width": 2.2, "line-dasharray": [2, 1.2] } }, before);
        map.addLayer({
          id: "purok-label", type: "symbol", source: "purok-preview",
          layout: { "text-field": ["get", "label"], "text-font": ["Noto Sans Medium"], "text-size": 12, "text-max-width": 14 },
          paint: { "text-color": ["get", "color"], "text-halo-color": "#fff", "text-halo-width": 1.8 },
        }, before);
      }
      (map.getSource("purok-preview") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: pieces.map((p) => ({
          type: "Feature" as const,
          properties: { color: p.color, label: `${p.name}\n${p.purok.pins} account${p.purok.pins === 1 ? "" : "s"}` },
          geometry: { type: "Polygon" as const, coordinates: [p.ring] },
        })),
      });
    };
    if (map.isStyleLoaded()) put();
    else map.once("load", put);
  }, [map, pieces]);

  // Take the draft off the map when leaving the page.
  useEffect(() => () => {
    if (!map) return;
    try {
      for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource("purok-preview")) map.removeSource("purok-preview");
    } catch {
      /* the map is already gone */
    }
  }, [map]);

  function preview(reach = reachM, brgy = barangayId) {
    setResult(purokOutlines(accounts, reach, brgy));
  }

  async function save() {
    if (!pieces.length) return;
    const taken = new Set(features.filter((f) => f.kind === "area").map((f) => f.name.trim().toUpperCase()));
    const todo = pieces.filter((p) => !taken.has(p.name.toUpperCase()));
    const skipped = pieces.length - todo.length;
    if (!todo.length) return onError("Every one of these outlines is already on the map as an area with the same name.");
    if (!window.confirm(`Add ${todo.length} purok area${todo.length === 1 ? "" : "s"} to the map?${skipped ? ` (${skipped} already there by name will be left alone.)` : ""}`)) return;
    setSaving(true);
    const today = new Date().toLocaleDateString("en-PH", { dateStyle: "medium" });
    let done = 0;
    try {
      for (const p of todo) {
        await apiPost("/api/gis/features", {
          kind: "area",
          name: p.name,
          props: {
            color: p.color,
            labelAccounts: true,
            labelStandpipes: false,
            remarks: `Drafted from the account pins on ${today} (reach ${reachM} m+). Reshape it to match the barangay's own map.`,
          },
          geometry: { type: "Polygon", coordinates: [p.ring] },
        });
        done++;
      }
      onNotice(`${done} purok area${done === 1 ? "" : "s"} added. Click one to reshape it.`);
      setResult(null);
    } catch (e) {
      onError(`${done} added, then: ${(e as Error).message}`);
    } finally {
      setSaving(false);
      onChanged();
    }
  }

  const stray = result?.outlines.reduce((s, o) => s + o.stray, 0) ?? 0;
  const split = result?.outlines.filter((o) => o.rings.length > 1).length ?? 0;

  return (
    <details style={{ marginTop: 8 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>Purok outlines from the pins</summary>
      <p className="count">
        A first draft of each purok (cluster) from where its accounts are pinned — nobody publishes purok
        boundaries, so this starts from your own data. Preview, then save them as areas to reshape.
      </p>
      <label className="field-input">
        <span>Barangay</span>
        <select value={barangayId} onChange={(e) => { setBarangayId(Number(e.target.value)); if (result) preview(reachM, Number(e.target.value)); }}>
          <option value={0}>All barangays</option>
          {barangays.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="field-input">
        <span>Reach around each meter (at least)</span>
        <select value={reachM} onChange={(e) => { setReachM(Number(e.target.value)); if (result) preview(Number(e.target.value), barangayId); }}>
          {REACHES.map((r) => <option key={r} value={r}>{r} m</option>)}
        </select>
        <span className="setting-note">Puroks with houses far apart reach further on their own. Raise this if one breaks into pieces.</span>
      </label>
      <div className="form-actions">
        <button className="clear-filters" disabled={!accounts.length} onClick={() => preview()}>Preview</button>
        {result && canEdit && (
          <button className="primary small" disabled={saving || !pieces.length} onClick={save}>
            {saving ? "Saving…" : "Save as areas"}
          </button>
        )}
        {result && <button className="clear-filters" disabled={saving} onClick={() => setResult(null)}>Clear</button>}
      </div>
      {result && (
        <div className="count" style={{ marginTop: 6 }}>
          <b>{result.outlines.length}</b> purok{result.outlines.length === 1 ? "" : "s"} outlined
          {split ? `, ${split} in more than one piece` : ""}.
          {stray > 0 && <> {stray} pin{stray === 1 ? "" : "s"} too far from the rest of their purok left out — check them.</>}
          {result.tooFew.length > 0 && (
            <> Too few pins to outline: {result.tooFew.map((t) => `${t.cluster} (${t.pins})`).join(", ")}.</>
          )}
          {result.noCluster > 0 && <> {result.noCluster} pinned account{result.noCluster === 1 ? " has" : "s have"} no purok.</>}
        </div>
      )}
    </details>
  );
}
