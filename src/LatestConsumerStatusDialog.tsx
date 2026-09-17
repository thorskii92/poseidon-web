import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Latest Consumer Status — a month + year picker with the VB source's own
 * four actions (Load per Barangay / Load per Cluster / Excel per Barangay /
 * Excel per Cluster) kept as four separate buttons rather than folded into
 * one "open report" flow, matching the dialog's own layout. The month/year
 * only label the snapshot (see latestConsumerStatus.ts) — the counts are
 * always the account table's current state.
 */
export default function LatestConsumerStatusDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [month, setMonth] = useState(MONTHS[now.getMonth()]!);
  const [year, setYear] = useState(now.getFullYear());

  const qs = `month=${encodeURIComponent(month)}&year=${year}`;

  function openReport(view: "barangay" | "cluster") {
    window.open(`/reports/consumer-status/print?view=${view}&${qs}`, "_blank");
    onClose();
  }
  function downloadExcel(view: "barangay" | "cluster") {
    window.open(`/api/reports/consumer-status/by-${view}/export.xlsx?${qs}`, "_blank");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Latest Consumer Status</h2>
        <p className="modal-sub">
          Active vs. disconnected accounts by classification, as of one billing period.
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

        <div className="form-actions" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <button className="primary" onClick={() => openReport("barangay")}>Load per Barangay</button>
          <button className="primary" onClick={() => openReport("cluster")}>Load per Cluster</button>
        </div>
        <div className="form-actions" style={{ marginTop: 10, flexWrap: "wrap" }}>
          <button className="clear-filters" onClick={() => downloadExcel("barangay")}>Excel per Barangay</button>
          <button className="clear-filters" onClick={() => downloadExcel("cluster")}>Excel per Cluster</button>
        </div>
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
