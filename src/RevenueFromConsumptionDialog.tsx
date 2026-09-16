import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Revenue from Consumption — a month + year picker with two destinations,
 *  matching the VB dialog's "Load per Barangay" / "Load per Cluster"
 *  buttons. Signatories are picked on the print view's own toolbar, same
 *  as every other report, rather than on this dialog. */
export default function RevenueFromConsumptionDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]!);
  const [year, setYear] = useState(now.getFullYear());

  function open(path: string) {
    window.open(`${path}?month=${encodeURIComponent(month)}&year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Revenue from Consumption</h2>
        <p className="modal-sub">
          Billed volume and amount by classification, for one billing month — by barangay,
          or by cluster grouped under its barangay.
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
          <button className="primary" onClick={() => open("/reports/revenue-consumption/by-barangay/print")}>
            Open per Barangay
          </button>
          <button className="primary" onClick={() => open("/reports/revenue-consumption/by-cluster/print")}>
            Open per Cluster
          </button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
