import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import {
  SignatoryBlock,
  SignatoryPickers,
  useSignatories,
  type SignatorySlot,
} from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * The Statement of Account sheet.
 *
 * The desktop wrote this as an HTML string in VB with its own blue (#1a56a0)
 * and its own table styling, unrelated to anything else the office printed.
 * This is the same document in the application's own navy, laid out like the
 * pending disconnection list — one masthead, one bordered table, signatories
 * across the foot — so a consumer holding a bill and a statement can see they
 * came from the same office.
 *
 * Signatories are picked in the toolbar rather than in the selection dialog,
 * matching the disconnection list: the sheet is already on screen, so a wrong
 * name is corrected by changing a dropdown instead of going back a step. The
 * block itself is the shared one — four slots, each a person, a blank rule or
 * nothing.
 */

const LABELS = ["Prepared by", "Prepared by", "Checked by", "Conformed by"];

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function longDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

type Row = {
  billId: number;
  period: string;
  prevRead: number;
  presRead: number;
  consumption: number;
  waterServiceFee: number;
  enviFee: number;
  discount: number;
  applicationFee: number;
  maintenanceFee: number;
  penalty: number;
  penaltyDue: number;
  amount: number;
  amountAfterDue: number;
  dueDate: string | null;
  paid: boolean;
  pastDue: boolean;
};

type Statement = {
  office: {
    municipality: string;
    municipalHeader: string;
    officeHeader: string;
    officeName: string;
    officeAddress: string;
    officeContact: string;
  };
  account: {
    accountNo: string;
    name: string;
    address: string;
    standpipe: string;
    meterNo: string;
    classification: string;
    accountType: string;
    status: string;
  };
  options: {
    fold: boolean;
    waive: boolean;
    includePaid: boolean;
    maintenanceEnabled: boolean;
  };
  coverage: string;
  issuedOn: string;
  rows: Row[];
  history: Row[];
  analytics: {
    months: number;
    avgConsumption: number;
    avgAmount: number;
    recentMonths: number;
    recentAvgConsumption: number;
    recentAvgAmount: number;
  } | null;
  totals: {
    bills: number;
    consumption: number;
    waterServiceFee: number;
    enviFee: number;
    discount: number;
    applicationFee: number;
    maintenanceFee: number;
    penalty: number;
    amount: number;
    amountAfterDue: number;
  };
  signatories: SignatorySlot[];
};

export default function SoaPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState("");
  const sig = useSignatories("soa");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  // A stable string: useSearchParams returns a new object on every render, so
  // depending on it directly re-runs this effect forever.
  const search = params.toString();

  useEffect(() => {
    if (!id || !sig.ready) return;
    apiGet<Statement>(`/api/soa/${id}?${search}&${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [id, search, sig.ready, sig.query]);

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
        <p className="count">Preparing the statement…</p>
      </div>
    );
  }

  const { options: opt, totals } = data;
  // Folding puts the penalty inside the water service fee, so the two penalty
  // columns would double-count it. Waiving leaves nothing to show.
  const showPenaltyColumns = !opt.fold && !opt.waive;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>

        <SignatoryPickers
          labels={LABELS}
          people={sig.people}
          values={sig.values}
          onChange={sig.setValue}
        />
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />

        <span className="print-hint count">
          {totals.bills} unpaid bill{totals.bills === 1 ? "" : "s"}
          {opt.waive
            ? " · penalty waived"
            : opt.fold
              ? " · penalty folded in"
              : ""}
        </span>
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <h1 className="soa-title">Statement of Account</h1>
        <p className="soa-issued">As of {longDate(data.issuedOn)}</p>

        <table className="soa-meta">
          <tbody>
            <tr>
              <td className="lbl">Account No.</td>
              <td className="val">{data.account.accountNo}</td>
              <td className="lbl">Classification</td>
              <td className="val">{data.account.classification}</td>
            </tr>
            <tr>
              <td className="lbl">Name</td>
              <td className="val name">{data.account.name}</td>
              <td className="lbl">Account Type</td>
              <td className="val">{data.account.accountType}</td>
            </tr>
            <tr>
              <td className="lbl">Address</td>
              <td className="val" colSpan={3}>
                {data.account.address}
              </td>
            </tr>
            <tr>
              <td className="lbl">Meter Serial</td>
              <td className="val">{data.account.meterNo || "—"}</td>
              <td className="lbl">Standpipe</td>
              <td className="val">{data.account.standpipe || "—"}</td>
            </tr>
            <tr>
              <td className="lbl">Period Covered</td>
              <td className="val">{data.coverage || "—"}</td>
              <td className="lbl">Status</td>
              <td className="val">{data.account.status || "—"}</td>
            </tr>
          </tbody>
        </table>

        <table className="soa-table">
          <thead>
            <tr>
              <th>Bill #</th>
              <th>Bill Period</th>
              <th className="soa-num">Previous</th>
              <th className="soa-num">Present</th>
              <th className="soa-num">Cu.m.</th>
              <th className="soa-amt">Water Service Fee</th>
              <th className="soa-amt">PES</th>
              <th className="soa-amt">Discount</th>
              {opt.maintenanceEnabled && <th className="soa-amt">Maint.</th>}
              <th className="soa-amt">Amount</th>
              {showPenaltyColumns && <th className="soa-amt">Penalty</th>}
              {showPenaltyColumns && <th className="soa-amt">After Due</th>}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.billId} className={r.paid ? "soa-paid" : ""}>
                <td>{r.billId}</td>
                <td>
                  {r.period}
                  {r.paid && <span className="soa-tag">paid</span>}
                </td>
                <td className="soa-num">{r.prevRead}</td>
                <td className="soa-num">{r.presRead}</td>
                <td className="soa-num">{r.consumption}</td>
                <td className="soa-amt">{peso.format(r.waterServiceFee)}</td>
                <td className="soa-amt">{peso.format(r.enviFee)}</td>
                <td className="soa-amt">
                  {r.discount ? `(${peso.format(r.discount)})` : peso.format(0)}
                </td>
                {opt.maintenanceEnabled && (
                  <td className="soa-amt">{peso.format(r.maintenanceFee)}</td>
                )}
                <td className="soa-amt">{peso.format(r.amount)}</td>
                {showPenaltyColumns && (
                  <td className="soa-amt">{peso.format(r.penalty)}</td>
                )}
                {showPenaltyColumns && (
                  <td className="soa-amt">{peso.format(r.amountAfterDue)}</td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td colSpan={4} className="soa-total-label">
                Total — {totals.bills} unpaid bill
                {totals.bills === 1 ? "" : "s"}
              </td>
              <td className="soa-num">{totals.consumption}</td>
              <td className="soa-amt">{peso.format(totals.waterServiceFee)}</td>
              <td className="soa-amt">{peso.format(totals.enviFee)}</td>
              <td className="soa-amt">
                {totals.discount
                  ? `(${peso.format(totals.discount)})`
                  : peso.format(0)}
              </td>
              {opt.maintenanceEnabled && (
                <td className="soa-amt">
                  {peso.format(totals.maintenanceFee)}
                </td>
              )}
              <td className="soa-amt">{peso.format(totals.amount)}</td>
              {showPenaltyColumns && (
                <td className="soa-amt">{peso.format(totals.penalty)}</td>
              )}
              {showPenaltyColumns && (
                <td className="soa-amt">
                  {peso.format(totals.amountAfterDue)}
                </td>
              )}
            </tr>
          </tfoot>
        </table>

        <div className="soa-due">
          <span>TOTAL AMOUNT DUE</span>
          <b>{peso.format(totals.amount)}</b>
        </div>
        {showPenaltyColumns && totals.penalty > 0 && (
          <div className="soa-due soa-due-after">
            <span>AMOUNT AFTER DUE DATE</span>
            <b>{peso.format(totals.amountAfterDue)}</b>
          </div>
        )}

        {opt.waive && (
          <p className="soa-remark">
            Penalties on the bills above have been waived for this statement.
          </p>
        )}

        {data.history.length > 0 && (
          <section className="soa-history">
            <h2>Payment history</h2>
            <table className="soa-table soa-table-compact">
              <thead>
                <tr>
                  <th className="soa-col-period">Bill Period</th>
                  <th className="soa-num">Previous</th>
                  <th className="soa-num">Present</th>
                  <th className="soa-num">Cu.m.</th>
                  <th className="soa-amt">Amount</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((r) => (
                  <tr key={r.billId}>
                    <td className="soa-col-period">{r.period || "—"}</td>
                    <td className="soa-num">{r.prevRead}</td>
                    <td className="soa-num">{r.presRead}</td>
                    <td className="soa-num">{r.consumption}</td>
                    <td className="soa-amt">{peso.format(r.amount)}</td>
                    <td>{longDate(r.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.analytics && (
              <div className="soa-analytics">
                <div className="soa-stat">
                  <span>Average consumption</span>
                  <b>{data.analytics.avgConsumption.toFixed(1)} m³</b>
                  <em>over {data.analytics.months} paid month(s)</em>
                </div>
                <div className="soa-stat">
                  <span>Average bill</span>
                  <b>{peso.format(data.analytics.avgAmount)}</b>
                  <em>over {data.analytics.months} paid month(s)</em>
                </div>
                <div className="soa-stat">
                  <span>Recent consumption</span>
                  <b>{data.analytics.recentAvgConsumption.toFixed(1)} m³</b>
                  <em>last {data.analytics.recentMonths} month(s)</em>
                </div>
                <div className="soa-stat">
                  <span>Recent bill</span>
                  <b>{peso.format(data.analytics.recentAvgAmount)}</b>
                  <em>last {data.analytics.recentMonths} month(s)</em>
                </div>
              </div>
            )}
          </section>
        )}

        <SignatoryBlock labels={LABELS} slots={data.signatories} />

        {data.office.officeContact && (
          <footer className="soa-foot">{data.office.officeContact}</footer>
        )}
      </article>
    </div>
  );
}
