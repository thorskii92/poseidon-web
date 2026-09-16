import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * Opens the Daily Collection Report print view for a chosen O.R. range —
 * shared by Receipts Manager (where picking a bundle pre-fills the serial)
 * and the Reports page (opened cold, no serial context yet).
 */
export default function DailyReportDialog({
  serial = "", onClose,
}: { serial?: string; onClose: () => void }) {
  const [initial, setInitial] = useState("");
  const [final, setFinal] = useState("");
  const [orSerial, setOrSerial] = useState(serial);
  const [error, setError] = useState("");

  const { data: serialData } = useQuery<{ serials: string[] }>({
    queryKey: ["receipt-serials"],
    queryFn: () => apiGet("/api/receipts/serials"),
  });

  function open() {
    setError("");
    if (!initial.trim() || !final.trim()) {
      setError("Enter both the starting and ending O.R. number");
      return;
    }
    if (Number(final) < Number(initial)) {
      setError("The ending O.R. cannot be before the starting one");
      return;
    }
    if (!orSerial) {
      setError("Choose an O.R. serial");
      return;
    }
    window.open(
      `/receipts/daily-collection/print?initial=${Number(initial)}&final=${Number(final)}&serial=${encodeURIComponent(orSerial)}`,
      "_blank",
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Daily Collection Report</h2>
        <p className="modal-sub">
          Rizal's report only, for now — every payment on this O.R. range, grouped and
          totalled the way the Municipal Economic Enterprise office needs it.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Initial O.R.</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={initial}
            autoFocus
            onChange={(e) => setInitial(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Final O.R.</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={final}
            onChange={(e) => setFinal(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>O.R. Serial</span>
          <select value={orSerial} onChange={(e) => setOrSerial(e.target.value)}>
            <option value="">Choose…</option>
            {(serialData?.serials ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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
