import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import AdjustDialog from "./AdjustDialog";
import { INBOX_KEY, whenMs } from "./mobileInbox";

/**
 * The Adjustments page's Mobile Requests tab — bill adjustment requests
 * consumers sent from the mobile app.
 *
 * A mobile request does not touch the bill. Staff call the consumer first,
 * then either accept (the ordinary Request Bill Adjustment dialog, pre-filled
 * with what the consumer typed — only then is the bill locked and sent for
 * inspection) or decline with a reason the consumer sees in the app.
 */

type Facts = {
  period: string;
  prevRead: number;
  presRead: number;
  consumption: number;
  wsf: number;
  enviFee: number;
  discount: number;
  total: number;
  penalty: number;
  afterDue: number;
  dueDate: string | null;
  billDate: string | null;
  readDate: string | null;
};

type MobileRequest = {
  id: number;
  createdMs: number;
  billId: number;
  reason: string;
  remarks: string;
  requestedBy: string;
  contactNo: string;
  status: string;
  adjID: number | null;
  handledBy: string;
  handledMs: number | null;
  declineReason: string;
  accountNo: string;
  name: string;
  address: string;
  blocked: string;
  facts: Facts;
};

type View = "Pending" | "Accepted" | "Declined";

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MobileAdjustmentRequests({ onChanged }: { onChanged: (message: string) => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("Pending");
  const [accepting, setAccepting] = useState<MobileRequest | null>(null);
  const [declining, setDeclining] = useState<MobileRequest | null>(null);

  const { data, isLoading, error } = useQuery<{ counts: Record<string, number>; rows: MobileRequest[] }>({
    queryKey: ["adjust-mobile", view],
    queryFn: () => apiGet(`/api/adjustment-mobile?status=${view}`),
    refetchInterval: 30_000,
  });

  function refresh(message: string) {
    setAccepting(null);
    setDeclining(null);
    qc.invalidateQueries({ queryKey: ["adjust-mobile"] });
    qc.invalidateQueries({ queryKey: ["adjust-list"] });
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: INBOX_KEY });
    onChanged(message);
  }

  return (
    <>
      <p className="account-no" style={{ marginBottom: 12 }}>
        Sent by consumers from the mobile app. Nothing on the bill changes until you accept.{" "}
        <strong>Call the consumer first</strong> to confirm the request, then accept it to send the bill
        for inspection, or decline it with a reason they'll see in the app.
      </p>

      <div className="filter-row">
        {(["Pending", "Accepted", "Declined"] as View[]).map((v) => (
          <button
            key={v}
            className={view === v ? "primary small" : "clear-filters"}
            onClick={() => setView(v)}
          >
            {v === "Pending" ? "Waiting for a call" : v}
            {!!data?.counts[v] && v === "Pending" ? ` (${data.counts[v]})` : ""}
          </button>
        ))}
      </div>

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}
        {error && <p className="form-error">{(error as Error).message}</p>}
        {data && data.rows.length === 0 && (
          <p className="count">
            {view === "Pending" ? "No mobile requests are waiting." : `No ${view.toLowerCase()} requests.`}
          </p>
        )}

        {data && data.rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Sent</th>
                <th>Account</th>
                <th>Bill</th>
                <th className="num">Amount</th>
                <th>Reason</th>
                <th>Call</th>
                <th>{view === "Pending" ? "" : view === "Accepted" ? "Accepted" : "Declined"}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{whenMs(r.createdMs)}</td>
                  <td>
                    {r.name}
                    <div className="muted">
                      {r.accountNo}
                      {r.address ? ` · ${r.address}` : ""}
                    </div>
                  </td>
                  <td>
                    {r.facts.period}
                    <div className="muted">
                      Bill #{r.billId} · {r.facts.consumption} m³
                    </div>
                  </td>
                  <td className="num">{peso.format(r.facts.total)}</td>
                  <td>
                    {r.reason}
                    {r.remarks && <div className="muted mobile-req-remarks">{r.remarks}</div>}
                  </td>
                  <td>
                    {r.requestedBy}
                    <div>
                      <a href={`tel:${r.contactNo}`}>{r.contactNo}</a>
                    </div>
                  </td>
                  <td className="adj-row-actions">
                    {view === "Pending" ? (
                      r.blocked ? (
                        <>
                          <span className="muted">{r.blocked}</span>
                          <button className="link-button" onClick={() => setDeclining(r)}>
                            Decline
                          </button>
                        </>
                      ) : (
                        <>
                          <button className="link-button" onClick={() => setDeclining(r)}>
                            Decline
                          </button>
                          <button className="primary small" onClick={() => setAccepting(r)}>
                            Accept…
                          </button>
                        </>
                      )
                    ) : view === "Accepted" ? (
                      <span className="muted">
                        {r.handledBy} · {whenMs(r.handledMs)}
                        {r.adjID ? ` · request #${r.adjID}` : ""}
                      </span>
                    ) : (
                      <span className="muted">
                        {r.handledBy} · {whenMs(r.handledMs)}
                        <div>“{r.declineReason}”</div>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {accepting && (
        <AdjustDialog
          billId={accepting.billId}
          facts={accepting.facts}
          prefill={{
            reason: accepting.reason,
            remarks: accepting.remarks,
            requestedBy: accepting.requestedBy,
            contactNo: accepting.contactNo,
          }}
          mobileRequestId={accepting.id}
          onClose={() => setAccepting(null)}
          onRequested={() => refresh(`${accepting.accountNo}'s request accepted — the bill is now for inspection.`)}
        />
      )}

      {declining && (
        <DeclineDialog
          request={declining}
          onClose={() => setDeclining(null)}
          onDone={() => refresh(`${declining.accountNo}'s mobile request was declined.`)}
        />
      )}
    </>
  );
}

function DeclineDialog({
  request: r, onClose, onDone,
}: {
  request: MobileRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState(r.blocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment-mobile/${r.id}/decline`, { reason });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Decline mobile request</h2>
        <p className="modal-sub">
          {r.accountNo} · {r.name} · {r.facts.period}
        </p>
        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Reason (the consumer sees this in the app)</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Reading was verified correct; please visit the office for details"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="danger" disabled={busy || reason.trim().length < 3} onClick={submit}>
            {busy ? "Declining…" : "Decline request"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
