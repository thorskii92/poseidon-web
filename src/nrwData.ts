/**
 * Non-revenue water: the shapes /api/nrw returns (poseidon-api/src/nrw.ts)
 * and the formatting shared by the page, its print view and components.
 */

export type Source = {
  id: number;
  zoneId: number;
  name: string;
  method: "meter" | "pump";
  multiplier: number;
  pumpRate: number;
  active: boolean;
  note: string;
};

export type System = {
  id: number;
  name: string;
  short: string;
  active: boolean;
  barangays: string;
  sources: Source[];
};

export type Systems = { canEdit: boolean; systems: System[] };

export type Allowance = { kind: string; m3: number; note: string };

export type BalanceRow = {
  zoneId: number;
  system: string;
  short: string;
  year: number;
  month: number;
  label: string;
  from: string;
  to: string;
  sources: number;
  produced: number | null;
  producedLogged: number;
  estimated: number;
  coverage: number;
  billed: number;
  billedValue: number;
  bills: number;
  authorised: number;
  allowances: Allowance[];
  nrw: number | null;
  nrwPct: number | null;
  losses: number | null;
  lossValue: number | null;
  pricePerM3: number;
  suspect: boolean;
};

export type MonthTotal = {
  key: number;
  label: string;
  systems: number;
  systemsWithBalance: number;
  produced: number | null;
  billed: number;
  billedCounted: number;
  nrw: number | null;
  nrwPct: number | null;
  lossValue: number | null;
};

export type Balance = {
  months: number;
  zoneId: number;
  systems: { id: number; name: string; short: string }[];
  rows: BalanceRow[];
  byMonth: MonthTotal[];
  summary: {
    latest: MonthTotal | null;
    monthsWithBalance: number;
    lossValueLast12: number;
    averageNrwPct: number | null;
    sources: number;
  };
  minCoveragePct: number;
  signatories?: import("./Signatories").SignatorySlot[];
};

export type LogSheet = {
  date: string;
  sources: (Source & {
    entry: { reading: number | null; pumpHours: number | null; reset: boolean; volume: number | null; note?: string; by?: string } | null;
    previous: { date: string; reading: number | null; pumpHours: number | null } | null;
    todayM3: number | null;
    week: { date: string; m3: number | null }[];
  })[];
};

export type MeterFlag = {
  acctId: number;
  flag: "stuck" | "backwards" | "drop";
  recentAvg: number;
  priorAvg: number | null;
  lostPerMonth: number | null;
  lastRead: string;
  lastReading: number;
  accountNo: string;
  name: string;
  meterNo: string;
  barangay: string;
  system: string;
};

export type MeterHealth = {
  accountsChecked: number;
  counts: { stuck: number; backwards: number; drop: number };
  lostPerMonth: number;
  flags: MeterFlag[];
};

export const FLAG_LABEL: Record<MeterFlag["flag"], string> = {
  stuck: "Stuck — 0 m³ three bills in a row",
  backwards: "Reading went backwards",
  drop: "Sudden drop in use",
};

export const m3 = (n: number) => `${Math.round(n).toLocaleString("en-PH")} m³`;
export const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortDate = (iso: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "";

/** NRW % band, the way utilities usually read it (the Philippine target is about 20%). */
export function nrwTone(pct: number | null): "good" | "warn" | "bad" | "" {
  if (pct == null) return "";
  if (pct <= 20) return "good";
  if (pct <= 35) return "warn";
  return "bad";
}

export function meterHealthCsv(h: MeterHealth) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    ["Account No.", "Name", "Barangay", "System", "Meter No.", "Flag", "Earlier average m3", "Last 3 bills average m3", "Est. m3 a month not billed", "Last read", "Last reading"].map(q).join(","),
    ...h.flags.map((f) =>
      [f.accountNo, f.name, f.barangay, f.system, f.meterNo, FLAG_LABEL[f.flag], f.priorAvg ?? "", f.recentAvg, f.lostPerMonth ?? "", f.lastRead, f.lastReading].map(q).join(","),
    ),
  ].join("\r\n");
}

/**
 * The balance rows worth showing, newest first: months where any system has
 * production logged (or authorised use entered). Months before logging began
 * are only empty rows, so they're counted instead; with nothing logged yet,
 * the latest month still shows.
 */
export function rowsToShow(rows: BalanceRow[]) {
  const key = (r: BalanceRow) => r.year * 12 + r.month;
  const active = new Set(rows.filter((r) => r.producedLogged > 0 || r.authorised > 0).map(key));
  if (!active.size && rows.length) active.add(Math.max(...rows.map(key)));
  const shown = rows.filter((r) => active.has(key(r))).reverse();
  const hiddenMonths = new Set(rows.map(key)).size - active.size;
  return { shown, hiddenMonths };
}
