/**
 * What can be drawn on the GIS map (poseidon-api gis.ts gisfeatures): the
 * water system and markup — their icons, line styles and legend entries,
 * plus the distance/area maths for measuring. Kept out of GisMapPage.tsx so
 * fast refresh keeps working.
 */
import type { Map as MlMap } from "maplibre-gl";

export type FeatureKind = "pipe" | "standpipe" | "valve" | "hydrant" | "pump" | "tank" | "source" | "note" | "area";
export type Geometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] }
  | { type: "Polygon"; coordinates: [number, number][][] };

export type FeatureProps = {
  remarks?: string;
  sizeMm?: number | null;
  material?: string;
  year?: number | null;
  status?: "existing" | "proposed" | "abandoned";
  state?: "open" | "closed";
  color?: string;
  /** Stand pipes: the barangay of the accounts' stand pipe this marks. */
  barangayId?: number | null;
};

/* ---------------- Stand pipes (from the accounts) ---------------- */

type AccountLike = { id: number; standpipe: string; barangayId: number; barangay: string; cluster: string; lat: number | null; lng: number | null };
export type StandpipeInfo = { key: string; name: string; barangayId: number; barangay: string; clusters: string[]; accountIds: number[] };

export const spKey = (name: string, barangayId: number | null | undefined) => `${barangayId ?? 0}|${name.trim().toUpperCase()}`;

/** Every stand pipe the accounts name (distinct per barangay), with its accounts. */
export function standpipeIndex(accounts: AccountLike[]) {
  const m = new Map<string, StandpipeInfo & { clusterSet: Set<string> }>();
  for (const a of accounts) {
    const name = a.standpipe.trim();
    if (!name) continue;
    const key = spKey(name, a.barangayId);
    let e = m.get(key);
    if (!e) {
      e = { key, name, barangayId: a.barangayId, barangay: a.barangay, clusters: [], accountIds: [], clusterSet: new Set() };
      m.set(key, e);
    }
    e.accountIds.push(a.id);
    if (a.cluster) e.clusterSet.add(a.cluster);
  }
  return new Map([...m.entries()].map(([k, { clusterSet, ...e }]) => [k, { ...e, clusters: [...clusterSet].sort() }]));
}

/** The accounts on a stand pipe drawn on the map (its barangay, when it has one). */
export function accountsOnStandpipe<A extends AccountLike>(f: Pick<MapFeature, "name" | "props">, accounts: A[]) {
  const n = f.name.trim().toUpperCase();
  if (!n) return [];
  return accounts.filter((a) => a.standpipe.trim().toUpperCase() === n && (!f.props.barangayId || a.barangayId === f.props.barangayId));
}

export type MapFeature = { id: number; kind: FeatureKind; name: string; geometry: Geometry; props: FeatureProps; updatedMs: number; by: string };

/** Which layer switch a kind belongs to. */
export type FeatureGroup = "pipes" | "standpipes" | "valves" | "hydrants" | "facilities" | "markup";

export const KINDS: Record<FeatureKind, { label: string; geom: "point" | "linestring" | "polygon"; group: FeatureGroup; nameLabel: string }> = {
  pipe: { label: "Pipe", geom: "linestring", group: "pipes", nameLabel: "Name / line no." },
  standpipe: { label: "Stand pipe", geom: "point", group: "standpipes", nameLabel: "Stand pipe no. (as on the accounts)" },
  valve: { label: "Valve", geom: "point", group: "valves", nameLabel: "Valve no." },
  hydrant: { label: "Fire hydrant", geom: "point", group: "hydrants", nameLabel: "Hydrant no." },
  pump: { label: "Pump", geom: "point", group: "facilities", nameLabel: "Name" },
  tank: { label: "Tank / reservoir", geom: "point", group: "facilities", nameLabel: "Name" },
  source: { label: "Water source", geom: "point", group: "facilities", nameLabel: "Name (spring, well, intake…)" },
  note: { label: "Note", geom: "point", group: "markup", nameLabel: "Text" },
  area: { label: "Area", geom: "polygon", group: "markup", nameLabel: "Name" },
};

export const GROUPS: { id: FeatureGroup; label: string }[] = [
  { id: "pipes", label: "Pipes" },
  { id: "standpipes", label: "Stand pipes" },
  { id: "valves", label: "Valves" },
  { id: "hydrants", label: "Fire hydrants" },
  { id: "facilities", label: "Pumps, tanks & sources" },
  { id: "markup", label: "Notes & areas" },
];

/* ---------------- Pipes ---------------- */

export const MATERIALS: { name: string; color: string }[] = [
  { name: "PVC", color: "#1f77b4" },
  { name: "HDPE", color: "#2c2c2c" },
  { name: "GI", color: "#7f7f7f" },
  { name: "Ductile iron", color: "#8c564b" },
  { name: "Cast iron", color: "#a0522d" },
  { name: "Steel", color: "#b8860b" },
];
const OTHER_MATERIAL = "#17becf";

export function materialColor(m: string | undefined) {
  const t = (m ?? "").trim().toLowerCase();
  if (!t) return OTHER_MATERIAL;
  return MATERIALS.find((x) => x.name.toLowerCase() === t)?.color ?? OTHER_MATERIAL;
}

/** Line width on screen for a pipe size. */
export function pipeWidth(sizeMm: number | null | undefined) {
  const s = sizeMm ?? 0;
  if (!s) return 2.5;
  if (s <= 25) return 2;
  if (s <= 50) return 2.5;
  if (s <= 100) return 3.5;
  if (s <= 150) return 4.5;
  if (s <= 200) return 5.5;
  return 6.5;
}

/* ---------------- Icons ---------------- */

/** Icon image names on the map, one per point kind (valves have two). */
export function iconOf(f: Pick<MapFeature, "kind" | "props">) {
  return f.kind === "valve" ? (f.props.state === "closed" ? "gis-valve-closed" : "gis-valve-open") : `gis-${f.kind}`;
}

const ICONS: Record<string, { color: string; draw: (c: CanvasRenderingContext2D, s: number) => void }> = {
  "gis-standpipe": { color: "#1f77b4", draw: (c, s) => badge(c, s, "#1f77b4", "S", true) },
  "gis-hydrant": { color: "#d62728", draw: (c, s) => badge(c, s, "#d62728", "H") },
  "gis-pump": { color: "#6a3d9a", draw: (c, s) => badge(c, s, "#6a3d9a", "P") },
  "gis-tank": { color: "#17becf", draw: (c, s) => badge(c, s, "#0e8a96", "T") },
  "gis-source": { color: "#08306b", draw: (c, s) => badge(c, s, "#08306b", "W") },
  "gis-valve-open": { color: "#2ca02c", draw: (c, s) => valve(c, s, "#2ca02c", false) },
  "gis-valve-closed": { color: "#d62728", draw: (c, s) => valve(c, s, "#d62728", true) },
};

function badge(c: CanvasRenderingContext2D, s: number, fill: string, letter: string, square = false) {
  const r = s * 0.4;
  const m = s / 2;
  c.beginPath();
  if (square) c.roundRect(m - r, m - r, r * 2, r * 2, r * 0.3);
  else c.arc(m, m, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = s * 0.07;
  c.strokeStyle = "#fff";
  c.stroke();
  c.fillStyle = "#fff";
  c.font = `bold ${s * 0.42}px sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(letter, m, m + s * 0.02);
}

/** The drawing symbol for a valve: two triangles tip to tip — filled when closed. */
function valve(c: CanvasRenderingContext2D, s: number, colour: string, closed: boolean) {
  const m = s / 2;
  c.beginPath();
  c.arc(m, m, s * 0.42, 0, Math.PI * 2);
  c.fillStyle = "#fff";
  c.fill();
  c.lineWidth = s * 0.06;
  c.strokeStyle = colour;
  c.stroke();
  const w = s * 0.26;
  const h = s * 0.2;
  c.beginPath();
  c.moveTo(m - w, m - h);
  c.lineTo(m + w, m + h);
  c.lineTo(m + w, m - h);
  c.lineTo(m - w, m + h);
  c.closePath();
  c.lineJoin = "round";
  c.lineWidth = s * 0.06;
  c.strokeStyle = colour;
  c.stroke();
  if (closed) {
    c.fillStyle = colour;
    c.fill();
  }
}

function iconCanvas(name: string, size = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) ICONS[name]?.draw(ctx, size);
  return canvas;
}

/** Add every icon to the map (drawn at 2× for sharp screens). */
export function addIcons(map: MlMap) {
  for (const name of Object.keys(ICONS)) {
    if (map.hasImage(name)) continue;
    const canvas = iconCanvas(name);
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    map.addImage(name, data, { pixelRatio: 2 });
  }
}

const urlCache = new Map<string, string>();
/** The same icon as an image address, for the legend and the toolbar. */
export function iconUrl(name: string) {
  let u = urlCache.get(name);
  if (!u) {
    u = iconCanvas(name).toDataURL();
    urlCache.set(name, u);
  }
  return u;
}

/* ---------------- Measuring ---------------- */

const R = 6371008.8; // mean Earth radius, metres
const rad = (d: number) => (d * Math.PI) / 180;

/** Length of a line in metres (great-circle). */
export function lengthM(coords: [number, number][]) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1]!;
    const [lon2, lat2] = coords[i]!;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

/** Area of a ring in square metres (spherical). */
export function areaM2(ring: [number, number][]) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[(i + 1) % ring.length]!;
    s += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((s * R * R) / 2);
}

export const fmtLength = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
export const fmtArea = (m2: number) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`);

/* ---------------- Map layers ---------------- */

/** The map's GeoJSON for the saved features in the switched-on groups (minus the one being reshaped). */
export function featureCollection(rows: MapFeature[], hiddenId: number | null, visible: Record<FeatureGroup, boolean>) {
  return {
    type: "FeatureCollection" as const,
    features: rows
      .filter((f) => f.id !== hiddenId && visible[KINDS[f.kind].group])
      .map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: {
          id: f.id,
          kind: f.kind,
          group: KINDS[f.kind].group,
          name: f.name,
          icon: iconOf(f),
          color: f.kind === "pipe" ? materialColor(f.props.material) : (f.props.color ?? "#e67e22"),
          width: pipeWidth(f.props.sizeMm),
          status: f.props.status ?? "existing",
        },
      })),
  };
}

export const FEATURE_LAYERS = [
  "feat-area-fill", "feat-area-line", "feat-pipe", "feat-pipe-proposed", "feat-pipe-abandoned",
  "feat-selected-line", "feat-points", "feat-selected-point", "feat-notes", "feat-area-label",
] as const;

/** Add the saved-feature layers (below the account pins, which are added after). */
export function addFeatureLayers(map: MlMap) {
  addIcons(map);
  map.addSource("features", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const kind = (k: string) => ["==", ["get", "kind"], k] as ["==", ["get", string], string];
  map.addLayer({ id: "feat-area-fill", type: "fill", source: "features", filter: kind("area"), paint: { "fill-color": ["get", "color"], "fill-opacity": 0.18 } });
  map.addLayer({ id: "feat-area-line", type: "line", source: "features", filter: kind("area"), paint: { "line-color": ["get", "color"], "line-width": 2 } });
  map.addLayer({
    id: "feat-pipe", type: "line", source: "features", filter: ["all", kind("pipe"), ["==", ["get", "status"], "existing"]],
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"] },
  });
  map.addLayer({
    id: "feat-pipe-proposed", type: "line", source: "features", filter: ["all", kind("pipe"), ["==", ["get", "status"], "proposed"]],
    layout: { "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": [2, 1.5] },
  });
  map.addLayer({
    id: "feat-pipe-abandoned", type: "line", source: "features", filter: ["all", kind("pipe"), ["==", ["get", "status"], "abandoned"]],
    layout: { "line-join": "round" }, paint: { "line-color": "#999", "line-width": ["get", "width"], "line-dasharray": [0.6, 1.4], "line-opacity": 0.8 },
  });
  // Lines from the selected stand pipe to its accounts (GisDrawing fills it).
  map.addSource("sp-links", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "sp-links", type: "line", source: "sp-links",
    paint: { "line-color": "#1f77b4", "line-width": 1.5, "line-dasharray": [2, 1.5], "line-opacity": 0.85 },
  });
  map.addLayer({
    id: "feat-selected-line", type: "line", source: "features", filter: ["==", ["get", "id"], -1],
    paint: { "line-color": "#ffd400", "line-width": ["+", ["get", "width"], 6], "line-opacity": 0.55 },
  });
  map.addLayer({
    id: "feat-points", type: "symbol", source: "features",
    filter: ["match", ["get", "kind"], ["standpipe", "valve", "hydrant", "pump", "tank", "source"], true, false],
    layout: {
      "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 1],
      "text-field": ["step", ["zoom"], "", 15, ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11,
      "text-offset": [0, 1.4], "text-anchor": "top", "text-optional": true,
    },
    paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.5 },
  });
  map.addLayer({
    id: "feat-selected-point", type: "circle", source: "features", filter: ["==", ["get", "id"], -1],
    paint: { "circle-radius": 18, "circle-color": "rgba(255,212,0,0.35)", "circle-stroke-color": "#ffb300", "circle-stroke-width": 2 },
  });
  map.addLayer({
    id: "feat-notes", type: "symbol", source: "features", filter: kind("note"),
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 14, "text-max-width": 14, "text-allow-overlap": true },
    paint: { "text-color": ["get", "color"], "text-halo-color": "#fff", "text-halo-width": 2 },
  });
  map.addLayer({
    id: "feat-area-label", type: "symbol", source: "features", filter: kind("area"),
    layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Medium"], "text-size": 12 },
    paint: { "text-color": ["get", "color"], "text-halo-color": "#fff", "text-halo-width": 1.8 },
  });
}
