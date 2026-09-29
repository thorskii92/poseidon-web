import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
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
 * Disconnection & Reconnection Turnaround / New Service Connection
 * Turnaround — one shared print view for both, since they ask the
 * identical question of two different event pairs in `transactionlog`
 * (see serviceTurnaround.ts). `kind` in the URL picks which; everything
 * else — layout, sections, the signed-document treatment — is identical.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type BucketRow = { label: string; count: number };
type GroupRow = { label: string; count: number; avgDays: number };
type OpenRow = { accountNo: string; acctName: string; brgy: string; fromDate: string; daysOpenSoFar: number };

type Report = {
  kind: "disconnection" | "connection" | "temp-closure";
  title: string;
  fromLabel: string;
  toLabel: string;
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: {
    started: number; completed: number; avgDays: number; stillOpenThisCohort: number;
    within7: number; within7Pct: number; openAllTime: number;
  };
  insights?: string[];
  buckets?: BucketRow[];
  byBarangay?: GroupRow[];
  byZone?: GroupRow[];
  byClassification?: GroupRow[];
  openList?: OpenRow[];
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

/** Fastest to slowest, by average days — same shape the Payment Timing
 * reports' AvgTable uses, duplicated here rather than shared since every
 * print view in this app keeps its own small presentational helpers. */
function AvgTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Cases</th><th className="n">Average days</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.count}</td>
            <td className="n">{r.avgDays.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ServiceTurnaroundPrint() {
  const [params] = useSearchParams();
  const kindParam = params.get("kind");
  const kind = kindParam === "connection" || kindParam === "temp-closure" ? kindParam : "disconnection";
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories(`service-turnaround-${kind}`);
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/service-turnaround?kind=${kind}&month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [kind, month, sig.ready, sig.query]);

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

  const bucketTotal = (data.buckets ?? []).reduce((s, b) => s + b.count, 0);

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

        <p className="ecpay-kicker">{data.title}</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No {data.fromLabel.toLowerCase()}s were recorded in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label={`${data.fromLabel}s recorded`}
                value={data.kpis.started.toLocaleString()}
                sub={data.monthLabel}
              />
              <KpiTile
                label={`${data.toLabel}s completed`}
                value={data.kpis.completed.toLocaleString()}
                sub={`${data.kpis.within7Pct.toFixed(1)}% within a week`}
              />
              <KpiTile
                label="Average days"
                value={data.kpis.avgDays.toFixed(1)}
                sub="From event to resolution"
              />
              <KpiTile
                label="Still open"
                value={data.kpis.stillOpenThisCohort.toLocaleString()}
                sub="From this month's cases"
              />
              <KpiTile
                label="Open across all history"
                value={data.kpis.openAllTime.toLocaleString()}
                sub="Chronic cases, any month"
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the turnaround shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Time from {data.fromLabel.toLowerCase()} to {data.toLabel.toLowerCase()}</h2></div>
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
                            <div className="chart-tip-row total"><span>Cases</span><span>{p.count}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" name="Cases" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr><th>Window</th><th className="n">Cases</th><th className="n">Share</th></tr>
                </thead>
                <tbody>
                  {(data.buckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.count}</td>
                      <td className="n">{pctStr(b.count, bucketTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{bucketTotal}</td>
                    <td className="n">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Average days by group</h2></div>
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
              <div style={{ marginTop: 16 }}>
                <p className="count">Zone / water system — fastest to slowest.</p>
                <AvgTable rows={data.byZone ?? []} label="Zone / water system" />
              </div>
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Still open</h2>
                <span className="count">Longest-standing first, across all history</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Account no.</th><th>Account name</th><th>Barangay</th>
                    <th>{data.fromLabel} date</th><th className="n">Days open</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.openList ?? []).map((o, i) => (
                    <tr key={`${o.accountNo}-${i}`}>
                      <td>{o.accountNo}</td>
                      <td>{o.acctName}</td>
                      <td>{o.brgy}</td>
                      <td>{o.fromDate}</td>
                      <td className="n">{o.daysOpenSoFar}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
