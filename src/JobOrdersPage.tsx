import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

/**
 * Job Orders — the printed dispatch slip a crew takes into the field, one
 * per job, matching Rizal's own paper forms and flowcharts. See
 * poseidon-api's joborders.ts for what this deliberately is and isn't: an
 * additive paper trail over the Pending workflow's own statuses, not a new
 * gate in front of them.
 *
 * Every paper form has a "Details of X" section the crew fills in by hand
 * once the job is done — meter serial, readings, date, remarks. "Record
 * results" is where that comes back into the system, so a reprinted job
 * order shows what actually happened instead of the blank lines it went out
 * with. Recording results is its own step, independent of Pendings' own
 * completion forms — a job order can be marked Completed here without
 * touching the account, and the account can be marked done in Pendings
 * without a job order ever existing.
 */

type JobType =
  | "installation" | "reconnection" | "meter-transfer"
  | "meter-replacement" | "repair-adjustment" | "temp-closure";

const TABS: { key: JobType; label: string; blurb: string }[] = [
  { key: "installation", label: "Installation", blurb: "New connections waiting to be installed." },
  { key: "reconnection", label: "Reconnection", blurb: "Reconnection fee paid, tap not yet reopened." },
  { key: "meter-transfer", label: "Meter Transfer", blurb: "Transfer fee paid, meter not yet moved." },
  { key: "meter-replacement", label: "Meter Replacement", blurb: "Replacement fee paid, meter not yet swapped." },
  { key: "repair-adjustment", label: "Inspection (Repair/Adjustment)", blurb: "Bill adjustment requests waiting to be inspected." },
  { key: "temp-closure", label: "Temporary & Voluntary Closure", blurb: "Waiting for the tap to be shut off." },
];

type JobOrderInfo = {
  joId: number;
  jobOrderNo: string;
  dateIssued: string | null;
  preparedBy: string;
  status: string;
};

type Row = {
  acctId: number;
  accountNo: string;
  name: string;
  address: string;
  standpipe: string;
  meterNo: string;
  contactNo: string;
  barangay: string;
  cluster: string;
  refId: number | null;
  jobOrder: JobOrderInfo | null;
  appliedOn?: string | null;
  reason?: string;
  from?: { address: string; standpipe: string };
  to?: { address: string; standpipe: string; barangay: string; cluster: string };
  currentSerial?: string;
  currentReference?: number;
};

/* ------------------------------------------------------------------ *
 * The "Details of X" fields, per type — what the crew reports back.
 * ------------------------------------------------------------------ */

type ResultKey =
  | "meterSerial" | "meterBrand" | "standpipe" | "newBarangay" | "newCluster"
  | "completedBy" | "reading" | "reading2" | "date" | "remarks" | "materials" | "findings";

type FieldSpec = { key: ResultKey; label: string; kind: "text" | "number" | "date" | "textarea" };

const RESULT_FIELDS: Record<JobType, FieldSpec[]> = {
  installation: [
    { key: "meterSerial", label: "Meter Serial No.", kind: "text" },
    { key: "meterBrand", label: "Meter Brand", kind: "text" },
    { key: "standpipe", label: "Stand Pipe No.", kind: "text" },
    { key: "reading", label: "Initial Reading", kind: "number" },
    { key: "date", label: "Date Installed", kind: "date" },
    { key: "materials", label: "Materials Used", kind: "textarea" },
    { key: "completedBy", label: "Installed by", kind: "text" },
    { key: "remarks", label: "Remarks / Status", kind: "textarea" },
  ],
  reconnection: [
    { key: "meterSerial", label: "Meter Serial No.", kind: "text" },
    { key: "standpipe", label: "Stand Pipe No.", kind: "text" },
    { key: "date", label: "Date Reconnected", kind: "date" },
    { key: "completedBy", label: "Reconnected by", kind: "text" },
    { key: "remarks", label: "Remarks / Status", kind: "textarea" },
  ],
  "meter-transfer": [
    { key: "standpipe", label: "New Stand Pipe No.", kind: "text" },
    { key: "newBarangay", label: "New Barangay", kind: "text" },
    { key: "newCluster", label: "New Cluster / Purok", kind: "text" },
    { key: "date", label: "Date Installed", kind: "date" },
    { key: "completedBy", label: "Installed by", kind: "text" },
    { key: "remarks", label: "Remarks / Status", kind: "textarea" },
  ],
  "meter-replacement": [
    { key: "reading2", label: "Actual Reading (Old Meter)", kind: "number" },
    { key: "meterSerial", label: "New Meter Serial No.", kind: "text" },
    { key: "meterBrand", label: "New Meter Brand", kind: "text" },
    { key: "reading", label: "New Initial Reading", kind: "number" },
    { key: "date", label: "Date Installed", kind: "date" },
    { key: "completedBy", label: "Installed by", kind: "text" },
    { key: "remarks", label: "Remarks / Status", kind: "textarea" },
  ],
  "repair-adjustment": [
    { key: "meterSerial", label: "Meter Serial No.", kind: "text" },
    { key: "standpipe", label: "Stand Pipe No.", kind: "text" },
    { key: "reading", label: "Last Reading", kind: "number" },
    { key: "reading2", label: "Actual / Default Reading", kind: "number" },
    { key: "date", label: "Date Completed", kind: "date" },
    { key: "materials", label: "Materials Used", kind: "textarea" },
    { key: "findings", label: "Inspection Report / Findings / Recommendations", kind: "textarea" },
    { key: "completedBy", label: "Conducted by", kind: "text" },
  ],
  "temp-closure": [
    { key: "meterSerial", label: "Meter Serial No.", kind: "text" },
    { key: "standpipe", label: "Stand Pipe No.", kind: "text" },
    { key: "reading", label: "Last Reading", kind: "number" },
    { key: "date", label: "Date Disconnected", kind: "date" },
    { key: "completedBy", label: "Disconnected by", kind: "text" },
    { key: "remarks", label: "Remarks / Status", kind: "textarea" },
  ],
};

export default function JobOrdersPage() {
  const [tab, setTab] = useState<JobType>("installation");
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Job Orders</h1>
          <p className="account-no">
            One printed dispatch slip per job. Printing here does not change
            anything — the Pending tabs still record when the work is done.
          </p>
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

      <JobOrderList key={tab} type={tab} blurb={current.blurb} />
    </div>
  );
}

function JobOrderList({ type, blurb }: { type: JobType; blurb: string }) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ joId: number; accountNo: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<Row[]>({
    queryKey: ["joborders", type],
    queryFn: () => apiGet<Row[]>(`/api/joborders/${type}`),
  });

  const rows = data ?? [];

  async function issueAndPrint(r: Row) {
    const key = `${r.acctId}-${r.refId ?? ""}`;
    setBusyKey(key);
    setError("");
    try {
      const result = await apiPost<{ jobOrder: JobOrderInfo }>(`/api/joborders/${type}/issue`, {
        acctId: r.acctId,
        refId: r.refId,
      });
      qc.invalidateQueries({ queryKey: ["joborders", type] });
      setNotice(`Job order ${result.jobOrder.jobOrderNo} issued for ${r.accountNo}.`);
      openPrint(result.jobOrder.joId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  function openPrint(joId: number) {
    window.open(`/joborders/${joId}/print`, "_blank");
  }

  return (
    <section className="record-section">
      <p className="count">{blurb}</p>

      {notice && <div className="form-notice">{notice}</div>}
      {error && <div className="form-error">{error}</div>}

      {isLoading ? (
        <p className="count">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="count">Nothing waiting here.</p>
      ) : (
        <div className="batch-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account No.</th>
                <th>Name</th>
                {type === "meter-transfer" ? (
                  <>
                    <th>From</th>
                    <th>To</th>
                  </>
                ) : type === "meter-replacement" ? (
                  <th>Current meter</th>
                ) : type === "repair-adjustment" ? (
                  <th>Reason</th>
                ) : (
                  <>
                    <th>Address</th>
                    <th>Barangay</th>
                  </>
                )}
                <th>Job Order No.</th>
                <th>Date Issued</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.acctId}-${r.refId ?? ""}`;
                const jo = r.jobOrder;
                const completed = jo?.status === "Completed";
                return (
                  <tr key={key}>
                    <td>{r.accountNo}</td>
                    <td>{r.name}</td>
                    {type === "meter-transfer" ? (
                      <>
                        <td>{r.from?.address}<div className="setting-note">{r.from?.standpipe}</div></td>
                        <td>{r.to?.address}<div className="setting-note">{[r.to?.cluster, r.to?.barangay].filter(Boolean).join(", ")}</div></td>
                      </>
                    ) : type === "meter-replacement" ? (
                      <td>{r.currentSerial || <span className="muted">—</span>}</td>
                    ) : type === "repair-adjustment" ? (
                      <td>{r.reason || <span className="muted">—</span>}</td>
                    ) : (
                      <>
                        <td>{r.address || <span className="muted">—</span>}</td>
                        <td>
                          {r.barangay}
                          {r.cluster && <div className="setting-note">{r.cluster}</div>}
                        </td>
                      </>
                    )}
                    <td>{jo?.jobOrderNo || <span className="muted">Not issued</span>}</td>
                    <td>{jo?.dateIssued ?? ""}</td>
                    <td>
                      {jo && (
                        <span className={completed ? "badge setting-badge role-appr" : "badge setting-badge role-none"}>
                          {jo.status}
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {jo ? (
                        <>
                          <button className="link-button" onClick={() => openPrint(jo.joId)}>
                            Reprint
                          </button>
                          {" · "}
                          <button
                            className="link-button"
                            onClick={() => setRecording({ joId: jo.joId, accountNo: r.accountNo })}
                          >
                            {completed ? "Edit results" : "Record results"}
                          </button>
                        </>
                      ) : (
                        <button
                          className="primary small"
                          disabled={busyKey === key}
                          onClick={() => issueAndPrint(r)}
                        >
                          {busyKey === key ? "Working…" : "Issue & Print"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {recording && (
        <RecordResultsDialog
          type={type}
          joId={recording.joId}
          accountNo={recording.accountNo}
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null);
            setNotice(`Results recorded for ${recording.accountNo}.`);
            qc.invalidateQueries({ queryKey: ["joborders", type] });
          }}
        />
      )}
    </section>
  );
}

type ResultEntry = { joId: number; status: string; result: Record<ResultKey, string | number | null> };

function RecordResultsDialog({
  type, joId, accountNo, onClose, onDone,
}: { type: JobType; joId: number; accountNo: string; onClose: () => void; onDone: () => void }) {
  const fields = RESULT_FIELDS[type];
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<ResultEntry>(`/api/joborders/entry/${joId}`)
      .then((d) => {
        const initial: Record<string, string> = {};
        for (const f of fields) {
          const v = (d as any).result?.[f.key];
          initial[f.key] = v === null || v === undefined ? "" : String(v);
        }
        setValues(initial);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fields is a
    // constant lookup by `type`, not something that changes for a mounted dialog.
  }, [joId]);

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/joborders/${joId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Record results</h2>
        <p className="modal-sub">{accountNo}</p>

        {!loaded ? (
          <p className="count">Loading…</p>
        ) : (
          fields.map((f) => (
            <label className="field-input" style={{ marginBottom: 12 }} key={f.key}>
              <span>{f.label}</span>
              {f.kind === "textarea" ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              ) : (
                <input
                  type={f.kind}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </label>
          ))
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !loaded} onClick={save}>
            {busy ? "Saving…" : "Save results"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
