import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Opens the ECPay Monthly Collection Report print view for a chosen month —
 * ported from frmMonthlyCollectionReportLoad, which just asked for a month
 * and a year (2017 through the current year, same range the desktop form
 * offered). */
export default function ECPayMonthlyCollectionReportDialog({
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
    window.open(`/ecpay/reports/monthly-collection/print?month=${ym}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">ECPay Monthly Collection Report</h2>
        <p className="modal-sub">
          Every ECPay transaction posted in the chosen month — daily and
          weekday trends, branch/classification/barangay/cluster/zone
          breakdowns, bill-period ageing, the six-month trend, and the
          highest-paying accounts.
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
