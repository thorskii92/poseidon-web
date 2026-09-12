import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * Account Transaction History — the date window.
 *
 * The statement is about what is owed; this is about what has been paid. The
 * only decision the clerk makes is how far back to go, so the dialog is one
 * pair of dates and a live count of what falls inside them — no sheet is
 * opened before the clerk can see whether the window holds anything.
 *
 * Read-only, like the statement: nothing here writes.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Totals = {
  billPayments: number;
  billsWithoutRecord: number;
  waterPaid: number;
  otherPayments: number;
  otherPaid: number;
  grandTotal: number;
};

type Summary = {
  account: { accountNo: string; name: string };
  from: string;
  to: string;
  firstDate: string | null;
  totals: Totals;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yearAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

export default function TransactionsDialog({
  acctId,
  onClose,
}: {
  acctId: number;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);

  const { data, isLoading, error } = useQuery<Summary>({
    queryKey: ["txn-summary", acctId, from, to],
    queryFn: () =>
      apiGet<Summary>(
        `/api/transactions/${acctId}/summary?from=${from}&to=${to}`,
      ),
  });

  // Kept in state rather than read straight from the query so the shortcut
  // below survives a refetch while the clerk is still moving the dates.
  const [firstDate, setFirstDate] = useState<string | null>(null);
  useEffect(() => {
    if (data?.firstDate) setFirstDate(data.firstDate);
  }, [data?.firstDate]);

  const totals = data?.totals;
  const empty =
    !!totals &&
    totals.billPayments === 0 &&
    totals.otherPayments === 0 &&
    totals.billsWithoutRecord === 0;

  function open() {
    window.open(
      `/accounts/${acctId}/transactions?from=${from}&to=${to}`,
      "_blank",
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Account Transaction History</h2>
        <p className="modal-sub">
          {data
            ? `${data.account.accountNo} · ${data.account.name}`
            : "Loading account…"}
        </p>

        <p className="txn-blurb">
          Every payment collected on this account inside the window — water
          bills with the O.R. that settled them, and the fees below them.
        </p>

        <div className="txn-range">
          <label className="field-input">
            <span>From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field-input">
            <span>To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today()}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          <div className="txn-shortcuts">
            <button
              className="link-button"
              onClick={() => {
                setFrom(yearAgo());
                setTo(today());
              }}
            >
              Last 12 months
            </button>
            <button
              className="link-button"
              disabled={!firstDate}
              onClick={() => {
                if (firstDate) setFrom(firstDate);
                setTo(today());
              }}
              title={
                firstDate
                  ? `Back to the first payment on file, ${firstDate}`
                  : "No payments on file"
              }
            >
              Whole history
            </button>
          </div>
        </div>

        {error && <div className="form-error">{(error as Error).message}</div>}

        {isLoading && <p className="count">Counting…</p>}

        {totals && (
          <div className="txn-summary">
            <div className="txn-stat">
              <span>Water bills paid</span>
              <b>{totals.billPayments}</b>
              <em>{peso.format(totals.waterPaid)}</em>
            </div>
            <div className="txn-stat">
              <span>Other payments</span>
              <b>{totals.otherPayments}</b>
              <em>{peso.format(totals.otherPaid)}</em>
            </div>
            <div className="txn-stat txn-stat-total">
              <span>Total collected</span>
              <b>{peso.format(totals.grandTotal)}</b>
              <em>in this window</em>
            </div>
          </div>
        )}

        {totals && totals.billsWithoutRecord > 0 && (
          <div className="txn-warning">
            <strong>
              {totals.billsWithoutRecord} bill
              {totals.billsWithoutRecord === 1 ? " is" : "s are"} marked paid
              with no payment on file.
            </strong>{" "}
            They are listed with a blank O.R. so the gap is visible on the
            sheet rather than looking like a missing month. Older bills settled
            before the current collection module usually account for this.
          </div>
        )}

        {empty && (
          <p className="count">
            Nothing was collected on this account between these dates.
          </p>
        )}

        <div className="form-actions">
          <button className="primary" disabled={!totals || empty} onClick={open}>
            Open history
          </button>
          <button className="clear-filters" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
