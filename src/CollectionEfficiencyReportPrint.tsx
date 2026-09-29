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
 * Collection Efficiency Report — ported from frmCollectionEfficiencyReport
 * (BuildHtml). What was billed for the month against what was collected,
 * and how much of that collection came through ECPay. Dressed the same way
 * as the other three ECPay reports — see
 * ECPayDailyCollectionReportPrint.tsx for why.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type Bucket = {
  label: string; bills: number; billed: number; paid: number; collected: number;
  ecPayCount: number; ecPay: number; consump: number; efficiency: number;
  uncollected: number; ecShare: number;
};

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
    billed: number; totalBills: number; overallEfficiency: number; paidBills: number;
    uncollected: number; openBills: number; ecpayAmount: number; collected: number;
    ecCount: number; consump: number;
  };
  insights?: string[];
  byBarangay?: Bucket[];
  byZone?: Bucket[];
  byClassification?: Bucket[];
  weakestClusters?: Bucket[];
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

/** Bills / Billed / Settled / Collected / Efficiency / Uncollected / ECPay /
 * ECPay share, footed by totals over exactly the rows shown — a "weakest
 * clusters" table's total is the total of those 15 clusters, not the
 * report-wide total, matching the desktop's own EfficiencyTable helper. */
function EfficiencyTable({ rows, label }: { rows: Bucket[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  const tBills = rows.reduce((s, r) => s + r.bills, 0);
  const tPaid = rows.reduce((s, r) => s + r.paid, 0);
  const tBilled = money(rows.reduce((s, r) => s + r.billed, 0));
  const tCollected = money(rows.reduce((s, r) => s + r.collected, 0));
  const tEcPay = money(rows.reduce((s, r) => s + r.ecPay, 0));
  const tEfficiency = tBilled > 0 ? (tCollected / tBilled) * 100 : 0;
  const tUncollected = money(tBilled - tCollected);
  const tEcShare = tCollected > 0 ? (tEcPay / tCollected) * 100 : 0;

  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th><th className="n">Bills</th><th className="n">Billed</th>
          <th className="n">Settled</th><th className="n">Collected</th><th className="n">Efficiency</th>
          <th className="n">Uncollected</th><th className="n">ECPay</th><th className="n">ECPay share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.bills}</td>
            <td className="n">{peso.format(r.billed)}</td>
            <td className="n">{r.paid}</td>
            <td className="n">{peso.format(r.collected)}</td>
            <td className="n">{r.efficiency.toFixed(1)}%</td>
            <td className="n">{peso.format(r.uncollected)}</td>
            <td className="n">{peso.format(r.ecPay)}</td>
            <td className="n">{r.ecShare.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{tBills}</td>
          <td className="n">{peso.format(tBilled)}</td>
          <td className="n">{tPaid}</td>
          <td className="n">{peso.format(tCollected)}</td>
          <td className="n">{tEfficiency.toFixed(1)}%</td>
          <td className="n">{peso.format(tUncollected)}</td>
          <td className="n">{peso.format(tEcPay)}</td>
          <td className="n">{tEcShare.toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>
  );
}

function money(v: number): number {
  return Math.round(v * 100) / 100;
}

export default function CollectionEfficiencyReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("collection-efficiency");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/collection-efficiency?month=${month}&${sig.query}`)
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

  const top15Barangays = (data.byBarangay ?? []).slice(0, 15);

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

        <p className="ecpay-kicker">Collection Efficiency Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          {data.monthLabel}, as collected to date
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No bills were issued for {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Billed for the period"
                value={peso.format(data.kpis.billed)}
                sub={`${data.kpis.totalBills.toLocaleString()} bills issued`}
              />
              <KpiTile
                label="Collection efficiency"
                value={`${data.kpis.overallEfficiency.toFixed(1)}%`}
                sub={`${data.kpis.paidBills.toLocaleString()} bills settled`}
              />
              <KpiTile
                label="Still uncollected"
                value={peso.format(data.kpis.uncollected)}
                sub={`${data.kpis.openBills.toLocaleString()} bills open`}
              />
              <KpiTile
                label="Collected via ECPay"
                value={peso.format(data.kpis.ecpayAmount)}
                sub={`${data.kpis.collected > 0 ? ((data.kpis.ecpayAmount / data.kpis.collected) * 100).toFixed(1) : "0.0"}% of collections`}
              />
              <KpiTile
                label="Bills paid via ECPay"
                value={data.kpis.ecCount.toLocaleString()}
                sub={`${data.kpis.paidBills > 0 ? ((data.kpis.ecCount / data.kpis.paidBills) * 100).toFixed(1) : "0.0"}% of settled bills`}
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the period shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Efficiency by barangay</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={Math.max(160, top15Barangays.length * 26)}>
                  <BarChart
                    data={top15Barangays}
                    layout="vertical"
                    margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} unit="%" />
                    <YAxis type="category" dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} width={140} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as Bucket;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row"><span>Bills</span><span>{p.bills}</span></div>
                            <div className="chart-tip-row total"><span>Efficiency</span><span>{p.efficiency.toFixed(1)}%</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="efficiency" name="Efficiency" fill="var(--navy)" radius={[0, 2, 2, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <EfficiencyTable rows={data.byBarangay ?? []} label="Barangay" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Efficiency by water system</h2></div>
              <EfficiencyTable rows={data.byZone ?? []} label="Zone / water system" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Efficiency by consumer classification</h2></div>
              <EfficiencyTable rows={data.byClassification ?? []} label="Classification" />
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Weakest clusters</h2>
                <span className="count">15 lowest by efficiency, minimum 5 bills</span>
              </div>
              <EfficiencyTable rows={data.weakestClusters ?? []} label="Cluster" />
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
