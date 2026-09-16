import { useState } from "react";

/** A single year picker — opens a print view at ?year=YYYY. Used by reports
 *  whose only real parameter is which billing year to run. */
export default function YearReportDialog({
  title, blurb, printPath, onClose,
}: { title: string; blurb: string; printPath: string; onClose: () => void }) {
  const [year, setYear] = useState(new Date().getFullYear());

  function open() {
    window.open(`${printPath}?year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">{blurb}</p>

        <label className="field-input">
          <span>Year</span>
          <input
            className="amount-input"
            type="number"
            value={year}
            autoFocus
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
