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

/**
 * Reading List — the meter reader's paper worksheet for one barangay or
 * cluster, for one billing month. Barangay/cluster options come from the
 * same /api/filters this app's other area pickers use; whether the cluster
 * picker even shows follows /api/reading/setup's useCluster flag, exactly
 * as ReadingPage's own barangay/cluster step already does.
 */
export default function ReadingListDialog({ onClose }: { onClose: () => void }) {
  const now = new Date();
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
      month, year: String(year),
      barangayId: String(barangay), barangayName,
      ...(useCluster ? { clusterId: String(cluster), clusterName } : {}),
    });
    window.open(`/reports/reading-list/print?${params.toString()}`, "_blank");
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Reading List</h2>
        <p className="modal-sub">
          Every account in a barangay or cluster, with its last recorded reading, for the
          meter reader to carry into the field.
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
          <button className="primary" onClick={open} disabled={!canOpen}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
