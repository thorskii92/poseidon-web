import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut, ApiError } from "./api";
import AdminGate, { type AdminCreds } from "./AdminGate";

/**
 * Meter Manager — the desktop's frmMeterManager. Find accounts by meter
 * number (exact or partial), list meter numbers used on more than one
 * account, and correct an account's meter no. or stand pipe in place
 * (Enter or leaving the box saves; Esc undoes). Opens only after an
 * administrator signs off, like the desktop.
 */

type Row = {
  id: number; accountNo: string; name: string; meterNo: string; street: string; cluster: string;
  barangay: string; standpipe: string; classification: string; status: string;
};
type Query = { mode: "exact" | "contains" | "duplicates"; q: string };
type Pending = { row: Row; field: "meterNo" | "standpipe"; value: string; duplicates: { accountNo: string; name: string }[] };

const KEY = ["meters"];

export default function MeterManagerPage() {
  const [admin, setAdmin] = useState<AdminCreds | null>(null);
  if (!admin) {
    return (
      <AdminGate
        title="Meter Manager"
        blurb="Find accounts by meter number, spot duplicate meter numbers, and correct meter and stand pipe numbers."
        unlockUrl="/api/meters/unlock"
        onUnlock={setAdmin}
      />
    );
  }
  return <MeterManager admin={admin} />;
}

function MeterManager({ admin }: { admin: AdminCreds }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"exact" | "contains">("exact");
  const [text, setText] = useState("");
  const [query, setQuery] = useState<Query | null>(null);
  const [brgy, setBrgy] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);

  const qs = query ? new URLSearchParams({ mode: query.mode, q: query.q }).toString() : "";
  const { data, isFetching, error: loadError } = useQuery<{ rows: Row[] }>({
    queryKey: [...KEY, qs],
    queryFn: () => apiGet(`/api/meters?${qs}`),
    enabled: !!query,
  });
  const all = data?.rows ?? [];
  const barangays = [...new Set(all.map((r) => r.barangay).filter(Boolean))].sort();
  const rows = brgy ? all.filter((r) => r.barangay === brgy) : all;
  const dupMode = query?.mode === "duplicates";
  // Shade alternate meter numbers so each duplicate group reads as one block.
  const groupShade = new Map<string, boolean>();
  if (dupMode) {
    let on = false;
    for (const r of rows) {
      const k = r.meterNo.trim().toUpperCase();
      if (!groupShade.has(k)) {
        groupShade.set(k, on);
        on = !on;
      }
    }
  }

  function search() {
    const q = text.trim();
    if (!q) return;
    setBrgy("");
    setQuery({ mode, q });
  }

  async function save(row: Row, field: "meterNo" | "standpipe", value: string, allowDuplicate = false) {
    setBusy(true);
    setError("");
    try {
      await apiPut(`/api/meters/${row.id}`, {
        [field]: value, allowDuplicate, adminUsername: admin.adminUsername, adminPassword: admin.adminPassword,
      });
      setPending(null);
      setNotice(`${row.accountNo}: ${field === "meterNo" ? "meter no." : "stand pipe"} changed to ${value || "(blank)"}.`);
      qc.invalidateQueries({ queryKey: KEY });
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as { duplicates?: Pending["duplicates"] } | undefined) : undefined;
      if (body?.duplicates?.length) setPending({ row, field, value, duplicates: body.duplicates });
      else setError(`${row.accountNo}: ${(e as Error).message}`);
      qc.invalidateQueries({ queryKey: KEY });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Meter Manager</h1>
          <p className="account-no">
            Find accounts by meter number and correct meter and stand pipe numbers. Every change is written to the account's log.
            Authorised by {admin.name}.
          </p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="record-section">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="field-input" style={{ minWidth: 160 }}>
            <span>Search meter no.</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as "exact" | "contains")}>
              <option value="exact">Exact match</option>
              <option value="contains">Contains</option>
            </select>
          </label>
          <label className="field-input" style={{ flex: "1 1 200px" }}>
            <span>Meter no.</span>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} maxLength={60} />
          </label>
          <button className="primary" disabled={!text.trim()} onClick={search}>Search</button>
          <button className="clear-filters" onClick={() => { setBrgy(""); setQuery({ mode: "duplicates", q: "" }); }}>
            Show duplicate meter numbers
          </button>
        </div>
      </section>

      {!query && <p className="count">Search for a meter number, or list the meter numbers used on more than one account.</p>}

      {query && (
        <section className="record-section">
          <div className="record-head">
            <h2>{dupMode ? "Meter numbers on more than one account" : `Meter no. ${query.mode === "contains" ? "containing" : ""} “${query.q}”`}</h2>
            <span className="count">
              {isFetching ? "Loading…" : dupMode ? `${rows.length} account(s), ${groupShade.size} meter no.` : `${rows.length} account(s)`}
            </span>
          </div>
          {barangays.length > 1 && (
            <div className="form-grid" style={{ marginBottom: 10 }}>
              <label className="field-input">
                <span>Barangay</span>
                <select value={brgy} onChange={(e) => setBrgy(e.target.value)}>
                  <option value="">All</option>
                  {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {loadError && <div className="form-error">{(loadError as Error).message}</div>}
          {data && rows.length === 0 && <p className="count">{dupMode ? "No meter number is used on more than one account." : "No account has that meter number."}</p>}
          {rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Account No.</th><th>Account name</th><th>Meter no.</th><th>Street address</th><th>Cluster</th>
                    <th>Barangay</th><th>Stand pipe</th><th>Classification</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={dupMode && groupShade.get(r.meterNo.trim().toUpperCase()) ? { background: "var(--row-alt, rgba(0,0,0,0.035))" } : undefined}>
                      <td>{r.accountNo}</td>
                      <td>{r.name}</td>
                      <td><EditCell key={`m-${r.id}-${r.meterNo}`} value={r.meterNo} disabled={busy} onSave={(v) => save(r, "meterNo", v)} /></td>
                      <td>{r.street}</td>
                      <td>{r.cluster}</td>
                      <td>{r.barangay}</td>
                      <td><EditCell key={`s-${r.id}-${r.standpipe}`} value={r.standpipe} disabled={busy} onSave={(v) => save(r, "standpipe", v)} /></td>
                      <td>{r.classification}</td>
                      <td>{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {pending && (
        <div className="modal-backdrop" onClick={() => setPending(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Meter no. {pending.value} is already in use</h2>
            <p className="modal-sub">It is on:</p>
            <ul>{pending.duplicates.map((d) => <li key={d.accountNo}>{d.accountNo} — {d.name}</li>)}</ul>
            <p className="count">Save it on {pending.row.accountNo} anyway? Both accounts will then show under “Show duplicate meter numbers”.</p>
            <div className="form-actions">
              <button className="danger" disabled={busy} onClick={() => save(pending.row, pending.field, pending.value, true)}>Save anyway</button>
              <button className="clear-filters" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A table cell edited in place: Enter or leaving the box saves, Esc undoes. */
function EditCell({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  const commit = () => {
    if (v.trim() !== value.trim()) onSave(v.trim());
  };
  return (
    <input
      className="table-input"
      style={{ width: "100%", minWidth: 90 }}
      value={v}
      maxLength={45}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(value);
      }}
    />
  );
}
