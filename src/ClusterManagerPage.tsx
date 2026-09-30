import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "./api";
import AdminGate, { type AdminCreds } from "./AdminGate";

/**
 * Cluster Manager — the desktop's ClusterManager form. Pick a barangay
 * (then optionally a cluster and a stand pipe), and move accounts between
 * that barangay's clusters: one at a time from the Cluster column, or
 * several at once with the checkboxes. Clusters are added in Settings.
 * Opens only after an administrator signs off, like the desktop.
 */

type Areas = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; name: string; barangayId: number; accounts: number }[];
};
type Row = { id: number; accountNo: string; name: string; street: string; standpipe: string; clusterId: number | null; clusterName: string };

const KEY = ["clusters"];

export default function ClusterManagerPage() {
  const [admin, setAdmin] = useState<AdminCreds | null>(null);
  if (!admin) {
    return (
      <AdminGate
        title="Cluster Manager"
        blurb="Move accounts between the clusters of their barangay."
        unlockUrl="/api/clusters/unlock"
        onUnlock={setAdmin}
      />
    );
  }
  return <ClusterManager admin={admin} />;
}

function ClusterManager({ admin }: { admin: AdminCreds }) {
  const qc = useQueryClient();
  const [brgy, setBrgy] = useState(0);
  const [cluster, setCluster] = useState(0);
  const [standpipe, setStandpipe] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [target, setTarget] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { data: areas } = useQuery<Areas>({ queryKey: [...KEY, "areas"], queryFn: () => apiGet("/api/clusters/areas") });
  const qs = new URLSearchParams({ barangayId: String(brgy), clusterId: String(cluster), standpipe, search }).toString();
  const { data, isLoading, error: loadError } = useQuery<{ rows: Row[]; standpipes: string[] }>({
    queryKey: [...KEY, "accounts", qs],
    queryFn: () => apiGet(`/api/clusters/accounts?${qs}`),
    enabled: brgy > 0,
  });

  const clusters = (areas?.clusters ?? []).filter((c) => c.barangayId === brgy);
  const rows = data?.rows ?? [];

  function pickBrgy(id: number) {
    setBrgy(id);
    setCluster(0);
    setStandpipe("");
    setPicked([]);
    setTarget(0);
  }

  async function move(ids: number[], clusterId: number) {
    setBusy(true);
    setError("");
    try {
      const r = await apiPut<{ moved: number; cluster: string }>("/api/clusters/assign", {
        accountIds: ids, clusterId, adminUsername: admin.adminUsername, adminPassword: admin.adminPassword,
      });
      setNotice(r.moved ? `${r.moved} account(s) moved to ${r.cluster}.` : `Already in ${r.cluster} — nothing to move.`);
      setPicked([]);
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Cluster Manager</h1>
          <p className="account-no">Move accounts between the clusters of their barangay. Every move is written to the account's log. Authorised by {admin.name}.</p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="record-section">
        <div className="form-grid">
          <label className="field-input">
            <span>Barangay</span>
            <select value={brgy} onChange={(e) => pickBrgy(Number(e.target.value))}>
              <option value={0}>— pick a barangay —</option>
              {(areas?.barangays ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {brgy > 0 && (
            <label className="field-input">
              <span>Cluster</span>
              <select value={cluster} onChange={(e) => { setCluster(Number(e.target.value)); setStandpipe(""); setPicked([]); }}>
                <option value={0}>All</option>
                {clusters.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.accounts})</option>)}
                <option value={-1}>No cluster yet</option>
              </select>
            </label>
          )}
          {brgy > 0 && (
            <label className="field-input">
              <span>Stand pipe</span>
              <select value={standpipe} onChange={(e) => { setStandpipe(e.target.value); setPicked([]); }}>
                <option value="">All</option>
                {(data?.standpipes ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          )}
          {brgy > 0 && (
            <label className="field-input">
              <span>Search</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Account no., name, street" />
            </label>
          )}
        </div>
      </section>

      {brgy === 0 && <p className="count">Pick a barangay to see its accounts.</p>}
      {brgy > 0 && clusters.length === 0 && areas && (
        <p className="form-error">This barangay has no clusters yet — add them in Settings first.</p>
      )}

      {brgy > 0 && (
        <section className="record-section">
          <div className="record-head">
            <h2>Accounts</h2>
            <span className="count">{isLoading ? "Loading…" : `${rows.length} account(s)`}</span>
          </div>

          {picked.length > 0 && (
            <div className="form-actions" style={{ marginTop: 0, marginBottom: 10, alignItems: "center" }}>
              <strong>{picked.length} selected — move to</strong>
              <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
                <option value={0}>— cluster —</option>
                {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="primary" disabled={busy || !target} onClick={() => move(picked, target)}>Move</button>
              <button className="clear-filters" onClick={() => setPicked([])}>Clear selection</button>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {loadError && <div className="form-error">{(loadError as Error).message}</div>}
          {data && rows.length === 0 && <p className="count">No accounts match.</p>}

          {rows.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={picked.length > 0 && picked.length === rows.length}
                      onChange={(e) => setPicked(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                  <th>Account No.</th>
                  <th>Name</th>
                  <th>Street address</th>
                  <th>Stand pipe</th>
                  <th>Cluster</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.includes(r.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, r.id] : p.filter((x) => x !== r.id)))}
                      />
                    </td>
                    <td>{r.accountNo}</td>
                    <td>{r.name}</td>
                    <td>{r.street}</td>
                    <td>{r.standpipe}</td>
                    <td>
                      <select
                        value={r.clusterId ?? 0}
                        disabled={busy}
                        onChange={(e) => Number(e.target.value) > 0 && move([r.id], Number(e.target.value))}
                      >
                        {!r.clusterId && <option value={0}>— none —</option>}
                        {clusters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}
