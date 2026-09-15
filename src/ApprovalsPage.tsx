import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "./api";
import { peso, ApprovalDialog, type Context, type Detail } from "./AdjustmentShared";

/**
 * Approvals — every request in the app that waits on a role-gated decision
 * before it can proceed, one tab per kind. Both this page's tabs share the
 * same shape (GET .../approvals, role-gated the same way — see
 * poseidon-api's permissions.ts's requireApprover) but act on unrelated
 * requests, so each keeps its own query and its own dialog.
 */

type Row = {
  adjID: number;
  billId: number;
  accountNo: string;
  name: string;
  period: string;
  amount: number;
  requestedOn: string | null;
  inspectedOn: string | null;
  inspector: string;
};

type TabKey = "adjustments" | "temp-closure";

const TABS: { key: TabKey; label: string }[] = [
  { key: "adjustments", label: "Bill Adjustments" },
  { key: "temp-closure", label: "Temporary Closure" },
];

export default function ApprovalsPage() {
  const [tab, setTab] = useState<TabKey>("adjustments");

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Approvals</h1>
          <p className="account-no">Requests waiting on a decision.</p>
        </div>
      </div>

      <div className="stage-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "stage-tab current" : "stage-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "adjustments" ? <AdjustmentApprovals /> : <TempClosureApprovals />}
    </div>
  );
}

function AdjustmentApprovals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const { data: ctx } = useQuery<Context>({
    queryKey: ["adjust-context"],
    queryFn: () => apiGet<Context>("/api/adjustment/context"),
  });

  const { data, isLoading, error } = useQuery<Row[]>({
    queryKey: ["adjust-approvals"],
    queryFn: () => apiGet<Row[]>("/api/adjustment/approvals"),
  });

  const { data: detail } = useQuery<Detail>({
    queryKey: ["adjust-detail", open],
    queryFn: () => apiGet<Detail>(`/api/adjustment/${open}`),
    enabled: open != null,
  });

  function refresh(message: string) {
    setNotice(message);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["adjust-approvals"] });
    qc.invalidateQueries({ queryKey: ["adjust-list"] });
    qc.invalidateQueries({ queryKey: ["adjust-detail"] });
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["account"] });
  }

  const forbidden = error instanceof ApiError && error.status === 403;

  return (
    <>
      <p className="account-no" style={{ marginBottom: 14 }}>
        Requests inspected and waiting on a decision. Approving is a
        recommendation for the biller, not the adjustment itself.
      </p>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}

        {forbidden && (
          <p className="form-error">{(error as ApiError).message}</p>
        )}
        {error && !forbidden && (
          <p className="form-error">{(error as Error).message}</p>
        )}

        {data && data.length === 0 && (
          <p className="count">No requests are waiting for approval.</p>
        )}

        {data && data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Name</th>
                <th>Account No.</th>
                <th>Period</th>
                <th className="num">Amount</th>
                <th>Requested</th>
                <th>Inspected</th>
                <th>Inspector</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.adjID}>
                  <td>{r.billId}</td>
                  <td>{r.name}</td>
                  <td>{r.accountNo}</td>
                  <td>{r.period}</td>
                  <td className="num">{peso.format(r.amount)}</td>
                  <td>{r.requestedOn ?? ""}</td>
                  <td>{r.inspectedOn ?? ""}</td>
                  <td>{r.inspector}</td>
                  <td className="adj-row-actions">
                    <button
                      className="link-button"
                      onClick={() =>
                        window.open(`/adjustments/${r.adjID}/print`, "_blank")
                      }
                    >
                      Form
                    </button>
                    <button
                      className="primary small"
                      onClick={() => setOpen(r.adjID)}
                    >
                      Review and approve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open != null && detail && ctx && (
        <ApprovalDialog
          d={detail}
          ctx={ctx}
          onClose={() => setOpen(null)}
          onDone={() => refresh("Decision recorded.")}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Temporary Closure
 * ------------------------------------------------------------------ */

type TempClosureRow = {
  reqId: number;
  acctId: number;
  accountNo: string;
  name: string;
  reason: string;
  requestedBy: string;
  dateApplied: string | null;
};

function TempClosureApprovals() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<TempClosureRow | null>(null);
  const [remark, setRemark] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const { data, isLoading, error } = useQuery<TempClosureRow[]>({
    queryKey: ["temp-closure-approvals"],
    queryFn: () => apiGet<TempClosureRow[]>("/api/temp-closure/approvals"),
  });

  const forbidden = error instanceof ApiError && error.status === 403;

  function refresh(message: string) {
    setNotice(message);
    setRejecting(null);
    setRemark("");
    qc.invalidateQueries({ queryKey: ["temp-closure-approvals"] });
    qc.invalidateQueries({ queryKey: ["account"] });
    qc.invalidateQueries({ queryKey: ["joborders"] });
  }

  async function approve(r: TempClosureRow) {
    setBusyId(r.reqId);
    setActionError("");
    try {
      await apiPost(`/api/temp-closure/${r.reqId}/approve`, {});
      refresh(`${r.accountNo} moved to pending closure.`);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    setBusyId(rejecting.reqId);
    setActionError("");
    try {
      await apiPost(`/api/temp-closure/${rejecting.reqId}/reject`, { remark });
      refresh(`${rejecting.accountNo}'s request was rejected.`);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <p className="account-no" style={{ marginBottom: 14 }}>
        Requests for temporary or voluntary disconnection, waiting on an
        approver. Approving moves the account straight to pending closure —
        the tap still needs shutting off and that is confirmed separately.
      </p>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}
      {actionError && <p className="form-error">{actionError}</p>}

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}
        {forbidden && <p className="form-error">{(error as ApiError).message}</p>}
        {error && !forbidden && <p className="form-error">{(error as Error).message}</p>}

        {data && data.length === 0 && (
          <p className="count">No temporary closure requests are waiting.</p>
        )}

        {data && data.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Name</th>
                <th>Reason</th>
                <th>Requested by</th>
                <th>Date applied</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.reqId}>
                  <td>{r.accountNo}</td>
                  <td>{r.name}</td>
                  <td>{r.reason}</td>
                  <td>{r.requestedBy}</td>
                  <td>{r.dateApplied ?? ""}</td>
                  <td className="adj-row-actions">
                    <button
                      className="link-button"
                      onClick={() => setRejecting(r)}
                      disabled={busyId === r.reqId}
                    >
                      Reject
                    </button>
                    <button
                      className="primary small"
                      onClick={() => approve(r)}
                      disabled={busyId === r.reqId}
                    >
                      {busyId === r.reqId ? "Working…" : "Approve"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {rejecting && (
        <div className="modal-backdrop" onClick={() => setRejecting(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Reject closure request</h2>
            <p className="modal-sub">{rejecting.accountNo} · {rejecting.name}</p>

            <label className="field-input" style={{ marginBottom: 12 }}>
              <span>Why (optional)</span>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} />
            </label>

            {actionError && <div className="form-error">{actionError}</div>}

            <div className="form-actions">
              <button
                className="danger"
                disabled={busyId === rejecting.reqId}
                onClick={reject}
              >
                {busyId === rejecting.reqId ? "Working…" : "Reject request"}
              </button>
              <button className="clear-filters" onClick={() => setRejecting(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
