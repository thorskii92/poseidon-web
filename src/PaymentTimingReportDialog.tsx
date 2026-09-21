import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Opens the Payment Timing Report (Main Collection) print view for a
 * chosen month — the over-the-counter counterpart to the ECPay Payment
 * Timing Report: how long consumers take to pay after the bill is issued,
 * and how close to the due date, for counter payments instead of ECPay. */
export default function PaymentTimingReportDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const years = Array.from({ length: now.getFullYear() - 2017 + 1 }, (_, i) => 2017 + i).reverse();

  function open() {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    window.open(`/reports/payment-timing/print?month=${ym}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Payment Timing Report</h2>
        <p className="modal-sub">
          How long consumers take to pay a water bill over the counter, and
          how close to the due date those payments land, for the chosen
          month — by barangay, classification, and water system. ECPay
          payments are excluded; see the ECPay Payment Timing Report for
          that channel.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
