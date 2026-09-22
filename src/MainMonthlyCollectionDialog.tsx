import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Opens the Monthly Collection Report (Main Collection) print view for a
 * chosen month — over-the-counter water bill collections, ECPay excluded,
 * with daily/weekday trends and the six-month trend. */
export default function MainMonthlyCollectionDialog({
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
    window.open(`/reports/main-monthly-collection/print?month=${ym}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Monthly Collection Report</h2>
        <p className="modal-sub">
          Over-the-counter water bill collections for the chosen month —
          daily and weekday trends, the six-month trend, and breakdowns by
          barangay, water system, and classification. ECPay payments are
          excluded; see the ECPay Monthly Collection Report for that
          channel.
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
