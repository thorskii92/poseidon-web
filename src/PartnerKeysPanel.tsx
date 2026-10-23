import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import AdminAuth from "./AdminAuth";

/**
 * Settings → API keys: keys for partner systems (the official website's
 * server) to use the partner API — poseidon-api partnerApi.ts. A new key is
 * shown once; POSEIDON keeps only a fingerprint of it. Creating and revoking
 * need an administrator.
 */

type KeyRow = {
  id: number; name: string; prefix: string; scopes: string[]; createdAt: string; createdBy: string;
  lastUsedAt: string | null; revokedAt: string | null; revokedBy: string | null;
};

const SCOPE_TEXT: Record<string, string> = {
  applications: "New applications — send applications, check their status, read the barangay/purok lists",
  accounts: "Account inquiry — a consumer's own balance and bills, by the details printed on their bill",
};

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function PartnerKeysPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ scopes: string[]; rows: KeyRow[] }>({
    queryKey: ["partner-keys"],
    queryFn: () => apiGet("/api/partner-keys"),
  });
  const [mode, setMode] = useState<null | { kind: "new" } | { kind: "revoke"; row: KeyRow }>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["applications"]);
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function reset() {
    setMode(null);
    setName("");
    setScopes(["applications"]);
    setAdminUser("");
    setAdminPass("");
    setError("");
  }

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ key: string }>("/api/partner-keys", { name, scopes, adminUser, adminPass });
      setCreated({ key: r.key, name });
      setCopied(false);
      reset();
      qc.invalidateQueries({ queryKey: ["partner-keys"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: KeyRow) {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/partner-keys/${row.id}/revoke`, { adminUser, adminPass });
      reset();
      qc.invalidateQueries({ queryKey: ["partner-keys"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = data?.rows ?? [];

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>API keys</h2>
        <button className="clear-filters" onClick={onClose}>Close</button>
      </div>
      <p className="count">
        For another system to talk to POSEIDON — e.g. the official website&apos;s server sending new applications.
        Give each partner its own key, and only what it needs. A key belongs on the partner&apos;s server, never in a
        web page. Revoke it the moment it may have leaked; the partner then needs a new one.
      </p>

      {created && (
        <div className="form-notice" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Key for &ldquo;{created.name}&rdquo; — copy it now. It won&apos;t be shown again.</div>
          <code style={{ display: "block", wordBreak: "break-all", padding: 8, background: "#fff", border: "1px solid #ddd", borderRadius: 6 }}>{created.key}</code>
          <div className="form-actions" style={{ marginTop: 8 }}>
            <button
              className="primary small"
              onClick={() => navigator.clipboard?.writeText(created.key).then(() => setCopied(true), () => setCopied(false))}
            >
              {copied ? "Copied" : "Copy key"}
            </button>
            <button className="clear-filters" onClick={() => setCreated(null)}>I&apos;ve saved it</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Key</th><th>May</th><th>Created</th><th>Last used</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.revokedAt ? { opacity: 0.55 } : undefined}>
                <td>{r.name}</td>
                <td><code>{r.prefix}…</code></td>
                <td>{r.scopes.join(", ")}</td>
                <td>{when(r.createdAt)}{r.createdBy ? <div className="muted" style={{ fontSize: 12 }}>by {r.createdBy}</div> : null}</td>
                <td>{when(r.lastUsedAt)}</td>
                <td>
                  {r.revokedAt ? (
                    <span className="muted">Revoked {when(r.revokedAt)}</span>
                  ) : (
                    <button className="clear-filters" onClick={() => { reset(); setMode({ kind: "revoke", row: r }); }}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="muted">No keys yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      {!mode && (
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button className="primary" onClick={() => { reset(); setCreated(null); setMode({ kind: "new" }); }}>New key</button>
        </div>
      )}

      {mode?.kind === "new" && (
        <div className="delete-override" style={{ marginTop: 12 }}>
          <label className="field-input" style={{ marginBottom: 10 }}>
            <span>Who uses it</span>
            <input value={name} autoFocus maxLength={80} placeholder="e.g. Official website" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field-label" style={{ marginBottom: 4 }}>What it may do</div>
          {(data?.scopes ?? ["applications", "accounts"]).map((s) => (
            <label key={s} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={(e) => setScopes((x) => (e.target.checked ? [...x, s] : x.filter((y) => y !== s)))}
              />
              <span>{SCOPE_TEXT[s] ?? s}</span>
            </label>
          ))}
          <AdminAuth username={adminUser} password={adminPass} onUsername={setAdminUser} onPassword={setAdminPass} disabled={busy} />
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button
              className="primary"
              disabled={busy || name.trim().length < 3 || !scopes.length || !adminUser.trim() || !adminPass}
              onClick={create}
            >
              {busy ? "Creating…" : "Create key"}
            </button>
            <button className="clear-filters" disabled={busy} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {mode?.kind === "revoke" && (
        <div className="delete-override" style={{ marginTop: 12 }}>
          <p style={{ marginTop: 0 }}>
            Revoke <b>{mode.row.name}</b> (<code>{mode.row.prefix}…</code>)? Anything using it stops working at once.
          </p>
          <AdminAuth username={adminUser} password={adminPass} onUsername={setAdminUser} onPassword={setAdminPass} disabled={busy} />
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="primary" disabled={busy || !adminUser.trim() || !adminPass} onClick={() => revoke(mode.row)}>
              {busy ? "Revoking…" : "Revoke key"}
            </button>
            <button className="clear-filters" disabled={busy} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
