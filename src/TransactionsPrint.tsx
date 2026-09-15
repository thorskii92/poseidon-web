import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import {
  SignatoryBlock,
  SignatoryPickers,
  useSignatories,
  type SignatorySlot,
} from "./Signatories";
import "./print.css";

/**
 * The Account Transaction History sheet.
 *
 * Shares the statement's masthead, table and signature conventions on
 * purpose — a consumer often leaves the counter with both, and they should
 * read as two pages of the same record rather than two different offices.
 *
 * The signatory block is the shared one: four slots, each set to a person, a
 * blank rule, or nothing. "Certified correct by" is what this sheet calls its
 * third slot, because it usually goes out as proof of payment.
 */

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

const MONTH_ABBR: Record<string, string> = {
  January: "Jan",
  February: "Feb",
  March: "Mar",
  April: "Apr",
  May: "May",
  June: "Jun",
  July: "Jul",
  August: "Aug",
  September: "Sep",
  October: "Oct",
  November: "Nov",
  December: "Dec",
};

function shortPeriod(period: string) {
  const [month, year] = period.split(" ");
  return MONTH_ABBR[month] ? `${MONTH_ABBR[month]} ${year}` : period;
}

function longDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function shortDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

const LOGO_SRC = {
  municipal: "/api/settings/logo/municipal",
  office: "/api/settings/logo/office",
} as const;

function Seal({ which }: { which: keyof typeof LOGO_SRC }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return (
    <img className="soa-seal" src={LOGO_SRC[which]} alt="" onError={hide} />
  );
}

type BillPayment = {
  paymentId: number;
  date: string | null;
  orNumber: string;
  billId: number | null;
  period: string;
  prevRead: number;
  presRead: number;
  consumption: number;
  billAmount: number;
  penalty: number;
  discount: number;
  amountPaid: number;
  paymentType: string;
  noRecord: boolean;
};

type OtherPayment = {
  paymentId: number;
  date: string | null;
  orNumber: string;
  nature: string;
  amountPaid: number;
  paymentType: string;
};

const LABELS = [
  "Prepared by",
  "Prepared by",
  "Certified correct by",
  "Approved by",
];

type History = {
  office: {
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
    meterNo: string;
    standpipe: string;
    classification: string;
    accountType: string;
    status: string;
  };
  from: string;
  to: string;
  issuedOn: string;
  bills: BillPayment[];
  others: OtherPayment[];
  totals: {
    billPayments: number;
    billsWithoutRecord: number;
    consumption: number;
    billAmount: number;
    penalty: number;
    discount: number;
    waterPaid: number;
    otherPayments: number;
    otherPaid: number;
    grandTotal: number;
  };
  signatories: SignatorySlot[];
};

export default function TransactionsPrint() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState("");
  const sig = useSignatories("transactions");

  // useSearchParams hands back a new object every render, so depending on it
  // directly re-runs this effect forever and whichever response lands last
  // wins — which is how the first version printed blank rules under names the
  // clerk had picked. The string is stable.
  const search = params.toString();

  useEffect(() => {
    if (!id || !sig.ready) return;
    apiGet<History>(`/api/transactions/${id}?${search}&${sig.query}`)
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
        <p className="count">Preparing the history…</p>
      </div>
    );
  }

  const { totals } = data;

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

        <span className="print-hint count">
          {totals.billPayments + totals.otherPayments} payment
          {totals.billPayments + totals.otherPayments === 1 ? "" : "s"} ·{" "}
          {peso.format(totals.grandTotal)}
        </span>
      </div>

      <article className="soa-sheet">
        <header className="soa-head">
          <Seal which="municipal" />
          <div className="soa-head-text">
            <div>Republic of the Philippines</div>
            {data.office.municipalHeader && (
              <div>{data.office.municipalHeader}</div>
            )}
            {data.office.officeHeader && <div>{data.office.officeHeader}</div>}
            <div className="soa-office">{data.office.officeName}</div>
            {data.office.officeAddress && (
              <div className="soa-address">{data.office.officeAddress}</div>
            )}
          </div>
          <Seal which="office" />
        </header>

        <h1 className="soa-title">Account Transaction History</h1>
        <p className="soa-issued">
          {longDate(data.from)} to {longDate(data.to)} · issued{" "}
          {longDate(data.issuedOn)}
        </p>

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
              <td className="lbl">Status</td>
              <td className="val">{data.account.status || "—"}</td>
            </tr>
          </tbody>
        </table>

        <h2 className="txn-section">Water bills paid</h2>
        {data.bills.length === 0 ? (
          <p className="txn-none">No water bills were paid in this period.</p>
        ) : (
          <table className="soa-table soa-table-fixed">
            <colgroup>
              <col style={{ width: "10%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Date Paid</th>
                <th>O.R. No.</th>
                <th>Bill Period</th>
                <th className="soa-num soa-col-reading">Previous</th>
                <th className="soa-num soa-col-reading">Present</th>
                <th className="soa-num soa-col-reading">Cu.m.</th>
                <th className="soa-amt">Bill Amount</th>
                <th className="soa-amt">Penalty</th>
                <th className="soa-amt">Discount</th>
                <th className="soa-amt">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {data.bills.map((r, i) => (
                <tr
                  key={`${r.paymentId}-${r.billId}-${i}`}
                  className={r.noRecord ? "txn-gap" : ""}
                >
                  <td>{shortDate(r.date)}</td>
                  <td>
                    {r.orNumber || "—"}
                    {r.noRecord && (
                      <span className="soa-tag">no O.R. on file</span>
                    )}
                  </td>
                  <td className="soa-col-period">
                    {r.period ? shortPeriod(r.period) : "—"}
                  </td>
                  <td className="soa-num soa-col-reading">{r.prevRead}</td>
                  <td className="soa-num soa-col-reading">{r.presRead}</td>
                  <td className="soa-num soa-col-reading">{r.consumption}</td>
                  <td className="soa-amt">{peso.format(r.billAmount)}</td>
                  <td className="soa-amt">{peso.format(r.penalty)}</td>
                  <td className="soa-amt">
                    {r.discount
                      ? `(${peso.format(r.discount)})`
                      : peso.format(0)}
                  </td>
                  <td className="soa-amt">
                    {r.noRecord ? "—" : peso.format(r.amountPaid)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="soa-total-row">
                <td colSpan={5} className="soa-total-label">
                  Total — {totals.billPayments} payment
                  {totals.billPayments === 1 ? "" : "s"}
                </td>
                <td className="soa-num">{totals.consumption}</td>
                <td className="soa-amt">{peso.format(totals.billAmount)}</td>
                <td className="soa-amt">{peso.format(totals.penalty)}</td>
                <td className="soa-amt">
                  {totals.discount
                    ? `(${peso.format(totals.discount)})`
                    : peso.format(0)}
                </td>
                <td className="soa-amt">{peso.format(totals.waterPaid)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {totals.billsWithoutRecord > 0 && (
          <p className="txn-footnote">
            {totals.billsWithoutRecord} bill
            {totals.billsWithoutRecord === 1 ? " is" : "s are"} recorded as paid
            with no official receipt on file, and{" "}
            {totals.billsWithoutRecord === 1 ? "is" : "are"} listed above for
            completeness. Amounts paid for these are not included in the totals.
          </p>
        )}

        <h2 className="txn-section">Other payments</h2>
        {data.others.length === 0 ? (
          <p className="txn-none">
            No other payments were made in this period.
          </p>
        ) : (
          <table className="soa-table">
            <thead>
              <tr>
                <th>Date Paid</th>
                <th>O.R. No.</th>
                <th>Particulars</th>
                <th>Mode</th>
                <th className="soa-amt">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {data.others.map((r) => (
                <tr key={r.paymentId}>
                  <td>{shortDate(r.date)}</td>
                  <td>{r.orNumber || "—"}</td>
                  <td>{r.nature}</td>
                  <td>{r.paymentType || "—"}</td>
                  <td className="soa-amt">{peso.format(r.amountPaid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="soa-total-row">
                <td colSpan={4} className="soa-total-label">
                  Total — {totals.otherPayments} payment
                  {totals.otherPayments === 1 ? "" : "s"}
                </td>
                <td className="soa-amt">{peso.format(totals.otherPaid)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="soa-due">
          <span>TOTAL COLLECTED</span>
          <b>{peso.format(totals.grandTotal)}</b>
        </div>

        <SignatoryBlock labels={LABELS} slots={data.signatories} />

        {data.office.officeContact && (
          <footer className="soa-foot">{data.office.officeContact}</footer>
        )}
      </article>
    </div>
  );
}
