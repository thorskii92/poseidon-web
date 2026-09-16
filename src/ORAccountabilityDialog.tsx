import { useState } from "react";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoFirstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** O.R. Accountability Report — a date range, or "all receipts on record"
 *  overriding it entirely, matching the VB dialog's From/To pickers plus
 *  its single override checkbox. */
export default function ORAccountabilityDialog({ onClose }: { onClose: () => void }) {
  const [from, setFrom] = useState(isoFirstOfMonth());
  const [to, setTo] = useState(isoToday());
  const [allDates, setAllDates] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setError("");
    if (!allDates && to < from) {
      setError("The end date comes before the start date");
      return;
    }
    const params = allDates ? "allDates=true" : `from=${from}&to=${to}`;
    window.open(`/reports/or-accountability/print?${params}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">O.R. Accountability Report</h2>
        <p className="modal-sub">
          Which booklets are on issue, which numbers were skipped or duplicated, and which
          issued receipts fall outside every booklet on record.
        </p>

        <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={allDates}
            onChange={(e) => setAllDates(e.target.checked)}
          />
          Cover all receipts on record
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>From</span>
          <input
            type="date"
            value={from}
            disabled={allDates}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>To</span>
          <input
            type="date"
            value={to}
            disabled={allDates}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
