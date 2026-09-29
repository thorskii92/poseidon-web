import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
 * Bill Adjustment Processing — the staff angle on tbladjustedbills, for the
 * chosen month: who requested, processed and completed each adjustment, and
 * how long it took. Monthly Adjusted Bills (Billing Reports) already covers
 * the bill-level angle; this one is about the people, not the bills.
 */

type Grouped = { key: string; count: number };

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
    totalRequests: number; completed: number; rejected: number; pending: number;
    completionRate: number; avgTurnaroundDays: number | null;
  };
  insights?: string[];
  byProcessor?: Grouped[];
  byAdjuster?: Grouped[];
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

function CountTable({ rows, label, countLabel }: { rows: Grouped[]; label: string; countLabel: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">{countLabel}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function AdjustmentProcessingPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("adjustment-processing");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/adjustment-processing?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Bill Adjustment Processing Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No adjustment requests were filed in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile label="Requests filed" value={data.kpis.totalRequests.toLocaleString()} />
              <KpiTile label="Completed" value={data.kpis.completed.toLocaleString()} sub={`${data.kpis.completionRate.toFixed(1)}%`} />
              <KpiTile label="Rejected" value={data.kpis.rejected.toLocaleString()} />
              <KpiTile label="Still pending" value={data.kpis.pending.toLocaleString()} />
              <KpiTile label="Avg. turnaround" value={data.kpis.avgTurnaroundDays != null ? `${data.kpis.avgTurnaroundDays.toFixed(1)} day(s)` : "—"} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What this month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By request processor</h2></div>
                <CountTable rows={data.byProcessor ?? []} label="Processor" countLabel="Requests" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By adjuster (completed only)</h2></div>
                <CountTable rows={data.byAdjuster ?? []} label="Adjuster" countLabel="Completed" />
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
