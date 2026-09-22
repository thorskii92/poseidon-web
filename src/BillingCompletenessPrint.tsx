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
 * Billing Generation Completeness — whether every billable account
 * actually got billed for the chosen month. Not billed-vs-collected —
 * whether the bill was generated at all.
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
type UnbilledRow = { accountNo: string; acctName: string; brgy: string; className: string };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { totalAccounts: number; billed: number; unbilled: number; completionRate: number };
  insights?: string[];
  byBarangay?: Grouped[];
  byClassification?: Grouped[];
  unbilledList?: UnbilledRow[];
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
  if (!rows.length) return <p className="count">No accounts were missed.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">Unbilled accounts</th></tr></thead>
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

export default function BillingCompletenessPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("billing-completeness");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/billing-completeness?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Billing Generation Completeness Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">There are no billable accounts on record.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Billable accounts" value={data.kpis.totalAccounts.toLocaleString()} />
              <KpiTile label="Billed" value={data.kpis.billed.toLocaleString()} />
              <KpiTile label="Not billed" value={data.kpis.unbilled.toLocaleString()} />
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
                <div className="record-head"><h2>Unbilled, by barangay</h2></div>
                <CountTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Unbilled, by classification</h2></div>
                <CountTable rows={data.byClassification ?? []} label="Classification" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head">
                <h2>Accounts not billed</h2>
                <span className="count">Top 60</span>
              </div>
              <table>
                <thead><tr><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Class</th></tr></thead>
                <tbody>
                  {(data.unbilledList ?? []).map((u, i) => (
                    <tr key={`${u.accountNo}-${i}`}>
                      <td>{u.accountNo}</td>
                      <td>{u.acctName}</td>
                      <td>{u.brgy}</td>
                      <td>{u.className}</td>
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
