import { useEffect, useState } from "react";
import { apiGet, apiPost } from "./api";
import { useDebounce } from "./useDebounce";

/**
 * Shared by the Adjustments and Approvals screens — the two halves of the
 * same four-stage request (Inspection, Pending Approval, Approved, Done /
 * Rejected). Approvals is its own screen because only an approving role can
 * act on it; Adjustments is everyone else's view of the same chain and no
 * longer shows the approval stage at all.
 */

export const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export type Stage = "Inspection" | "Pending Approval" | "Approved" | "Done" | "Rejected";

export const STAGE_LABEL: Record<string, string> = {
  Inspection: "For inspection",
  "Pending Approval": "For approval",
  Approved: "For adjustment",
  Done: "Adjusted",
  Rejected: "Rejected",
};

export type Context = {
  reasons: string[];
  findings: string[];
  methods: {
    key: string;
    label: string;
    kind: "amount" | "volume";
    averaged: boolean;
    fixedMonths: number | null;
  }[];
  stages: Stage[];
  finishedStages: Stage[];
  barangays: { id: number; name: string }[];
  clusters: { id: number; name: string; brgyID: number }[];
  approvers: { id: number; name: string; title: string }[];
  clustersEnabled: boolean;
};

export type Figures = {
  consumption: number;
  waterServiceFee: number;
  enviFee: number;
  discount: number;
  airContent: number;
  flatRate: number;
  excess: number;
  tariffAmount: number;
  maintenanceFee: number;
  total: number;
  penalty: number;
  afterDue: number;
};

export type Quote = {
  method: string;
  label: string;
  kind: "amount" | "volume";
  input: number | null;
  averaged: number | null;
  description: string;
  original: Figures;
  adjusted: Figures;
  carried: string[];
  notes: string[];
};

export type Detail = {
  adjID: number;
  status: Stage;
  billId: number;
  account: {
    accountNo: string;
    name: string;
    address: string;
    barangay: string;
    cluster: string;
    meterNo: string;
    standpipe: string;
    classification: string;
    consumerType: string;
    isSenior: boolean;
  };
  bill: {
    period: string;
    status: string;
    prevRead: number;
    presRead: number;
    readDate: string | null;
    billDate: string | null;
    dueDate: string | null;
    applicationFee: number;
    figures: Figures;
  };
  request: {
    date: string | null;
    reason: string;
    remarks: string;
    requestedBy: string;
    contactNo: string;
    preparedBy: string;
    approverName: string;
    approverTitle: string;
  };
  inspection: {
    date: string;
    inspector: string;
    findings: string;
    householdMembers: number;
    standpipeLocation: string;
    meterNo: string;
  } | null;
  approval: {
    date: string;
    approvedBy: string;
    remark: string;
    recommendation: string;
  } | null;
  rejection: { comments: string } | null;
  applied: {
    date: string;
    adjustedBy: string;
    type: string;
    fromConsumption: number;
    toConsumption: number;
    fromAmount: number;
    toAmount: number;
  } | null;
};

/* ------------------------------------------------------------------ *
 * The method picker — shared by the approval and the final adjustment
 * ------------------------------------------------------------------ */

export function MethodPicker({
  adjID,
  methods,
  value,
  onQuote,
}: {
  adjID: number;
  methods: Context["methods"];
  /** Pre-selection, when the approval already recommended one. */
  value?: { method: string; input: number | null };
  onQuote: (q: Quote | null, pending: boolean) => void;
}) {
  const [method, setMethod] = useState(value?.method ?? "amount");
  const [raw, setRaw] = useState(
    value?.input != null ? String(value.input) : "",
  );
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const debounced = useDebounce(raw, 300);

  const spec = methods.find((m) => m.key === method);
  const needsValue = !spec?.averaged || spec.fixedMonths == null;

  useEffect(() => {
    let cancelled = false;
    const v = spec?.averaged
      ? spec.fixedMonths != null
        ? spec.fixedMonths
        : Number(debounced)
      : Number(debounced);

    if (needsValue && (debounced === "" || !Number.isFinite(v))) {
      setQuote(null);
      setError("");
      onQuote(null, false);
      return;
    }

    onQuote(null, true);
    apiGet<Quote>(
      `/api/adjustment/${adjID}/quote?method=${encodeURIComponent(method)}&value=${v}`,
    )
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setError("");
        onQuote(q, false);
      })
      .catch((e) => {
        if (cancelled) return;
        setQuote(null);
        setError((e as Error).message);
        onQuote(null, false);
      });

    return () => {
      cancelled = true;
    };
    // onQuote is re-created each render by design; excluding it keeps this
    // from looping, and the values above are what actually decide the quote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjID, method, debounced, needsValue, spec?.averaged, spec?.fixedMonths]);

  return (
    <div className="adj-methods">
      {methods.map((m) => {
        const active = m.key === method;
        return (
          <label key={m.key} className={active ? "adj-method active" : "adj-method"}>
            <input
              type="radio"
              name={`method-${adjID}`}
              checked={active}
              onChange={() => {
                setMethod(m.key);
                setRaw(m.fixedMonths != null ? String(m.fixedMonths) : "");
              }}
            />
            <span className="adj-method-body">
              <b>{m.label}</b>
              {active && m.fixedMonths == null && (
                <input
                  className="adj-method-value"
                  autoFocus
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  placeholder={
                    m.kind === "amount" && !m.averaged
                      ? "Amount"
                      : m.averaged
                        ? "Months"
                        : "Cubic metres"
                  }
                />
              )}
              {active && quote?.averaged != null && (
                <em className="adj-method-avg">
                  Average over {quote.input} month
                  {quote.input === 1 ? "" : "s"}:{" "}
                  {m.kind === "amount"
                    ? peso.format(quote.averaged)
                    : `${quote.averaged} m³`}
                </em>
              )}
            </span>
          </label>
        );
      })}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

/** Original against adjusted, the way the desktop's grid was meant to read. */
export function Comparison({ quote, busy }: { quote: Quote | null; busy: boolean }) {
  if (busy) return <p className="count">Pricing…</p>;
  if (!quote) {
    return <p className="count">Choose a method and enter a value.</p>;
  }

  const rows: [string, number, number, boolean][] = [
    ["Consumption (m³)", quote.original.consumption, quote.adjusted.consumption, false],
    ["Water service fee", quote.original.waterServiceFee, quote.adjusted.waterServiceFee, true],
    ["Environmental fee", quote.original.enviFee, quote.adjusted.enviFee, true],
    ["Discount", quote.original.discount, quote.adjusted.discount, true],
    ["Maintenance fee", quote.original.maintenanceFee, quote.adjusted.maintenanceFee, true],
    ["Amount due", quote.original.total, quote.adjusted.total, true],
    ["Penalty", quote.original.penalty, quote.adjusted.penalty, true],
    ["After due", quote.original.afterDue, quote.adjusted.afterDue, true],
  ];

  return (
    <div className="adj-compare">
      <table>
        <thead>
          <tr>
            <th>Details</th>
            <th className="num">Original</th>
            <th className="num">Adjusted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, cash]) => (
            <tr key={label} className={a !== b ? "adj-changed" : ""}>
              <td>{label}</td>
              <td className="num">{cash ? peso.format(a) : a}</td>
              <td className="num">{cash ? peso.format(b) : b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {quote.notes.map((n, i) => (
        <p className="adj-note" key={i}>
          {n}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stage dialogs
 * ------------------------------------------------------------------ */

export function Shell({
  title,
  sub,
  wide,
  error,
  busy,
  saveLabel,
  canSave,
  onSave,
  onClose,
  extra,
  children,
}: {
  title: string;
  sub: string;
  wide?: boolean;
  error: string;
  busy: boolean;
  saveLabel: string;
  canSave: boolean;
  onSave: () => void;
  onClose: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{title}</h2>
        <p className="modal-sub">{sub}</p>
        {children}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || !canSave} onClick={onSave}>
            {busy ? "Saving…" : saveLabel}
          </button>
          {extra}
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export function RequestSummary({ d }: { d: Detail }) {
  return (
    <div className="adj-summary">
      <div>
        <span>Account</span>
        <b>
          {d.account.accountNo} · {d.account.name}
        </b>
      </div>
      <div>
        <span>Bill</span>
        <b>
          #{d.billId} · {d.bill.period}
        </b>
      </div>
      <div>
        <span>Reading</span>
        <b>
          {d.bill.prevRead} → {d.bill.presRead} ({d.bill.figures.consumption} m³)
        </b>
      </div>
      <div>
        <span>Amount due</span>
        <b>{peso.format(d.bill.figures.total)}</b>
      </div>
      <div className="adj-summary-wide">
        <span>Reason of request</span>
        <b>{d.request.reason}</b>
      </div>
      {d.inspection && (
        <div className="adj-summary-wide">
          <span>Inspection findings</span>
          <b>{d.inspection.findings}</b>
        </div>
      )}
      {d.approval?.recommendation && (
        <div className="adj-summary-wide">
          <span>Approved recommendation</span>
          <b>{d.approval.recommendation}</b>
        </div>
      )}
    </div>
  );
}

/**
 * Review, approve or reject — the approving officer's only screen.
 * Both writes are gated server-side by role (see poseidon-api's
 * permissions.ts); a 403 here means the signed-in role isn't one of them.
 */
export function ApprovalDialog({
  d,
  ctx,
  onClose,
  onDone,
}: {
  d: Detail;
  ctx: Context;
  onClose: () => void;
  onDone: () => void;
}) {
  const [approverId, setApproverId] = useState(
    ctx.approvers.length ? String(ctx.approvers[0].id) : "",
  );
  const [remark, setRemark] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment/${d.adjID}/approve`, {
        approverId: Number(approverId) || null,
        remark,
        method: quote.method,
        value: quote.input,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment/${d.adjID}/reject`, {
        approverId: Number(approverId) || null,
        comments,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (rejecting) {
    return (
      <Shell
        title="Reject Adjustment Request"
        sub={`${d.account.accountNo} · ${d.account.name} · Bill #${d.billId}`}
        error={error}
        busy={busy}
        saveLabel="Reject request"
        canSave={!!comments.trim()}
        onSave={reject}
        onClose={() => setRejecting(false)}
      >
        <div className="adj-blocked">
          <strong>Rejecting locks this bill.</strong>
          <p>
            The bill stays locked against editing, deletion and any further
            adjustment request until an administrator clears it from this
            screen. The comments below print on the request form.
          </p>
        </div>
        <label className="field-input adj-wide">
          <span>Comments and recommendations</span>
          <textarea
            rows={4}
            autoFocus
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Why the request is being declined"
          />
        </label>
      </Shell>
    );
  }

  return (
    <Shell
      title="Bill Adjustment Approval"
      sub={`${d.account.accountNo} · ${d.account.name} · Bill #${d.billId}`}
      wide
      error={error}
      busy={busy}
      saveLabel="Approve"
      canSave={!!quote && !!approverId}
      onSave={approve}
      onClose={onClose}
      extra={
        <button
          className="danger"
          disabled={busy}
          onClick={() => setRejecting(true)}
        >
          Reject…
        </button>
      }
    >
      <RequestSummary d={d} />

      <div className="adj-reference">
        This is a <b>recommendation</b>, not the adjustment. The biller applies
        it at the last stage and can change it — the record shows if they did.
      </div>

      <MethodPicker
        adjID={d.adjID}
        methods={ctx.methods}
        onQuote={(q, p) => {
          setQuote(q);
          setPending(p);
        }}
      />

      <Comparison quote={quote} busy={pending} />

      <div className="adj-form">
        <label className="field-input">
          <span>Approved by</span>
          <select
            value={approverId}
            onChange={(e) => setApproverId(e.target.value)}
          >
            {ctx.approvers.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label className="field-input adj-wide">
          <span>Approval remark (optional)</span>
          <textarea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
      </div>
    </Shell>
  );
}
