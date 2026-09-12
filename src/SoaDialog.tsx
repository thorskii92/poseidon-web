import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * Statement of Account — bill selection.
 *
 * The clerk picks which unpaid bills the statement covers, decides how the
 * penalty is presented, and the sheet opens in a new tab. Nothing is written;
 * a statement is a read of the account, so this dialog never needs an
 * authorisation and never changes a figure.
 *
 * The three options carry the desktop's behaviour but not its names. "Hide
 * Penalty" there did not hide anything — it folded the penalty into the water
 * service fee and dropped the two penalty columns, leaving the consumer with
 * one figure and the same amount to pay. Since a clerk could reasonably read
 * the old label as "don't charge it", each option here says what it does and
 * shows the effect on the total as it is ticked.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
  pastDue: boolean;
};

type Payload = {
  account: { accountNo: string; name: string; address: string; accountType: string };
  rows: Row[];
  paidAvailable: number;
  maintenanceEnabled: boolean;
};

function shortDate(value: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export default function SoaDialog({
  acctId,
  onClose,
}: {
  acctId: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [touched, setTouched] = useState(false);
  const [fold, setFold] = useState(false);
  const [waive, setWaive] = useState(false);
  const [includePaid, setIncludePaid] = useState(false);

  const { data, isLoading, error } = useQuery<Payload>({
    queryKey: ["soa-bills", acctId],
    queryFn: () => apiGet<Payload>(`/api/soa/${acctId}/bills`),
  });

  const rows = data?.rows ?? [];

  // Everything unpaid is ticked to begin with — that is the statement the
  // office asks for nine times out of ten — until the clerk touches the list.
  const chosen = touched ? selected : rows.map((r) => r.billId);

  function toggle(id: number) {
    const base = touched ? selected : rows.map((r) => r.billId);
    setTouched(true);
    setSelected(
      base.includes(id) ? base.filter((x) => x !== id) : [...base, id],
    );
  }

  function toggleAll() {
    setTouched(true);
    setSelected(chosen.length === rows.length ? [] : rows.map((r) => r.billId));
  }

  const picked = rows.filter((r) => chosen.includes(r.billId));

  // The same arithmetic the server will do, so the figure in the footer is the
  // figure on the sheet. The server still recomputes it from the database —
  // this is a preview, not the source.
  const totals = picked.reduce(
    (acc, r) => {
      const penalty = waive ? 0 : r.penalty;
      const penaltyDue = r.pastDue ? penalty : 0;
      const base = r.amount; // already net of penalty from the API
      return {
        amount: acc.amount + (fold ? base + penaltyDue : base),
        penalty: acc.penalty + penalty,
        afterDue: acc.afterDue + (fold ? base + penaltyDue : base + penalty),
      };
    },
    { amount: 0, penalty: 0, afterDue: 0 },
  );

  function open() {
    const qs = new URLSearchParams({ bills: chosen.join(",") });
    if (fold) qs.set("fold", "1");
    if (waive) qs.set("waive", "1");
    if (includePaid) qs.set("includePaid", "1");
    window.open(`/accounts/${acctId}/soa?${qs}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Statement of Account</h2>
        <p className="modal-sub">
          {data
            ? `${data.account.accountNo} · ${data.account.name}`
            : "Loading account…"}
        </p>

        {isLoading && <p className="count">Loading bills…</p>}
        {error && <div className="form-error">{(error as Error).message}</div>}

        {data && rows.length === 0 && (
          <p className="count">
            This account has no unpaid bills. There is nothing to state.
          </p>
        )}

        {data && rows.length > 0 && (
          <>
            <div className="soa-scroll">
              <table className="soa-pick">
                <thead>
                  <tr>
                    <th className="check">
                      <input
                        type="checkbox"
                        checked={chosen.length === rows.length}
                        onChange={toggleAll}
                      />
                    </th>
                    <th>Bill #</th>
                    <th>Bill period</th>
                    <th className="num">Prev</th>
                    <th className="num">Present</th>
                    <th className="num">Cu.m.</th>
                    <th className="num">Discount</th>
                    <th className="num">Amount</th>
                    <th className="num">Penalty</th>
                    <th>Due date</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const penalty = waive ? 0 : r.penalty;
                    const penaltyDue = r.pastDue ? penalty : 0;
                    const total = fold
                      ? r.amount + penaltyDue
                      : r.amount + penalty;
                    return (
                      <tr
                        key={r.billId}
                        className={chosen.includes(r.billId) ? "row-selected" : ""}
                      >
                        <td className="check">
                          <input
                            type="checkbox"
                            checked={chosen.includes(r.billId)}
                            onChange={() => toggle(r.billId)}
                          />
                        </td>
                        <td>{r.billId}</td>
                        <td>{r.period}</td>
                        <td className="num">{r.prevRead}</td>
                        <td className="num">{r.presRead}</td>
                        <td className="num">{r.consumption}</td>
                        <td className="num">
                          {r.discount ? peso.format(r.discount) : "—"}
                        </td>
                        <td className="num">{peso.format(r.amount)}</td>
                        <td className="num">
                          {penalty ? peso.format(penalty) : "—"}
                          {penalty > 0 && !r.pastDue && (
                            <span className="soa-note" title="Still inside its due date, so no penalty is owed yet">
                              not yet due
                            </span>
                          )}
                        </td>
                        <td>{shortDate(r.dueDate)}</td>
                        <td className="num bold">{peso.format(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="soa-options">
              <h3>How the statement reads</h3>

              <label className="soa-option">
                <input
                  type="checkbox"
                  checked={waive}
                  onChange={(e) => setWaive(e.target.checked)}
                />
                <span>
                  <b>Do not charge the penalty</b>
                  <em>
                    The penalty is dropped from every line and from the total.
                    This is the desktop's "Exclude Penalty".
                  </em>
                </span>
              </label>

              <label className="soa-option">
                <input
                  type="checkbox"
                  checked={fold}
                  onChange={(e) => setFold(e.target.checked)}
                  disabled={waive}
                />
                <span>
                  <b>Fold the penalty into the water service fee</b>
                  <em>
                    One figure, no penalty column and no amount-after-due — the
                    same money, presented as a single charge. This is the
                    desktop's "Hide Penalty", which despite the name never
                    reduced what was owed.
                    {waive ? " Nothing to fold once the penalty is waived." : ""}
                  </em>
                </span>
              </label>

              <label className="soa-option">
                <input
                  type="checkbox"
                  checked={includePaid}
                  onChange={(e) => setIncludePaid(e.target.checked)}
                  disabled={data.paidAvailable === 0}
                />
                <span>
                  <b>Include payment history</b>
                  <em>
                    {data.paidAvailable === 0
                      ? "No paid bills on this account yet."
                      : `The last ${Math.min(12, data.paidAvailable)} paid bill(s) and the
                         consumption averages, printed below the statement. They are
                         history only and are not added to the total.`}
                  </em>
                </span>
              </label>
            </div>

            <div className="soa-footer">
              <span className="count">
                {picked.length} of {rows.length} bill
                {rows.length === 1 ? "" : "s"} selected
              </span>
              <span className="soa-total">
                <span>Total amount due</span>
                <b>{peso.format(totals.amount)}</b>
              </span>
              {!fold && totals.penalty > 0 && (
                <span className="soa-total">
                  <span>Amount after due</span>
                  <b>{peso.format(totals.afterDue)}</b>
                </span>
              )}
            </div>
          </>
        )}

        <div className="form-actions">
          <button
            className="primary"
            disabled={picked.length === 0}
            onClick={open}
          >
            Open statement
          </button>
          <button className="clear-filters" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
