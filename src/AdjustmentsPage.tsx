import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import AdminAuth from "./AdminAuth";
import EditBillsDialog from "./EditBillsDialog";
import { useDebounce } from "./useDebounce";
import {
  peso,
  today,
  STAGE_LABEL,
  MethodPicker,
  Comparison,
  Shell,
  RequestSummary,
  type Stage,
  type Context,
  type Quote,
  type Detail,
} from "./AdjustmentShared";

/**
 * Bill Adjustment — inspection through to the final adjustment.
 *
 * Four stages of one request, but this screen only ever shows three of
 * them: Inspection, Approved (ready to adjust), and the finished/rejected
 * outcomes. Pending Approval — the approving officer's decision — moved to
 * its own Approvals screen once that decision became gated by role rather
 * than by whoever had the screen open. See poseidon-api's permissions.ts.
 *
 * Every figure on the adjustment dialogs comes from GET /:adjID/quote. The
 * browser sends a method and a number and renders what comes back; it never
 * computes an amount. That is the fix for the desktop's `CalcNewRate` — an
 * Async Sub fired from a synchronous handler whose results were read before
 * they arrived, so the Adjusted column showed the previous method's figures
 * and whatever was in memory at the moment Done was pressed went to the bill.
 */

type Row = {
  adjID: number;
  billId: number;
  status: Stage;
  name: string;
  accountNo: string;
  consumption: number;
  amount: number;
  address: string;
  barangay: string;
  cluster: string;
  period: string;
  requestedOn: string | null;
  inspectedOn: string | null;
  inspector: string;
  approvedOn: string | null;
  adjustedOn: string | null;
  paid: boolean;
  /** A finished adjustment on an unpaid bill whose figures don't add up —
   *  Collection refuses it until it's repaired in Edit Bills. */
  mismatch: { parts: number; charged: number; chargedAfterDue: number; penalty: number } | null;
};

function InspectionDialog({
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
  const [date, setDate] = useState(today());
  const [householdMembers, setHouseholdMembers] = useState("");
  const [standpipeLocation, setStandpipeLocation] = useState("");
  const [meterNo, setMeterNo] = useState(d.account.meterNo);
  const [finding, setFinding] = useState("");
  const [observations, setObservations] = useState("");
  const [inspector, setInspector] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment/${d.adjID}/inspection`, {
        date,
        householdMembers: Number(householdMembers) || 0,
        standpipeLocation,
        meterNo,
        finding,
        observations,
        inspector,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Bill Adjustment Inspection"
      sub={`${d.account.accountNo} · ${d.account.name} · Bill #${d.billId}`}
      wide
      error={error}
      busy={busy}
      saveLabel="Save inspection"
      canSave={
        !!finding &&
        !!inspector.trim() &&
        (finding !== "Others" || !!observations.trim())
      }
      onSave={save}
      onClose={onClose}
    >
      <RequestSummary d={d} />

      <div className="adj-form">
        <label className="field-input">
          <span>Inspection date</span>
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>Household members</span>
          <input
            value={householdMembers}
            onChange={(e) => setHouseholdMembers(e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>Standpipe location</span>
          <input
            value={standpipeLocation}
            onChange={(e) => setStandpipeLocation(e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>Meter serial no.</span>
          <input value={meterNo} onChange={(e) => setMeterNo(e.target.value)} />
        </label>
        <label className="field-input">
          <span>Findings</span>
          <select value={finding} onChange={(e) => setFinding(e.target.value)}>
            <option value="">Choose…</option>
            {ctx.findings.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field-input">
          <span>Inspected by</span>
          <input value={inspector} onChange={(e) => setInspector(e.target.value)} />
        </label>
        <label className="field-input adj-wide">
          <span>
            Other observations
            {finding === "Others" ? " (required)" : " (optional)"}
          </span>
          <textarea
            rows={2}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </label>
      </div>

      <p className="adj-note">
        The household count recorded here feeds the tariff when the bill is
        repriced by volume, so it is worth getting right.
      </p>
    </Shell>
  );
}

function AdjustDialogFinal({
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
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pending, setPending] = useState(false);
  const [adjustedBy, setAdjustedBy] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The approved recommendation, parsed back into a starting selection so the
  // biller confirms rather than re-derives it.
  const preset = useMemo(() => {
    const reco = d.approval?.recommendation ?? "";
    const m = ctx.methods.find((x) => reco.startsWith(x.label));
    if (!m) return undefined;
    const numbers = reco.match(/-?[\d,]+(\.\d+)?/g) ?? [];
    const monthMatch = reco.match(/\((\d+) months?\)/);
    const input = m.averaged
      ? m.fixedMonths ?? (monthMatch ? Number(monthMatch[1]) : null)
      : numbers.length
        ? Number(numbers[numbers.length - 1].replace(/,/g, ""))
        : null;
    return { method: m.key, input };
  }, [d.approval?.recommendation, ctx.methods]);

  const departed =
    !!quote && !!d.approval && quote.description !== d.approval.recommendation;

  async function save() {
    if (!quote) return;
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment/${d.adjID}/adjust`, {
        method: quote.method,
        value: quote.input,
        adjustedBy,
        adminUsername,
        adminPassword,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Adjust Bill"
      sub={`${d.account.accountNo} · ${d.account.name} · Bill #${d.billId} · ${d.bill.period}`}
      wide
      error={error}
      busy={busy}
      saveLabel="Adjust bill"
      canSave={!!quote && !!adjustedBy.trim() && !!adminUsername && !!adminPassword}
      onSave={save}
      onClose={onClose}
    >
      <RequestSummary d={d} />

      <MethodPicker
        adjID={d.adjID}
        methods={ctx.methods}
        value={preset}
        onQuote={(q, p) => {
          setQuote(q);
          setPending(p);
        }}
      />

      <Comparison quote={quote} busy={pending} />

      {departed && (
        <div className="adj-blocked">
          <strong>This differs from what was approved.</strong>
          <p>
            Approved: {d.approval?.recommendation}. Applying it this way is
            allowed, and both figures are recorded against the request.
          </p>
        </div>
      )}

      <div className="adj-form">
        <label className="field-input">
          <span>Adjusted by</span>
          <input
            value={adjustedBy}
            onChange={(e) => setAdjustedBy(e.target.value)}
            placeholder="Name of the biller applying this"
          />
        </label>
      </div>

      <AdminAuth
        label="This changes the amount owed — an administrator must authorise it"
        username={adminUsername}
        password={adminPassword}
        onUsername={setAdminUsername}
        onPassword={setAdminPassword}
        disabled={busy}
      />
    </Shell>
  );
}

function ClearLockDialog({
  d,
  onClose,
  onDone,
}: {
  d: Detail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/adjustment/bill/${d.billId}/clear`, {
        reason,
        adminUsername,
        adminPassword,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell
      title="Clear the rejection lock"
      sub={`${d.account.accountNo} · ${d.account.name} · Bill #${d.billId}`}
      error={error}
      busy={busy}
      saveLabel="Clear the lock"
      canSave={!!reason.trim() && !!adminUsername && !!adminPassword}
      onSave={save}
      onClose={onClose}
    >
      <div className="adj-blocked">
        <strong>This reopens a bill an approving officer declined.</strong>
        <p>
          {d.approval?.approvedBy
            ? `Rejected by ${d.approval.approvedBy}: `
            : "Rejected: "}
          {d.rejection?.comments || "no comments recorded"}
        </p>
      </div>

      <label className="field-input adj-wide">
        <span>Why is the lock being lifted?</span>
        <textarea
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>

      <AdminAuth
        username={adminUsername}
        password={adminPassword}
        onUsername={setAdminUsername}
        onPassword={setAdminPassword}
        disabled={busy}
      />
    </Shell>
  );
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export default function AdjustmentsPage() {
  const qc = useQueryClient();
  const [finished, setFinished] = useState(false);
  const [status, setStatus] = useState("");
  const [brgyID, setBrgyID] = useState("");
  const [clusterID, setClusterID] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{ adjID: number; mode: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [onlyMismatched, setOnlyMismatched] = useState(false);
  const [repairIds, setRepairIds] = useState<number[] | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data: ctx } = useQuery<Context>({
    queryKey: ["adjust-context"],
    queryFn: () => apiGet<Context>("/api/adjustment/context"),
  });

  const query = new URLSearchParams({
    finished: finished ? "1" : "0",
    page: String(page),
  });
  if (status) query.set("status", status);
  if (brgyID) query.set("brgyID", brgyID);
  if (clusterID) query.set("clusterID", clusterID);
  if (debouncedSearch) query.set("search", debouncedSearch);
  if (finished && onlyMismatched) query.set("mismatch", "1");

  const { data, isLoading } = useQuery<{
    page: number;
    pages: number;
    total: number;
    mismatchCount: number;
    rows: Row[];
  }>({
    queryKey: ["adjust-list", query.toString()],
    queryFn: () => apiGet(`/api/adjustment/list?${query}`),
  });

  const { data: detail } = useQuery<Detail>({
    queryKey: ["adjust-detail", open?.adjID],
    queryFn: () => apiGet<Detail>(`/api/adjustment/${open!.adjID}`),
    enabled: !!open,
  });

  const clusters = (ctx?.clusters ?? []).filter(
    (c) => !brgyID || String(c.brgyID) === brgyID,
  );

  function refresh(message: string) {
    setNotice(message);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["adjust-list"] });
    qc.invalidateQueries({ queryKey: ["adjust-detail"] });
    qc.invalidateQueries({ queryKey: ["bills"] });
    qc.invalidateQueries({ queryKey: ["account"] });
  }

  /** What the selected row's stage lets someone do next. */
  function action(row: Row) {
    switch (row.status) {
      case "Inspection":
        return { mode: "inspect", label: "Record inspection" };
      case "Approved":
        return { mode: "adjust", label: "Proceed to adjustment" };
      case "Rejected":
        return { mode: "clear", label: "Clear the lock" };
      default:
        return null;
    }
  }

  const stages = finished ? ctx?.finishedStages ?? [] : ctx?.stages ?? [];

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Bill Adjustments</h1>
          <p className="account-no">
            Request, inspect, adjust. Approval is decided on its own screen by
            the approving officer.
          </p>
        </div>
        <div className="detail-head-right">
          <button
            className={finished ? "primary small" : "clear-filters"}
            onClick={() => {
              setFinished(!finished);
              setStatus("");
              setOnlyMismatched(false);
              setPage(1);
            }}
          >
            {finished ? "Show open requests" : "Show finished transactions"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <div className="filter-row">
        <label className="field-input">
          <span>Stage</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {stages.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s] ?? s}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Barangay</span>
          <select
            value={brgyID}
            onChange={(e) => {
              setBrgyID(e.target.value);
              setClusterID("");
              setPage(1);
            }}
          >
            <option value="">All</option>
            {ctx?.barangays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        {ctx?.clustersEnabled && brgyID && (
          <label className="field-input">
            <span>Cluster</span>
            <select
              value={clusterID}
              onChange={(e) => {
                setClusterID(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field-input">
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name or account number"
          />
        </label>

        {finished && (
          <label className="toolbar-check" style={{ alignSelf: "center" }}>
            <input
              type="checkbox"
              checked={onlyMismatched}
              onChange={(e) => {
                setOnlyMismatched(e.target.checked);
                setPage(1);
              }}
            />
            Only unpaid bills that don't add up
          </label>
        )}

        <span className="count">
          {data ? `${data.total} request${data.total === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {finished && !!data?.mismatchCount && !onlyMismatched && (
        <div className="adj-mismatch-banner">
          <span>
            <strong>
              {data.mismatchCount} adjusted bill{data.mismatchCount === 1 ? "" : "s"} still unpaid and
              {data.mismatchCount === 1 ? " doesn't" : " don't"} add up.
            </strong>{" "}
            The amount charged doesn't match the water bill, fee and discount on the bill, so Collection
            will refuse {data.mismatchCount === 1 ? "it" : "them"} until repaired.
          </span>
          <button
            className="primary small"
            onClick={() => {
              setOnlyMismatched(true);
              setStatus("");
              setPage(1);
            }}
          >
            Show {data.mismatchCount === 1 ? "it" : "them"}
          </button>
        </div>
      )}

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}

        {data && data.rows.length === 0 && (
          <p className="count">
            {finished
              ? "No finished adjustments match these filters."
              : "No open adjustment requests match these filters."}
          </p>
        )}

        {data && data.rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Bill #</th>
                <th>Name</th>
                <th>Account No.</th>
                <th>Period</th>
                <th className="num">Cu.m.</th>
                <th className="num">Amount</th>
                <th>Address</th>
                <th>Barangay</th>
                <th>Stage</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const a = action(r);
                return (
                  <tr key={r.adjID}>
                    <td>{r.billId}</td>
                    <td>{r.name}</td>
                    <td>{r.accountNo}</td>
                    <td>{r.period}</td>
                    <td className="num">{r.consumption}</td>
                    <td className="num">{peso.format(r.amount)}</td>
                    <td>
                      {r.address}
                      {r.cluster ? `, ${r.cluster}` : ""}
                    </td>
                    <td>{r.barangay}</td>
                    <td>
                      <span
                        className={
                          r.status === "Rejected"
                            ? "badge disconnected"
                            : r.status === "Done"
                              ? "badge connected"
                              : "badge pending"
                        }
                      >
                        {STAGE_LABEL[r.status] ?? r.status}
                      </span>
                      {r.mismatch && (
                        <span
                          className="badge pending adj-mismatch-pill"
                          title={
                            `Charges ${peso.format(r.mismatch.charged)}, but water bill + fee − discount = ` +
                            `${peso.format(r.mismatch.parts)}`
                          }
                        >
                          Doesn't add up
                        </span>
                      )}
                    </td>
                    <td className="adj-row-actions">
                      <button
                        className="link-button"
                        onClick={() =>
                          window.open(`/adjustments/${r.adjID}/print`, "_blank")
                        }
                      >
                        Form
                      </button>
                      {r.mismatch && (
                        <button className="primary small" onClick={() => setRepairIds([r.billId])}>
                          Repair
                        </button>
                      )}
                      {a && (
                        <button
                          className="primary small"
                          onClick={() => setOpen({ adjID: r.adjID, mode: a.mode })}
                        >
                          {a.label}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {data && data.pages > 1 && (
          <div className="adj-pager">
            <button
              className="clear-filters"
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
            >
              Previous
            </button>
            <span className="count">
              Page {data.page} of {data.pages}
            </span>
            <button
              className="clear-filters"
              disabled={data.page >= data.pages}
              onClick={() => setPage(data.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {open && detail && ctx && open.mode === "inspect" && (
        <InspectionDialog
          d={detail}
          ctx={ctx}
          onClose={() => setOpen(null)}
          onDone={() => refresh("Inspection saved. The request is now with the approving officer.")}
        />
      )}
      {open && detail && ctx && open.mode === "adjust" && (
        <AdjustDialogFinal
          d={detail}
          ctx={ctx}
          onClose={() => setOpen(null)}
          onDone={() => refresh("The bill has been adjusted.")}
        />
      )}
      {repairIds && (
        <EditBillsDialog
          billIds={repairIds}
          onClose={() => setRepairIds(null)}
          onSaved={() => {
            setRepairIds(null);
            refresh("The bill has been repaired and can now be collected.");
          }}
        />
      )}
      {open && detail && open.mode === "clear" && (
        <ClearLockDialog
          d={detail}
          onClose={() => setOpen(null)}
          onDone={() => refresh("The lock has been cleared.")}
        />
      )}
    </div>
  );
}
