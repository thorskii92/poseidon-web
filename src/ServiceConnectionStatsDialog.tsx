import { useEffect, useState } from "react";
import { apiGet } from "./api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Service Connection Statistics — year + month picker with the VB's own
 * two separate actions (Load Annual / Load Monthly) kept as two buttons,
 * matching frmServiceConnectionStatisticsReport's own layout.
 */
export default function ServiceConnectionStatsDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(MONTHS[now.getMonth()]!);
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    apiGet<{ years: number[] }>("/api/reports/service-connection-stats/years")
      .then((d) => { setYears(d.years); if (d.years.length) setYear(d.years[0]!); })
      .catch(() => {});
  }, []);

  function openAnnual() {
    window.open(`/reports/service-connection-stats/print?view=annual&year=${year}`, "_blank");
    onClose();
  }
  function openMonthly() {
    const monthIdx = MONTHS.indexOf(month) + 1;
    window.open(`/reports/service-connection-stats/print?view=monthly&year=${year}&month=${monthIdx}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Service Connection Statistics</h2>
        <p className="modal-sub">
          Application, installation, disconnection, reconnection and transfer activity, by zone,
          barangay, cluster and classification.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Year</span>
          {years.length > 0 ? (
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          ) : (
            <input className="amount-input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          )}
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <div className="form-actions" style={{ marginTop: 14, flexWrap: "wrap" }}>
          <button className="primary" onClick={openAnnual}>Load Annual</button>
          <button className="primary" onClick={openMonthly}>Load Monthly</button>
        </div>
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
