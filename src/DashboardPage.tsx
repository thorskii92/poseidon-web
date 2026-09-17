import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import {
  ComposedChart, BarChart, LineChart, Bar, Line, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/**
 * The landing page — every signed-in account sees this first, regardless of
 * role (see server.ts: /api/analytics is gated on requireAuth only, not a
 * page permission, on purpose).
 *
 * A fresh design, not a port of the desktop's "System Analytics" screen —
 * that screen was six charts of raw counts per dimension (an 11-slice pie
 * chief among them) with no rate, no comparison, and no read on what's
 * overdue. This is built around the questions a utility actually asks a
 * dashboard: is revenue up or down, how much of what's billed gets
 * collected, who's overdue and by how much, where is the pending-work
 * backlog. See poseidon-api's analytics.ts for the aggregation queries and
 * the reasoning behind each one — most notably why the current, still-
 * in-progress calendar month is excluded from the rate KPIs (it very
 * briefly showed a 1000%+ "collection rate" during testing, from a month
 * that had barely been billed yet colliding with a full month of arrears
 * being paid off — the trend chart still plots it, just marked partial).
 */

type Kpis = {
  activeAccounts: number;
  collectionRate: number | null;
  collectionRateMonth: string;
  collectionRateDelta: number | null;
  collectedThisMonth: number;
  collectedLastMonth: number;
  lastMonthLabel: string;
  outstanding: number;
  accountsNeedingAction: number;
  overdueAccounts: number;
  totalReceipts: number;
};

type RevenuePoint = { label: string; billed: number; collected: number; rate: number | null; partial: boolean };
type StatusRow = { status: string; count: number };
type AgingBucket = { label: string; status: "good" | "warning" | "serious" | "critical"; amount: number; count: number };
type MonthCount = { label: string; count: number };
type NamedAmount = { name: string; amount: number };
type ChannelPoint = { label: string; online: number; counter: number };
type ConsumptionPoint = { label: string; cubicMeters: number; partial: boolean };

type DashboardData = {
  kpis: Kpis;
  revenueTrend: RevenuePoint[];
  pendingBreakdown: StatusRow[];
  aging: AgingBucket[];
  newConnections: MonthCount[];
  topBarangays: NamedAmount[];
  paymentChannel: ChannelPoint[];
  onlineShare: number;
  consumptionTrend: ConsumptionPoint[];
  revenueByNature: NamedAmount[];
  insights: string[];
};

const STATUS_COLOR: Record<AgingBucket["status"], string> = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

// The chart-card surface (.record-section's own background) — used for the
// 2px ring around line markers and the 2px gap between stacked-bar segments,
// per the dataviz method's mark specs. Never a mismatched stroke color: that
// reads as a border/outline (extra ink), not a gap.
const SURFACE = "#fff";

// A validated categorical pair (dataviz skill's reference palette, slots 1/2)
// for the one chart that compares two named series rather than showing a
// single magnitude — the app's own --blue-soft stays as Counter's identity,
// unchanged everywhere else it's used as a single-series fill.
const ONLINE_COLOR = "#eb6834";

// Mark spec caps a bar/column at 24px so the band's leftover stays air.
const MAX_BAR = 24;

function compactPeso(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₱${(v / 1_000).toFixed(0)}K`;
  return peso.format(v);
}

/** Ring the marker in the chart surface so it stays legible where it crosses
 *  the line or another mark — the "surface ring" spacer, not a border. */
const MARKER_DOT = { r: 4, stroke: SURFACE, strokeWidth: 2 };

/**
 * Every chart card gets a "View as table" toggle — the relief channel a
 * sub-3:1 fill (the payment-channel amber, the aging warning/serious steps)
 * needs to stay compliant, and the fallback every tooltip-gated value
 * needs per the method ("tooltips enhance, they never gate").
 */
function ChartCard({
  title, note, wide, table, children,
}: { title: string; note?: ReactNode; wide?: boolean; table: ReactNode; children: ReactNode }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={wide ? "record-section dash-chart-wide" : "record-section"}>
      <div className="record-head">
        <h2>{title}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {note}
          <button className="link-button" onClick={() => setView((v) => (v === "chart" ? "table" : "chart"))}>
            {view === "chart" ? "View as table" : "View as chart"}
          </button>
        </div>
      </div>
      {view === "chart" ? children : table}
    </section>
  );
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => apiGet("/api/analytics/dashboard"),
    staleTime: 60_000,
  });

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Dashboard</h1>
          <p className="account-no">Where collections, receivables and pending work stand right now.</p>
        </div>
        <div className="head-actions no-print">
          <button className="clear-filters" onClick={() => window.print()} disabled={!data}>
            Print
          </button>
        </div>
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <div className="form-error">{(error as Error).message}</div>}

      {data && (
        <>
          <div className="dash-kpis">
            <KpiTile label="Active accounts" value={data.kpis.activeAccounts.toLocaleString()} />
            <KpiTile
              label={`Collection rate — ${data.kpis.collectionRateMonth}`}
              value={data.kpis.collectionRate !== null ? `${data.kpis.collectionRate}%` : "—"}
              delta={data.kpis.collectionRateDelta}
              deltaSuffix=" pts"
            />
            <KpiTile
              label="Collected this month"
              value={compactPeso(data.kpis.collectedThisMonth)}
              sub={`${compactPeso(data.kpis.collectedLastMonth)} in all of ${data.kpis.lastMonthLabel}`}
            />
            <KpiTile label="Outstanding receivables" value={compactPeso(data.kpis.outstanding)} sub="unpaid balance, all accounts" />
            <KpiTile label="Accounts needing action" value={data.kpis.accountsNeedingAction.toLocaleString()} sub="installation, transfer, closure…" />
            <KpiTile label="Overdue accounts" value={data.kpis.overdueAccounts.toLocaleString()} sub="at least one unpaid bill past due" />
          </div>

          {data.insights.length > 0 && (
            <div className="dash-insights">
              {data.insights.map((s, i) => (
                <div key={i} className="dash-insight">{s}</div>
              ))}
            </div>
          )}

          <div className="dash-charts">
            <RevenueTrendChart data={data.revenueTrend} />
            <CollectionRateChart data={data.revenueTrend} />
            <ConsumptionChart data={data.consumptionTrend} />
            <AgingChart data={data.aging} />
            <PendingBreakdownChart data={data.pendingBreakdown} />
            <NewConnectionsChart data={data.newConnections} />
            <TopBarangaysChart data={data.topBarangays} />
            <RevenueByNatureChart data={data.revenueByNature} />
            <PaymentChannelChart data={data.paymentChannel} onlineShare={data.onlineShare} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({
  label, value, sub, delta, deltaSuffix = "",
}: { label: string; value: string; sub?: string; delta?: number | null; deltaSuffix?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {delta !== undefined && delta !== null && (
        <div className="dash-kpi-sub">
          <span className={`dash-kpi-delta ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}{deltaSuffix}
          </span>{" "}
          vs previous month
        </div>
      )}
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

/* ==================================================================== *
 * Revenue trend — billed (bar, muted) vs collected (line, brand navy).
 * One axis, same currency — a "target vs actual" read, not a two-series
 * identity comparison, so both stay in the app's own ink rather than a
 * categorical pair.
 * ==================================================================== */

function RevenueTrendChart({ data }: { data: RevenuePoint[] }) {
  return (
    <ChartCard
      title="Revenue — billed vs collected"
      wide
      note={<span className="count">last 12 months</span>}
      table={
        <table>
          <thead><tr><th>Month</th><th className="num">Billed</th><th className="num">Collected</th><th className="num">Rate</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <td>{p.label}{p.partial ? " (in progress)" : ""}</td>
                <td className="num">{peso.format(p.billed)}</td>
                <td className="num">{peso.format(p.collected)}</td>
                <td className="num">{p.rate !== null ? `${p.rate}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={compactPeso} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as RevenuePoint;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}{p.partial ? " (in progress)" : ""}</div>
                    <div className="chart-tip-row"><span>Billed</span><span>{peso.format(p.billed)}</span></div>
                    <div className="chart-tip-row"><span>Collected</span><span>{peso.format(p.collected)}</span></div>
                    {p.rate !== null && (
                      <div className="chart-tip-row total"><span>Rate</span><span>{p.rate}%</span></div>
                    )}
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="billed" name="Billed" fill="var(--tint)" stroke="var(--border)" radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR} />
            <Line dataKey="collected" name="Collected" type="monotone" stroke="var(--navy)" strokeWidth={2.5} dot={MARKER_DOT} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="dash-chart-note">The last bar is the current month, still in progress.</p>
    </ChartCard>
  );
}

function CollectionRateChart({ data }: { data: RevenuePoint[] }) {
  const complete = data.filter((d) => !d.partial);
  return (
    <ChartCard
      title="Collection rate"
      note={<span className="count">collected ÷ billed, per month</span>}
      table={
        <table>
          <thead><tr><th>Month</th><th className="num">Rate</th></tr></thead>
          <tbody>
            {complete.map((p) => (
              <tr key={p.label}><td>{p.label}</td><td className="num">{p.rate}%</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={complete} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as RevenuePoint;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row"><span>Rate</span><span>{p.rate}%</span></div>
                  </div>
                );
              }}
            />
            <Line dataKey="rate" name="Rate" type="monotone" stroke="var(--blue)" strokeWidth={2.5} dot={MARKER_DOT} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/**
 * Consumption. billing's own Fconsump/SConsump/origConsump columns are
 * unpopulated for this deployment, so this is derived server-side from the
 * meter reads behind each bill (presRead - prevRead) instead — see
 * analytics.ts. A non-revenue-water read: usage moving independently of
 * collections is itself a signal (leakage, meter drift, under-reading).
 */
function ConsumptionChart({ data }: { data: ConsumptionPoint[] }) {
  return (
    <ChartCard
      title="Water consumption"
      note={<span className="count">cu.m. billed, last 12 months</span>}
      table={
        <table>
          <thead><tr><th>Month</th><th className="num">Consumption (cu.m.)</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <td>{p.label}{p.partial ? " (in progress)" : ""}</td>
                <td className="num">{p.cubicMeters.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as ConsumptionPoint;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}{p.partial ? " (in progress)" : ""}</div>
                    <div className="chart-tip-row"><span>Consumption</span><span>{p.cubicMeters.toLocaleString()} cu.m.</span></div>
                  </div>
                );
              }}
            />
            <Line dataKey="cubicMeters" name="Consumption" type="monotone" stroke="var(--blue-soft)" strokeWidth={2.5} dot={MARKER_DOT} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ==================================================================== *
 * Aging — each bucket is a financial-risk state (current → 90+ days), so
 * it wears the fixed status scale (good→critical), not a categorical hue —
 * paired with the bucket name and a direct value label, since warning/
 * serious sit under 3:1 contrast on a light surface by design.
 * ==================================================================== */

/**
 * Aging buckets wear the fixed status scale (good→critical), not a
 * categorical hue — but on a light surface, warning and serious sit below
 * 3:1 by design (the reference default's own accepted trade-off). The
 * bucket name is already a visible axis label; a direct value label on top
 * of each bar is the other half of the "icon + label" mitigation, so the
 * balance itself is never gated behind a hover.
 */
function AgingChart({ data }: { data: AgingBucket[] }) {
  return (
    <ChartCard
      title="Receivables aging"
      note={<span className="count">unpaid balance by how overdue</span>}
      table={
        <table>
          <thead><tr><th>Age</th><th className="num">Balance</th><th className="num">Bills</th></tr></thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}><td>{d.label}</td><td className="num">{peso.format(d.amount)}</td><td className="num">{d.count}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={compactPeso} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as AgingBucket;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row"><span>Balance</span><span>{peso.format(p.amount)}</span></div>
                    <div className="chart-tip-row"><span>Bills</span><span>{p.count}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" name="Balance" radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR}>
              {data.map((d) => <Cell key={d.label} fill={STATUS_COLOR[d.status]} />)}
              <LabelList dataKey="amount" position="top" formatter={(v) => compactPeso(Number(v))} style={{ fill: "var(--text-muted)", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/* ==================================================================== *
 * Pending breakdown, new connections, top barangays — each is ONE series
 * (a count or an amount) across many categories, so every bar takes the
 * same identity hue rather than a different color per bar (color doesn't
 * re-encode what the bar's own length already shows).
 * ==================================================================== */

function PendingBreakdownChart({ data }: { data: StatusRow[] }) {
  const height = Math.max(160, data.length * 34 + 40);
  return (
    <ChartCard
      title="Accounts needing action"
      note={<span className="count">{data.reduce((s, d) => s + d.count, 0)} accounts</span>}
      table={
        <table>
          <thead><tr><th>Status</th><th className="num">Accounts</th></tr></thead>
          <tbody>
            {data.map((d) => <tr key={d.status}><td>{d.status}</td><td className="num">{d.count}</td></tr>)}
          </tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="count">Nothing pending right now.</p>
      ) : (
        <div className="chart">
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} allowDecimals={false} />
              <YAxis type="category" dataKey="status" tick={AXIS_TICK} tickLine={false} axisLine={false} width={140} />
              <Tooltip
                cursor={{ fill: "#f4f7fa" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as StatusRow;
                  return (
                    <div className="chart-tip">
                      <div className="chart-tip-head">{p.status}</div>
                      <div className="chart-tip-row"><span>Accounts</span><span>{p.count}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Accounts" fill="var(--blue-soft)" radius={[0, 3, 3, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

function NewConnectionsChart({ data }: { data: MonthCount[] }) {
  return (
    <ChartCard
      title="New connections"
      note={<span className="count">last 12 months</span>}
      table={
        <table>
          <thead><tr><th>Month</th><th className="num">New connections</th></tr></thead>
          <tbody>
            {data.map((p) => <tr key={p.label}><td>{p.label}</td><td className="num">{p.count}</td></tr>)}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as MonthCount;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row"><span>New connections</span><span>{p.count}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="count" name="New connections" fill="var(--blue-soft)" radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function TopBarangaysChart({ data }: { data: NamedAmount[] }) {
  const height = Math.max(200, data.length * 30 + 40);
  return (
    <ChartCard
      title="Top barangays by revenue"
      note={<span className="count">year to date</span>}
      table={
        <table>
          <thead><tr><th>Barangay</th><th className="num">Collected</th></tr></thead>
          <tbody>
            {data.map((d) => <tr key={d.name}><td>{d.name}</td><td className="num">{peso.format(d.amount)}</td></tr>)}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} tickFormatter={compactPeso} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={110} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as NamedAmount;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.name}</div>
                    <div className="chart-tip-row"><span>Collected</span><span>{peso.format(p.amount)}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" name="Collected" fill="var(--blue-soft)" radius={[0, 3, 3, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

/** What collections are actually for — everything before this was billed
 *  vs. collected in aggregate; this is the composition of the "collected"
 *  side (Water Bill, Application Fee, Reconnection Fee, …). One series
 *  across fee-type categories, so one hue — same reasoning as the barangay
 *  and pending-work breakdowns above. */
function RevenueByNatureChart({ data }: { data: NamedAmount[] }) {
  const height = Math.max(200, data.length * 30 + 40);
  return (
    <ChartCard
      title="Revenue by fee type"
      note={<span className="count">last 12 months</span>}
      table={
        <table>
          <thead><tr><th>Fee type</th><th className="num">Collected</th></tr></thead>
          <tbody>
            {data.map((d) => <tr key={d.name}><td>{d.name}</td><td className="num">{peso.format(d.amount)}</td></tr>)}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} tickFormatter={compactPeso} />
            <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={130} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as NamedAmount;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.name}</div>
                    <div className="chart-tip-row"><span>Collected</span><span>{peso.format(p.amount)}</span></div>
                  </div>
                );
              }}
            />
            <Bar dataKey="amount" name="Collected" fill="var(--blue-soft)" radius={[0, 3, 3, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function PaymentChannelChart({ data, onlineShare }: { data: ChannelPoint[]; onlineShare: number }) {
  return (
    <ChartCard
      title="Payment channel"
      note={<span className="count">{onlineShare}% online (ECPay)</span>}
      table={
        <table>
          <thead><tr><th>Month</th><th className="num">Counter</th><th className="num">Online (ECPay)</th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}><td>{p.label}</td><td className="num">{peso.format(p.counter)}</td><td className="num">{peso.format(p.online)}</td></tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="chart">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} tickFormatter={compactPeso} />
            <Tooltip
              cursor={{ fill: "#f4f7fa" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as ChannelPoint;
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row"><span>Counter</span><span>{peso.format(p.counter)}</span></div>
                    <div className="chart-tip-row"><span>Online (ECPay)</span><span>{peso.format(p.online)}</span></div>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Surface-colored stroke, not a border: it reveals the 2px gap
                between stacked segments the mark spec calls for, rather than
                outlining each one. */}
            <Bar dataKey="counter" name="Counter" stackId="ch" fill="var(--blue-soft)" stroke={SURFACE} strokeWidth={2} maxBarSize={MAX_BAR} />
            <Bar dataKey="online" name="Online (ECPay)" stackId="ch" fill={ONLINE_COLOR} stroke={SURFACE} strokeWidth={2} radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
