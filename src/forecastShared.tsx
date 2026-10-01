import type { ReactNode } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";

import { m3, peso, pct, type Forecast, type ForecastMonth, type Group, type MonthPoint } from "./forecastData";

/**
 * The demand forecast's pieces, shared by the page and its print view:
 * the chart, the month-by-month table and the breakdown tables.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const ACTUAL = "var(--navy)";
const FORECAST = "var(--blue)";
const BACKTEST = "#9ca3af";

type ChartRow = MonthPoint & { range?: [number, number] };

/**
 * Actual billed m³, then the forecast with its likely range, on one axis.
 * The forecast line starts on the last actual month so the two join.
 */
export function ForecastChart({
  data, historyShown = 24, showBacktest = false, height = 300, animate = true,
}: { data: Forecast; historyShown?: number; showBacktest?: boolean; height?: number; animate?: boolean }) {
  const history = data.months.filter((m) => m.actual != null).slice(-historyShown);
  const ahead = data.months.filter((m) => m.forecast != null);
  const last = history[history.length - 1];
  const rows: ChartRow[] = [
    ...history.map((m) => (m === last ? { ...m, forecast: m.actual, range: [m.actual!, m.actual!] as [number, number] } : m)),
    ...ahead.map((m) => ({ ...m, range: [m.low!, m.high!] as [number, number] })),
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#eef1f4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#e3e6ea" }} interval="preserveStartEnd" minTickGap={18} />
        <YAxis
          tick={AXIS_TICK} tickLine={false} axisLine={false} width={48}
          tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        />
        {last && <ReferenceLine x={last.label} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: "now", position: "insideTopRight", fontSize: 11, fill: "#6b7280" }} />}
        <Tooltip
          cursor={{ stroke: "#cbd5e1" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as ChartRow;
            const isForecast = p.actual == null;
            return (
              <div className="chart-tip">
                <div className="chart-tip-head">{p.label}{isForecast ? " · forecast" : ""}</div>
                {p.actual != null && <div className="chart-tip-row"><span>Billed</span><span>{m3(p.actual)}</span></div>}
                {showBacktest && p.backtest != null && (
                  <div className="chart-tip-row"><span>Forecast a year before</span><span>{m3(p.backtest)}</span></div>
                )}
                {isForecast && p.forecast != null && (
                  <>
                    <div className="chart-tip-row"><span>Forecast</span><span>{m3(p.forecast)}</span></div>
                    <div className="chart-tip-row"><span>Likely range</span><span>{Math.round(p.low!).toLocaleString("en-PH")}–{m3(p.high!)}</span></div>
                  </>
                )}
                <div className="chart-tip-row"><span>Accounts{isForecast ? " (expected)" : ""}</span><span>{p.accounts.toLocaleString("en-PH")}</span></div>
              </div>
            );
          }}
        />
        <Area dataKey="range" stroke="none" fill={FORECAST} fillOpacity={0.14} isAnimationActive={animate} name="Likely range" />
        <Line dataKey="actual" stroke={ACTUAL} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={animate} name="Billed" />
        {showBacktest && (
          <Line dataKey="backtest" stroke={BACKTEST} strokeWidth={2} strokeDasharray="2 4" dot={false} connectNulls isAnimationActive={animate} name="Forecast a year before" />
        )}
        <Line dataKey="forecast" stroke={FORECAST} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2.5 }} activeDot={{ r: 5 }} isAnimationActive={animate} name="Forecast" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** The chart's key — identity never rests on colour alone (solid vs dashed). */
export function ForecastLegend({ showBacktest }: { showBacktest: boolean }) {
  const item = (swatch: ReactNode, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{swatch}{label}</span>
  );
  const line = (color: string, dash?: string) => (
    <svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} /></svg>
  );
  return (
    <div className="count" style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 4 }}>
      {item(line(ACTUAL), "Billed")}
      {item(line(FORECAST, "6 4"), "Forecast")}
      {item(<span style={{ width: 18, height: 10, borderRadius: 2, background: FORECAST, opacity: 0.18, display: "inline-block" }} />, "Likely range (~80%)")}
      {showBacktest && item(line(BACKTEST, "2 4"), "What it forecast a year before")}
    </div>
  );
}

export function ForecastTable({ rows }: { rows: ForecastMonth[] }) {
  const produce = rows.some((r) => r.toProduce != null);
  return (
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th className="n">Accounts</th>
          <th className="n">m³ per account</th>
          <th className="n">Forecast</th>
          <th className="n">Likely range</th>
          <th className="n">Same month last year</th>
          <th className="n">Change</th>
          {produce && <th className="n" title="Billed demand plus the recent share lost as non-revenue water">Water to produce</th>}
          <th className="n" title="Under the tariff in force that month, on today's mix of customers">₱ per m³</th>
          <th className="n">Expected billings</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key}>
            <td>{r.longLabel}</td>
            <td className="n">{r.accounts.toLocaleString("en-PH")}</td>
            <td className="n">{r.perAccount.toFixed(1)}</td>
            <td className="n"><b>{m3(r.m3)}</b></td>
            <td className="n">{Math.round(r.low).toLocaleString("en-PH")}–{Math.round(r.high).toLocaleString("en-PH")}</td>
            <td className="n">{r.lastYear != null ? m3(r.lastYear) : "—"}</td>
            <td className="n">{r.lastYear ? pct(((r.m3 - r.lastYear) / r.lastYear) * 100) : "—"}</td>
            {produce && <td className="n">{r.toProduce != null ? m3(r.toProduce) : "—"}</td>}
            <td className="n" title={r.tariff ?? undefined}>
              {peso(r.pricePerM3)}
              {i > 0 && r.tariff && r.tariff !== rows[i - 1]!.tariff && <span className="count"> · new tariff</span>}
            </td>
            <td className="n">{peso(r.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GroupTable({ title, rows, horizon }: { title: string; rows: Group[]; horizon: number }) {
  return (
    <table>
      <thead>
        <tr>
          <th>{title}</th>
          <th className="n">Accounts now</th>
          <th className="n">Next {horizon} months</th>
          <th className="n">Same months last year</th>
          <th className="n">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.id}>
            <td>
              {g.name}
              {g.forecast != null && g.historyMonths < 24 && (
                <span className="count" title="Under two years of bills: its seasons are borrowed from the whole service area"> · {g.historyMonths} months of history</span>
              )}
            </td>
            <td className="n">{g.accounts.toLocaleString("en-PH")}</td>
            <td className="n">{g.forecast != null ? m3(g.forecast) : <span className="count">not enough history</span>}</td>
            <td className="n">{g.lastYear != null ? m3(g.lastYear) : "—"}</td>
            <td className="n">{pct(g.changePct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

export function ForecastKpis({ data }: { data: Forecast }) {
  const s = data.summary!;
  const a = data.accuracy!;
  return (
    <>
      <KpiTile
        label={`Next ${data.horizon} months`}
        value={m3(s.total)}
        sub={s.growthPct != null ? `${pct(s.growthPct)} on the same months last year` : undefined}
      />
      <KpiTile
        label="Expected billings"
        value={peso(s.revenue)}
        sub={data.tariffPriced ? "at the tariff in force each month" : `at the recent ${peso(data.pricePerM3 ?? 0)} per m³`}
      />
      {s.toProduce != null && data.nrw && (
        <KpiTile label="Water to produce" value={m3(s.toProduce)} sub={`billed + ${data.nrw.pct}% non-revenue water`} />
      )}
      <KpiTile label="Highest month" value={m3(s.peak.m3)} sub={s.peak.label} />
      <KpiTile
        label="Accounts billed"
        value={s.accountsEnd.toLocaleString("en-PH")}
        sub={`expected by the end, from ${s.accountsNow.toLocaleString("en-PH")} now`}
      />
      <KpiTile
        label="Track record"
        value={a.oneMonthPct != null ? `±${a.oneMonthPct.toFixed(1)}%` : "—"}
        sub={a.oneMonthPct != null ? "average miss, one month ahead, over the last year" : "not enough history to test"}
      />
    </>
  );
}
