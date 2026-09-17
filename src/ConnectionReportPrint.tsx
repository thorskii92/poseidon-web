import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";

/**
 * Monthly Connection Report. See connectionReport.ts for the reconstructed
 * forecast (ordinary least squares, no VB source given) and the two
 * "connections on file" figures (one date-reconstructed, one a live
 * unconditional count). Styled after this app's own DashboardPage / other
 * analytics-style reports this session — KPI tiles, insight list, plain
 * tables — not the printed-statement convention: no signatures, no paper
 * size, matching the VB source's own "Generated" badge + Print button.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };
const MAX_BAR = 24;
const MARKER_DOT = { r: 4, stroke: "#fff", strokeWidth: 2 };

function pctStr(v: number | null): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type Breakdown = { key: string; count: number; share: number | null };

type Report = {
  month: string; year: number; generatedAt: string;
  kpis: {
    total: number; activeDays: number;
    vsLastMonth: number | null; lastMonthCount: number; lastMonthLabel: string;
    vsLastYear: number | null; lastYearCount: number; lastYearLabel: string;
    ytd: number; connectionsOnFile: number;
  };
  insights: string[];
  byDay: { day: number; count: number }[];
  trend: { month: string; year: number; count: number; change: number | null; totalOnFile: number }[];
  projection: { month: string; year: number; count: number; totalOnFile: number }[];
  dataQuality: { label: string; count: number; share: number | null }[];
  breakdowns: {
    byClassification: Breakdown[]; byBarangay: Breakdown[]; byCluster: Breakdown[]; byZone: Breakdown[];
    bySenior: Breakdown[]; byMeterSize: Breakdown[]; byMeterBrand: Breakdown[];
  } | null;
  detail: {
    no: number; connectedOn: string; accountNo: string; accountName: string; isSenior: boolean;
    barangay: string; cluster: string; classification: string; meterNo: string; meterSize: string;
    hh: number; minimumMonthly: number;
  }[];
  totals: { hh: number; minMonthly: number };
};

export default function ConnectionReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!month || !year) return;
    apiGet<Report>(`/api/reports/monthly-connections?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, year]);

  if (!month || !year) {
    return (
      <div className="print-root">
        <div className="form-error">No month/year given.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="print-root">
        <div className="form-error">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="print-root">
        <p className="count">Building the report…</p>
      </div>
    );
  }

  const trendChart = [
    ...data.trend.map((t) => ({ label: `${t.month.slice(0, 3)} ${String(t.year).slice(2)}`, count: t.count, forecast: false })),
    ...data.projection.map((t) => ({ label: `${t.month.slice(0, 3)} ${String(t.year).slice(2)}*`, count: t.count, forecast: true })),
  ];

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <p className="account-no" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Monthly New Connections Report
          </p>
          <h1>Connections made in {data.month} {data.year}</h1>
        </div>
        <div className="head-actions no-print">
          <span className="count">Generated {new Date(data.generatedAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <button className="clear-filters" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="dash-kpis">
        <KpiTile label="New connections" value={data.kpis.total.toLocaleString()} sub={`${data.kpis.activeDays} day(s) with activity`} />
        <KpiTile
          label="Against last month"
          value={data.kpis.lastMonthCount > 0 ? pctStr(data.kpis.vsLastMonth) : "—"}
          sub={data.kpis.lastMonthCount > 0 ? `${data.kpis.lastMonthLabel}: ${data.kpis.lastMonthCount}` : "No connections recorded"}
        />
        <KpiTile
          label={`Against ${data.kpis.lastYearLabel}`}
          value={data.kpis.lastYearCount > 0 ? pctStr(data.kpis.vsLastYear) : "—"}
          sub={data.kpis.lastYearCount > 0 ? `${data.kpis.lastYearCount} that month` : "No connections recorded"}
        />
        <KpiTile label="Year to date" value={data.kpis.ytd.toLocaleString()} sub={`January to ${data.month} ${data.year}`} />
        <KpiTile label="Connections on file" value={data.kpis.connectionsOnFile.toLocaleString()} sub="At the end of the month" />
      </div>

      {data.kpis.total === 0 && (
        <p className="count">No connection was recorded in {data.month} {data.year}. The trend and forecast below still apply.</p>
      )}

      {data.insights.length > 0 && (
        <div className="dash-insights">
          {data.insights.map((s, i) => <div key={i} className="dash-insight">{s}</div>)}
        </div>
      )}

      <section className="record-section">
        <div className="record-head"><h2>Connections by day</h2></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.byDay} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval={2} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#f4f7fa" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as (typeof data.byDay)[number];
                  return (
                    <div className="chart-tip">
                      <div className="chart-tip-head">{data.month} {p.day}</div>
                      <div className="chart-tip-row"><span>Connections</span><span>{p.count}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Connections" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={MAX_BAR} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="record-section dash-chart-wide">
        <div className="record-head"><h2>Twelve-month trend and outlook</h2><span className="count">months marked * are projected</span></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendChart} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as (typeof trendChart)[number];
                  return (
                    <div className="chart-tip">
                      <div className="chart-tip-head">{p.label}{p.forecast ? " (projected)" : ""}</div>
                      <div className="chart-tip-row"><span>Connections</span><span>{p.count}</span></div>
                    </div>
                  );
                }}
              />
              <Line dataKey="count" name="Connections" type="monotone" stroke="var(--blue)" strokeWidth={2.5} dot={MARKER_DOT} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <table>
          <thead><tr><th>Month</th><th className="num">Connections</th><th className="num">Change</th><th className="num">Total on file at month end</th></tr></thead>
          <tbody>
            {data.trend.map((t, i) => (
              <tr key={i}>
                <td>{t.month} {t.year}</td><td className="num">{t.count}</td>
                <td className="num">{pctStr(t.change)}</td><td className="num">{t.totalOnFile.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Twelve-month total</td>
              <td className="num">{data.trend.reduce((s, t) => s + t.count, 0).toLocaleString()}</td>
              <td className="num" />
              <td className="num">{data.kpis.connectionsOnFile.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <table>
          <caption className="dash-chart-note">Projected from the twelve-month trend. Indicative only — it assumes conditions hold and takes no account of planned expansion or moratoria.</caption>
          <thead><tr><th>Month</th><th className="num">Projected connections</th><th className="num">Projected total on file</th></tr></thead>
          <tbody>
            {data.projection.map((t, i) => (
              <tr key={i}><td>{t.month} {t.year}</td><td className="num">{t.count.toLocaleString()}</td><td className="num">{t.totalOnFile.toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.breakdowns && (
        <>
          <section className="record-section">
            <div className="record-head"><h2>Connections by consumer classification</h2></div>
            <BreakdownTable data={data.breakdowns.byClassification} keyLabel="Classification" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Connections by barangay</h2></div>
            <BreakdownTable data={data.breakdowns.byBarangay} keyLabel="Barangay" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Connections by cluster</h2><span className="count">top 12</span></div>
            <BreakdownTable data={data.breakdowns.byCluster} keyLabel="Cluster" />
          </section>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>By water system</h2></div>
              <BreakdownTable data={data.breakdowns.byZone} keyLabel="Zone" />
            </section>
            <section className="record-section">
              <div className="record-head"><h2>Senior citizen accounts</h2></div>
              <BreakdownTable data={data.breakdowns.bySenior} keyLabel="Consumer" />
            </section>
          </div>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>By meter size</h2></div>
              <BreakdownTable data={data.breakdowns.byMeterSize} keyLabel="Meter size" />
            </section>
            <section className="record-section">
              <div className="record-head"><h2>By meter brand</h2></div>
              <BreakdownTable data={data.breakdowns.byMeterBrand} keyLabel="Meter brand" />
            </section>
          </div>

          {data.dataQuality.length > 0 && (
            <section className="record-section">
              <div className="record-head"><h2>Records needing completion</h2></div>
              <table>
                <thead><tr><th>Missing detail</th><th className="num">Connections</th><th className="num">Share</th></tr></thead>
                <tbody>
                  {data.dataQuality.map((d) => (
                    <tr key={d.label}><td>{d.label}</td><td className="num">{d.count}</td><td className="num">{pctStr(d.share)}</td></tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="record-section">
            <div className="record-head"><h2>New connection detail</h2></div>
            <table>
              <thead>
                <tr>
                  <th className="num">#</th><th>Date</th><th>Account no.</th><th>Account name</th><th>Barangay</th>
                  <th>Cluster</th><th>Class</th><th>Meter no.</th><th>Size</th><th className="num">HH</th><th className="num">Minimum</th>
                </tr>
              </thead>
              <tbody>
                {data.detail.map((r) => (
                  <tr key={r.no}>
                    <td className="num">{r.no}</td>
                    <td>{new Date(r.connectedOn).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}</td>
                    <td>{r.accountNo}</td>
                    <td>{r.accountName}{r.isSenior && <span className="cell-sub"> (SC)</span>}</td>
                    <td>{r.barangay}</td><td>{r.cluster}</td><td>{r.classification}</td>
                    <td>{r.meterNo || <span className="muted">none</span>}</td>
                    <td>{r.meterSize}</td>
                    <td className="num">{r.hh > 0 ? r.hh : ""}</td>
                    <td className="num">{peso.format(r.minimumMonthly)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9}>Total</td>
                  <td className="num">{data.totals.hh.toLocaleString()}</td>
                  <td className="num">{peso.format(data.totals.minMonthly)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ data, keyLabel }: { data: Breakdown[]; keyLabel: string }) {
  if (!data.length) return <p className="count">No data.</p>;
  return (
    <table>
      <thead><tr><th>{keyLabel}</th><th className="num">Connections</th><th className="num">Share</th></tr></thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}><td>{d.key}</td><td className="num">{d.count}</td><td className="num">{pctStr(d.share)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
