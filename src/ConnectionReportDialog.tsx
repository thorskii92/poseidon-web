import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Monthly Connection Report — a month + year picker, same pattern as the
 *  other analytics-style report dialogs (Adjusted Bills, Bill Modification). */
export default function ConnectionReportDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]!);
  const [year, setYear] = useState(now.getFullYear());

  function open() {
    window.open(`/reports/monthly-connections/print?month=${encodeURIComponent(month)}&year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Monthly Connection Report</h2>
        <p className="modal-sub">
          New service connections for one month — trend, forecast, and where the new accounts are.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Year</span>
          <input
            className="amount-input"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
