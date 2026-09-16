import { useEffect, useState } from "react";
import { apiGet } from "./api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type FilterOptions = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
};

type SelectBy = "all" | "month" | "year";

/**
 * Accounts Receivable Report — one row per unpaid bill for a barangay or
 * cluster, filtered either to every outstanding bill, one specific billing
 * month, or a whole year. Barangay/cluster options and the cluster-picker
 * visibility follow the same /api/filters + /api/reading/setup convention
 * ReadingListDialog uses.
 */
export default function AccountsReceivablesDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
  const [selectBy, setSelectBy] = useState<SelectBy>("all");
  const [month, setMonth] = useState(MONTHS[now.getMonth()]!);
  const [year, setYear] = useState(now.getFullYear());
  const [barangay, setBarangay] = useState(0);
  const [cluster, setCluster] = useState(0);
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [useCluster, setUseCluster] = useState(false);

  useEffect(() => {
    apiGet<FilterOptions>("/api/filters").then(setOptions).catch(() => {});
    apiGet<{ useCluster: boolean }>("/api/reading/setup")
      .then((s) => setUseCluster(s.useCluster))
      .catch(() => {});
  }, []);

  const clusters = barangay
    ? (options?.clusters ?? []).filter((c) => c.barangayId === barangay)
    : [];

  const canOpen = barangay > 0 && (!useCluster || cluster > 0);

  function open() {
    const barangayName = options?.barangays.find((b) => b.id === barangay)?.name ?? "";
    const clusterName = clusters.find((c) => c.id === cluster)?.name ?? "";
    const params = new URLSearchParams({
      selectBy,
      barangayId: String(barangay), barangayName,
      ...(useCluster ? { clusterId: String(cluster), clusterName } : {}),
      ...(selectBy === "month" ? { month } : {}),
      ...(selectBy === "month" || selectBy === "year" ? { year: String(year) } : {}),
    });
    window.open(`/reports/accounts-receivables/print?${params.toString()}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Accounts Receivable Report</h2>
        <p className="modal-sub">
          Every unpaid bill for a barangay or cluster — all outstanding, one billing month, or a
          whole year.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => { setBarangay(Number(e.target.value)); setCluster(0); }}
          >
            <option value={0}>Select…</option>
            {(options?.barangays ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        {useCluster && (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Cluster</span>
            <select value={cluster} onChange={(e) => setCluster(Number(e.target.value))} disabled={!barangay}>
              <option value={0}>Select…</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Select by</span>
          <select value={selectBy} onChange={(e) => setSelectBy(e.target.value as SelectBy)}>
            <option value="all">All outstanding</option>
            <option value="month">One month</option>
            <option value="year">One year</option>
          </select>
        </label>

        {selectBy === "month" && (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Month</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}

        {(selectBy === "month" || selectBy === "year") && (
          <label className="field-input" style={{ marginBottom: 12 }}>
            <span>Year</span>
            <input
              className="amount-input"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
        )}

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={open} disabled={!canOpen}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
