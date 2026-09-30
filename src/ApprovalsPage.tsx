import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "./api";
import { peso, ApprovalDialog, type Context, type Detail } from "./AdjustmentShared";
import { useAuth } from "./AuthContext";
import { RequestView } from "./InventoryRequests";
import { PrView, type PrRow } from "./InventoryPurchasing";
import { peso as pesoFmt } from "./inventoryShared";
import { INV_KEYS, longDate, type SupplyRequest } from "./inventoryShared";

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

type TabKey = "adjustments" | "temp-closure" | "inventory" | "purchase";

const TABS: { key: TabKey; label: string; perm: string }[] = [
  { key: "adjustments", label: "Bill Adjustments", perm: "approvals" },
  { key: "temp-closure", label: "Temporary Closure", perm: "approvals" },
  // Its own right: a department head can approve supplies without seeing bills.
  { key: "inventory", label: "Inventory Requests", perm: "invapprove" },
  { key: "purchase", label: "Purchase Requests", perm: "invapprove" },
];

export default function ApprovalsPage() {
  const { can } = useAuth();
  const tabs = TABS.filter((t) => can(t.perm));
  const [picked, setTab] = useState<TabKey | null>(null);
  const tab = picked ?? tabs[0]?.key ?? "adjustments";
  const { data: invWaiting } = useQuery<{ toApprove: number }>({
    queryKey: [...INV_KEYS.requests, "waiting"],
    queryFn: () => apiGet("/api/inventory/requests/waiting"),
    enabled: can("invapprove"),
  });
  const { data: prWaiting } = useQuery<{ toApprove: number }>({
    queryKey: ["inv-purchasing", "waiting"],
    queryFn: () => apiGet("/api/inventory/purchasing/waiting"),
    enabled: can("invapprove"),
  });

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Approvals</h1>
          <p className="account-no">Requests waiting on a decision.</p>
        </div>
      </div>

      <div className="stage-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "stage-tab current" : "stage-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === "inventory" && !!invWaiting?.toApprove && <span className="stage-count">{invWaiting.toApprove}</span>}
            {t.key === "purchase" && !!prWaiting?.toApprove && <span className="stage-count">{prWaiting.toApprove}</span>}
          </button>
        ))}
      </div>

      {tab === "adjustments" && <AdjustmentApprovals />}
      {tab === "temp-closure" && <TempClosureApprovals />}
      {tab === "inventory" && <InventoryRequestApprovals />}
      {tab === "purchase" && <PurchaseRequestApprovals />}
    </div>
  );
}

/**
 * Supply requests (RIS) waiting for approval — the same list and dialog as
 * Inventory → Requests (InventoryRequests.tsx), so approving here and there
 * is one and the same action.
 */
function InventoryRequestApprovals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const { data, isLoading, error } = useQuery<{ rows: SupplyRequest[] }>({
    queryKey: [...INV_KEYS.requests, "pending"],
    queryFn: () => apiGet("/api/inventory/requests?status=pending"),
  });

  return (
    <section className="record-section">
      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No supply requests are waiting for approval.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr><th>RIS No.</th><th>Filed</th><th>Office</th><th>Purpose</th><th>Requested by</th><th className="num">Items</th><th /></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => setOpen(r.id)}>
                <td>{r.risNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(r.date)}</td>
                <td>{r.office}</td>
                <td className="incident-details">{r.purpose}</td>
                <td>{r.requestedBy}</td>
                <td className="num">{r.lines}</td>
                <td>
                  <button className="primary small" onClick={(e) => { e.stopPropagation(); setOpen(r.id); }}>Review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open != null && (
        <RequestView
          id={open}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            setOpen(null);
            setNotice(m);
            qc.invalidateQueries({ queryKey: INV_KEYS.requests });
          }}
        />
      )}
    </section>
  );
}

/** Purchase requests waiting for approval — the same dialog as Inventory → Purchasing. */
function PurchaseRequestApprovals() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const { data, isLoading, error } = useQuery<{ rows: PrRow[] }>({
    queryKey: ["inv-purchasing", "prs", "pending"],
    queryFn: () => apiGet("/api/inventory/purchasing/prs?status=pending"),
  });
  return (
    <section className="record-section">
      {notice && <div className="action-notice" onAnimationEnd={() => setNotice("")}>{notice}</div>}
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No purchase requests are waiting for approval.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead><tr><th>PR No.</th><th>Date</th><th>Office</th><th>Purpose</th><th className="num">Items</th><th className="num">Estimate</th><th /></tr></thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id} className="row-link" onClick={() => setOpen(p.id)}>
                <td>{p.prNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(p.date)}</td>
                <td>{p.office}</td>
                <td className="incident-details">{p.purpose}</td>
                <td className="num">{p.lines}</td>
                <td className="num">{pesoFmt.format(p.estimate ?? 0)}</td>
                <td><button className="primary small" onClick={(e) => { e.stopPropagation(); setOpen(p.id); }}>Review</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open != null && (
        <PrView
          id={open}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            setOpen(null);
            setNotice(m);
            qc.invalidateQueries({ queryKey: ["inv-purchasing"] });
          }}
        />
      )}
    </section>
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
