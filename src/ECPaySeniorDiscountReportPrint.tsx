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
 * ECPay Senior Discount Report — ported from frmSeniorDiscountReport
 * (BuildHtml, titled "Senior Citizen Discount Summary" there). Lists the
 * senior citizen discounts granted on bills settled through ECPay for the
 * month. Dressed the same way as the other ECPay reports — see
 * ECPayDailyCollectionReportPrint.tsx for why.
 */

type SummaryRow = { label: string; accounts: number; bills: number; discount: number; share: number; collected: number };
type DetailRow = {
  orNum: string; serial: string; paidOn: string; accountNo: string; acctName: string;
  seniorId: string; brgy: string; className: string; billPeriod: string; consump: number;
  discount: number; netDue: number; grossDue: number; paid: number;
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
    bills: number; discount: number; acctsServed: number; avgPerAccount: number;
    effectiveRate: number; shareOfPayments: number; totalPayments: number; consump: number;
  };
  noSeniorId?: number;
  reconciliation?: { gross: number; discount: number; net: number; paid: number; difference: number };
  monthContext?: { discountedPayments: number; allPayments: number; discountedAmount: number; allAmount: number; sharePct: number };
  byBarangay?: SummaryRow[];
  byBillPeriod?: SummaryRow[];
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

function SummaryTable({ rows, label }: { rows: SummaryRow[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  const tBills = rows.reduce((s, r) => s + r.bills, 0);
  const tDiscount = rows.reduce((s, r) => s + r.discount, 0);
  const tCollected = rows.reduce((s, r) => s + r.collected, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th><th className="n">Accounts</th><th className="n">Bills</th>
          <th className="n">Discount</th><th className="n">Share</th><th className="n">Collected</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.accounts}</td>
            <td className="n">{r.bills}</td>
            <td className="n">{peso.format(r.discount)}</td>
            <td className="n">{r.share.toFixed(1)}%</td>
            <td className="n">{peso.format(r.collected)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n" />
          <td className="n">{tBills}</td>
          <td className="n">{peso.format(tDiscount)}</td>
          <td className="n">100.0%</td>
          <td className="n">{peso.format(tCollected)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function ECPaySeniorDiscountReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-senior-discount");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/senior-discount?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Senior Citizen Discount Summary</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          Discounts on bills settled through ECPay in {data.monthLabel}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">
            No senior citizen discounts were granted on ECPay payments in {data.monthLabel}.
          </p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Discount granted"
                value={peso.format(data.kpis.discount)}
                sub={`${data.kpis.bills} bill(s)`}
              />
              <KpiTile
                label="Senior accounts served"
                value={data.kpis.acctsServed.toLocaleString()}
                sub={`${peso.format(data.kpis.avgPerAccount)} average per account`}
              />
              <KpiTile
                label="Effective discount rate"
                value={`${data.kpis.effectiveRate.toFixed(1)}%`}
                sub="Against the gross amount due"
              />
              <KpiTile
                label="Share of ECPay payments"
                value={`${data.kpis.shareOfPayments.toFixed(1)}%`}
                sub={`${data.kpis.bills} of ${data.kpis.totalPayments.toLocaleString()}`}
              />
              <KpiTile
                label="Consumption covered"
                value={`${data.kpis.consump.toLocaleString()} m³`}
                sub="By discounted bills"
              />
            </div>

            {!!data.noSeniorId && (
              <div className="form-notice">
                {data.noSeniorId} discounted bill(s) have no senior citizen ID on the account
                record. The ID is normally required to support the discount on audit.
              </div>
            )}

            {data.reconciliation && data.monthContext && (
              <section className="record-section">
                <div className="record-head"><h2>Discount reconciliation</h2></div>
                <div className="notice-columns">
                  <div>
                    <p className="count">How the discount arrives at the amount collected.</p>
                    <table>
                      <thead>
                        <tr><th>Particular</th><th className="n">Amount</th></tr>
                      </thead>
                      <tbody>
                        <tr><td>Gross amount due before discount</td><td className="n">{peso.format(data.reconciliation.gross)}</td></tr>
                        <tr><td>Less: senior citizen discount</td><td className="n">({peso.format(data.reconciliation.discount)})</td></tr>
                        <tr><td>Net amount due</td><td className="n">{peso.format(data.reconciliation.net)}</td></tr>
                        <tr><td>Received through ECPay</td><td className="n">{peso.format(data.reconciliation.paid)}</td></tr>
                      </tbody>
                      <tfoot>
                        <tr className="bold">
                          <td>Difference</td>
                          <td className="n">{peso.format(data.reconciliation.difference)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div>
                    <p className="count">Discounted bills against all ECPay activity for the month.</p>
                    <table>
                      <thead>
                        <tr><th>Particular</th><th className="n">Discounted</th><th className="n">All payments</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Payments</td>
                          <td className="n">{data.monthContext.discountedPayments}</td>
                          <td className="n">{data.monthContext.allPayments.toLocaleString()}</td>
                        </tr>
                        <tr>
                          <td>Amount received</td>
                          <td className="n">{peso.format(data.monthContext.discountedAmount)}</td>
                          <td className="n">{peso.format(data.monthContext.allAmount)}</td>
                        </tr>
                        <tr>
                          <td>Share of the month</td>
                          <td className="n">{data.monthContext.sharePct.toFixed(1)}%</td>
                          <td className="n">100.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Discount by barangay</h2></div>
              <SummaryTable rows={data.byBarangay ?? []} label="Barangay" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Discount by bill period</h2></div>
              <SummaryTable rows={data.byBillPeriod ?? []} label="Bill period" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Discount detail</h2></div>
              <table>
                <thead>
                  <tr>
                    <th className="n">#</th><th>Date paid</th><th>O.R. no.</th><th>Account no.</th>
                    <th>Account name</th><th>Senior ID</th><th>Barangay</th><th>Bill period</th>
                    <th className="n">Cu. m.</th><th className="n">Gross due</th><th className="n">Discount</th>
                    <th className="n">Net due</th><th className="n">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.detail ?? []).map((d, i) => (
                    <tr key={`${d.orNum}-${i}`}>
                      <td className="n">{i + 1}</td>
                      <td>{d.paidOn}</td>
                      <td>{d.orNum}</td>
                      <td>{d.accountNo}</td>
                      <td>{d.acctName}</td>
                      <td>{d.seniorId || <span className="muted">none on file</span>}</td>
                      <td>{d.brgy}</td>
                      <td>{d.billPeriod}</td>
                      <td className="n">{d.consump}</td>
                      <td className="n">{peso.format(d.grossDue)}</td>
                      <td className="n">{peso.format(d.discount)}</td>
                      <td className="n">{peso.format(d.netDue)}</td>
                      <td className="n">{peso.format(d.paid)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={9}>Total</td>
                    <td className="n">{peso.format(data.reconciliation?.gross ?? 0)}</td>
                    <td className="n">{peso.format(data.reconciliation?.discount ?? 0)}</td>
                    <td className="n">{peso.format(data.reconciliation?.net ?? 0)}</td>
                    <td className="n">{peso.format(data.reconciliation?.paid ?? 0)}</td>
                  </tr>
                </tfoot>
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
