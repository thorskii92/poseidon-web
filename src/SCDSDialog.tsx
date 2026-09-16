import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Service Connection Data Sheet — a month + year picker. Signatories
 *  (Prepared x2, Checked, Noted) are set on the print view's own toolbar,
 *  same as every other report, rather than on this dialog the way the VB
 *  form had them. */
export default function SCDSDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  function open() {
    window.open(`/reports/scds/print?month=${month}&year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Service Connection Data Sheet</h2>
        <p className="modal-sub">
          Connections applied vs. active, disconnections and reconnections, by zone and
          barangay, as of the chosen month.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
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
