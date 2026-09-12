import { useMemo, useState } from "react";
import { apiPost } from "./api";
import type { CollectionAccount, Payable, PaymentResult } from "./collectionTypes";
import { peso } from "./collectionTypes";

const TYPES = ["Cash", "Check", "Money Order"] as const;

/**
 * The desktop's Payment Details form. Two differences, both deliberate:
 *
 *  - A tender below the total is refused. The desktop turned Change red and
 *    left Save enabled, so a short payment could be receipted in full.
 *  - Save posts item ids, not amounts. The server rebuilds every figure from
 *    the database inside the transaction that writes them.
 */
export default function PaymentDialog({
  account,
  date,
  orNumber,
  orSerial,
  rows,
  amounts,
  onClose,
  onSaved,
}: {
  account: CollectionAccount;
  date: string;
  orNumber: string;
  orSerial: string;
  rows: Payable[];
  amounts: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [paymentType, setPaymentType] = useState<(typeof TYPES)[number]>("Cash");
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");
  const [draweeDate, setDraweeDate] = useState(date);
  const [tendered, setTendered] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaymentResult | null>(null);

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (amounts[r.key] ?? r.amount), 0),
    [rows, amounts],
  );

  // Non-cash payments are written for the exact amount, so the field is
  // prefilled and the change is always zero.
  const tenderValue = paymentType === "Cash" ? Number(tendered || 0) : total;
  const change = tenderValue - total;
  const short = change < -0.004;

  /** The lines as they will print, grouped the way the desktop groups them. */
  const preview = useMemo(() => {
    const bills = rows.filter((r) => r.kind === "bill");
    const lines: { label: string; value: string }[] = [];

    if (bills.length) {
      const detail = (r: Payable, label: string) =>
        Number(
          (r.detail.find((d) => d.label === label)?.value ?? "0").replace(/,/g, ""),
        );
      const sum = (label: string) =>
        bills.reduce((s, r) => s + detail(r, label), 0);

      lines.push({ label: "WATER BILL FOR", value: peso.format(sum("Water Services Fee")) });
      lines.push({
        label:
          bills.length > 1
            ? `${bills[0].billPeriod} TO ${bills[bills.length - 1].billPeriod}`
            : String(bills[0].billPeriod),
        value: "",
      });
      lines.push({ label: "E.F", value: peso.format(sum("Environmental Fee")) });

      const discount = sum("Discount");
      if (discount > 0) lines.push({ label: "DISCOUNT", value: `(${peso.format(discount)})` });
      const penalty = sum("Penalty");
      if (penalty > 0) lines.push({ label: "PENALTY", value: peso.format(penalty) });
      const installment = sum("Installment Application Fee");
      if (installment > 0) {
        lines.push({ label: "APPLICATION FEE", value: peso.format(installment) });
      }
      const wmmf = sum("Water Meter Maintenance Fee");
      if (wmmf > 0) {
        lines.push({ label: "WM MAINTENANCE FEE", value: peso.format(wmmf) });
      }
    }

    for (const r of rows) {
      if (r.kind === "bill") continue;
      lines.push({
        label: r.nature.toUpperCase(),
        value: peso.format(amounts[r.key] ?? r.amount),
      });
    }
    return lines;
  }, [rows, amounts]);

  async function save(andPrint: boolean) {
    setSaving(true);
    setError("");
    try {
      const body = {
        acctId: account.id,
        orNumber,
        orSerial,
        date,
        paymentType,
        tendered: tenderValue,
        items: rows.map((r) => ({
          key: r.key,
          amount: amounts[r.key] ?? r.amount,
          ...(r.payload ?? {}),
        })),
        drawee:
          paymentType === "Cash"
            ? null
            : { bank, number: reference, date: draweeDate },
      };
      const saved = await apiPost<PaymentResult>("/api/collection/pay", body);
      if (andPrint) {
        window.open(
          `/collection/receipt?number=${encodeURIComponent(saved.orNumber)}&serial=${encodeURIComponent(saved.orSerial)}`,
          "_blank",
        );
      }
      setResult(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="modal-backdrop">
        <div className="modal payment-modal" role="dialog" aria-modal="true">
          <h2 className="modal-title">Payment recorded</h2>
          <p className="modal-sub">
            O.R. {result.orNumber} ({result.orSerial}) · {result.collector}
          </p>
          <div className="payment-totals">
            <div>
              <span>Total</span>
              <strong>{peso.format(result.total)}</strong>
            </div>
            <div>
              <span>Change</span>
              <strong>{peso.format(result.change)}</strong>
            </div>
          </div>
          <div className="form-actions">
            <button className="primary" onClick={onSaved}>
              Done
            </button>
            {/* Kept here for the case the print failed or the paper jammed —
                the payment is already saved, so this just opens it again. */}
            <button
              className="clear-filters"
              onClick={() =>
                window.open(
                  `/collection/receipt?number=${encodeURIComponent(result.orNumber)}&serial=${encodeURIComponent(result.orSerial ?? "")}`,
                  "_blank",
                )
              }
            >
              Print O.R. again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal payment-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="payment-head">
          <div>
            <h2 className="modal-title">Payment details</h2>
            <p className="modal-sub">{account.name}</p>
          </div>
          <div className="payment-or">
            <span className="field-label">Account No.</span>
            <span className="payment-account">{account.accountNo}</span>
            <span className="field-label">O.R. #</span>
            <span className="payment-ornum">{orNumber}</span>
            <span className="payment-serial">{orSerial}</span>
          </div>
        </header>

        <table className="data-table particulars">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((l, i) => (
              <tr key={`${l.label}-${i}`}>
                <td>{l.label}</td>
                <td className="num">{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {preview.length > 8 && (
          <div className="form-error">
            This payment needs {preview.length} lines but an O.R. only prints 8.
            Split it across two receipts.
          </div>
        )}

        <div className="payment-entry">
          <div className="payment-fields">
            <label className="field-input">
              <span>Payment type</span>
              <select
                value={paymentType}
                onChange={(e) =>
                  setPaymentType(e.target.value as (typeof TYPES)[number])
                }
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>

            {paymentType === "Cash" ? (
              <label className="field-input">
                <span>Amount tendered</span>
                <input
                  className="tender"
                  inputMode="decimal"
                  autoFocus
                  value={tendered}
                  onChange={(e) => setTendered(e.target.value)}
                />
              </label>
            ) : (
              <>
                {paymentType === "Check" && (
                  <label className="field-input">
                    <span>Drawee bank</span>
                    <input value={bank} onChange={(e) => setBank(e.target.value)} />
                  </label>
                )}
                <label className="field-input">
                  <span>{paymentType === "Check" ? "Check no." : "Money order no."}</span>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label className="field-input">
                  <span>Dated</span>
                  <input
                    type="date"
                    value={draweeDate}
                    onChange={(e) => setDraweeDate(e.target.value)}
                  />
                </label>
              </>
            )}
          </div>

          <div className="payment-totals">
            <div>
              <span>Total</span>
              <strong>{peso.format(total)}</strong>
            </div>
            <div className={short ? "short" : ""}>
              <span>Change</span>
              <strong>{peso.format(change)}</strong>
            </div>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={saving || short || preview.length > 8}
            onClick={() => save(true)}
          >
            {saving ? "Saving…" : "Save and print"}
          </button>
          <button
            className="clear-filters"
            disabled={saving || short || preview.length > 8}
            onClick={() => save(false)}
          >
            Save
          </button>
          <button className="clear-filters" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {short && (
            <span className="count">
              Amount tendered is short by {peso.format(Math.abs(change))}.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
