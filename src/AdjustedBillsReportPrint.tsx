import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";

/**
 * Monthly Adjusted Bills Report. See adjustedBillsReport.ts for why this
 * doesn't get the standard paper/orientation/scale controls or signatory
 * block every other report this session got — the VB source's own template
 * has neither, just a "Generated <date>" badge and a Print button, because
 * this is an analytics view for browsing, not a document anyone signs.
 *
 * Styled after this app's own DashboardPage rather than the soa-sheet print
 * convention — KPI tiles, an insight list, and plain tables, reusing the
 * same CSS classes (dash-kpis/dash-kpi/dash-insights/record-section) rather
 * than inventing a third visual language for one report.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

function compactPeso(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `₱${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `₱${(v / 1_000).toFixed(0)}K`;
  return peso.format(v);
}
function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}
function pctStr(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}
function daysStr(v: number | null): string {
  return v == null ? "—" : v.toFixed(1);
}

type GroupRow = { key: string; requests: number; share: number; completed: number; rejected: number; reduced: number; avgDays: number | null };
type Breakdown = { groups: GroupRow[]; total: GroupRow };

type Report = {
  empty: boolean;
  month: string; year: number;
  generatedAt: string; asOf: string;
  kpis: { raised: number; completed: number; rejected: number; reduction: number; avgTurnaroundDays: number | null; stillOpen: number };
  insights: string[];
  impact: {
    curWSF: number; newWSF: number; curEF: number; newEF: number;
    curAirContent: number; newAirContent: number; curPenalty: number; newPenalty: number;
    curDiscount: number; newDiscount: number; curConsump: number; newConsump: number;
    curAmountDue: number; newAmountDue: number; reduction: number;
  };
  pipeline: Breakdown;
  stageAverages: {
    toInspection: { cases: number; avgDays: number | null };
    toApproval: { cases: number; avgDays: number | null };
    toAdjustment: { cases: number; avgDays: number | null };
    toCompletion: { cases: number; avgDays: number | null };
  };
  turnaroundWindows: { label: string; cases: number; share: number | null }[];
  agingBuckets: { label: string; cases: number; share: number | null; amount: number }[];
  oldestOpen: { days: number; requested: string | null; accountNo: string; accountName: string; barangay: string; status: string; inspector: string; amountUnderReview: number }[];
  trend: { month: string; year: number; raised: number; completed: number; reduced: number }[];
  byReason: Breakdown; byMethod: Breakdown; byBarangay: Breakdown; byClassification: Breakdown;
  byZone: Breakdown; byCluster: Breakdown; byInspector: Breakdown; byAdjuster: Breakdown;
  rejectedDetail: { date: string | null; accountNo: string; accountName: string; barangay: string; reason: string; rejectedBy: string; amountReviewed: number }[];
  largestReductions: { rank: number; dateAdjusted: string | null; accountNo: string; accountName: string; barangay: string; billPeriod: string; consumpBefore: number; consumpAfter: number; before: number; after: number; reduced: number }[];
  raisedDetail: { no: number; requested: string | null; accountNo: string; accountName: string; barangay: string; billPeriod: string; reason: string; inspector: string; status: string; days: number | null; reduced: number }[];
};

export default function AdjustedBillsReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!month || !year) return;
    apiGet<Report>(`/api/reports/adjusted-bills?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`)
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

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <p className="account-no" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Monthly Adjusted Bills Report
          </p>
          <h1>Adjustment activity in {data.month} {data.year}</h1>
        </div>
        <div className="head-actions no-print">
          <span className="count">Generated {new Date(data.generatedAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <button className="clear-filters" onClick={() => window.print()}>Print report</button>
        </div>
      </div>

      {data.empty ? (
        <p className="count">No bill-adjustment activity in {data.month} {data.year}.</p>
      ) : (
        <>
          <div className="dash-kpis">
            <KpiTile label="Requests raised" value={data.kpis.raised.toLocaleString()} sub="Received this month" />
            <KpiTile label="Adjustments completed" value={data.kpis.completed.toLocaleString()} sub={`${data.kpis.rejected} rejected`} />
            <KpiTile label="Billing reduced" value={compactPeso(data.kpis.reduction)} sub={`${pctStr(data.impact.curAmountDue ? (data.kpis.reduction / data.impact.curAmountDue) * 100 : null)} of the amount reviewed`} />
            <KpiTile label="Average turnaround" value={data.kpis.avgTurnaroundDays == null ? "—" : `${data.kpis.avgTurnaroundDays.toFixed(1)} days`} sub="Request to completion" />
            <KpiTile label="Still open" value={data.kpis.stillOpen.toLocaleString()} sub={`As at ${fmtDate(data.asOf)}`} />
          </div>

          {data.insights.length > 0 && (
            <div className="dash-insights">
              {data.insights.map((s, i) => <div key={i} className="dash-insight">{s}</div>)}
            </div>
          )}

          <ImpactSection impact={data.impact} />

          <section className="record-section">
            <div className="record-head"><h2>Where this month's requests stand</h2></div>
            <BreakdownTable data={data.pipeline} keyLabel="Status" />
          </section>

          <TurnaroundSection stageAverages={data.stageAverages} windows={data.turnaroundWindows} />

          <OpenBacklogSection buckets={data.agingBuckets} oldest={data.oldestOpen} />

          <TrendSection trend={data.trend} />

          <section className="record-section">
            <div className="record-head"><h2>Reason for adjustment</h2></div>
            <BreakdownTable data={data.byReason} keyLabel="Reason" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Method of adjustment</h2><span className="count">completed this month</span></div>
            <BreakdownTable data={data.byMethod} keyLabel="Method" />
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Adjustments by barangay</h2></div>
            <BreakdownTable data={data.byBarangay} keyLabel="Barangay" />
          </section>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>By classification</h2></div>
              <BreakdownTable data={data.byClassification} keyLabel="Classification" />
            </section>
            <section className="record-section">
              <div className="record-head"><h2>By water system</h2></div>
              <BreakdownTable data={data.byZone} keyLabel="Zone" />
            </section>
          </div>

          <section className="record-section">
            <div className="record-head"><h2>By cluster</h2><span className="count">top 12</span></div>
            <BreakdownTable data={data.byCluster} keyLabel="Cluster" />
          </section>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>Inspector</h2></div>
              <BreakdownTable data={data.byInspector} keyLabel="Inspector" />
            </section>
            <section className="record-section">
              <div className="record-head"><h2>Adjusted by</h2></div>
              <BreakdownTable data={data.byAdjuster} keyLabel="Adjusted by" />
            </section>
          </div>

          {data.rejectedDetail.length > 0 && (
            <section className="record-section">
              <div className="record-head"><h2>Rejected requests</h2></div>
              <table>
                <thead>
                  <tr><th>Date</th><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Reason for rejection</th><th>Rejected by</th><th className="num">Amount reviewed</th></tr>
                </thead>
                <tbody>
                  {data.rejectedDetail.map((r, i) => (
                    <tr key={i}>
                      <td>{fmtDate(r.date)}</td><td>{r.accountNo}</td><td>{r.accountName}</td><td>{r.barangay}</td>
                      <td>{r.reason || <span className="muted">—</span>}</td><td>{r.rejectedBy || <span className="muted">—</span>}</td>
                      <td className="num">{peso.format(r.amountReviewed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.largestReductions.length > 0 && (
            <section className="record-section">
              <div className="record-head"><h2>Largest reductions</h2><span className="count">top 15 completed this month</span></div>
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th><th>Date adjusted</th><th>Account no.</th><th>Account name</th><th>Barangay</th>
                    <th>Bill period</th><th className="num">Cu.m. before</th><th className="num">Cu.m. after</th>
                    <th className="num">Before</th><th className="num">After</th><th className="num">Reduced</th>
                  </tr>
                </thead>
                <tbody>
                  {data.largestReductions.map((r) => (
                    <tr key={r.rank}>
                      <td className="num">{r.rank}</td><td>{fmtDate(r.dateAdjusted)}</td><td>{r.accountNo}</td><td>{r.accountName}</td>
                      <td>{r.barangay}</td><td>{r.billPeriod}</td>
                      <td className="num">{r.consumpBefore}</td><td className="num">{r.consumpAfter}</td>
                      <td className="num">{peso.format(r.before)}</td><td className="num">{peso.format(r.after)}</td>
                      <td className="num"><strong>{peso.format(r.reduced)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="record-section">
            <div className="record-head"><h2>Requests raised this month</h2></div>
            <table>
              <thead>
                <tr>
                  <th className="num">#</th><th>Requested</th><th>Account no.</th><th>Account name</th><th>Barangay</th>
                  <th>Bill period</th><th>Reason</th><th>Inspector</th><th>Status</th><th className="num">Days</th><th className="num">Reduced</th>
                </tr>
              </thead>
              <tbody>
                {data.raisedDetail.map((r) => (
                  <tr key={r.no}>
                    <td className="num">{r.no}</td><td>{fmtDate(r.requested)}</td><td>{r.accountNo}</td><td>{r.accountName}</td>
                    <td>{r.barangay}</td><td>{r.billPeriod}</td><td>{r.reason}</td>
                    <td>{r.inspector || <span className="muted">—</span>}</td><td>{r.status}</td>
                    <td className="num">{r.days == null ? "—" : r.days}</td><td className="num">{peso.format(r.reduced)}</td>
                  </tr>
                ))}
              </tbody>
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

function ImpactSection({ impact }: { impact: Report["impact"] }) {
  const rows: { label: string; before: number; after: number }[] = [
    { label: "Water sales and charges", before: impact.curWSF, after: impact.newWSF },
    { label: "Environmental fee", before: impact.curEF, after: impact.newEF },
    { label: "Air content", before: impact.curAirContent, after: impact.newAirContent },
    { label: "Penalty", before: impact.curPenalty, after: impact.newPenalty },
    { label: "Senior citizen discount", before: impact.curDiscount, after: impact.newDiscount },
  ];
  return (
    <section className="record-section">
      <div className="record-head"><h2>Effect on billing</h2><span className="count">adjustments completed this month</span></div>
      <table>
        <thead>
          <tr><th>Particular</th><th className="num">Before</th><th className="num">After</th><th className="num">Reduction</th><th className="num">Change</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = r.before - r.after;
            const chg = r.before !== 0 ? `${((-diff / r.before) * 100).toFixed(1)}%` : "—";
            return (
              <tr key={r.label}>
                <td>{r.label}</td><td className="num">{peso.format(r.before)}</td><td className="num">{peso.format(r.after)}</td>
                <td className="num">{peso.format(diff)}</td><td className="num">{chg}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>Amount due on the bills</td>
            <td className="num">{peso.format(impact.curAmountDue)}</td>
            <td className="num">{peso.format(impact.newAmountDue)}</td>
            <td className="num">{peso.format(impact.reduction)}</td>
            <td className="num">{impact.curAmountDue === 0 ? "—" : `-${((impact.reduction / impact.curAmountDue) * 100).toFixed(1)}%`}</td>
          </tr>
        </tfoot>
      </table>
      <p className="dash-chart-note">
        Consumption on these bills went from {Math.round(impact.curConsump).toLocaleString()} to {Math.round(impact.newConsump).toLocaleString()} cubic meters.
        Reductions are foregone billing, not cash refunded.
      </p>
    </section>
  );
}

function BreakdownTable({ data, keyLabel }: { data: Breakdown; keyLabel: string }) {
  if (!data.groups.length) return <p className="count">No data.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>{keyLabel}</th><th className="num">Requests</th><th className="num">Share</th>
          <th className="num">Completed</th><th className="num">Rejected</th>
          <th className="num">Amount reduced</th><th className="num">Average days</th>
        </tr>
      </thead>
      <tbody>
        {data.groups.map((g) => (
          <tr key={g.key}>
            <td>{g.key}</td><td className="num">{g.requests}</td><td className="num">{pctStr(g.share)}</td>
            <td className="num">{g.completed}</td><td className="num">{g.rejected}</td>
            <td className="num">{peso.format(g.reduced)}</td><td className="num">{daysStr(g.avgDays)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td><td className="num">{data.total.requests}</td><td className="num">{pctStr(data.total.share || 100)}</td>
          <td className="num">{data.total.completed}</td><td className="num">{data.total.rejected}</td>
          <td className="num">{peso.format(data.total.reduced)}</td><td className="num">{daysStr(data.total.avgDays)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function TurnaroundSection({ stageAverages, windows }: { stageAverages: Report["stageAverages"]; windows: Report["turnaroundWindows"] }) {
  return (
    <section className="record-section">
      <div className="record-head"><h2>Turnaround</h2><span className="count">cases closed this month</span></div>
      <div className="dash-charts">
        <div>
          <table>
            <thead><tr><th>Stage</th><th className="num">Cases</th><th className="num">Average days</th></tr></thead>
            <tbody>
              <tr><td>Request to inspection</td><td className="num">{stageAverages.toInspection.cases}</td><td className="num">{daysStr(stageAverages.toInspection.avgDays)}</td></tr>
              <tr><td>Inspection to approval</td><td className="num">{stageAverages.toApproval.cases}</td><td className="num">{daysStr(stageAverages.toApproval.avgDays)}</td></tr>
              <tr><td>Approval to adjustment</td><td className="num">{stageAverages.toAdjustment.cases}</td><td className="num">{daysStr(stageAverages.toAdjustment.avgDays)}</td></tr>
            </tbody>
            <tfoot>
              <tr><td>Request to completion</td><td className="num">{stageAverages.toCompletion.cases}</td><td className="num">{daysStr(stageAverages.toCompletion.avgDays)}</td></tr>
            </tfoot>
          </table>
        </div>
        <div>
          <table>
            <thead><tr><th>Window</th><th className="num">Cases</th><th className="num">Share</th></tr></thead>
            <tbody>
              {windows.map((w) => (
                <tr key={w.label}><td>{w.label}</td><td className="num">{w.cases}</td><td className="num">{pctStr(w.share)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function OpenBacklogSection({ buckets, oldest }: { buckets: Report["agingBuckets"]; oldest: Report["oldestOpen"] }) {
  const total = buckets.reduce((s, b) => s + b.cases, 0);
  return (
    <section className="record-section">
      <div className="record-head"><h2>Open requests, by age</h2></div>
      {total === 0 ? (
        <p className="count">Nothing is outstanding. Every request raised has been completed or rejected.</p>
      ) : (
        <>
          <table>
            <thead><tr><th>Waiting</th><th className="num">Requests</th><th className="num">Share</th><th className="num">Amount under review</th></tr></thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.label}><td>{b.label}</td><td className="num">{b.cases}</td><td className="num">{pctStr(b.share)}</td><td className="num">{peso.format(b.amount)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="dash-chart-note">The oldest open requests, ordered by how long they have waited.</p>
          <table>
            <thead>
              <tr><th className="num">Days</th><th>Requested</th><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Status</th><th>Inspector</th><th className="num">Amount under review</th></tr>
            </thead>
            <tbody>
              {oldest.map((o, i) => (
                <tr key={i}>
                  <td className="num"><strong>{o.days}</strong></td><td>{fmtDate(o.requested)}</td><td>{o.accountNo}</td>
                  <td>{o.accountName}</td><td>{o.barangay}</td><td>{o.status}</td>
                  <td>{o.inspector || <span className="muted">not assigned</span>}</td>
                  <td className="num">{peso.format(o.amountUnderReview)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function TrendSection({ trend }: { trend: Report["trend"] }) {
  const chartData = trend.map((t) => ({ label: `${t.month.slice(0, 3)} ${String(t.year).slice(2)}`, raised: t.raised, completed: t.completed, reduced: t.reduced }));
  return (
    <section className="record-section dash-chart-wide">
      <div className="record-head"><h2>Twelve-month trend</h2></div>
      <div className="chart">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as (typeof chartData)[number];
                return (
                  <div className="chart-tip">
                    <div className="chart-tip-head">{p.label}</div>
                    <div className="chart-tip-row"><span>Raised</span><span>{p.raised}</span></div>
                    <div className="chart-tip-row"><span>Completed</span><span>{p.completed}</span></div>
                    <div className="chart-tip-row total"><span>Reduced</span><span>{peso.format(p.reduced)}</span></div>
                  </div>
                );
              }}
            />
            <Line dataKey="raised" name="Requests raised" type="monotone" stroke="var(--navy)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table>
        <thead><tr><th>Month</th><th className="num">Requests raised</th><th className="num">Completed</th><th className="num">Amount reduced</th><th className="num">Average per case</th></tr></thead>
        <tbody>
          {trend.map((t, i) => (
            <tr key={i}>
              <td>{t.month} {t.year}</td><td className="num">{t.raised}</td><td className="num">{t.completed}</td>
              <td className="num">{peso.format(t.reduced)}</td>
              <td className="num">{peso.format(t.completed > 0 ? t.reduced / t.completed : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
