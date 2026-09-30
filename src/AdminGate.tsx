import { useState } from "react";
import { apiPost } from "./api";
import AdminAuth from "./AdminAuth";

export type AdminCreds = { adminUsername: string; adminPassword: string; name: string };

/**
 * A page that opens only after an administrator signs off — the desktop's
 * Cluster Manager and Meter Manager. The credentials stay in memory for
 * this visit only (leaving the page forgets them) and the server checks
 * them again on every change.
 */
export default function AdminGate({
  title, blurb, unlockUrl, onUnlock,
}: { title: string; blurb: string; unlockUrl: string; onUnlock: (c: AdminCreds) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ name: string }>(unlockUrl, { adminUsername: username, adminPassword: password });
      onUnlock({ adminUsername: username, adminPassword: password, name: r.name });
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
          <h1>{title}</h1>
          <p className="account-no">{blurb}</p>
        </div>
      </div>
      <section className="record-section" style={{ maxWidth: 480 }}>
        <AdminAuth
          label="An administrator must authorise opening this page"
          username={username}
          password={password}
          onUsername={setUsername}
          onPassword={setPassword}
          onSubmit={() => username && password && unlock()}
          disabled={busy}
        />
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || !username || !password} onClick={unlock}>
            {busy ? "Checking…" : "Open"}
          </button>
        </div>
      </section>
    </div>
  );
}
