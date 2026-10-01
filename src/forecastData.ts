/**
 * The demand forecast's data shapes and formatting, shared by the page,
 * its print view and their components (forecastShared.tsx). Numbers come
 * from /api/forecast — see poseidon-api/src/forecast.ts.
 */

export type MonthPoint = {
  key: number;
  label: string;
  actual?: number;
  accounts: number;
  backtest?: number | null;
  forecast?: number;
  low?: number;
  high?: number;
};

export type ForecastMonth = {
  key: number;
  label: string;
  longLabel: string;
  m3: number;
  low: number;
  high: number;
  accounts: number;
  perAccount: number;
  revenue: number;
  /** ₱ per m³ under the tariff in force that month, on today's mix of customers. */
  pricePerM3: number;
  tariff: string | null;
  /** Billed ÷ (1 − recent NRW share); null until production is logged. */
  toProduce: number | null;
  lastYear: number | null;
};

export type Group = {
  id: number;
  name: string;
  accounts: number;
  historyMonths: number;
  forecast: number | null;
  lastYear: number | null;
  changePct: number | null;
};

export type Forecast = {
  horizon: number;
  brgyId: number;
  classId: number;
  newPerMonth: number;
  scopeLabel: string;
  filters: { barangays: { id: number; name: string }[]; classifications: { id: number; name: string }[] };
  signatories?: import("./Signatories").SignatorySlot[];
  enough: boolean;
  historyMonths: number;
  minHistory?: number;
  historyFrom?: string;
  historyTo?: string;
  seasonFrom?: "own" | "town";
  pricePerM3?: number;
  /** False when the rate functions couldn't be used and billings use the recent average ₱/m³. */
  tariffPriced?: boolean;
  nrw?: { pct: number; months: string[]; system: number } | null;
  summary?: {
    total: number;
    revenue: number;
    toProduce: number | null;
    lastYearTotal: number | null;
    growthPct: number | null;
    peak: { label: string; m3: number };
    accountsNow: number;
    accountsEnd: number;
  };
  accuracy?: { oneMonthPct: number | null; overallPct: number | null; tests: number; bandPct: number };
  months: MonthPoint[];
  forecast?: ForecastMonth[];
  byBarangay?: Group[];
  byClassification?: Group[];
  insights?: string[];
};

export const m3 = (n: number) => `${Math.round(n).toLocaleString("en-PH")} m³`;
export const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;

/** /api/forecast query string for a set of choices. */
export function forecastQuery(o: { horizon: number; brgyId: number; classId: number; newPerMonth: number }) {
  return new URLSearchParams({
    horizon: String(o.horizon),
    brgyId: String(o.brgyId),
    classId: String(o.classId),
    newPerMonth: String(o.newPerMonth),
  }).toString();
}

/** The month-by-month forecast as CSV (opens in Excel). */
export function forecastCsv(data: Forecast) {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Scope", data.scopeLabel].map(q).join(","),
    "",
    ["Month", "Accounts", "m3 per account", "Forecast m3", "Low", "High", "Same month last year", "Water to produce m3", "Tariff", "Peso per m3", "Expected billings"].map(q).join(","),
    ...(data.forecast ?? []).map((r) =>
      [r.longLabel, r.accounts, r.perAccount, r.m3, r.low, r.high, r.lastYear ?? "", r.toProduce ?? "", r.tariff ?? "", r.pricePerM3.toFixed(2), r.revenue.toFixed(2)].map(q).join(","),
    ),
  ];
  return lines.join("\r\n");
}
