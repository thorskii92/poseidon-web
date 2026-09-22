import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { peso } from "./AdjustmentShared";
import AdminAuth from "./AdminAuth";

/**
 * Synchronization Conflicts — main-server only (see Layout.tsx: hidden on a
 * satellite deployment, the opposite of SyncPage's Upload section). A
 * satellite-collected payment whose bill/fee was also settled some other way
 * before it could be uploaded lands here (see poseidon-api's syncUpload.ts)
 * instead of being applied twice. Office staff pick one of three
 * resolutions per row — refund, cancel the O.R. that won the race, or carry
 * the amount forward to the account's next unpaid bill.
 */

type Conflict = {
  id: number;
  detectedAt: string;
  satelliteName: string | null;
  accountNo: string;
  accountName: string;
  acctId: number;
  payableKey: string;
  billId: number | null;
  nature: string;
  amount: number;
  orNumber: string;
  orSerial: string;
  collectedAt: string;
  winningOrNumber: string | null;
  winningOrSerial: string | null;
};

function shortDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SyncConflictsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const { data, isLoading, error } = useQuery<Conflict[]>({
    queryKey: ["sync-conflicts"],
    queryFn: () => apiGet<Conflict[]>("/api/sync-conflicts"),
    retry: false,
  });

  const current = data?.find((c) => c.id === open) ?? null;

  function refresh(message: string) {
    setNotice(message);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["sync-conflicts"] });
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Synchronization Conflicts</h1>
          <p className="account-no">
            Payments collected in the field whose bill or fee was also
            settled another way before they could be uploaded. The money was
            already collected — resolve each one as a refund, an O.R.
            cancellation, or a carry-forward to the account's next bill.
          </p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}
        {error && <p className="form-error">{(error as Error).message}</p>}
        {data && data.length === 0 && (
          <p className="count">No open conflicts — nothing waiting for review.</p>
        )}

        {data && data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Detected</th>
                <th>Satellite</th>
                <th>Account</th>
                <th>Nature</th>
                <th className="n">Amount</th>
                <th>O.R.</th>
                <th>Winning O.R.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>{shortDateTime(c.detectedAt)}</td>
                  <td>{c.satelliteName ?? "—"}</td>
                  <td>{c.accountNo} · {c.accountName}</td>
                  <td>{c.nature}</td>
                  <td className="n">{peso.format(c.amount)}</td>
                  <td>{c.orNumber}/{c.orSerial}</td>
                  <td>{c.winningOrNumber ? `${c.winningOrNumber}/${c.winningOrSerial}` : "—"}</td>
                  <td>
                    <button className="link-button" onClick={() => setOpen(c.id)}>Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {current && (
        <ConflictResolveDialog
          conflict={current}
          onClose={() => setOpen(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}

function ConflictResolveDialog({
  conflict, onClose, onDone,
}: { conflict: Conflict; onClose: () => void; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<"pick" | "refund" | "cancel" | "carry-forward">("pick");
  const [note, setNote] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function doRefund() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/sync-conflicts/${conflict.id}/refund`, { note });
      onDone(`Recorded as refunded — ${peso.format(conflict.amount)} for ${conflict.accountNo}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/sync-conflicts/${conflict.id}/cancel`, { adminUsername, adminPassword, note });
      onDone(`O.R. ${conflict.winningOrNumber}/${conflict.winningOrSerial} cancelled.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doCarryForward() {
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<{ ok: true; appliedTo: string; amount: number }>(
        `/api/sync-conflicts/${conflict.id}/carry-forward`, {},
      );
      onDone(`Carried forward to ${result.appliedTo} — ${peso.format(result.amount)}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {conflict.accountNo} · {conflict.accountName}
        </h2>
        <p className="modal-sub">
          {conflict.nature} · {peso.format(conflict.amount)} · collected under
          O.R. {conflict.orNumber}/{conflict.orSerial} on {shortDateTime(conflict.collectedAt)}
          {conflict.winningOrNumber && (
            <> — already paid under O.R. {conflict.winningOrNumber}/{conflict.winningOrSerial}</>
          )}
        </p>

        {mode === "pick" && (
          <div className="form-actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <button className="clear-filters" onClick={() => setMode("refund")}>
              Refund — the money was handed back in the field
            </button>
            <button
              className="clear-filters"
              onClick={() => setMode("cancel")}
              disabled={!conflict.winningOrNumber}
            >
              Cancel the winning O.R. instead
            </button>
            <button className="clear-filters" onClick={() => setMode("carry-forward")}>
              Carry forward to the account's next unpaid bill
            </button>
          </div>
        )}

        {mode === "refund" && (
          <>
            <div className="form-notice" style={{ marginBottom: 10 }}>
              Record-only — main's ledger never reflected this payment, so
              there is nothing to reverse here. This just closes the review.
            </div>
            <label className="field-input">
              <span>Note (optional)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {mode === "cancel" && (
          <>
            <div className="form-notice" style={{ marginBottom: 10 }}>
              <strong>This is irreversible.</strong> O.R. {conflict.winningOrNumber}/{conflict.winningOrSerial} will
              be cancelled, and the bill/fee it paid will re-open. Only works
              when that O.R. was bill-only.
            </div>
            <AdminAuth
              username={adminUsername}
              password={adminPassword}
              onUsername={setAdminUsername}
              onPassword={setAdminPassword}
              onSubmit={doCancel}
              disabled={busy}
            />
            <label className="field-input" style={{ marginTop: 10 }}>
              <span>Note (optional)</span>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}

        {mode === "carry-forward" && (
          <div className="form-notice" style={{ marginBottom: 10 }}>
            Applies {peso.format(conflict.amount)} to this account's next
            unpaid bill or fee, under a fresh O.R. from the satellite upload
            bundle. Refused if there's no other unpaid bill, or if the
            amount doesn't match it exactly — this app has no
            partial-bill-payment concept.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions" style={{ marginTop: 14 }}>
          {mode === "refund" && (
            <button className="primary" disabled={busy} onClick={doRefund}>
              {busy ? "Recording…" : "Record refund"}
            </button>
          )}
          {mode === "cancel" && (
            <button
              className="danger"
              disabled={busy || !adminUsername || !adminPassword}
              onClick={doCancel}
            >
              {busy ? "Cancelling…" : "Cancel O.R."}
            </button>
          )}
          {mode === "carry-forward" && (
            <button className="primary" disabled={busy} onClick={doCarryForward}>
              {busy ? "Applying…" : "Carry forward"}
            </button>
          )}
          {mode !== "pick" && (
            <button className="clear-filters" onClick={() => { setMode("pick"); setError(""); }} disabled={busy}>
              Back
            </button>
          )}
          <button className="clear-filters" onClick={onClose} disabled={busy}>Close</button>
        </div>
      </div>
    </div>
  );
}
