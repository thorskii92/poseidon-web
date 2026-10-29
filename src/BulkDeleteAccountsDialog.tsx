import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import AdminAuth from "./AdminAuth";

/**
 * Accounts → Delete unused accounts: every disconnected account with no
 * history at all (poseidon-api accountDeletion.ts), to delete several at
 * once under one administrator and one reason. Each one is still archived
 * on its own and re-checked as it goes; anything that picked up a record in
 * the meantime is skipped and listed.
 */

type Row = { id: number; accountNo: string; name: string; barangay: string; cluster: string; meterNo: string; logEntries: number };
type Result = { deleted: string[]; skipped: { accountNo: string; why: string }[] };

export default function BulkDeleteAccountsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error: loadError } = useQuery<{ rows: Row[] }>({
    queryKey: ["deletable-accounts"],
    queryFn: () => apiGet("/api/account-actions/deletable"),
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toUpperCase();
    return q
      ? rows.filter((r) => `${r.accountNo} ${r.name} ${r.barangay} ${r.cluster} ${r.meterNo}`.toUpperCase().includes(q))
      : rows;
  }, [rows, search]);
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  function toggleAll() {
    setPicked((p) => {
      const next = new Set(p);
      for (const r of shown) {
        if (allShownPicked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  async function run() {
    if (!window.confirm(`Delete ${picked.size} account${picked.size === 1 ? "" : "s"}? Each is archived first.`)) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<Result>("/api/account-actions/delete-bulk", { ids: [...picked], reason, adminUser, adminPass });
      setResult(r);
      setPicked(new Set());
      setAdminPass("");
      qc.invalidateQueries({ queryKey: ["deletable-accounts"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["account-stats"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <h2 className="modal-title">Delete unused accounts</h2>
        <p className="modal-sub">
          Disconnected accounts with no history at all — never billed, never paid, nothing ever filed. Most came over
          from the old system. Each one deleted is archived first (with your reason and who authorised it), so it can
          be put back if needed.
        </p>

        {result && (
          <div className="form-notice" style={{ marginBottom: 10 }}>
            <b>{result.deleted.length}</b> account{result.deleted.length === 1 ? "" : "s"} deleted.
            {result.skipped.length > 0 && (
              <>
                {" "}{result.skipped.length} skipped:
                <ul style={{ margin: "4px 0 0 18px" }}>
                  {result.skipped.map((s) => <li key={s.accountNo}>{s.accountNo} — {s.why}</li>)}
                </ul>
              </>
            )}
          </div>
        )}

        {isLoading && <p className="count">Finding them…</p>}
        {loadError && <p className="form-error">{(loadError as Error).message}</p>}
        {!isLoading && !rows.length && !loadError && <p className="count">There are no unused accounts left to delete.</p>}

        {rows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "4px 0 8px" }}>
              <input className="search" style={{ flex: 1 }} placeholder="Filter by name, account no., barangay…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <span className="count" style={{ whiteSpace: "nowrap" }}>{picked.size} of {rows.length} picked</span>
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--border, #e3e3e3)", borderRadius: 8 }}>
              <table className="data-table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>
                      <input type="checkbox" aria-label="Pick all shown" checked={allShownPicked} onChange={toggleAll} />
                    </th>
                    <th>Account</th><th>Where</th><th>Meter</th><th className="num">Log entries</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} style={{ cursor: "pointer" }}>
                      <td><input type="checkbox" checked={picked.has(r.id)} readOnly aria-label={`Pick ${r.accountNo}`} /></td>
                      <td>
                        <span className="cell-name">{r.name || "(no name)"}</span>
                        <span className="cell-sub">{r.accountNo}</span>
                      </td>
                      <td>{r.barangay}{r.cluster ? ` · ${r.cluster}` : ""}</td>
                      <td>{r.meterNo || <span className="muted">-</span>}</td>
                      <td className="num">{r.logEntries || <span className="muted">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="count" style={{ margin: "6px 0 10px" }}>
              Log entries are edits like a stand pipe or meter number change — they go with the account, into the archive.
            </p>

            <label className="field-input" style={{ marginBottom: 12 }}>
              <span>Reason</span>
              <input value={reason} maxLength={300} placeholder="e.g. Migrated from the legacy app, never had a bill or a payment" onChange={(e) => setReason(e.target.value)} />
            </label>
            <AdminAuth username={adminUser} password={adminPass} onUsername={setAdminUser} onPassword={setAdminPass} disabled={busy} />
          </>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          {rows.length > 0 && (
            <button
              className="primary"
              disabled={busy || !picked.size || reason.trim().length < 10 || !adminUser.trim() || !adminPass}
              onClick={run}
            >
              {busy ? `Deleting ${picked.size}…` : `Delete ${picked.size || ""} account${picked.size === 1 ? "" : "s"}`}
            </button>
          )}
          <button className="clear-filters" disabled={busy} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
