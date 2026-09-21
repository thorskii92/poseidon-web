import { useState } from "react";
import EcpayCalendarPicker from "./EcpayCalendarPicker";

/** Opens the ECPay Daily Collection Report print view for a chosen date —
 * ported from frmECPayDailyCollectionReportLoad, which only ever asked for
 * one thing: the date. The calendar bolds/highlights days that actually
 * have a transaction, rather than asking the clerk to guess which ones do. */
export default function ECPayDailyCollectionReportDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");

  function open() {
    if (!date) {
      setError("Choose a date");
      return;
    }
    window.open(`/ecpay/reports/daily-collection/print?date=${date}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">ECPay Daily Collection Report</h2>
        <p className="modal-sub">
          Every ECPay transaction posted on the chosen date — collections by
          branch and hour, classification/barangay/zone breakdowns, O.R.
          accountability, and the full transaction detail. Highlighted days
          below have at least one transaction on file.
        </p>

        <div style={{ marginBottom: 12 }}>
          <EcpayCalendarPicker value={date} onChange={setDate} />
        </div>

        <p className="count">Selected: <strong>{date}</strong></p>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
