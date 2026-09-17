import { useState } from "react";

/** Annual Connection Report — a year picker, no month (the whole calendar
 *  year is the period). Same pattern as the monthly sibling's dialog. */
export default function AnnualConnectionReportDialog({ onClose }: { onClose: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());

  function open() {
    window.open(`/reports/annual-connections/print?year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Annual Connection Report</h2>
        <p className="modal-sub">
          New service connections for a calendar year — monthly and quarterly spread, long-run
          growth, and where they landed.
        </p>

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
