import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";

/**
 * Annual Connection Report. See annualConnectionReport.ts for the
 * reconstructed forecast and the two "on file" figures — same notes as
 * the monthly sibling. No signatures/paper controls, same reasoning as
 * every other report in this analytics family.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };
const MAX_BAR = 24;

function pctStr(v: number | null): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

type Breakdown = { key: string; count: number; share: number | null };

type Report = {
  year: number; generatedAt: string;
  kpis: {
    total: number; monthsWith: number; vsPriorYear: number | null; priorTotal: number;
    monthlyAverage: number; bestMonthLabel: string; connectionsOnFile: number;
    growthPct: number | null; baseCount: number;
  };
  insights: string[];
  months: { month: string; count: number; share: number | null; priorYear: number; change: number | string | null; cumulative: number; totalOnFile: number }[];
  quarters: { label: string; count: number; share: number | null }[];
  growth: { year: number; count: number; change: number | null }[];
  nextYearProjection: number; projectedChange: number | null; projectedBaseIfHolds: number;
  dataQuality: { label: string; count: number; share: number | null }[];
  breakdowns: {
    byClassification: Breakdown[]; byBarangay: Breakdown[]; byZone: Breakdown[]; byCluster: Breakdown[];
    bySenior: Breakdown[]; byMeterSize: Breakdown[]; byMeterBrand: Breakdown[]; topGrowthBarangays: Breakdown[];
  } | null;
};

export default function AnnualConnectionReportPrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!year) return;
    apiGet<Report>(`/api/reports/annual-connections?year=${encodeURIComponent(year)}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [year]);

  if (!year) {
    return (
      <div className="print-root">
        <div className="form-error">No year given.</div>
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

  const monthChart = data.months.map((m) => ({ label: m.month.slice(0, 3), count: m.count }));
  const growthChart = [
    ...data.growth.map((g) => ({ label: String(g.year), count: g.count })),
    { label: `${data.year + 1}*`, count: data.nextYearProjection },
  ];

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <p className="account-no" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Annual New Connections Report
          </p>
          <h1>Calendar year {data.year}</h1>
        </div>
        <div className="head-actions no-print">
          <span className="count">Generated {new Date(data.generatedAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <button className="clear-filters" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      <div className="dash-kpis">
        <KpiTile label="New connections" value={data.kpis.total.toLocaleString()} sub={`${data.kpis.monthsWith} month(s) with activity`} />
        <KpiTile
          label={`Against ${data.year - 1}`}
          value={data.kpis.priorTotal > 0 ? pctStr(data.kpis.vsPriorYear) : "—"}
          sub={data.kpis.priorTotal > 0 ? `${data.kpis.priorTotal.toLocaleString()} that year` : "No connections recorded"}
        />
        <KpiTile label="Monthly average" value={data.kpis.monthlyAverage.toFixed(1)} sub={`${data.kpis.bestMonthLabel} was the peak`} />
        <KpiTile label="Connections on file" value={data.kpis.connectionsOnFile.toLocaleString()} sub={`At the end of ${data.year}`} />
        <KpiTile
          label="Growth in the base"
          value={data.kpis.baseCount > 0 ? `${data.kpis.growthPct?.toFixed(1)}%` : "—"}
          sub={data.kpis.baseCount > 0 ? `Against ${data.kpis.baseCount.toLocaleString()} at the start` : "No opening base"}
        />
      </div>

      {data.insights.length > 0 && (
        <div className="dash-insights">
          {data.insights.map((s, i) => <div key={i} className="dash-insight">{s}</div>)}
        </div>
      )}

      <section className="record-section dash-chart-wide">
        <div className="record-head"><h2>Connections by month</h2></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthChart} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#f4f7fa" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as (typeof monthChart)[number];
                  return (
                    <div className="chart-tip">
                      <div className="chart-tip-head">{p.label}</div>
                      <div className="chart-tip-row"><span>Connections</span><span>{p.count}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Connections" fill="var(--navy)" radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table>
          <thead>
            <tr>
              <th>Month</th><th className="num">Connections</th><th className="num">Share</th>
              <th className="num">{data.year - 1}</th><th className="num">Change</th>
              <th className="num">Cumulative</th><th className="num">Total on file</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className={m.count === 0 ? "muted" : undefined}>
                <td>{m.month}</td><td className="num">{m.count}</td><td className="num">{pctStr(m.share)}</td>
                <td className="num">{m.priorYear}</td>
                <td className="num">{m.change === "new" ? "new" : pctStr(m.change as number | null)}</td>
                <td className="num">{m.cumulative}</td><td className="num">{m.totalOnFile.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td><td className="num">{data.kpis.total}</td><td className="num">100.0%</td>
              <td className="num">{data.kpis.priorTotal}</td>
              <td className="num">{data.kpis.priorTotal > 0 ? pctStr(data.kpis.vsPriorYear) : "—"}</td>
              <td className="num">{data.kpis.total}</td><td className="num">{data.kpis.connectionsOnFile.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="record-section">
        <div className="record-head"><h2>Quarterly summary</h2></div>
        <table>
          <thead><tr><th>Quarter</th><th className="num">Connections</th><th className="num">Share</th></tr></thead>
          <tbody>
            {data.quarters.map((q) => (
              <tr key={q.label}><td>{q.label}</td><td className="num">{q.count}</td><td className="num">{pctStr(q.share)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Total</td><td className="num">{data.kpis.total}</td><td className="num">100.0%</td></tr>
          </tfoot>
        </table>
      </section>

      <section className="record-section dash-chart-wide">
        <div className="record-head"><h2>Growth of the connection base</h2><span className="count">the last year shown is projected</span></div>
        <div className="chart">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={growthChart} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#f4f7fa" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0]!.payload as (typeof growthChart)[number];
                  return (
                    <div className="chart-tip">
                      <div className="chart-tip-head">{p.label}</div>
                      <div className="chart-tip-row"><span>Connections</span><span>{p.count}</span></div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" name="Connections" fill="var(--blue)" radius={[3, 3, 0, 0]} maxBarSize={MAX_BAR} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table>
          <thead><tr><th>Year</th><th className="num">Connections</th><th className="num">Change</th></tr></thead>
          <tbody>
            {data.growth.map((g) => (
              <tr key={g.year}><td>{g.year}</td><td className="num">{g.count}</td><td className="num">{pctStr(g.change)}</td></tr>
            ))}
            <tr>
              <td>{data.year + 1} (projected)</td><td className="num">{data.nextYearProjection}</td>
              <td className="num">{pctStr(data.projectedChange)}</td>
            </tr>
          </tbody>
        </table>
        <p className="dash-chart-note">
          The projection extends the least-squares trend of the years shown. It is indicative only: it assumes
          conditions hold, and takes no account of planned expansion, moratoria or funding changes. If {data.year + 1} holds
          at the current pace the base would reach about {data.projectedBaseIfHolds.toLocaleString()} connections.
        </p>
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
            <div className="record-head"><h2>Connections by water system</h2></div>
            <BreakdownTable data={data.breakdowns.byZone} keyLabel="Zone" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Connections by cluster</h2><span className="count">top 15</span></div>
            <BreakdownTable data={data.breakdowns.byCluster} keyLabel="Cluster" />
          </section>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>Senior citizen accounts</h2></div>
              <BreakdownTable data={data.breakdowns.bySenior} keyLabel="Consumer" />
            </section>
            <section className="record-section">
              <div className="record-head"><h2>By meter size</h2></div>
              <BreakdownTable data={data.breakdowns.byMeterSize} keyLabel="Meter size" />
            </section>
          </div>

          <section className="record-section">
            <div className="record-head"><h2>By meter brand</h2><span className="count">top 10</span></div>
            <BreakdownTable data={data.breakdowns.byMeterBrand} keyLabel="Meter brand" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Where growth landed hardest</h2></div>
            <p className="dash-chart-note">
              Barangays ranked by the number of connections added this year. Read alongside the collection efficiency
              report: rapid growth in a barangay that already collects poorly compounds the problem.
            </p>
            <BreakdownTable data={data.breakdowns.topGrowthBarangays} keyLabel="Barangay" />
          </section>

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
