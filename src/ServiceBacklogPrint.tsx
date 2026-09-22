import { useEffect, useState, type SyntheticEvent } from "react";
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
 * Service Request Backlog — a live snapshot of every account currently
 * sitting in a pending stage (installation, reconnection, a transfer, a
 * meter swap, or a temporary closure), with how many days it's been
 * waiting. Complements the turnaround reports, which look back at
 * resolved cohorts rather than what's stuck in the queue right now. A
 * live snapshot, not a period report — no date picker.
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
type StageRow = { label: string; count: number; avgDays: number };
type QueueRow = { accountNo: string; acctName: string; brgy: string; stage: string; daysWaiting: number | null };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number };
  insights?: string[];
  byStage?: StageRow[];
  byBarangay?: Grouped[];
  oldestFirst?: QueueRow[];
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

export default function ServiceBacklogPrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("service-backlog");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/service-backlog?${sig.query}`)
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

        <p className="ecpay-kicker">Service Request Backlog</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">Nothing is currently waiting on a pending service stage.</p>
        ) : (
          <>
            <div className="dash-kpis">
              <KpiTile label="Accounts waiting" value={data.kpis.total.toLocaleString()} sub="Across every pending stage" />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the queue shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>By stage</h2></div>
              <table>
                <thead>
                  <tr><th>Stage</th><th className="n">Accounts</th><th className="n">Average days waiting</th></tr>
                </thead>
                <tbody>
                  {(data.byStage ?? []).map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td className="n">{s.count}</td>
                      <td className="n">{s.avgDays > 0 ? s.avgDays.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.total}</td>
                    <td className="n" />
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By barangay</h2></div>
              <table>
                <thead>
                  <tr><th>Barangay</th><th className="n">Accounts</th></tr>
                </thead>
                <tbody>
                  {(data.byBarangay ?? []).map((b) => (
                    <tr key={b.key}>
                      <td>{b.key}</td>
                      <td className="n">{b.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Longest-waiting cases</h2>
                <span className="count">Top 40</span>
              </div>
              <table>
                <thead>
                  <tr><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Stage</th><th className="n">Days waiting</th></tr>
                </thead>
                <tbody>
                  {(data.oldestFirst ?? []).map((r, i) => (
                    <tr key={`${r.accountNo}-${i}`}>
                      <td>{r.accountNo}</td>
                      <td>{r.acctName}</td>
                      <td>{r.brgy}</td>
                      <td>{r.stage}</td>
                      <td className="n">{r.daysWaiting ?? "—"}</td>
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
