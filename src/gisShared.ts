/**
 * GIS map data, colour schemes and filters (GisMapPage.tsx). Kept out of the
 * page component so fast refresh keeps working.
 */

export type MapAccount = {
  id: number; accountNo: string; name: string; meterNo: string; street: string; standpipe: string;
  barangayId: number; barangay: string; clusterId: number; cluster: string;
  classId: number; classification: string; statusId: number; status: string;
  lat: number | null; lng: number | null; locSource: string | null;
  balance: number; unpaidBills: number; lastConsumption: number | null; readLatest: boolean;
};

export type MapArea = {
  centerLat: number; centerLng: number; zoom: number;
  minLat: number; minLng: number; maxLat: number; maxLng: number; saved: boolean;
};
export type BasemapStatus = {
  installed: boolean; sizeBytes: number; updated: string | null; fonts: boolean; sprites: boolean; boundaries: boolean; folder: string;
};

/** Boundary line styles — shared by the map layers and the legend. */
export const MUNI_LINE = { color: "#1a1a1a", width: 2.5, dash: [2, 1.2] as [number, number] };
/** Everything outside the municipality is washed out this much. */
export const MASK_FILL = { color: "#ffffff", opacity: 0.6 };
export const BGY_LINE = { color: "#6c4f9e", width: 1.2, dash: [3, 2] as [number, number] };

export type ColorBy = "status" | "classification" | "arrears" | "consumption" | "reading";

export const COLOR_BY: { id: ColorBy; label: string }[] = [
  { id: "status", label: "Account status" },
  { id: "classification", label: "Classification" },
  { id: "arrears", label: "Unpaid balance" },
  { id: "consumption", label: "Last consumption" },
  { id: "reading", label: "Read in the latest billing" },
];

export type Filters = {
  barangayId: number; clusterId: number; standpipe: string;
  classIds: number[]; statusIds: number[];
  meter: "all" | "with" | "without";
  minBalance: string; minBills: string;
  read: "all" | "read" | "notread";
  consumption: "all" | "zero" | "high";
  highOver: string;
  search: string;
};

export const NO_FILTERS: Filters = {
  barangayId: 0, clusterId: 0, standpipe: "", classIds: [], statusIds: [], meter: "all",
  minBalance: "", minBills: "", read: "all", consumption: "all", highOver: "40", search: "",
};

export function matches(a: MapAccount, f: Filters) {
  if (f.barangayId && a.barangayId !== f.barangayId) return false;
  if (f.clusterId && a.clusterId !== f.clusterId) return false;
  if (f.standpipe && a.standpipe.trim() !== f.standpipe) return false;
  if (f.classIds.length && !f.classIds.includes(a.classId)) return false;
  if (f.statusIds.length && !f.statusIds.includes(a.statusId)) return false;
  if (f.meter === "with" && !a.meterNo.trim()) return false;
  if (f.meter === "without" && a.meterNo.trim()) return false;
  const minBal = Number(f.minBalance);
  if (f.minBalance !== "" && Number.isFinite(minBal) && a.balance < minBal) return false;
  const minBills = Number(f.minBills);
  if (f.minBills !== "" && Number.isFinite(minBills) && a.unpaidBills < minBills) return false;
  if (f.read === "read" && !a.readLatest) return false;
  if (f.read === "notread" && a.readLatest) return false;
  if (f.consumption === "zero" && a.lastConsumption !== 0) return false;
  if (f.consumption === "high" && !((a.lastConsumption ?? 0) > (Number(f.highOver) || 0))) return false;
  const q = f.search.trim().toLowerCase();
  if (q && ![a.accountNo, a.name, a.meterNo, a.street].some((s) => s.toLowerCase().includes(q))) return false;
  return true;
}

/** How many filters differ from "everything". */
export function activeFilterCount(f: Filters) {
  return (Object.keys(NO_FILTERS) as (keyof Filters)[]).filter((k) => {
    if (k === "highOver") return false;
    return JSON.stringify(f[k]) !== JSON.stringify(NO_FILTERS[k]);
  }).length;
}

const PALETTE = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#17becf", "#bcbd22", "#7f7f7f"];

function statusColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("for disc")) return "#f28e2b";
  if (n.includes("disconn")) return "#d62728";
  if (n.includes("temp")) return "#9467bd";
  if (n.includes("pend") || n.includes("applic") || n.includes("wait")) return "#1f77b4";
  if (n.includes("connect") || n.includes("active")) return "#2ca02c";
  return "#7f7f7f";
}

export type LegendItem = { key: string; label: string; color: string };

const ARREARS: (LegendItem & { max: number })[] = [
  { key: "a0", label: "Nothing unpaid", color: "#2ca02c", max: 0 },
  { key: "a1", label: "Up to ₱500", color: "#bcbd22", max: 500 },
  { key: "a2", label: "₱500 – ₱2,000", color: "#f28e2b", max: 2000 },
  { key: "a3", label: "Over ₱2,000", color: "#d62728", max: Infinity },
];
const CONSUMPTION: (LegendItem & { max: number })[] = [
  { key: "c0", label: "0 m³", color: "#7f7f7f", max: 0 },
  { key: "c1", label: "1 – 10 m³", color: "#9ecae1", max: 10 },
  { key: "c2", label: "11 – 20 m³", color: "#4292c6", max: 20 },
  { key: "c3", label: "21 – 40 m³", color: "#2171b5", max: 40 },
  { key: "c4", label: "Over 40 m³", color: "#08306b", max: Infinity },
];

/** The legend entry (key, label, colour) an account falls in, for the chosen scheme. */
export function legendOf(a: MapAccount, by: ColorBy, classOrder: number[]): LegendItem {
  switch (by) {
    case "status":
      return { key: `s${a.statusId}`, label: a.status || "No status", color: statusColor(a.status) };
    case "classification": {
      const i = classOrder.indexOf(a.classId);
      return { key: `k${a.classId}`, label: a.classification || "No classification", color: PALETTE[(i < 0 ? 9 : i) % PALETTE.length] ?? "#7f7f7f" };
    }
    case "arrears":
      return ARREARS.find((b) => a.balance <= b.max) ?? ARREARS[3]!;
    case "consumption":
      if (a.lastConsumption == null) return { key: "cn", label: "Never billed", color: "#d9d9d9" };
      return CONSUMPTION.find((b) => (a.lastConsumption ?? 0) <= b.max) ?? CONSUMPTION[4]!;
    case "reading":
      return a.readLatest
        ? { key: "r1", label: "Read", color: "#2ca02c" }
        : { key: "r0", label: "Not read", color: "#d62728" };
  }
}

/** Legend order for fixed-band schemes (others follow first appearance). */
export const BAND_ORDER: Record<string, number> = Object.fromEntries(
  [...ARREARS, ...CONSUMPTION, { key: "cn" }, { key: "r1" }, { key: "r0" }].map((b, i) => [b.key, i]),
);

export function toCsv(rows: MapAccount[]) {
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Account No", "Name", "Meter No", "Street", "Barangay", "Cluster", "Stand pipe", "Classification", "Status",
    "Unpaid balance", "Unpaid bills", "Last consumption", "Latitude", "Longitude"];
  const lines = rows.map((a) => [a.accountNo, a.name, a.meterNo, a.street, a.barangay, a.cluster, a.standpipe, a.classification, a.status,
    a.balance.toFixed(2), a.unpaidBills, a.lastConsumption ?? "", a.lat ?? "", a.lng ?? ""].map(cell).join(","));
  return [head.join(","), ...lines].join("\r\n");
}

export const SAVED_FILTERS_KEY = "gis.savedFilters";
