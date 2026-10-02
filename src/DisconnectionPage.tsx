import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { peso, today } from "./collectionTypes";

/**
 * Disconnection, in the three stages the work happens in.
 *
 * The desktop spread this across three windows — a list, a pending list, and
 * a per-account update dialog. Same flow, one screen, because the whole point
 * is that an account moves along it and you want to see where it got to.
 */

type Stage = "candidates" | "pending" | "disconnected";

type Context = {
  clustersEnabled: boolean;
  maintenanceEnabled: boolean;
  arrearsForDisconnection: number;
  statuses: {
    connected: string;
    forDisconnection: string;
    disconnected: string;
    disconnectedId: number;
  };
};

type Candidate = {
  id: number;
  accountNo: string;
  name: string;
  address: string;
  meterNo: string;
  standpipe: string;
  barangay: string;
  cluster: string;
  balance: number;
  bills: number;
  oldestDue: string | null;
  daysOverdue: number;
};

type Pending = {
  id: number;
  accountNo: string;
  name: string;
  meterNo: string;
  address: string;
  standpipe: string;
  barangay: string;
  cluster: string;
  balance: number;
  bills: number;
  lastReading: number;
  period: string;
  listedOn: string | null;
  payBy: string | null;
};

type Cut = {
  id: number;
  accountNo: string;
  name: string;
  meterNo: string;
  address: string;
  barangay: string;
  cluster: string;
  balance: number;
  cutOn: string | null;
  cutBy: string;
  lastReading: number | null;
};

type FilterOption = { id: number; name: string; barangayId?: number };

const ORDERS = [
  { value: "balance", label: "Total balance" },
  { value: "bills", label: "Unpaid bills" },
  { value: "name", label: "Name" },
  { value: "account", label: "Account no." },
  { value: "standpipe", label: "Standpipe" },
];

const STAGES: { key: Stage; label: string }[] = [
  { key: "candidates", label: "Candidates" },
  { key: "pending", label: "Pending" },
  { key: "disconnected", label: "Disconnected" },
];

/** YYYY-MM-DD, n days from today (local). */
function daysFromToday(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DisconnectionPage() {
  const [stage, setStage] = useState<Stage>("candidates");

  const { data: ctx } = useQuery<Context>({
    queryKey: ["disconnection-context"],
    queryFn: () => apiGet<Context>("/api/disconnection/context"),
  });

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Disconnection</h1>
          <p className="account-no">
            List the accounts, print for the crew, then record what they did.
          </p>
        </div>
      </div>

      <div className="stage-tabs">
        {STAGES.map((s) => (
          <button
            key={s.key}
            className={stage === s.key ? "stage-tab current" : "stage-tab"}
            onClick={() => setStage(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {stage === "candidates" && <Candidates ctx={ctx} />}
      {stage === "pending" && <PendingList ctx={ctx} />}
      {stage === "disconnected" && <Disconnected ctx={ctx} />}
    </div>
  );
}

/** Barangay and cluster pickers, shared by all three stages. */
function useAreas() {
  const { data } = useQuery<{ barangays: FilterOption[]; clusters: FilterOption[] }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });
  return {
    barangays: data?.barangays ?? [],
    allClusters: data?.clusters ?? [],
  };
}

/* ==================================================================== *
 * Stage 1 — candidates
 * ==================================================================== */

function Candidates({ ctx }: { ctx?: Context }) {
  const queryClient = useQueryClient();
  const { barangays, allClusters } = useAreas();

  const [barangay, setBarangay] = useState<number | "">("");
  const [cluster, setCluster] = useState<number | "">("");
  const [order, setOrder] = useState("balance");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [minBills, setMinBills] = useState("");

  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  // The deadline the account holders are given, and whether their phones are told.
  const [payBy, setPayBy] = useState(() => daysFromToday(3));
  const [notify, setNotify] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ listed: number; skipped: { account: string; why: string }[] } | null>(null);

  const clusters = allClusters.filter((c) => barangay === "" || c.barangayId === barangay);

  async function load() {
    if (barangay === "") return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const qs = new URLSearchParams({ barangay: String(barangay), order });
      if (ctx?.clustersEnabled && cluster !== "") qs.set("cluster", String(cluster));
      if (fromAmount.trim()) qs.set("fromAmount", fromAmount.trim());
      if (toAmount.trim()) qs.set("toAmount", toAmount.trim());
      if (minBills.trim()) qs.set("minBills", minBills.trim());
      const list = await apiGet<Candidate[]>(`/api/disconnection/candidates?${qs}`);
      setRows(list);
      setChecked(new Set());
    } catch (err) {
      setError((err as Error).message);
      setRows(null);
    } finally {
      setBusy(false);
    }
  }

  const list = rows ?? [];
  const total = useMemo(
    () => list.filter((r) => checked.has(r.id)).reduce((s, r) => s + r.balance, 0),
    [list, checked],
  );

  function toggle(id: number) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }

  async function confirm() {
    if (checked.size === 0) return;
    if (
      !confirmDialog(
        `Set ${checked.size} account(s) for disconnection? They move to "${ctx?.statuses.forDisconnection ?? "For Disconnection"}" and appear on the Pending list.` +
          (payBy ? ` Pay by ${payBy}.` : "") +
          (notify ? " Account holders with the mobile app are notified." : ""),
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ listed: number; skipped: { account: string; why: string }[] }>(
        "/api/disconnection/list",
        { ids: [...checked], payBy: payBy || null, notify },
      );
      setResult(r);
      queryClient.invalidateQueries({ queryKey: ["disconnection-pending"] });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section">
      <p className="count">
        Connected accounts carrying unpaid bills. Every one of them is listed —
        the threshold is not applied here, the same as the desktop.
        {ctx && (
          <>
            {" "}For reference, the bill only prints the disconnection notice at{" "}
            <b>{ctx.arrearsForDisconnection}</b> month
            {ctx.arrearsForDisconnection === 1 ? "" : "s"} behind.
          </>
        )}
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => {
              setBarangay(e.target.value === "" ? "" : Number(e.target.value));
              setCluster("");
              setRows(null);
            }}
          >
            <option value="">Pick a barangay…</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        {ctx?.clustersEnabled && (
          <label className="field-input">
            <span>Cluster</span>
            <select
              value={cluster}
              disabled={barangay === "" || clusters.length === 0}
              onChange={(e) => {
                setCluster(e.target.value === "" ? "" : Number(e.target.value));
                setRows(null);
              }}
            >
              <option value="">All clusters</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="field-input">
          <span>Order by</span>
          <select value={order} onChange={(e) => setOrder(e.target.value)}>
            {ORDERS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Balance from</span>
          <input
            className="amount-input"
            inputMode="decimal"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
          />
        </label>

        <label className="field-input">
          <span>to</span>
          <input
            className="amount-input"
            inputMode="decimal"
            value={toAmount}
            onChange={(e) => setToAmount(e.target.value)}
          />
        </label>

        <label className="field-input">
          <span>Min. unpaid bills</span>
          <input
            className="amount-input"
            inputMode="numeric"
            value={minBills}
            onChange={(e) => setMinBills(e.target.value)}
          />
        </label>

        <button className="primary" disabled={barangay === "" || busy} onClick={load}>
          {busy ? "Loading…" : "Load"}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {result && (
        <div className="form-notice">
          <b>{result.listed} account(s) set for disconnection.</b>
          {result.skipped.length > 0 && (
            <>
              {" "}
              {result.skipped.length} were left alone:{" "}
              {result.skipped.slice(0, 5).map((s) => `${s.account} — ${s.why}`).join("; ")}
              {result.skipped.length > 5 ? `, and ${result.skipped.length - 5} more` : ""}.
            </>
          )}
        </div>
      )}

      {rows && (
        <>
          <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
            <span className="count">
              {list.length} account{list.length === 1 ? "" : "s"}
              {checked.size > 0 && (
                <>
                  {" · "}
                  <b>{checked.size} selected, {peso.format(total)}</b>
                </>
              )}
            </span>
            <div className="head-actions">
              <button
                className="clear-filters"
                onClick={() => setChecked(new Set(list.map((r) => r.id)))}
              >
                Select all
              </button>
              <button className="clear-filters" onClick={() => setChecked(new Set())}>
                Clear
              </button>
              <label className="field-input" style={{ margin: 0 }} title="The deadline in the notice, the app and the crew's list">
                <span>Pay by</span>
                <input type="date" value={payBy} onChange={(e) => setPayBy(e.target.value)} />
              </label>
              <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }} title="Sends the disconnection notice to account holders who have the mobile app">
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                Notify through the app
              </label>
              <button
                className="danger small"
                disabled={checked.size === 0 || busy}
                onClick={confirm}
              >
                Set {checked.size || ""} for disconnection
              </button>
            </div>
          </div>

          <div className="batch-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="check" />
                  <th>Account No.</th>
                  <th>Name</th>
                  <th className="num">Balance</th>
                  <th className="num">Unpaid</th>
                  <th className="num">Days overdue</th>
                  <th>Address</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr
                    key={r.id}
                    className={checked.has(r.id) ? "selected-row" : ""}
                    onClick={() => toggle(r.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="check">
                      <input
                        type="checkbox"
                        checked={checked.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td>{r.accountNo}</td>
                    <td>{r.name}</td>
                    <td className="num">{peso.format(r.balance)}</td>
                    <td className="num">{r.bills}</td>
                    <td className="num">
                      {r.daysOverdue > 0 ? r.daysOverdue : <span className="muted">—</span>}
                    </td>
                    <td>
                      {r.address}
                      {r.cluster && <div className="setting-note">{r.cluster}</div>}
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={7} className="count">
                      Nothing matches. Every connected account here is paid up.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ==================================================================== *
 * Stage 2 — pending, and the decision
 * ==================================================================== */

function PendingList({ ctx }: { ctx?: Context }) {
  const queryClient = useQueryClient();
  const { barangays, allClusters } = useAreas();

  const [barangay, setBarangay] = useState<number | "">("");
  const [cluster, setCluster] = useState<number | "">("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [deciding, setDeciding] = useState<"confirm" | "cancel" | null>(null);
  const [notice, setNotice] = useState("");

  const clusters = allClusters.filter((c) => barangay === "" || c.barangayId === barangay);

  const qs = new URLSearchParams();
  if (barangay !== "") qs.set("barangay", String(barangay));
  if (ctx?.clustersEnabled && cluster !== "") qs.set("cluster", String(cluster));

  const { data, isLoading } = useQuery<Pending[]>({
    queryKey: ["disconnection-pending", qs.toString()],
    queryFn: () => apiGet<Pending[]>(`/api/disconnection/pending?${qs}`),
  });

  const list = data ?? [];
  const selected = list.filter((r) => checked.has(r.id));
  const total = selected.reduce((s, r) => s + r.balance, 0);

  function toggle(id: number) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["disconnection-pending"] });
    queryClient.invalidateQueries({ queryKey: ["disconnection-cut"] });
    setChecked(new Set());
  }

  function print() {
    const p = new URLSearchParams(qs);
    window.open(`/disconnection/print?${p}`, "_blank");
  }

  return (
    <section className="record-section">
      <p className="count">
        Awaiting a decision. Print the list for the crew, then come back and
        record what they did — Confirm for the ones that were cut, Cancel for
        the ones that were not.
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => {
              setBarangay(e.target.value === "" ? "" : Number(e.target.value));
              setCluster("");
              setChecked(new Set());
            }}
          >
            <option value="">All barangays</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        {ctx?.clustersEnabled && (
          <label className="field-input">
            <span>Cluster</span>
            <select
              value={cluster}
              disabled={barangay === "" || clusters.length === 0}
              onChange={(e) => {
                setCluster(e.target.value === "" ? "" : Number(e.target.value));
                setChecked(new Set());
              }}
            >
              <option value="">All clusters</option>
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <button className="clear-filters" onClick={print} disabled={list.length === 0}>
          Print list
        </button>
      </div>

      {notice && <div className="form-notice">{notice}</div>}

      <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
        <span className="count">
          {list.length} pending
          {checked.size > 0 && (
            <>
              {" · "}
              <b>{checked.size} selected, {peso.format(total)}</b>
            </>
          )}
        </span>
        <div className="head-actions">
          <button
            className="clear-filters"
            onClick={() => setChecked(new Set(list.map((r) => r.id)))}
          >
            Select all
          </button>
          <button className="clear-filters" onClick={() => setChecked(new Set())}>
            Clear
          </button>
          <button
            className="clear-filters"
            disabled={checked.size === 0}
            onClick={() => setDeciding("cancel")}
          >
            Cancel disconnection
          </button>
          <button
            className="danger small"
            disabled={checked.size === 0}
            onClick={() => setDeciding("confirm")}
          >
            Confirm disconnection
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th className="check" />
                <th>Account No.</th>
                <th>Name</th>
                <th>Meter serial</th>
                <th>Address</th>
                <th>Period covered</th>
                <th className="num">Balance</th>
                <th>Listed</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr
                  key={r.id}
                  className={checked.has(r.id) ? "selected-row" : ""}
                  onClick={() => toggle(r.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="check">
                    <input
                      type="checkbox"
                      checked={checked.has(r.id)}
                      onChange={() => toggle(r.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td>{r.accountNo}</td>
                  <td>{r.name}</td>
                  <td>{r.meterNo || <span className="muted">—</span>}</td>
                  <td>
                    {r.address}
                    {r.cluster && <div className="setting-note">{r.cluster}</div>}
                  </td>
                  <td>{r.period}</td>
                  <td className="num">{peso.format(r.balance)}</td>
                  <td className="change-when">
                    {r.listedOn ? new Date(r.listedOn).toLocaleDateString("en-PH", {
                      day: "numeric", month: "short", year: "numeric",
                    }) : <span className="muted">—</span>}
                    {r.payBy && (
                      <div className="setting-note">
                        pay by {new Date(`${r.payBy}T00:00:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short" })}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="count">
                    Nothing pending.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deciding === "cancel" && (
        <CancelDialog
          rows={selected}
          statusName={ctx?.statuses.connected ?? "Connected"}
          onClose={() => setDeciding(null)}
          onDone={(n) => {
            setDeciding(null);
            setNotice(`${n} account(s) returned to ${ctx?.statuses.connected ?? "Connected"}.`);
            refresh();
          }}
        />
      )}

      {deciding === "confirm" && (
        <ConfirmDialog
          rows={selected}
          statusName={ctx?.statuses.disconnected ?? "Disconnected"}
          onClose={() => setDeciding(null)}
          onDone={(n) => {
            setDeciding(null);
            setNotice(`${n} account(s) marked ${ctx?.statuses.disconnected ?? "Disconnected"}.`);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function CancelDialog({
  rows,
  statusName,
  onClose,
  onDone,
}: {
  rows: Pending[];
  statusName: string;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ cancelled: number }>("/api/disconnection/pending/cancel", {
        ids: rows.map((x) => x.id),
        reason,
        notify,
      });
      onDone(r.cancelled);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Cancel disconnection</h2>
        <p className="modal-sub">
          {rows.length} account{rows.length === 1 ? "" : "s"} back to {statusName}
        </p>

        <div className="decide-list">
          {rows.slice(0, 8).map((r) => (
            <div key={r.id}>
              {r.accountNo} · {r.name}
            </div>
          ))}
          {rows.length > 8 && <div className="muted">and {rows.length - 8} more</div>}
        </div>

        <label className="field-input">
          <span>Reason</span>
          <input
            value={reason}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            placeholder="Paid at the counter, promissory note, …"
          />
          <span className="setting-note">
            Optional, but it goes on the account&apos;s log — worth a few words.
          </span>
        </label>

        <label style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Tell account holders with the mobile app that their service continues
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : `Return ${rows.length} to ${statusName}`}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  rows,
  statusName,
  onClose,
  onDone,
}: {
  rows: Pending[];
  statusName: string;
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [date, setDate] = useState(today());
  const [by, setBy] = useState("");
  const [byOther, setByOther] = useState(false);
  const [readings, setReadings] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const { data: readers } = useQuery<{ id: number; name: string; status: string }[]>({
    queryKey: ["meter-readers"],
    queryFn: () => apiGet("/api/settings/meter-readers"),
  });

  const future = new Date(date) > new Date();
  const [notify, setNotify] = useState(true);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ confirmed: number }>("/api/disconnection/pending/confirm", {
        ids: rows.map((x) => x.id),
        date,
        by,
        readings,
        notify,
      });
      onDone(r.confirmed);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Confirm disconnection</h2>
        <p className="modal-sub">
          {rows.length} account{rows.length === 1 ? "" : "s"} to {statusName}
        </p>

        <div className="filter-row">
          <label className="field-input">
            <span>Date disconnected</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field-input">
            <span>Disconnected by</span>
            {/* The crew are the meter readers. "Someone else" keeps a free-text
                escape for a name that is not on the list. */}
            {byOther ? (
              <>
                <input
                  value={by}
                  autoFocus
                  onChange={(e) => setBy(e.target.value)}
                  placeholder="Name"
                />
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setByOther(false);
                    setBy("");
                  }}
                >
                  Pick from the meter readers instead
                </button>
              </>
            ) : (
              <select
                value={by}
                onChange={(e) => {
                  if (e.target.value === "__other") {
                    setByOther(true);
                    setBy("");
                  } else {
                    setBy(e.target.value);
                  }
                }}
              >
                <option value="">Choose…</option>
                {(readers ?? [])
                  .filter((r) => /active/i.test(r.status))
                  .map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                <option value="__other">Someone else…</option>
              </select>
            )}
          </label>
        </div>

        <p className="count">
          The reading is prefilled with the account&apos;s current meter
          reference. Correct any the crew read differently.
        </p>

        <div className="decide-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Name</th>
                <th className="num">Last reading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.accountNo}</td>
                  <td>{r.name}</td>
                  <td className="num">
                    <input
                      className="amount-input"
                      type="number"
                      min={0}
                      value={readings[r.id] ?? String(r.lastReading)}
                      onChange={(e) =>
                        setReadings({ ...readings, [r.id]: e.target.value })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {future && <div className="form-error">That date is in the future.</div>}
        <label style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Tell account holders with the mobile app (balance and reconnection fee)
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-notice">
          The reading is recorded on each account&apos;s log, not written to the
          meter reference — a disconnected account is not billed, and moving the
          reference here would quietly change what a later reconnection measures
          from.
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !by.trim() || future}
            onClick={save}
          >
            {busy ? "Saving…" : `Disconnect ${rows.length}`}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================== *
 * Stage 3 — what has been cut
 * ==================================================================== */

function Disconnected({ ctx }: { ctx?: Context }) {
  const { barangays } = useAreas();
  const [barangay, setBarangay] = useState<number | "">("");

  const qs = new URLSearchParams();
  if (barangay !== "") qs.set("barangay", String(barangay));

  const { data, isLoading } = useQuery<Cut[]>({
    queryKey: ["disconnection-cut", qs.toString()],
    queryFn: () => apiGet<Cut[]>(`/api/disconnection/disconnected?${qs}`),
  });

  const list = data ?? [];

  return (
    <section className="record-section">
      <p className="count">
        Accounts currently {ctx?.statuses.disconnected ?? "Disconnected"}. Each
        one owes a reconnection fee, which appears on its own at the counter
        when they come in to pay.
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => setBarangay(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All barangays</option>
            {barangays.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Name</th>
                <th>Address</th>
                <th className="num">Balance</th>
                <th className="num">Last reading</th>
                <th>Cut on</th>
                <th>Cut by</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{r.accountNo}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.address}
                    {r.cluster && <div className="setting-note">{r.cluster}</div>}
                  </td>
                  <td className="num">{peso.format(r.balance)}</td>
                  <td className="num">
                    {r.lastReading === null
                      ? <span className="muted">—</span>
                      : r.lastReading.toLocaleString()}
                  </td>
                  <td className="change-when">
                    {r.cutOn ? new Date(r.cutOn).toLocaleDateString("en-PH", {
                      day: "numeric", month: "short", year: "numeric",
                    }) : <span className="muted">—</span>}
                  </td>
                  <td>{r.cutBy || <span className="muted">—</span>}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="count">
                    Nothing disconnected.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Kept separate so the bulk actions read the same way everywhere. */
function confirmDialog(message: string) {
  return window.confirm(message);
}
