import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { today } from "./collectionTypes";

/**
 * Pending work — the five things an account waits for once its fee is paid.
 *
 * Collection moves the account to the right status the moment the fee is
 * receipted; nothing else happens until somebody records that the work was
 * done. That recording is this screen.
 *
 * The desktop had one shared Pending List with a filter combo and five
 * different dialogs behind it. Each stage gets its own tab here, because the
 * lists want different columns and the forms ask for different things.
 */

type StageKey =
  | "installation"
  | "reconnection"
  | "meter-transfer"
  | "owner-transfer"
  | "meter-replacement"
  | "temporary-close";

const TABS: { key: StageKey; label: string; blurb: string }[] = [
  {
    key: "installation",
    label: "Installation",
    blurb: "Application fee paid, meter not yet fitted.",
  },
  {
    key: "reconnection",
    label: "Reconnection",
    blurb: "Reconnection fee paid, tap not yet reopened.",
  },
  {
    key: "meter-transfer",
    label: "Meter transfer",
    blurb: "Transfer fee paid, meter not yet moved.",
  },
  {
    key: "owner-transfer",
    label: "Owner transfer",
    blurb: "Transfer fee paid, name not yet changed.",
  },
  {
    key: "meter-replacement",
    label: "Meter replacement",
    blurb: "Replacement fee paid, meter not yet swapped.",
  },
  {
    key: "temporary-close",
    label: "Temporary closure",
    blurb:
      "Closure requested from the account menu. Not waiting on a fee — waiting on somebody shutting the tap off.",
  },
];

type Row = {
  id: number;
  accountNo: string;
  name: string;
  address: string;
  standpipe: string;
  meterNo: string;
  meterReference: number;
  barangay: string;
  cluster: string;
  appliedOn?: string | null;
  cutOn?: string | null;
  hasRequest?: boolean;
  // meter transfer
  from?: { address: string; standpipe: string; barangay: string; cluster: string };
  to?: { address: string; standpipe: string; barangay: string; cluster: string };
  // owner transfer
  currentOwner?: string;
  newOwner?: string;
  // meter replacement
  logId?: number | null;
  currentSerial?: string;
  currentReference?: number;
  // temporary closure
  reason?: string;
};

export default function PendingPage() {
  const [tab, setTab] = useState<StageKey>("installation");

  const { data: counts } = useQuery<{ counts: Record<string, number> }>({
    queryKey: ["pending-counts"],
    queryFn: () => apiGet("/api/pending/counts"),
  });

  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Pendings</h1>
          <p className="account-no">
            Work an account is waiting for, once the fee has been paid.
          </p>
        </div>
      </div>

      <div className="stage-tabs">
        {TABS.map((t) => {
          const n = counts?.counts[t.key] ?? 0;
          return (
            <button
              key={t.key}
              className={tab === t.key ? "stage-tab current" : "stage-tab"}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {n > 0 && <span className="stage-count">{n}</span>}
            </button>
          );
        })}
      </div>

      <StageList key={tab} stage={tab} blurb={current.blurb} />
    </div>
  );
}

function StageList({ stage, blurb }: { stage: StageKey; blurb: string }) {
  const queryClient = useQueryClient();
  const [barangay, setBarangay] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [batch, setBatch] = useState(false);

  // Only these two batch. The transfers and replacements carry per-account
  // detail that has to be read off a form one at a time.
  const batchable = stage === "installation" || stage === "reconnection";

  const { data: filters } = useQuery<{ barangays: { id: number; name: string }[] }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });

  const qs = new URLSearchParams();
  if (barangay !== "") qs.set("barangay", String(barangay));
  if (search.trim()) qs.set("search", search.trim());

  const { data, isLoading, error } = useQuery<Row[]>({
    queryKey: ["pending", stage, qs.toString()],
    queryFn: () => apiGet<Row[]>(`/api/pending/${stage}?${qs}`),
  });

  const rows = data ?? [];

  function done(message: string) {
    setEditing(null);
    setBatch(false);
    setChecked(new Set());
    setNotice(message);
    queryClient.invalidateQueries({ queryKey: ["pending", stage] });
    queryClient.invalidateQueries({ queryKey: ["pending-counts"] });
  }

  function toggle(id: number) {
    const next = new Set(checked);
    next.has(id) ? next.delete(id) : next.add(id);
    setChecked(next);
  }

  const selected = rows.filter((r) => checked.has(r.id));

  return (
    <section className="record-section">
      <p className="count">{blurb}</p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => setBarangay(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All barangays</option>
            {(filters?.barangays ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Search</span>
          <input
            className="filter-input class-search"
            value={search}
            placeholder="Name or account no."
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {notice && <div className="form-notice">{notice}</div>}
      {error && <div className="form-error">{(error as Error).message}</div>}

      {batchable && rows.length > 0 && (
        <div className="record-head" style={{ paddingBottom: 10, marginBottom: 10 }}>
          <span className="count">
            {rows.length} waiting
            {checked.size > 0 && <> · <b>{checked.size} selected</b></>}
          </span>
          <div className="head-actions">
            <button
              className="clear-filters"
              onClick={() => setChecked(new Set(rows.map((r) => r.id)))}
            >
              Select all
            </button>
            <button
              className="clear-filters"
              disabled={checked.size === 0}
              onClick={() => setChecked(new Set())}
            >
              Clear
            </button>
            <button
              className="primary"
              disabled={checked.size === 0}
              onClick={() => setBatch(true)}
            >
              {stage === "installation"
                ? `Install ${checked.size || ""}`.trim()
                : `Reconnect ${checked.size || ""}`.trim()}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="count">Nothing waiting here.</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {batchable && <th className="check" />}
                <th>Account No.</th>
                <th>Name</th>
                {stage === "meter-transfer" ? (
                  <>
                    <th>From</th>
                    <th>To</th>
                  </>
                ) : stage === "owner-transfer" ? (
                  <>
                    <th>Current owner</th>
                    <th>New owner</th>
                  </>
                ) : stage === "meter-replacement" ? (
                  <>
                    <th>Current serial</th>
                    <th className="num">Last billed</th>
                  </>
                ) : stage === "temporary-close" ? (
                  <>
                    <th>Address</th>
                    <th>Reason</th>
                  </>
                ) : (
                  <>
                    <th>Address</th>
                    <th>Barangay</th>
                  </>
                )}
                <th>Waiting since</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={checked.has(r.id) ? "selected-row" : ""}
                  onClick={batchable ? () => toggle(r.id) : undefined}
                  style={batchable ? { cursor: "pointer" } : undefined}
                >
                  {batchable && (
                    <td className="check">
                      <input
                        type="checkbox"
                        checked={checked.has(r.id)}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  <td>{r.accountNo}</td>
                  <td>{r.name}</td>

                  {stage === "meter-transfer" ? (
                    <>
                      <td>
                        {r.from?.address || <span className="muted">—</span>}
                        <div className="setting-note">
                          {[r.from?.cluster, r.from?.barangay].filter(Boolean).join(", ")}
                        </div>
                      </td>
                      <td>
                        {r.hasRequest ? (
                          <>
                            {r.to?.address}
                            <div className="setting-note">
                              {[r.to?.cluster, r.to?.barangay].filter(Boolean).join(", ")}
                            </div>
                          </>
                        ) : (
                          <span className="badge setting-badge role-none">No request</span>
                        )}
                      </td>
                    </>
                  ) : stage === "owner-transfer" ? (
                    <>
                      <td>{r.currentOwner}</td>
                      <td>
                        {r.hasRequest ? (
                          <b>{r.newOwner}</b>
                        ) : (
                          <span className="badge setting-badge role-none">No request</span>
                        )}
                      </td>
                    </>
                  ) : stage === "temporary-close" ? (
                    <>
                      <td>{r.address || <span className="muted">—</span>}</td>
                      <td>{r.reason || <span className="muted">—</span>}</td>
                    </>
                  ) : stage === "meter-replacement" ? (
                    <>
                      <td>
                        {r.currentSerial || <span className="muted">—</span>}
                        {!r.hasRequest && (
                          <span className="badge setting-badge role-none" style={{ marginLeft: 8 }}>
                            No request
                          </span>
                        )}
                      </td>
                      <td className="num">{(r.currentReference ?? 0).toLocaleString()}</td>
                    </>
                  ) : (
                    <>
                      <td>{r.address || <span className="muted">—</span>}</td>
                      <td>
                        {r.barangay}
                        {r.cluster && <div className="setting-note">{r.cluster}</div>}
                      </td>
                    </>
                  )}

                  <td className="change-when">
                    {waitingSince(r)}
                  </td>
                  <td className="num">
                    <button
                      className="primary small"
                      disabled={r.hasRequest === false}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(r);
                      }}
                    >
                      Update
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && stage === "installation" && (
        <InstallationForm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}
      {editing && stage === "reconnection" && (
        <ReconnectionForm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}
      {editing && stage === "meter-transfer" && (
        <MeterTransferForm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}
      {editing && stage === "owner-transfer" && (
        <OwnerTransferForm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}
      {editing && stage === "meter-replacement" && (
        <MeterReplacementForm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}
      {editing && stage === "temporary-close" && (
        <TempCloseConfirm row={editing} onClose={() => setEditing(null)} onDone={done} />
      )}

      {batch && stage === "reconnection" && (
        <BulkReconnection rows={selected} onClose={() => setBatch(false)} onDone={done} />
      )}
      {batch && stage === "installation" && (
        <BulkInstallation rows={selected} onClose={() => setBatch(false)} onDone={done} />
      )}
    </section>
  );
}

function waitingSince(r: Row) {
  const d = r.appliedOn ?? r.cutOn;
  if (!d) return <span className="muted">—</span>;
  const when = new Date(d);
  if (Number.isNaN(when.getTime())) return <span className="muted">—</span>;
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  return (
    <>
      {when.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" })}
      {days > 0 && <div className="setting-note">{days} day{days === 1 ? "" : "s"}</div>}
    </>
  );
}


/**
 * Who did the work. The plumbers, installers and meter changers are the same
 * people as the meter readers, so the list comes from `meterreader` — active
 * only. "Someone else" keeps a free-text escape for a name that is not on it
 * (a contractor, a new hire) rather than forcing a settings edit mid-job.
 */
function CrewPicker({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const { data } = useQuery<{ id: number; name: string; status: string }[]>({
    queryKey: ["meter-readers"],
    queryFn: () => apiGet("/api/settings/meter-readers"),
  });

  const active = (data ?? []).filter((r) => /active/i.test(r.status));
  const known = active.some((r) => r.name === value);
  const [other, setOther] = useState(false);
  const freeText = other || (value !== "" && !known);

  return (
    <label className="field-input" style={{ marginBottom: 12 }}>
      <span>{label}</span>
      {freeText ? (
        <>
          <input
            value={value}
            autoFocus
            onChange={(e) => onChange(e.target.value)}
            placeholder="Name"
          />
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setOther(false);
              onChange("");
            }}
          >
            Pick from the meter readers instead
          </button>
        </>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === "__other") {
              setOther(true);
              onChange("");
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">Choose…</option>
          {active.map((r) => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
          <option value="__other">Someone else…</option>
        </select>
      )}
      {hint && <span className="setting-note">{hint}</span>}
    </label>
  );
}

/** The header every update form shares — the account it is about. */
function Who({ row, title }: { row: Row; title: string }) {
  return (
    <>
      <h2 className="modal-title">{title}</h2>
      <div className="or-current">
        <div>
          <span className="field-label">Consumer</span>
          <strong>{row.name}</strong>
        </div>
        <div>
          <span className="field-label">Account No.</span>
          <strong>{row.accountNo}</strong>
        </div>
      </div>
    </>
  );
}

/** Shared submit plumbing — every form posts one account and closes. */
function useSubmit(
  path: string,
  onDone: (message: string) => void,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(body: unknown, message: (r: any) => string) {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<any>(path, body);
      onDone(message(r));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return { busy, error, send };
}

/* ==================================================================== *
 * Installation
 * ==================================================================== */

function InstallationForm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [standpipe, setStandpipe] = useState(row.standpipe ?? "");
  const [meterNo, setMeterNo] = useState("");
  const [meterBrand, setMeterBrand] = useState("");
  const [reference, setReference] = useState("0");
  const [installedBy, setInstalledBy] = useState("");

  const { busy, error, send } = useSubmit(`/api/pending/installation/${row.id}`, onDone);
  const ready = meterNo.trim() && installedBy.trim() && reference !== "";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <Who row={row} title="Update account installation" />

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Connection date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Stand pipe</span>
          <input value={standpipe} onChange={(e) => setStandpipe(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Meter no.</span>
          <input value={meterNo} autoFocus onChange={(e) => setMeterNo(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Meter brand</span>
          <input value={meterBrand} onChange={(e) => setMeterBrand(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Meter reference</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <span className="setting-note">
            The reading on the meter as fitted. The first bill measures from here.
          </span>
        </label>

        <CrewPicker
          label="Installed by"
          value={installedBy}
          onChange={setInstalledBy}
        />

        {error && <div className="form-error">{error}</div>}

        <div className="form-notice">
          The account becomes Connected and will be picked up by the next
          reading run.
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !ready}
            onClick={() =>
              send(
                {
                  date, standpipe, meterNo, meterBrand,
                  meterReference: Number(reference), installedBy,
                },
                (r) => `${r.accountNo} is now connected.`,
              )
            }
          >
            {busy ? "Saving…" : "Done"}
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
 * Reconnection
 * ==================================================================== */

function ReconnectionForm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [plumber, setPlumber] = useState("");
  const { busy, error, send } = useSubmit(`/api/pending/reconnection/${row.id}`, onDone);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <Who row={row} title="Update of reconnection" />

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Date reconnected</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <CrewPicker label="Name of plumber" value={plumber} onChange={setPlumber} />

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !plumber.trim()}
            onClick={() =>
              send({ date, plumber }, (r) => `${r.accountNo} is reconnected.`)
            }
          >
            {busy ? "Saving…" : "Confirm"}
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
 * Meter transfer
 * ==================================================================== */

function MeterTransferForm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const { busy, error, send } = useSubmit(`/api/pending/meter-transfer/${row.id}`, onDone);

  const movesBarangay =
    !!row.to?.barangay && !!row.from?.barangay && row.to.barangay !== row.from.barangay;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <Who row={row} title="Update of water meter" />

        <label className="field-input" style={{ marginBottom: 14 }}>
          <span>Date transferred</span>
          <input type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
        </label>

        <h3 className="profile-head">Address of transfer</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>From</th>
              <th>To</th>
            </tr>
          </thead>
          <tbody>
            <Move label="Street" from={row.from?.address} to={row.to?.address} />
            <Move label="Cluster" from={row.from?.cluster} to={row.to?.cluster} />
            <Move label="Barangay" from={row.from?.barangay} to={row.to?.barangay} />
            <Move label="Standpipe" from={row.from?.standpipe} to={row.to?.standpipe} />
          </tbody>
        </table>

        {movesBarangay && (
          <div className="form-notice">
            This moves the account to a different barangay. Its{" "}
            <b>account number stays as it is</b> — the number records where the
            connection was originally made, not where it is now. Its bills,
            receipts and O.R.s keep pointing at it unchanged.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => send({ date }, (r) => `${r.accountNo} transferred.`)}
          >
            {busy ? "Saving…" : "Confirm"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Move({ label, from, to }: { label: string; from?: string; to?: string }) {
  const changed = (from ?? "") !== (to ?? "");
  return (
    <tr>
      <td className="move-label">{label}</td>
      <td className={changed ? "change-from" : ""}>{from || <span className="muted">—</span>}</td>
      <td className={changed ? "change-to" : ""}>{to || <span className="muted">—</span>}</td>
    </tr>
  );
}

/* ==================================================================== *
 * Owner transfer
 * ==================================================================== */

function OwnerTransferForm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const { busy, error, send } = useSubmit(`/api/pending/owner-transfer/${row.id}`, onDone);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Update of transfer of ownership</h2>

        <div className="or-current">
          <div>
            <span className="field-label">Current owner</span>
            <strong>{row.currentOwner}</strong>
          </div>
          <div>
            <span className="field-label">New owner</span>
            <strong>{row.newOwner}</strong>
          </div>
          <div>
            <span className="field-label">Account No.</span>
            <strong>{row.accountNo}</strong>
          </div>
        </div>

        <label className="field-input">
          <span>Date transferred</span>
          <input type="date" value={date} autoFocus onChange={(e) => setDate(e.target.value)} />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-notice">
          The account keeps its number and its whole history — bills, payments
          and receipts already issued stay under the old owner&apos;s name as
          they were printed.
        </div>

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              send({ date }, (r) => `${r.accountNo} is now under ${r.to}.`)
            }
          >
            {busy ? "Saving…" : "Confirm"}
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
 * Meter replacement
 * ==================================================================== */

function MeterReplacementForm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [readingBefore, setReadingBefore] = useState("");
  const [newSerial, setNewSerial] = useState("");
  const [newReading, setNewReading] = useState("0");
  const [replacedBy, setReplacedBy] = useState("");

  const { busy, error, send } = useSubmit(
    `/api/pending/meter-replacement/${row.id}`, onDone,
  );

  const lastBilled = row.currentReference ?? 0;
  const before = Number(readingBefore);
  const backwards = readingBefore !== "" && before < lastBilled;
  const unbilled = readingBefore !== "" && !backwards ? before - lastBilled : 0;
  const ready = readingBefore !== "" && !backwards && newSerial.trim() && replacedBy.trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Meter replacement update</h2>

        <div className="or-current">
          <div>
            <span className="field-label">Consumer</span>
            <strong>{row.name}</strong>
          </div>
          <div>
            <span className="field-label">Account No.</span>
            <strong>{row.accountNo}</strong>
          </div>
          <div>
            <span className="field-label">Current serial</span>
            <strong>{row.currentSerial || "—"}</strong>
          </div>
          <div>
            <span className="field-label">Last billed at</span>
            <strong>{lastBilled.toLocaleString()}</strong>
          </div>
        </div>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Reading before replacement</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            autoFocus
            value={readingBefore}
            onChange={(e) => setReadingBefore(e.target.value)}
          />
          <span className="setting-note">
            What the old meter showed when it came off.
          </span>
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>New serial #</span>
          <input value={newSerial} onChange={(e) => setNewSerial(e.target.value)} />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>New reading</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={newReading}
            onChange={(e) => setNewReading(e.target.value)}
          />
          <span className="setting-note">
            Usually zero. The next bill measures from here.
          </span>
        </label>

        <CrewPicker label="Replaced by" value={replacedBy} onChange={setReplacedBy} />

        <label className="field-input">
          <span>Replacement date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {backwards && (
          <div className="form-error">
            The old meter was last billed at {lastBilled.toLocaleString()}. A
            reading of {before.toLocaleString()} is lower than that.
          </div>
        )}

        {unbilled > 0 && (
          <div className="form-notice">
            <b>{unbilled.toLocaleString()} m³ on the old meter has not been billed.</b>{" "}
            Swapping the meter does not bill it — the new meter starts at{" "}
            {Number(newReading || 0).toLocaleString()} and the next bill measures
            from there. Bill it first if the consumer should pay for it.
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !ready}
            onClick={() =>
              send(
                {
                  date,
                  readingBefore: Number(readingBefore),
                  newSerial,
                  newReading: Number(newReading || 0),
                  replacedBy,
                },
                (r) => `${r.accountNo} is on meter ${newSerial}.`,
              )
            }
          >
            {busy ? "Saving…" : "Done"}
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
 * Bulk
 *
 * A crew goes out for a morning and comes back with a list. Doing those one
 * dialog at a time is the tedious part of the job.
 * ==================================================================== */

function BulkReconnection({
  rows, onClose, onDone,
}: { rows: Row[]; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [plumber, setPlumber] = useState("");
  const { busy, error, send } = useSubmit("/api/pending/reconnection", onDone);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Reconnect {rows.length} account{rows.length === 1 ? "" : "s"}</h2>
        <p className="modal-sub">
          The date and the plumber apply to all of them.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Date reconnected</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <CrewPicker label="Name of plumber" value={plumber} onChange={setPlumber} />

        <div className="decide-list">
          {rows.slice(0, 10).map((r) => (
            <div key={r.id}>{r.accountNo} · {r.name}</div>
          ))}
          {rows.length > 10 && (
            <div className="muted">and {rows.length - 10} more</div>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !plumber.trim()}
            onClick={() =>
              send(
                { ids: rows.map((r) => r.id), date, plumber },
                (r) => summarise(r, "reconnected"),
              )
            }
          >
            {busy ? "Saving…" : `Reconnect ${rows.length}`}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type InstallRow = { meterNo: string; standpipe: string; meterReference: string };

function BulkInstallation({
  rows, onClose, onDone,
}: { rows: Row[]; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [installedBy, setInstalledBy] = useState("");
  const [brand, setBrand] = useState("");
  const [entry, setEntry] = useState<Record<number, InstallRow>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        { meterNo: "", standpipe: r.standpipe ?? "", meterReference: "0" },
      ]),
    ),
  );

  const { busy, error, send } = useSubmit("/api/pending/installation", onDone);

  function edit(id: number, patch: Partial<InstallRow>) {
    setEntry({ ...entry, [id]: { ...entry[id], ...patch } });
  }

  const filled = rows.filter((r) => entry[r.id]?.meterNo.trim());

  // Caught here as well as on the server, because the fix is to retype a
  // serial and it is easier to see which two rows clash while they are on
  // screen than after a refusal.
  const dupes = (() => {
    const seen = new Map<string, number>();
    for (const r of filled) {
      const k = entry[r.id].meterNo.trim().toUpperCase();
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  })();

  const ready = filled.length === rows.length && dupes.length === 0 && installedBy.trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          Install {rows.length} account{rows.length === 1 ? "" : "s"}
        </h2>
        <p className="modal-sub">
          The date, brand and installer apply to all of them. The meter number
          and its starting reading are per account.
        </p>

        <div className="filter-row">
          <label className="field-input">
            <span>Connection date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Meter brand</span>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Same for the whole batch"
            />
          </label>
          <div style={{ minWidth: 220 }}>
            <CrewPicker label="Installed by" value={installedBy} onChange={setInstalledBy} />
          </div>
        </div>

        <div className="decide-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Name</th>
                <th>Meter no.</th>
                <th>Stand pipe</th>
                <th className="num">Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const v = entry[r.id];
                const clash =
                  v.meterNo.trim() !== "" &&
                  dupes.includes(v.meterNo.trim().toUpperCase());
                return (
                  <tr key={r.id}>
                    <td>{r.accountNo}</td>
                    <td>{r.name}</td>
                    <td>
                      <input
                        className={clash ? "filter-input amount-input invalid" : "filter-input"}
                        style={{ width: 130 }}
                        value={v.meterNo}
                        onChange={(e) => edit(r.id, { meterNo: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="filter-input"
                        style={{ width: 110 }}
                        value={v.standpipe}
                        onChange={(e) => edit(r.id, { standpipe: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        className="amount-input"
                        type="number"
                        min={0}
                        value={v.meterReference}
                        onChange={(e) => edit(r.id, { meterReference: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {dupes.length > 0 && (
          <div className="form-error">
            Meter {dupes.join(", ")} is entered on more than one account.
          </div>
        )}
        {filled.length < rows.length && (
          <div className="count">
            {rows.length - filled.length} still need a meter number.
          </div>
        )}
        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !ready}
            onClick={() =>
              send(
                {
                  date,
                  installedBy,
                  meterBrand: brand,
                  rows: rows.map((r) => ({
                    id: r.id,
                    meterNo: entry[r.id].meterNo,
                    standpipe: entry[r.id].standpipe,
                    meterReference: Number(entry[r.id].meterReference || 0),
                  })),
                },
                (r) => summarise(r, "connected"),
              )
            }
          >
            {busy ? "Saving…" : `Install ${rows.length}`}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** One sentence covering what went through and what did not. */
function summarise(r: { done: number; skipped: { account: string; why: string }[] }, verb: string) {
  const base = `${r.done} account${r.done === 1 ? "" : "s"} ${verb}.`;
  if (!r.skipped?.length) return base;
  const named = r.skipped.slice(0, 3).map((s) => `${s.account} — ${s.why}`).join("; ");
  const rest = r.skipped.length > 3 ? `, and ${r.skipped.length - 3} more` : "";
  return `${base} ${r.skipped.length} left alone: ${named}${rest}.`;
}

/* ==================================================================== *
 * Temporary closure — confirm the tap was shut off
 * ==================================================================== */

function TempCloseConfirm({
  row, onClose, onDone,
}: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [date, setDate] = useState(today());
  const [by, setBy] = useState("");
  const [reading, setReading] = useState(String(row.meterReference ?? 0));
  const { busy, error, send } = useSubmit(
    `/api/pending/temporary-close/${row.id}`, onDone,
  );

  // Says where the account will land, and refuses to pretend when the id has
  // not been configured — writing an arbitrary status is worse than stopping.
  const { data: target } = useQuery<{ configured: boolean; id: number; name: string }>({
    queryKey: ["temp-close-target"],
    queryFn: () => apiGet("/api/pending/temporary-close/target"),
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <Who row={row} title="Confirm temporary closure" />

        {target && !target.configured && (
          <div className="form-error">
            The Temporary Closed status id is not set, so this cannot be saved.
            Set <code>TEMP_CLOSED_STATUS_ID</code> in the API&apos;s{" "}
            <code>.env</code> to whichever <code>staID</code> your{" "}
            <code>accountstatus</code> table uses for it.
          </div>
        )}

        {row.reason && (
          <div className="or-current">
            <div>
              <span className="field-label">Requested because</span>
              <strong>{row.reason}</strong>
            </div>
          </div>
        )}

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Date closed</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        <CrewPicker label="Closed by" value={by} onChange={setBy} />

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Last reading</span>
          <input
            className="amount-input"
            type="number"
            min={0}
            value={reading}
            onChange={(e) => setReading(e.target.value)}
          />
          <span className="setting-note">
            Recorded on the account log, not written to the meter reference — a
            closed account is not billed, and moving the reference would change
            what a later reopening measures from.
          </span>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button
            className="primary"
            disabled={busy || !by.trim() || (target ? !target.configured : true)}
            onClick={() =>
              send(
                { date, by, reading: Number(reading || 0) },
                (r) => `${r.accountNo} is now ${target?.name ?? "closed"}.`,
              )
            }
          >
            {busy ? "Saving…" : "Confirm closure"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
