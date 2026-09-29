import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
 * ECPay Payment Timing Report — ported from frmECPayPaymentTimingReport
 * (BuildHtml). How long consumers take to pay after the bill is issued, and
 * how close to the due date those payments land. Dressed the same way as
 * the other ECPay reports — see ECPayDailyCollectionReportPrint.tsx for why.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type BucketRow = { label: string; count: number; amount: number };
type GroupRow = { label: string; count: number; avgDays: number; amount: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: {
    measured: number; avgDays: number; avgToDue: number; aheadOfDue: boolean;
    pctOnOrBeforeDue: number; late: number;
  };
  insights?: string[];
  billBuckets?: BucketRow[];
  dueBuckets?: BucketRow[];
  byBarangay?: GroupRow[];
  byClassification?: GroupRow[];
  byZone?: GroupRow[];
  byBranch?: GroupRow[];
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

function pctStr(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

/** Fastest to slowest, by average days from the bill date — same helper the
 * desktop's AvgTable produces, rendered here instead of built as an HTML
 * string. */
function AvgTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th><th className="n">Payments</th><th className="n">Average days</th><th className="n">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.count}</td>
            <td className="n">{r.avgDays.toFixed(1)}</td>
            <td className="n">{peso.format(r.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ECPayPaymentTimingReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-payment-timing");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/payment-timing?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) {
    return (
      <div className="print-root">
        <div className="form-error">No month given.</div>
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

  const billTotal = (data.billBuckets ?? []).reduce((s, b) => s + b.amount, 0);
  const dueTotal = (data.dueBuckets ?? []).reduce((s, b) => s + b.amount, 0);
  const dueCount = (data.dueBuckets ?? []).reduce((s, b) => s + b.count, 0);

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">ECPay Payment Timing Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>Payments posted in {data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No ECPay payments were posted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile
                label="Payments measured"
                value={data.kpis.measured.toLocaleString()}
                sub="Linked to a bill with dates"
              />
              <KpiTile
                label="Average time to pay"
                value={`${data.kpis.avgDays.toFixed(1)} days`}
                sub="From the bill date"
              />
              <KpiTile
                label={data.kpis.aheadOfDue ? "Ahead of the due date" : "Past the due date"}
                value={`${Math.abs(data.kpis.avgToDue).toFixed(1)} days`}
                sub="On average"
              />
              <KpiTile
                label="Paid on or before due"
                value={`${data.kpis.pctOnOrBeforeDue.toFixed(1)}%`}
                sub={`${data.kpis.late} payment(s) came in late`}
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the timing shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Time from bill date to payment</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.billBuckets ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval={0} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as BucketRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" name="Payments" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr><th>Window</th><th className="n">Payments</th><th className="n">Share</th><th className="n">Amount</th></tr>
                </thead>
                <tbody>
                  {(data.billBuckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.count}</td>
                      <td className="n">{pctStr(b.count, data.kpis!.measured)}</td>
                      <td className="n">{peso.format(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.measured}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(billTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Payment against the due date</h2></div>
              <table>
                <thead>
                  <tr><th>When paid</th><th className="n">Payments</th><th className="n">Share</th><th className="n">Amount</th></tr>
                </thead>
                <tbody>
                  {(data.dueBuckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.count}</td>
                      <td className="n">{pctStr(b.count, dueCount)}</td>
                      <td className="n">{peso.format(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{dueCount}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(dueTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Average days to pay by group</h2></div>
              <div className="notice-columns">
                <div>
                  <p className="count">Barangay — fastest to slowest.</p>
                  <AvgTable rows={data.byBarangay ?? []} label="Barangay" />
                </div>
                <div>
                  <p className="count">Classification — fastest to slowest.</p>
                  <AvgTable rows={data.byClassification ?? []} label="Classification" />
                </div>
              </div>
              <div className="notice-columns" style={{ marginTop: 16 }}>
                <div>
                  <p className="count">Zone / water system — fastest to slowest.</p>
                  <AvgTable rows={data.byZone ?? []} label="Zone / water system" />
                </div>
                <div>
                  <p className="count">ECPay branch — fastest to slowest.</p>
                  <AvgTable rows={data.byBranch ?? []} label="ECPay branch" />
                </div>
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
