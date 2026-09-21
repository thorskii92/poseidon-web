import { useState } from "react";

/** Opens the ECPay Annual Collection Report print view for a chosen year —
 * ported from frmECPayAnnualCollectionReport, which just asked for a year
 * (2017 through the current year, same range the desktop form offered). */
export default function ECPayAnnualCollectionReportDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const years = Array.from({ length: now.getFullYear() - 2017 + 1 }, (_, i) => 2017 + i).reverse();

  function open() {
    window.open(`/ecpay/reports/annual-collection/print?year=${year}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">ECPay Annual Collection Report</h2>
        <p className="modal-sub">
          The full calendar year's ECPay collections — monthly and quarterly
          trends, branch/classification/barangay/cluster/zone breakdowns,
          bill-period ageing, O.R. booklets used, and the highest-paying
          accounts.
        </p>

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
