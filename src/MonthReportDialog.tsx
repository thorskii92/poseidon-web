import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Pick a month, open a report's print view for it. For reports whose only
 * input is the month — the Mobile App reports use this rather than each
 * growing its own copy of the same two dropdowns.
 */
export default function MonthReportDialog({
  title, blurb, printPath, firstYear = 2026, onClose,
}: {
  title: string;
  blurb: string;
  /** Opened as `${printPath}?month=YYYY-MM`. */
  printPath: string;
  /** No data can exist before this year (the feature's first release). */
  firstYear?: number;
  onClose: () => void;
}) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from(
    { length: Math.max(1, now.getFullYear() - firstYear + 1) },
    (_, i) => now.getFullYear() - i,
  );

  function open() {
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    window.open(`${printPath}?month=${ym}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">{blurb}</p>

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
