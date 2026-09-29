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
 * Consumption Bracket Analysis — how many bills fall into which
 * consumption range, and revenue by bracket. A rate-setting/tariff-review
 * lens the existing consumption reports (single-period snapshots by
 * group) don't take.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type BucketRow = { label: string; bills: number; consump: number; amount: number };
type Grouped = { key: string; count: number; amount: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { totalBills: number; totalConsump: number; totalAmount: number; avgConsump: number };
  insights?: string[];
  buckets?: BucketRow[];
  byClassification?: Grouped[];
  byBarangay?: Grouped[];
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

function GroupTable({ rows, label }: { rows: Grouped[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">Bills</th><th className="n">Amount</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
            <td className="n">{peso.format(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="n">{peso.format(rows.reduce((s, r) => s + r.amount, 0))}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function ConsumptionBracketsPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("consumption-brackets");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/consumption-brackets?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) return <div className="print-root"><div className="form-error">No month given.</div></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">Consumption Bracket Analysis Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No bills were issued in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Bills issued" value={data.kpis.totalBills.toLocaleString()} />
              <KpiTile label="Total consumption" value={`${data.kpis.totalConsump.toLocaleString()} m³`} />
              <KpiTile label="Total billed" value={peso.format(data.kpis.totalAmount)} />
              <KpiTile label="Average per bill" value={`${data.kpis.avgConsump.toFixed(1)} m³`} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the brackets show</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Bills by consumption bracket</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.buckets ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as BucketRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row"><span>Bills</span><span>{p.bills}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="bills" name="Bills" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead><tr><th>Bracket</th><th className="n">Bills</th><th className="n">Consumption</th><th className="n">Amount</th><th className="n">Share</th></tr></thead>
                <tbody>
                  {(data.buckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.bills}</td>
                      <td className="n">{b.consump.toLocaleString()} m³</td>
                      <td className="n">{peso.format(b.amount)}</td>
                      <td className="n">{data.kpis!.totalAmount > 0 ? `${((b.amount / data.kpis!.totalAmount) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.totalBills}</td>
                    <td className="n">{data.kpis.totalConsump.toLocaleString()} m³</td>
                    <td className="n">{peso.format(data.kpis.totalAmount)}</td>
                    <td className="n">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <GroupTable rows={data.byClassification ?? []} label="Classification" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <GroupTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
            </div>

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
