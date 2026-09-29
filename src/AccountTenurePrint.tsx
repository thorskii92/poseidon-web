import { useEffect, useState } from "react";
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
 * Account Tenure — how long accounts have been connected, bucketed.
 * Infrastructure/asset-age planning, not billing. A live snapshot, not a
 * period report — no date picker.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type BucketRow = { label: string; count: number };
type GroupRow = { label: string; count: number; avgYears: number };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; avgYears: number; oldest: number; noDate: number };
  insights?: string[];
  buckets?: BucketRow[];
  byBarangay?: GroupRow[];
  byClassification?: GroupRow[];
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

function AvgTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Accounts</th><th className="n">Average years</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.count}</td>
            <td className="n">{r.avgYears.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AccountTenurePrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("account-tenure");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/account-tenure?${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [sig.ready, sig.query]);

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

        <p className="ecpay-kicker">Account Tenure Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No accounts are on file.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Accounts on file" value={data.kpis.total.toLocaleString()} />
              <KpiTile label="Average tenure" value={`${data.kpis.avgYears.toFixed(1)} yrs`} />
              <KpiTile label="Oldest connection" value={`${data.kpis.oldest.toFixed(1)} yrs`} />
              <KpiTile label="No connection date on file" value={data.kpis.noDate.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the tenure shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Accounts by tenure</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.buckets ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as BucketRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row total"><span>Accounts</span><span>{p.count}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" name="Accounts" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr><th>Tenure</th><th className="n">Accounts</th><th className="n">Share</th></tr>
                </thead>
                <tbody>
                  {(data.buckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.count}</td>
                      <td className="n">{bucketTotal > 0 ? `${((b.count / bucketTotal) * 100).toFixed(1)}%` : "—"}</td>
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

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <AvgTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <AvgTable rows={data.byClassification ?? []} label="Classification" />
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
