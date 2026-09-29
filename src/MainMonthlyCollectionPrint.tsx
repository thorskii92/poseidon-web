import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * Monthly Collection Report — Main Collection. The over-the-counter
 * counterpart to ECPayMonthlyCollectionReportPrint.tsx: same daily/
 * weekday/six-month trend shape, scoped to Water Bill payments that did
 * NOT come through ECPay (same exclusion the Payment Timing and
 * Collection Efficiency Main Collection reports already use). No branch
 * breakdown — over-the-counter payments have no branch concept.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type Grouped = { key: string; count: number; amount: number };
type DailyRow = { day: number; weekday: number; count: number; amount: number };
type WeekdayRow = { label: string; count: number; amount: number; avgPerOccurrence: number };
type TrendRow = { month: string; monthLabel: string; count: number; amount: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; count: number; distinctAccounts: number; avgTxn: number; activeDays: number; daysInMonth: number; bestDay: DailyRow };
  insights?: string[];
  daily?: DailyRow[];
  weekday?: WeekdayRow[];
  byBarangay?: Grouped[];
  byZone?: Grouped[];
  byClassification?: Grouped[];
  sixMonthTrend?: TrendRow[];
};

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

function GroupTable({ rows, label, total }: { rows: Grouped[]; label: string; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Share</th><th>&nbsp;</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
            <td className="n">{peso.format(r.amount)}</td>
            <td className="n">{total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : "—"}</td>
            <td style={{ width: 120 }}>
              <div style={{ background: "var(--tint)", borderRadius: 3, overflow: "hidden", height: 8 }}>
                <div style={{ width: `${(r.amount / max) * 100}%`, background: "var(--blue)", height: "100%" }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="n">{peso.format(rows.reduce((s, r) => s + r.amount, 0))}</td>
          <td className="n">100.0%</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

export default function MainMonthlyCollectionPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("main-monthly-collection");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/main-monthly-collection?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) {
    return <div className="print-root"><div className="form-error">No month given.</div></div>;
  }
  if (error) {
    return <div className="print-root"><div className="form-error">{error}</div></div>;
  }
  if (!data) {
    return <div className="print-root"><p className="count">Building the report…</p></div>;
  }

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">Monthly Collection Report — Main Collection</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No over-the-counter water bill payments were posted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Total collected" value={peso.format(data.kpis.total)} sub={`${data.kpis.count.toLocaleString()} payments`} />
              <KpiTile label="Accounts served" value={data.kpis.distinctAccounts.toLocaleString()} sub={`${peso.format(data.kpis.avgTxn)} average payment`} />
              <KpiTile label="Active days" value={`${data.kpis.activeDays} of ${data.kpis.daysInMonth}`} />
              <KpiTile label="Best day" value={peso.format(data.kpis.bestDay.amount)} sub={`Day ${data.kpis.bestDay.day}, ${data.kpis.bestDay.count} payments`} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Daily collection trend</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.daily ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ stroke: "#cbd5e1" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as DailyRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">Day {p.day}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="amount" name="Amount" stroke="var(--navy)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Weekday pattern</h2></div>
              <table>
                <thead><tr><th>Weekday</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Average per day</th></tr></thead>
                <tbody>
                  {(data.weekday ?? []).map((w) => (
                    <tr key={w.label}>
                      <td>{w.label}</td>
                      <td className="n">{w.count}</td>
                      <td className="n">{peso.format(w.amount)}</td>
                      <td className="n">{peso.format(w.avgPerOccurrence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by barangay</h2></div>
              <GroupTable rows={data.byBarangay ?? []} label="Barangay" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By water system</h2></div>
                <GroupTable rows={data.byZone ?? []} label="Zone / water system" total={data.kpis.total} />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <GroupTable rows={data.byClassification ?? []} label="Classification" total={data.kpis.total} />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Six-month collection trend</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.sixMonthTrend ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="monthLabel" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as TrendRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.monthLabel}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <SignatoryBlock slots={data.signatories ?? []} />
            </div>

            <p className="ecpay-generated">
              Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
