import { useEffect, useState, type SyntheticEvent } from "react";
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

/**
 * Job Order Turnaround — for job orders issued in the chosen month, how
 * many days from issue to completion, by type, and which are still open.
 */

const LOGO_SRC = {
  municipal: "/api/settings/logo/municipal",
  office: "/api/settings/logo/office",
} as const;

function Seal({ which }: { which: keyof typeof LOGO_SRC }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return <img className="bill-seal" src={LOGO_SRC[which]} alt="" onError={hide} />;
}

type ByType = { label: string; completed: number; avgDays: number };
type OpenRow = { joborderno: string; type: string; dateissued: string; daysOpenSoFar: number; accountNo: string; acctName: string };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { issued: number; completed: number; stillOpen: number; avgDays: number | null };
  insights?: string[];
  byType?: ByType[];
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

export default function JobOrderTurnaroundPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("job-order-turnaround");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/job-order-turnaround?month=${month}&${sig.query}`)
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
        <header className="ecpay-head">
          <Seal which="municipal" />
          <div>
            <div>Republic of the Philippines</div>
            <div>PROVINCE OF PALAWAN</div>
            <div>{data.office.officeHeader || data.office.municipalHeader}</div>
            <div className="soa-office">{data.office.officeName}</div>
            {data.office.officeAddress && <div className="soa-address">{data.office.officeAddress}</div>}
          </div>
          <Seal which="office" />
        </header>

        <p className="ecpay-kicker">Job Order Turnaround Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No job orders were issued in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Issued this month" value={data.kpis.issued.toLocaleString()} />
              <KpiTile label="Completed" value={data.kpis.completed.toLocaleString()} />
              <KpiTile label="Still open" value={data.kpis.stillOpen.toLocaleString()} />
              <KpiTile label="Avg. turnaround" value={data.kpis.avgDays != null ? `${data.kpis.avgDays.toFixed(1)} day(s)` : "—"} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What this month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Turnaround by type</h2></div>
              {!(data.byType ?? []).length ? (
                <p className="count">No completed job orders in this cohort yet.</p>
              ) : (
                <table>
                  <thead><tr><th>Type</th><th className="n">Completed</th><th className="n">Avg. days</th></tr></thead>
                  <tbody>
                    {(data.byType ?? []).map((t) => (
                      <tr key={t.label}>
                        <td>{t.label}</td>
                        <td className="n">{t.completed}</td>
                        <td className="n">{t.avgDays.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Still open</h2>
                <span className="count">Oldest first, top 30</span>
              </div>
              {!(data.openList ?? []).length ? (
                <p className="count">Every job order issued this month has been completed.</p>
              ) : (
                <table>
                  <thead><tr><th>Job order no.</th><th>Type</th><th>Date issued</th><th className="n">Days open</th><th>Account</th></tr></thead>
                  <tbody>
                    {(data.openList ?? []).map((r, i) => (
                      <tr key={`${r.joborderno}-${i}`}>
                        <td>{r.joborderno}</td>
                        <td>{r.type}</td>
                        <td>{r.dateissued}</td>
                        <td className="n">{r.daysOpenSoFar}</td>
                        <td>{r.accountNo} — {r.acctName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
