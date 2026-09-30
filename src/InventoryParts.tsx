import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiUpload } from "./api";

/**
 * Small pieces several Inventory screens share: the scanned-papers list
 * (poseidon-api inventoryFiles.ts) and the field-by-field change history
 * (invchangelog).
 */

type Attachment = { id: number; filename: string; type: string; size: number; atMs: number; by: string };

function size(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function when(ms: number) {
  return new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Scanned papers kept with one record — a DR, an invoice, a signed slip. */
export function Attachments({ refkind, refid, title = "Scanned papers" }: { refkind: string; refid: number; title?: string }) {
  const qc = useQueryClient();
  const key = ["inv-attachments", refkind, refid];
  const { data } = useQuery<{ rows: Attachment[] }>({
    queryKey: key,
    queryFn: () => apiGet(`/api/inventory/files/attachments/${refkind}/${refid}`),
  });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files)) await apiUpload(`/api/inventory/files/attachments/${refkind}/${refid}`, f);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(a: Attachment) {
    if (!window.confirm(`Remove ${a.filename}?`)) return;
    try {
      await apiDelete(`/api/inventory/files/attachment/${a.id}`);
      qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="record-head" style={{ marginBottom: 6 }}>
        <strong>{title}</strong>
        <button className="clear-filters" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : "Attach a PDF or photo"}
        </button>
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => add(e.target.files)} />
      </div>
      {error && <div className="form-error">{error}</div>}
      {data && data.rows.length === 0 && <p className="count">Nothing attached yet.</p>}
      {data && data.rows.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.rows.map((a) => (
            <li key={a.id}>
              <a href={`/api/inventory/files/attachment/${a.id}`} target="_blank" rel="noreferrer">{a.filename}</a>{" "}
              <span className="muted">· {size(a.size)} · {when(a.atMs)}{a.by ? ` · ${a.by}` : ""}</span>{" "}
              <button className="link-button" onClick={() => remove(a)}>remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Change = { id: number; atMs: number; by: string; field: string; oldValue: string; newValue: string };

/** Corrections made to a record's details, newest first. */
export function ChangeHistory({ refkind, refid }: { refkind: string; refid: number }) {
  const { data, isLoading, error } = useQuery<{ rows: Change[] }>({
    queryKey: ["inv-changes", refkind, refid],
    queryFn: () => apiGet(`/api/inventory/changes/${refkind}/${refid}`),
  });
  if (isLoading) return <p className="count">Loading…</p>;
  if (error) return <p className="form-error">{(error as Error).message}</p>;
  if (!data?.rows.length) return <p className="count">No changes since it was entered.</p>;
  return (
    <table>
      <thead><tr><th>When</th><th>What</th><th>Was</th><th>Now</th><th>By</th></tr></thead>
      <tbody>
        {data.rows.map((c) => (
          <tr key={c.id}>
            <td style={{ whiteSpace: "nowrap" }}>{when(c.atMs)}</td>
            <td>{c.field}</td>
            <td className="muted">{c.oldValue || "—"}</td>
            <td>{c.newValue || "—"}</td>
            <td>{c.by}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
