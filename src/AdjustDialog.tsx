import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

/**
 * Request Bill Adjustment.
 *
 * Raised from the Bills tab against one unpaid bill. Nothing about the bill
 * changes here beyond a lock — the request starts a four-stage chain and the
 * money only moves at the end of it, under an administrator's credentials.
 *
 * The eligibility check runs before the form opens, so instead of the
 * desktop's one catch-all ("Cannot Adjust Bill, it is Either already adjusted
 * or the Bill is already paid") the clerk is told which of the several
 * possible reasons actually applies.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Eligibility = {
  ok: boolean;
  why: string;
  billId: number;
  period: string;
  adjID: number | null;
  clearable: boolean;
};

type Context = {
  reasons: string[];
  approvers: { id: number; name: string; title: string }[];
};

function shortDate(v: string | null) {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export default function AdjustDialog({
  billId,
  facts,
  onClose,
  onRequested,
}: {
  billId: number;
  /** The bill row the Bills tab already has, so nothing is re-fetched. */
  facts: {
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
  onClose: () => void;
  onRequested: (adjID: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [approverId, setApproverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: gate, isLoading: gateLoading } = useQuery<Eligibility>({
    queryKey: ["adjust-eligibility", billId],
    queryFn: () => apiGet<Eligibility>(`/api/adjustment/bill/${billId}/eligibility`),
  });

  const { data: ctx } = useQuery<Context>({
    queryKey: ["adjust-context"],
    queryFn: () => apiGet<Context>("/api/adjustment/context"),
  });

  // Default to the first approver once the list arrives, as the desktop did.
  const approver =
    approverId || (ctx?.approvers.length ? String(ctx.approvers[0].id) : "");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ adjID: number; message: string }>(
        "/api/adjustment/request",
        {
          billId,
          reason,
          remarks,
          requestedBy,
          contactNo,
          preparedBy,
          approverId: Number(approver) || null,
        },
      );
      onRequested(r.adjID);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    !!reason &&
    !!requestedBy.trim() &&
    !!preparedBy.trim() &&
    (reason !== "Others" || !!remarks.trim());

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Request Bill Adjustment</h2>
        <p className="modal-sub">
          Bill #{billId} · {facts.period}
        </p>

        {gateLoading && <p className="count">Checking this bill…</p>}

        {gate && !gate.ok && (
          <div className="adj-blocked">
            <strong>This bill cannot be adjusted.</strong>
            <p>{gate.why}</p>
            {gate.clearable && (
              <p className="adj-blocked-hint">
                An administrator can lift the lock from the Adjustments screen.
              </p>
            )}
          </div>
        )}

        {gate?.ok && (
          <>
            <div className="adj-facts">
              <Fact label="Previous reading" value={facts.prevRead} />
              <Fact label="Present reading" value={facts.presRead} />
              <Fact label="Consumption" value={`${facts.consumption} m³`} />
              <Fact label="Water service fee" value={peso.format(facts.wsf)} />
              <Fact label="Environmental fee" value={peso.format(facts.enviFee)} />
              <Fact label="Discount" value={peso.format(facts.discount)} />
              <Fact label="Reading date" value={shortDate(facts.readDate)} />
              <Fact label="Billing date" value={shortDate(facts.billDate)} />
              <Fact label="Due date" value={shortDate(facts.dueDate)} />
              <Fact label="Amount due" value={peso.format(facts.total)} strong />
              <Fact label="Penalty" value={peso.format(facts.penalty)} />
              <Fact label="After due" value={peso.format(facts.afterDue)} />
            </div>

            <div className="adj-form">
              <label className="field-input">
                <span>Reason of request</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose…</option>
                  {ctx?.reasons.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>

              <label className="field-input adj-wide">
                <span>
                  Remarks
                  {reason === "Others" ? " (required)" : " (optional)"}
                </span>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    reason === "Others"
                      ? "Describe what the consumer is disputing"
                      : "Anything the inspector should know"
                  }
                />
              </label>

              <label className="field-input">
                <span>Requested by</span>
                <input
                  value={requestedBy}
                  onChange={(e) => setRequestedBy(e.target.value)}
                  placeholder="Consumer or representative"
                />
              </label>

              <label className="field-input">
                <span>Contact number</span>
                <input
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                />
              </label>

              <label className="field-input">
                <span>Prepared by</span>
                <input
                  value={preparedBy}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  placeholder="Office staff taking the request"
                />
              </label>

              <label className="field-input">
                <span>Approval signatory</span>
                <select
                  value={approver}
                  onChange={(e) => setApproverId(e.target.value)}
                >
                  {ctx?.approvers.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="adj-note">
              Submitting locks this bill against editing and deletion, and sends
              it for inspection. Nothing about the amount changes yet.
            </p>
          </>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          {gate?.ok && (
            <button
              className="primary"
              disabled={busy || !canSubmit}
              onClick={submit}
            >
              {busy ? "Submitting…" : "Submit request"}
            </button>
          )}
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            {gate?.ok ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "adj-fact adj-fact-strong" : "adj-fact"}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
