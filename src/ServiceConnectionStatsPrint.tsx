import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";

/**
 * Service Connection Statistics. See serviceConnectionStats.ts for the
 * orphan-count warning (transactions whose account no longer resolves,
 * counted in the Summary total but dropped from the Zone/Barangay,
 * Barangay/Cluster and Classification breakdowns) and why Zone/Barangay
 * reads zones.PlantName rather than the Abbrv this app's other reports use.
 * No signatures/paper controls — the VB source's own template is a plain
 * data-table report with a print bar, not a document anyone signs.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };
const SERIES_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

function pctStr(v: number): string {
  return `${v.toFixed(1)}%`;
}
function signed(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

type LogType = { id: number; name: string };
type Counts = Record<number, number>;

type Report = {
  view: "annual" | "monthly"; year: number; month?: number;
  reportTitle: string; periodLabel: string; generatedAt: string;
  logTypes: LogType[]; orphanCount: number;
  summary: {
    rows: { id: number; name: string; count: number; pctOfTotal: number; priorCount: number; change: number }[];
    grandTotal: number; priorGrandTotal: number; comparisonLabel: string;
  };
  zoneBarangay: { rows: { zone: string; barangay: string; counts: Counts; total: number }[]; grandTotals: Counts };
  barangayCluster: { groups: { barangay: string; rows: { cluster: string; counts: Counts; total: number }[]; subtotal: Counts; subtotalTotal: number }[]; grandTotals: Counts };
  classification: { rows: { classification: string; counts: Counts; total: number }[]; grandTotals: Counts };
  trend: {
    months: { month: string; counts: Counts; total: number }[];
    firstHalf: Counts; firstHalfTotal: number; secondHalf: Counts; secondHalfTotal: number;
    yearTotals: Counts; yearTotal: number;
  } | null;
  cumulative: { rows: { id: number; name: string; count: number; pctOfTotal: number }[]; grandTotal: number; asOfLabel: string };
};

export default function ServiceConnectionStatsPrint() {
  const [params] = useSearchParams();
  const view = params.get("view") === "monthly" ? "monthly" : "annual";
  const year = params.get("year") ?? "";
  const month = params.get("month") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!year) return;
    if (view === "monthly" && !month) return;
    const qs = new URLSearchParams({ view, year, ...(view === "monthly" ? { month } : {}) });
    apiGet<Report>(`/api/reports/service-connection-stats?${qs.toString()}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [view, year, month]);

  if (!year || (view === "monthly" && !month)) {
    return (
      <div className="print-root">
        <div className="form-error">No year/month given.</div>
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

  const logTypes = data.logTypes;
  let sectionNum = 0;
  const nextSection = () => { sectionNum += 1; return sectionNum; };

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>{data.reportTitle}</h1>
          <p className="account-no">Period: {data.periodLabel}</p>
        </div>
        <div className="head-actions no-print">
          <span className="count">Generated {new Date(data.generatedAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <button className="clear-filters" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {data.orphanCount > 0 && (
        <div className="notice" style={{ background: "#fffbeb", color: "#92400e" }}>
          <span>
            ⚠ {data.orphanCount} transaction(s) this period reference an account not found in consumer records.
            These are counted in the Summary total below but excluded from the Zone/Barangay, Barangay/Cluster,
            and Classification breakdowns, since those require a valid account link. This is why breakdown totals
            can be lower than the Summary total.
          </span>
        </div>
      )}

      <section className="record-section">
        <div className="record-head"><h2>{nextSection()}. Transaction Type Summary</h2></div>
        <table>
          <thead>
            <tr><th>Transaction Type</th><th className="num">Count</th><th className="num">% of Total</th><th className="num">{data.summary.comparisonLabel}</th><th className="num">Change</th></tr>
          </thead>
          <tbody>
            {data.summary.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td className="num">{r.count}</td><td className="num">{pctStr(r.pctOfTotal)}</td>
                <td className="num">{r.priorCount}</td><td className="num">{signed(r.change)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL</td><td className="num">{data.summary.grandTotal}</td><td className="num">100.0%</td>
              <td className="num">{data.summary.priorGrandTotal}</td>
              <td className="num">{signed(data.summary.grandTotal - data.summary.priorGrandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="record-section">
        <div className="record-head"><h2>{nextSection()}. Breakdown by Zone / Barangay</h2></div>
        <table>
          <thead>
            <tr>
              <th>Zone</th><th>Barangay</th>
              {logTypes.map((t) => <th key={t.id} className="num">{t.name}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.zoneBarangay.rows.length === 0 ? (
              <tr><td colSpan={logTypes.length + 3} style={{ textAlign: "center" }} className="muted">No activity recorded for this period.</td></tr>
            ) : (
              data.zoneBarangay.rows.map((r, i, arr) => (
                <tr key={`${r.zone}|${r.barangay}`}>
                  <td>{i > 0 && arr[i - 1]!.zone === r.zone ? "" : r.zone}</td>
                  <td>{r.barangay}</td>
                  {logTypes.map((t) => <td key={t.id} className="num">{r.counts[t.id]}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{r.total}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.zoneBarangay.rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.zoneBarangay.grandTotals[t.id]}</td>)}
                <td className="num">{logTypes.reduce((s, t) => s + (data.zoneBarangay.grandTotals[t.id] ?? 0), 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="record-section">
        <div className="record-head"><h2>{nextSection()}. Breakdown by Barangay / Cluster</h2></div>
        <table>
          <thead>
            <tr>
              <th>Barangay</th><th>Cluster</th>
              {logTypes.map((t) => <th key={t.id} className="num">{t.name}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.barangayCluster.groups.length === 0 ? (
              <tr><td colSpan={logTypes.length + 3} style={{ textAlign: "center" }} className="muted">No activity recorded for this period.</td></tr>
            ) : (
              data.barangayCluster.groups.map((g) => (
                <Fragment key={g.barangay}>
                  {g.rows.map((r, i) => (
                    <tr key={r.cluster}>
                      <td>{i === 0 ? g.barangay : ""}</td>
                      <td>{r.cluster}</td>
                      {logTypes.map((t) => <td key={t.id} className="num">{r.counts[t.id]}</td>)}
                      <td className="num" style={{ fontWeight: 600 }}>{r.total}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, fontStyle: "italic", background: "#f5f5f5" }}>
                    <td colSpan={2}>Subtotal — {g.barangay}</td>
                    {logTypes.map((t) => <td key={t.id} className="num">{g.subtotal[t.id]}</td>)}
                    <td className="num">{g.subtotalTotal}</td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {data.barangayCluster.groups.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2}>TOTAL</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.barangayCluster.grandTotals[t.id]}</td>)}
                <td className="num">{logTypes.reduce((s, t) => s + (data.barangayCluster.grandTotals[t.id] ?? 0), 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="record-section">
        <div className="record-head"><h2>{nextSection()}. Breakdown by Classification</h2></div>
        <table>
          <thead>
            <tr>
              <th>Classification</th>
              {logTypes.map((t) => <th key={t.id} className="num">{t.name}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.classification.rows.length === 0 ? (
              <tr><td colSpan={logTypes.length + 2} style={{ textAlign: "center" }} className="muted">No activity recorded for this period.</td></tr>
            ) : (
              data.classification.rows.map((r) => (
                <tr key={r.classification}>
                  <td>{r.classification}</td>
                  {logTypes.map((t) => <td key={t.id} className="num">{r.counts[t.id]}</td>)}
                  <td className="num" style={{ fontWeight: 600 }}>{r.total}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.classification.rows.length > 0 && (
            <tfoot>
              <tr>
                <td>TOTAL</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.classification.grandTotals[t.id]}</td>)}
                <td className="num">{logTypes.reduce((s, t) => s + (data.classification.grandTotals[t.id] ?? 0), 0)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      {data.trend && (
        <section className="record-section dash-chart-wide">
          <div className="record-head"><h2>{nextSection()}. Monthly Trend</h2></div>
          <div className="chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data.trend.months.map((m) => ({ label: m.month.slice(0, 3), ...m.counts }))} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {logTypes.map((t, i) => (
                  <Line key={t.id} dataKey={t.id} name={t.name} type="monotone" stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                {logTypes.map((t) => <th key={t.id} className="num">{t.name}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.months.slice(0, 6).map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  {logTypes.map((t) => <td key={t.id} className="num">{m.counts[t.id]}</td>)}
                  <td className="num">{m.total}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, fontStyle: "italic", background: "#f5f5f5" }}>
                <td>Subtotal (Jan – Jun)</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.trend!.firstHalf[t.id]}</td>)}
                <td className="num">{data.trend.firstHalfTotal}</td>
              </tr>
              {data.trend.months.slice(6, 12).map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  {logTypes.map((t) => <td key={t.id} className="num">{m.counts[t.id]}</td>)}
                  <td className="num">{m.total}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, fontStyle: "italic", background: "#f5f5f5" }}>
                <td>Subtotal (Jul – Dec)</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.trend!.secondHalf[t.id]}</td>)}
                <td className="num">{data.trend.secondHalfTotal}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>TOTAL</td>
                {logTypes.map((t) => <td key={t.id} className="num">{data.trend!.yearTotals[t.id]}</td>)}
                <td className="num">{data.trend.yearTotal}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      <section className="record-section">
        <div className="record-head"><h2>{nextSection()}. Cumulative Total (All-Time, as of {data.cumulative.asOfLabel})</h2></div>
        <table>
          <thead><tr><th>Transaction Type</th><th className="num">Cumulative Count</th><th className="num">% of Cumulative Total</th></tr></thead>
          <tbody>
            {data.cumulative.rows.map((r) => (
              <tr key={r.id}><td>{r.name}</td><td className="num">{r.count}</td><td className="num">{pctStr(r.pctOfTotal)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>TOTAL</td><td className="num">{data.cumulative.grandTotal}</td><td className="num">100.0%</td></tr>
          </tfoot>
        </table>
      </section>

      <p className="dash-chart-note">Excludes inactive barangays/clusters/classifications.</p>
    </div>
  );
}
