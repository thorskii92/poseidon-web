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
 * Job Order Completion Detail — field results for job orders completed in
 * the chosen month: meter/standpipe readings, materials used and findings,
 * by who completed them. A fieldwork/materials audit, not a status count.
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

type Grouped = { key: string; count: number };
type DetailRow = {
  joborderno: string; type: string; resultdate: string; completedby: string;
  meterSerial: string; meterBrand: string; standpipe: string; reading: number | null;
  remarks: string; materials: string; findings: string; accountNo: string; acctName: string;
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
  kpis?: { completed: number; withMaterials: number; withFindings: number };
  insights?: string[];
  byCompleter?: Grouped[];
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

export default function JobOrderCompletionDetailPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("job-order-completion-detail");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/job-order-completion-detail?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Job Order Completion Detail Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No job orders were completed in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Completed" value={data.kpis.completed.toLocaleString()} />
              <KpiTile label="With materials logged" value={data.kpis.withMaterials.toLocaleString()} />
              <KpiTile label="With findings logged" value={data.kpis.withFindings.toLocaleString()} />
              <KpiTile label="Month" value={data.monthLabel} />
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
              <div className="record-head"><h2>By who completed it</h2></div>
              <table>
                <thead><tr><th>Completed by</th><th className="n">Job orders</th></tr></thead>
                <tbody>
                  {(data.byCompleter ?? []).map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="n">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Completion detail</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Job order no.</th><th>Type</th><th>Date</th><th>Completed by</th>
                    <th>Meter</th><th>Standpipe</th><th className="n">Reading</th>
                    <th>Materials</th><th>Findings</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.detail ?? []).map((r, i) => (
                    <tr key={`${r.joborderno}-${i}`}>
                      <td>{r.joborderno}</td>
                      <td>{r.type}</td>
                      <td>{r.resultdate}</td>
                      <td>{r.completedby || <span className="muted">—</span>}</td>
                      <td>{[r.meterSerial, r.meterBrand].filter(Boolean).join(" / ") || <span className="muted">—</span>}</td>
                      <td>{r.standpipe || <span className="muted">—</span>}</td>
                      <td className="n">{r.reading != null ? r.reading.toLocaleString() : "—"}</td>
                      <td>{r.materials || <span className="muted">—</span>}</td>
                      <td>{r.findings || <span className="muted">—</span>}</td>
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
