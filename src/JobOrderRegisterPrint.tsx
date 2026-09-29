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
 * Job Order Register — every job order issued for the chosen month, by
 * type, status and preparer. See joborders.ts for the printed dispatch-slip
 * workflow this reports on.
 */

type Grouped = { key: string; count: number };
type DetailRow = {
  joborderno: string; type: string; dateissued: string; status: string;
  preparedby: string; completedby: string; accountNo: string; acctName: string;
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
  kpis?: { totalIssued: number; completed: number; open: number; completionRate: number };
  insights?: string[];
  byType?: Grouped[];
  byPreparer?: Grouped[];
  detail?: DetailRow[];
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

function CountTable({ rows, label }: { rows: Grouped[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">Job orders</th></tr></thead>
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

export default function JobOrderRegisterPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("job-order-register");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/job-order-register?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Job Order Register</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No job orders were issued in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Job orders issued" value={data.kpis.totalIssued.toLocaleString()} />
              <KpiTile label="Completed" value={data.kpis.completed.toLocaleString()} sub={`${data.kpis.completionRate.toFixed(1)}%`} />
              <KpiTile label="Still open" value={data.kpis.open.toLocaleString()} />
              <KpiTile label="Completion rate" value={`${data.kpis.completionRate.toFixed(1)}%`} />
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
                <div className="record-head"><h2>By type</h2></div>
                <CountTable rows={data.byType ?? []} label="Type" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By preparer</h2></div>
                <CountTable rows={data.byPreparer ?? []} label="Preparer" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Job orders issued</h2></div>
              <table>
                <thead><tr><th>Job order no.</th><th>Type</th><th>Date issued</th><th>Status</th><th>Prepared by</th><th>Completed by</th><th>Account</th></tr></thead>
                <tbody>
                  {(data.detail ?? []).map((r, i) => (
                    <tr key={`${r.joborderno}-${i}`}>
                      <td>{r.joborderno}</td>
                      <td>{r.type}</td>
                      <td>{r.dateissued}</td>
                      <td>{r.status}</td>
                      <td>{r.preparedby}</td>
                      <td>{r.completedby || <span className="muted">—</span>}</td>
                      <td>{r.accountNo} — {r.acctName}</td>
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
