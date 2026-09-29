import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
 * Senior/PWD Discount Collection — Main Collection. tblor.totaldiscount,
 * the O.R. table's own figure — a different source than the ECPay Senior
 * Discount Report's billing.scdiscount, covering over-the-counter
 * receipts instead of ECPay-settled bills.
 */

type Grouped = { key: string; count: number; amount: number };
type DetailRow = { orNum: string; paidOn: string; seniorId: string; discount: number; billAmount: number; paid: number; accountNo: string; acctName: string; brgy: string };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { discountTotal: number; receipts: number; accounts: number; missingId: number; missingIdPct: number; effectiveRate: number };
  insights?: string[];
  byBarangay?: Grouped[];
  reconciliation?: { gross: number; discount: number; net: number; paid: number };
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

export default function MainSeniorDiscountPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("main-senior-discount");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/main-senior-discount?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Senior/PWD Discount Collection Report — Main Collection</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No senior/PWD discounts were granted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Discount granted" value={peso.format(data.kpis.discountTotal)} sub={`${data.kpis.receipts.toLocaleString()} receipt(s)`} />
              <KpiTile label="Accounts served" value={data.kpis.accounts.toLocaleString()} />
              <KpiTile label="Missing senior ID" value={data.kpis.missingId.toLocaleString()} sub={`${data.kpis.missingIdPct.toFixed(1)}% of receipts`} />
              <KpiTile label="Effective rate" value={`${data.kpis.effectiveRate.toFixed(1)}%`} sub="Against the gross billed amount" />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What this month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            {data.reconciliation && (
              <section className="record-section">
                <div className="record-head"><h2>Reconciliation</h2></div>
                <table>
                  <thead><tr><th>Particular</th><th className="n">Amount</th></tr></thead>
                  <tbody>
                    <tr><td>Gross amount due before discount</td><td className="n">{peso.format(data.reconciliation.gross)}</td></tr>
                    <tr><td>Less: senior/PWD discount</td><td className="n">({peso.format(data.reconciliation.discount)})</td></tr>
                    <tr><td>Net amount due</td><td className="n">{peso.format(data.reconciliation.net)}</td></tr>
                    <tr><td>Received over the counter</td><td className="n">{peso.format(data.reconciliation.paid)}</td></tr>
                  </tbody>
                </table>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>By barangay</h2></div>
              <table>
                <thead><tr><th>Barangay</th><th className="n">Receipts</th><th className="n">Discount</th></tr></thead>
                <tbody>
                  {(data.byBarangay ?? []).map((r) => (
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
                    <td className="n">{(data.byBarangay ?? []).reduce((s, r) => s + r.count, 0)}</td>
                    <td className="n">{peso.format((data.byBarangay ?? []).reduce((s, r) => s + r.amount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Discount detail</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>O.R. no.</th><th>Date paid</th><th>Account no.</th><th>Account name</th>
                    <th>Senior ID</th><th>Barangay</th><th className="n">Gross</th><th className="n">Discount</th><th className="n">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.detail ?? []).map((d, i) => (
                    <tr key={`${d.orNum}-${i}`}>
                      <td>{d.orNum}</td>
                      <td>{d.paidOn}</td>
                      <td>{d.accountNo}</td>
                      <td>{d.acctName}</td>
                      <td>{d.seniorId || <span className="muted">none on file</span>}</td>
                      <td>{d.brgy}</td>
                      <td className="n">{peso.format(d.billAmount)}</td>
                      <td className="n">{peso.format(d.discount)}</td>
                      <td className="n">{peso.format(d.paid)}</td>
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
