import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { TerraDraw, TerraDrawLineStringMode, TerraDrawPointMode, TerraDrawPolygonMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { apiDelete, apiPost, apiPut } from "./api";
import {
  GROUPS, KINDS, MATERIALS, accountsOnStandpipe, areaM2, featureCollection, fmtArea, fmtLength, iconOf, iconUrl, lengthM,
  materialColor, spKey, standpipeIndex,
  type FeatureGroup, type FeatureKind, type FeatureProps, type Geometry, type MapFeature, type StandpipeInfo,
} from "./gisFeatures";
import type { MapAccount } from "./gisShared";

/**
 * Drawing on the GIS map: the toolbar (water system features, notes, areas,
 * measuring), the form for a new or selected feature, and reshaping one.
 * Terra Draw does the drawing itself; saved features are drawn by the map's
 * own layers (gisFeatures.ts addFeatureLayers).
 */

type Tool =
  | { type: "new"; kind: FeatureKind }
  | { type: "reshape"; feature: MapFeature; drawId: string }
  | { type: "measure"; what: "line" | "area" };

type Pending = { kind: FeatureKind; geometry: Geometry };
type Preset = { name: string; props: FeatureProps };

/** What the page can ask the drawing tools to do (GisMapPage's stand pipe list). */
export type GisDrawingHandle = { placeStandpipe: (sp: StandpipeInfo) => void };

const MODE: Record<"point" | "linestring" | "polygon", string> = { point: "point", linestring: "linestring", polygon: "polygon" };
const FEATURE_CLICK_LAYERS = ["feat-points", "feat-notes", "feat-pipe", "feat-pipe-proposed", "feat-pipe-abandoned", "feat-area-fill"];
const ACCOUNT_LAYERS = ["acct-points", "acct-clusters"];

const panel: React.CSSProperties = {
  background: "var(--surface, #fff)", color: "var(--text, #111)", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,.25)", fontSize: 13,
};

function measureOf(g: Geometry | null | undefined) {
  if (!g) return "";
  if (g.type === "LineString") return fmtLength(lengthM(g.coordinates));
  if (g.type === "Polygon") {
    const ring = g.coordinates[0] ?? [];
    return `${fmtArea(areaM2(ring))} · edge ${fmtLength(lengthM(ring))}`;
  }
  return `${g.coordinates[1].toFixed(5)}, ${g.coordinates[0].toFixed(5)}`;
}

export default function GisDrawing({
  ref, map, canEdit, features, groups, accounts, selectedId, onSelect, onBusy, onChanged, onNotice, onError, onFilterStandpipe, onShowAccount,
}: {
  ref?: Ref<GisDrawingHandle>;
  map: MlMap | null;
  canEdit: boolean;
  features: MapFeature[];
  groups: Record<FeatureGroup, boolean>;
  accounts: MapAccount[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
  onNotice: (m: string) => void;
  onError: (m: string) => void;
  onFilterStandpipe: (sp: { name: string; barangayId: number | null }) => void;
  onShowAccount: (id: number) => void;
}) {
  const drawRef = useRef<TerraDraw | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const spIndex = useMemo(() => standpipeIndex(accounts), [accounts]);
  const placedKeys = useMemo(
    () => new Set(features.filter((f) => f.kind === "standpipe").map((f) => spKey(f.name, f.props.barangayId))),
    [features],
  );
  const [tool, setTool] = useState<Tool | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [measure, setMeasure] = useState("");
  const toolRef = useRef<Tool | null>(null);
  const busyRef = useRef(false);
  const selected = features.find((f) => f.id === selectedId) ?? null;

  // The drawing engine, once the map is ready.
  useEffect(() => {
    if (!map) return;
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawPointMode({ styles: { pointColor: "#e6550d", pointWidth: 7, pointOutlineColor: "#ffffff", pointOutlineWidth: 2 } }),
        new TerraDrawLineStringMode({ styles: { lineStringColor: "#e6550d", lineStringWidth: 4 } }),
        new TerraDrawPolygonMode({ styles: { fillColor: "#e6550d", fillOpacity: 0.2, outlineColor: "#e6550d", outlineWidth: 3 } }),
        new TerraDrawSelectMode({
          flags: {
            point: { feature: { draggable: true } },
            linestring: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
            polygon: { feature: { draggable: true, coordinates: { midpoints: true, draggable: true, deletable: true } } },
          },
        }),
      ],
    });
    draw.start();
    draw.on("change", () => {
      const t = toolRef.current;
      if (t?.type !== "measure" && t?.type !== "reshape") return;
      const snap = draw.getSnapshot();
      const last = t.type === "reshape" ? snap.find((f) => f.id === t.drawId) : snap[snap.length - 1];
      setMeasure(measureOf(last?.geometry as Geometry | undefined));
    });
    draw.on("finish", (id) => {
      const t = toolRef.current;
      const f = draw.getSnapshotFeature(id);
      if (!f) return;
      if (t?.type === "new") {
        setPending({ kind: t.kind, geometry: f.geometry as Geometry });
        setMeasure(measureOf(f.geometry as Geometry));
        draw.setMode("static");
      } else if (t?.type === "measure") {
        setMeasure(measureOf(f.geometry as Geometry));
        draw.setMode("static");
      }
    });
    drawRef.current = draw;
    return () => {
      try {
        draw.stop();
      } catch {
        /* the map is already gone */
      }
      drawRef.current = null;
    };
  }, [map]);

  // Saved features on the map (the one being reshaped is left to Terra Draw).
  const reshapingId = tool?.type === "reshape" ? tool.feature.id : null;
  useEffect(() => {
    if (!map) return;
    (map.getSource("features") as GeoJSONSource | undefined)?.setData(featureCollection(features, reshapingId, groups));
    const sel = ["==", ["get", "id"], selectedId ?? -1] as ["==", ["get", string], number];
    if (map.getLayer("feat-selected-line")) map.setFilter("feat-selected-line", ["all", sel, ["match", ["get", "kind"], ["pipe", "area"], true, false]]);
    if (map.getLayer("feat-selected-point")) map.setFilter("feat-selected-point", ["all", sel, ["match", ["get", "kind"], ["pipe", "area"], false, true]]);
  }, [map, features, groups, reshapingId, selectedId]);

  // A selected stand pipe: its accounts, and lines to the ones on the map.
  const connected = useMemo(
    () => (selected?.kind === "standpipe" ? accountsOnStandpipe(selected, accounts).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [selected, accounts],
  );
  useEffect(() => {
    if (!map) return;
    const from = selected?.kind === "standpipe" && selected.geometry.type === "Point" && groups.standpipes ? selected.geometry.coordinates : null;
    (map.getSource("sp-links") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: from
        ? connected.filter((a) => a.lat != null && a.lng != null).map((a) => ({
          type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [from, [a.lng!, a.lat!]] },
        }))
        : [],
    });
  }, [map, selected, connected, groups.standpipes]);

  // Clicking a saved feature selects it — not while a tool is in use.
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    if (!map) return;
    // One handler, top-most thing wins: a valve on a pipe selects the valve,
    // and an account pin is left to the page's own account click.
    const click = (e: { point: { x: number; y: number } }) => {
      if (busyRef.current) return;
      const layers = [...ACCOUNT_LAYERS, ...FEATURE_CLICK_LAYERS].filter((l) => map.getLayer(l));
      const top = map.queryRenderedFeatures([e.point.x, e.point.y], { layers })[0];
      if (top && ACCOUNT_LAYERS.includes(top.layer.id)) return;
      // Clicking empty map lets go of the selected feature.
      const id = Number(top?.properties?.id);
      selectRef.current(id || null);
    };
    const enter = () => { if (!busyRef.current) map.getCanvas().style.cursor = "pointer"; };
    const leave = () => { if (!busyRef.current) map.getCanvas().style.cursor = ""; };
    map.on("click", click);
    for (const l of FEATURE_CLICK_LAYERS) {
      map.on("mouseenter", l, enter);
      map.on("mouseleave", l, leave);
    }
    return () => {
      map.off("click", click);
      for (const l of FEATURE_CLICK_LAYERS) {
        map.off("mouseenter", l, enter);
        map.off("mouseleave", l, leave);
      }
    };
  }, [map]);

  // Keep the refs and the page's "busy" flag in step with the tool.
  const busy = !!tool || !!pending;
  useEffect(() => {
    toolRef.current = tool;
    busyRef.current = busy;
    onBusy(busy);
  }, [tool, busy, onBusy]);

  function reset() {
    const draw = drawRef.current;
    if (draw) {
      draw.setMode("static");
      draw.clear();
    }
    setTool(null);
    setPending(null);
    setPreset(null);
    setMeasure("");
  }

  // Esc cancels whatever is being drawn.
  useEffect(() => {
    if (!busy) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [busy]);

  function start(next: Tool) {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode("static");
    draw.clear();
    setPending(null);
    setMeasure("");
    onSelect(null);
    setTool(next);
    if (next.type === "new") draw.setMode(MODE[KINDS[next.kind].geom]);
    else if (next.type === "measure") draw.setMode(next.what === "line" ? "linestring" : "polygon");
  }

  const pickKind = (kind: FeatureKind) => {
    setPreset(null);
    start({ type: "new", kind });
  };

  useImperativeHandle(ref, () => ({
    placeStandpipe(sp: StandpipeInfo) {
      start({ type: "new", kind: "standpipe" });
      setPreset({ name: sp.name, props: { barangayId: sp.barangayId } });
    },
  }));

  function reshape(f: MapFeature) {
    const draw = drawRef.current;
    if (!draw) return;
    draw.setMode("static");
    draw.clear();
    const drawId = crypto.randomUUID();
    draw.addFeatures([{ id: drawId, type: "Feature", geometry: f.geometry, properties: { mode: MODE[KINDS[f.kind].geom] } }]);
    draw.setMode("select");
    draw.selectFeature(drawId);
    setMeasure(measureOf(f.geometry));
    setTool({ type: "reshape", feature: f, drawId });
  }

  async function saveReshape() {
    if (tool?.type !== "reshape") return;
    const g = drawRef.current?.getSnapshotFeature(tool.drawId)?.geometry as Geometry | undefined;
    if (!g) return;
    try {
      await apiPut(`/api/gis/features/${tool.feature.id}`, { name: tool.feature.name, props: tool.feature.props, geometry: g });
      onNotice(`${KINDS[tool.feature.kind].label} ${tool.feature.kind === "pipe" || tool.feature.kind === "area" ? "reshaped" : "moved"}.`);
      const id = tool.feature.id;
      reset();
      onSelect(id);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function saveNew(name: string, props: FeatureProps) {
    if (!pending) return;
    try {
      const r = await apiPost<{ id: number }>("/api/gis/features", { kind: pending.kind, name, props, geometry: pending.geometry });
      onNotice(`${KINDS[pending.kind].label} added.`);
      reset();
      onChanged();
      onSelect(r.id);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function saveDetails(f: MapFeature, name: string, props: FeatureProps) {
    try {
      await apiPut(`/api/gis/features/${f.id}`, { name, props, geometry: f.geometry });
      onNotice(`${KINDS[f.kind].label} saved.`);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  async function remove(f: MapFeature) {
    if (!window.confirm(`Delete this ${KINDS[f.kind].label.toLowerCase()}${f.name ? ` (${f.name})` : ""} from the map?`)) return;
    try {
      await apiDelete(`/api/gis/features/${f.id}`);
      onNotice(`${KINDS[f.kind].label} deleted.`);
      onSelect(null);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  const spOptions = useMemo(() => [...spIndex.values()].sort((a, b) => a.barangay.localeCompare(b.barangay) || a.name.localeCompare(b.name, undefined, { numeric: true })), [spIndex]);
  const standpipe = { options: spOptions, index: spIndex, placed: placedKeys };

  const hint =
    tool?.type === "new"
      ? KINDS[tool.kind].geom === "point"
        ? `Click where ${tool.kind === "standpipe" && preset ? `stand pipe ${preset.name}` : `the ${KINDS[tool.kind].label.toLowerCase()}`} is.`
        : KINDS[tool.kind].geom === "linestring"
          ? "Click along the pipe's route; click the last point again to finish."
          : "Click the area's corners; click the first corner again to finish."
      : tool?.type === "measure"
        ? tool.what === "line" ? "Click along the path; click the last point again to finish." : "Click the corners; click the first corner again to finish."
        : tool?.type === "reshape"
          ? "Drag the shape or its points; drag a midpoint to add a point; right-click a point to remove it."
          : "";

  return (
    <>
      {/* Toolbar */}
      <div style={{ ...panel, position: "absolute", top: 8, left: 8, zIndex: 3, padding: 6, display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "calc(100% - 370px)" }}>
        {canEdit && (["pipe", "standpipe", "valve", "hydrant", "pump", "tank", "source", "note", "area"] as FeatureKind[]).map((k) => (
          <KindButton key={k} kind={k} active={tool?.type === "new" && tool.kind === k} onPick={pickKind} />
        ))}
        {canEdit && <span style={{ width: 1, background: "var(--border, #ddd)", margin: "0 2px" }} />}
        <ToolButton active={tool?.type === "measure" && tool.what === "line"} title="Measure a distance" onClick={() => start({ type: "measure", what: "line" })}>
          <span aria-hidden="true">📏</span> <span>Distance</span>
        </ToolButton>
        <ToolButton active={tool?.type === "measure" && tool.what === "area"} title="Measure an area" onClick={() => start({ type: "measure", what: "area" })}>
          <span aria-hidden="true">⬠</span> <span>Area</span>
        </ToolButton>
      </div>

      {/* What to do / measurement */}
      {(tool || pending) && (
        <div style={{ ...panel, position: "absolute", bottom: 40, left: "50%", transform: "translateX(-50%)", zIndex: 3, padding: "8px 12px", display: "flex", gap: 10, alignItems: "center", maxWidth: "80%" }}>
          <span>{pending ? "Fill in the details on the right." : hint}</span>
          {measure && <strong style={{ whiteSpace: "nowrap" }}>{measure}</strong>}
          {tool?.type === "reshape" && <button className="primary small" onClick={saveReshape}>Save</button>}
          {tool?.type === "measure" && <button className="clear-filters" onClick={() => start(tool)}>Again</button>}
          <button className="clear-filters" onClick={reset}>{tool?.type === "measure" ? "Done" : "Cancel"}</button>
        </div>
      )}

      {/* New feature details */}
      {pending && (
        <div style={{ ...panel, position: "absolute", top: 8, right: 50, zIndex: 4, width: 300, padding: 12 }}>
          <FeatureForm
            key={`new-${pending.kind}`}
            kind={pending.kind}
            name={preset?.name ?? ""}
            props={preset?.props ?? {}}
            geometry={pending.geometry}
            canEdit
            standpipe={standpipe}
            onSave={saveNew}
            onCancel={reset}
            onFilterStandpipe={onFilterStandpipe}
          />
        </div>
      )}

      {/* Selected feature */}
      {selected && !pending && tool?.type !== "reshape" && (
        <div style={{ ...panel, position: "absolute", top: 8, right: 50, zIndex: 4, width: 300, padding: 12 }}>
          <FeatureForm
            key={`${selected.id}-${selected.updatedMs}`}
            kind={selected.kind}
            name={selected.name}
            props={selected.props}
            geometry={selected.geometry}
            canEdit={canEdit}
            by={selected.by}
            updatedMs={selected.updatedMs}
            standpipe={standpipe}
            connected={connected}
            onShowAccount={onShowAccount}
            onSave={(name, props) => saveDetails(selected, name, props)}
            onCancel={() => onSelect(null)}
            onReshape={() => reshape(selected)}
            onDelete={() => remove(selected)}
            onFilterStandpipe={onFilterStandpipe}
          />
        </div>
      )}
    </>
  );
}

function ToolButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className={active ? "primary small" : "clear-filters"}
      title={title}
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", fontSize: 12 }}
    >
      {children}
    </button>
  );
}

function KindButton({ kind, active, onPick }: { kind: FeatureKind; active: boolean; onPick: (k: FeatureKind) => void }) {
  return (
    <ToolButton active={active} title={`Add a ${KINDS[kind].label.toLowerCase()}`} onClick={() => onPick(kind)}>
      <ToolIcon kind={kind} /> <span>{KINDS[kind].label}</span>
    </ToolButton>
  );
}

function ToolIcon({ kind }: { kind: FeatureKind }) {
  if (kind === "pipe") return <svg width="16" height="16" aria-hidden="true"><path d="M2 13 L7 6 L14 4" stroke="#1f77b4" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>;
  if (kind === "area") return <svg width="16" height="16" aria-hidden="true"><path d="M2 12 L5 3 L14 5 L12 14 Z" fill="rgba(230,126,34,.3)" stroke="#e67e22" strokeWidth="1.5" /></svg>;
  if (kind === "note") return <span aria-hidden="true" style={{ fontWeight: 700, fontFamily: "serif" }}>T</span>;
  return <img src={iconUrl(iconOf({ kind, props: {} }))} width={16} height={16} alt="" />;
}

/** The details of one feature — new or saved — with its kind's own fields. */
type StandpipeLists = { options: StandpipeInfo[]; index: Map<string, StandpipeInfo>; placed: Set<string> };

function FeatureForm({
  kind, name: name0, props: props0, geometry, canEdit, by, updatedMs, standpipe, connected, onShowAccount,
  onSave, onCancel, onReshape, onDelete, onFilterStandpipe,
}: {
  kind: FeatureKind; name: string; props: FeatureProps; geometry: Geometry; canEdit: boolean; by?: string; updatedMs?: number;
  standpipe: StandpipeLists;
  connected?: MapAccount[];
  onShowAccount?: (id: number) => void;
  onSave: (name: string, props: FeatureProps) => void; onCancel: () => void; onReshape?: () => void; onDelete?: () => void;
  onFilterStandpipe: (sp: { name: string; barangayId: number | null }) => void;
}) {
  const [name, setName] = useState(name0);
  const [p, setP] = useState<FeatureProps>({
    status: "existing", state: "open", color: kind === "note" ? "#1a1a1a" : "#e67e22", ...props0,
  });
  const k = KINDS[kind];
  const set = (patch: Partial<FeatureProps>) => setP((x) => ({ ...x, ...patch }));
  const isNew = !onDelete;
  // The accounts' stand pipe this names: by barangay when known, else by number alone.
  const spMatch = kind === "standpipe" && name.trim()
    ? (standpipe.index.get(spKey(name, p.barangayId)) ?? standpipe.options.find((o) => o.name.toUpperCase() === name.trim().toUpperCase()))
    : undefined;
  const spPlacedElsewhere = isNew && spMatch && standpipe.placed.has(spMatch.key);
  const pickStandpipe = (v: string) => {
    setName(v);
    const hit = standpipe.options.find((o) => o.name.toUpperCase() === v.trim().toUpperCase());
    set({ barangayId: hit?.barangayId ?? null });
  };
  const ro = !canEdit;

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}><ToolIcon kind={kind} /> {isNew ? `New ${k.label.toLowerCase()}` : k.label}</strong>
        <button className="clear-filters" onClick={onCancel} aria-label="Close">✕</button>
      </div>
      <div className="muted" style={{ margin: "2px 0 8px" }}>
        {kind === "pipe" ? `Length ${measureOf(geometry)}` : kind === "area" ? measureOf(geometry) : measureOf(geometry)}
      </div>
      {props0.source === "reader" && (
        <div className="info-banner" style={{ margin: "0 0 8px", fontSize: 12 }}>
          Marked by a meter reader with the phone's GPS{props0.accuracyM ? ` (±${props0.accuracyM} m)` : ""}. Check it; saving here confirms it.
        </div>
      )}

      <label className="field-input">
        <span>{k.nameLabel}</span>
        {kind === "note" ? (
          <textarea rows={2} value={name} readOnly={ro} maxLength={120} onChange={(e) => setName(e.target.value)} />
        ) : kind === "standpipe" ? (
          <>
            <input list="gis-standpipes" value={name} readOnly={ro} maxLength={120} placeholder="Type to search the accounts' stand pipes" onChange={(e) => pickStandpipe(e.target.value)} />
            <datalist id="gis-standpipes">
              {standpipe.options.map((o) => (
                <option key={o.key} value={o.name}>{`${o.barangay} · ${o.accountIds.length} account${o.accountIds.length === 1 ? "" : "s"}${standpipe.placed.has(o.key) ? " · on the map" : ""}`}</option>
              ))}
            </datalist>
          </>
        ) : (
          <input value={name} readOnly={ro} maxLength={120} onChange={(e) => setName(e.target.value)} />
        )}
      </label>
      {kind === "standpipe" && name.trim() && (
        <p className="count" style={{ margin: "2px 0 6px" }}>
          {spMatch
            ? <>{spMatch.barangay}{spMatch.clusters.length ? ` · ${spMatch.clusters.join(", ")}` : ""} · {spMatch.accountIds.length} account{spMatch.accountIds.length === 1 ? "" : "s"}</>
            : "No account has this stand pipe — check the number."}
          {spPlacedElsewhere && <><br /><b>This stand pipe is already on the map.</b></>}
        </p>
      )}
      {kind === "standpipe" && !isNew && connected && (
        <div style={{ margin: "4px 0 8px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Connected accounts ({connected.length})</strong>
            {connected.length > 0 && (
              <button className="clear-filters" onClick={() => onFilterStandpipe({ name: name.trim(), barangayId: p.barangayId ?? null })}>Show only these</button>
            )}
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border, #eee)", borderRadius: 6, marginTop: 4 }}>
            {connected.map((a) => (
              <button
                key={a.id}
                className="clear-filters"
                onClick={() => onShowAccount?.(a.id)}
                style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid var(--border, #eee)", borderRadius: 0, padding: "4px 6px" }}
                title={a.lat == null ? "Not placed on the map yet" : "Show on the map"}
              >
                {a.accountNo} — {a.name}
                <div className="muted" style={{ fontSize: 11 }}>{a.status}{a.lat == null ? " · no location" : ""}</div>
              </button>
            ))}
            {!connected.length && <div className="muted" style={{ padding: 6 }}>No account has this stand pipe.</div>}
          </div>
        </div>
      )}

      {kind === "pipe" && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <label className="field-input" style={{ flex: 1 }}>
              <span>Size (mm)</span>
              <input type="number" min={1} value={p.sizeMm ?? ""} readOnly={ro} onChange={(e) => set({ sizeMm: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
            <label className="field-input" style={{ flex: 1 }}>
              <span>Year laid</span>
              <input type="number" min={1900} max={2100} value={p.year ?? ""} readOnly={ro} onChange={(e) => set({ year: e.target.value === "" ? null : Number(e.target.value) })} />
            </label>
          </div>
          <label className="field-input">
            <span>Material <span style={{ display: "inline-block", width: 18, height: 4, background: materialColor(p.material), verticalAlign: "middle" }} /></span>
            <input list="gis-materials" value={p.material ?? ""} readOnly={ro} maxLength={30} onChange={(e) => set({ material: e.target.value })} />
            <datalist id="gis-materials">{MATERIALS.map((m) => <option key={m.name} value={m.name} />)}</datalist>
          </label>
          <label className="field-input">
            <span>Status</span>
            <select value={p.status} disabled={ro} onChange={(e) => set({ status: e.target.value as FeatureProps["status"] })}>
              <option value="existing">Existing</option><option value="proposed">Proposed</option><option value="abandoned">Abandoned</option>
            </select>
          </label>
        </>
      )}
      {kind === "valve" && (
        <div style={{ display: "flex", gap: 8 }}>
          <label className="field-input" style={{ flex: 1 }}>
            <span>Valve is</span>
            <select value={p.state} disabled={ro} onChange={(e) => set({ state: e.target.value as FeatureProps["state"] })}>
              <option value="open">Open</option><option value="closed">Closed</option>
            </select>
          </label>
          <label className="field-input" style={{ flex: 1 }}>
            <span>Size (mm)</span>
            <input type="number" min={1} value={p.sizeMm ?? ""} readOnly={ro} onChange={(e) => set({ sizeMm: e.target.value === "" ? null : Number(e.target.value) })} />
          </label>
        </div>
      )}
      {(kind === "note" || kind === "area") && (
        <label className="field-input">
          <span>Colour</span>
          <input type="color" value={p.color} disabled={ro} onChange={(e) => set({ color: e.target.value })} style={{ height: 32, padding: 2 }} />
        </label>
      )}
      <label className="field-input">
        <span>Remarks</span>
        <textarea rows={2} value={p.remarks ?? ""} readOnly={ro} maxLength={300} onChange={(e) => set({ remarks: e.target.value })} />
      </label>

      {!isNew && by && (
        <div className="muted" style={{ fontSize: 11 }}>Last changed by {by}{updatedMs ? `, ${new Date(updatedMs).toLocaleString()}` : ""}</div>
      )}
      {canEdit && (
        <div className="form-actions" style={{ marginTop: 8 }}>
          <button className="primary small" disabled={kind === "note" && !name.trim()} onClick={() => onSave(name.trim(), p)}>{isNew ? "Add to the map" : "Save"}</button>
          {onReshape && <button className="clear-filters" onClick={onReshape}>{k.geom === "point" ? "Move" : "Reshape"}</button>}
          {onDelete && <button className="clear-filters" onClick={onDelete}>Delete</button>}
          {isNew && <button className="clear-filters" onClick={onCancel}>Cancel</button>}
        </div>
      )}
    </>
  );
}

/** The feature part of the legend: only what's on the map and switched on. */
export function FeatureLegend({ features, groups }: { features: MapFeature[]; groups: Record<FeatureGroup, boolean> }) {
  const shown = features.filter((f) => groups[KINDS[f.kind].group]);
  if (!shown.length) return null;
  const pipes = shown.filter((f) => f.kind === "pipe");
  const materials = [...new Set(pipes.filter((f) => (f.props.status ?? "existing") !== "abandoned").map((f) => (f.props.material ?? "").trim() || "Other"))];
  const statuses = new Set(pipes.map((f) => f.props.status ?? "existing"));
  const totalM = pipes.filter((f) => f.props.status !== "abandoned" && f.geometry.type === "LineString")
    .reduce((s, f) => s + lengthM((f.geometry as { coordinates: [number, number][] }).coordinates), 0);
  const icons = [...new Map(shown.filter((f) => KINDS[f.kind].geom === "point" && f.kind !== "note").map((f) => [iconOf(f), f])).values()];
  const row = { display: "flex", alignItems: "center", gap: 6 } as const;

  return (
    <>
      <div style={{ fontWeight: 600, margin: "8px 0 4px" }}>Water system</div>
      {materials.map((m) => (
        <div key={m} style={row}>
          <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke={materialColor(m === "Other" ? "" : m)} strokeWidth="3.5" strokeLinecap="round" /></svg>
          <span>{m} pipe</span>
        </div>
      ))}
      {statuses.has("proposed") && (
        <div style={row}><svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="#555" strokeWidth="3" strokeDasharray="5 3" /></svg><span>Proposed pipe</span></div>
      )}
      {statuses.has("abandoned") && (
        <div style={row}><svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="#999" strokeWidth="3" strokeDasharray="1.5 3" /></svg><span>Abandoned pipe</span></div>
      )}
      {pipes.length > 0 && <div className="muted" style={{ fontSize: 11 }}>Thicker line = bigger pipe · {fmtLength(totalM)} in use</div>}
      {icons.map((f) => (
        <div key={iconOf(f)} style={row}>
          <img src={iconUrl(iconOf(f))} width={16} height={16} alt="" />
          <span>{f.kind === "valve" ? (f.props.state === "closed" ? "Valve (closed)" : "Valve (open)") : KINDS[f.kind].label}</span>
        </div>
      ))}
      {GROUPS.some((g) => g.id === "markup" && groups.markup) && shown.some((f) => f.kind === "area") && (
        <div style={row}><span style={{ width: 16, height: 12, background: "rgba(230,126,34,.25)", border: "1.5px solid #e67e22" }} /><span>Marked area</span></div>
      )}
    </>
  );
}
