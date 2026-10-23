import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "./api";

/**
 * Online Applications — what applicants sent through the official website
 * (poseidon-api partnerApi.ts). Nothing here is an account yet: Accept fills
 * in what an applicant can't know (classification, meter size) and creates
 * the normal application, exactly as New Application does; Reject records
 * why, which the applicant sees when they check their reference.
 */

type OnlineApp = {
  id: number; reference: string; submittedAt: string; status: "pending" | "accepted" | "rejected";
  name: string; streetAddress: string; barangayId: number; barangay: string; clusterId: number; cluster: string;
  contactNum: string; email: string; gender: string; isSenior: "Yes" | "No"; seniorId: string;
  householdMembers: number | null; seniorCount: number | null; consumerTypeId: number; consumerType: string;
  notes: string; decidedAt: string | null; decidedBy: string | null; decisionNote: string | null;
  acctId: number | null; accountNo: string | null; source: string;
};

type Options = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
  classifications: { id: number; name: string }[];
  consumerTypes: { id: number; name: string; needsCollection: number }[];
  meterSizes: { id: number; name: string }[];
  downpaymentEnabled: boolean;
};

const TABS = [
  { id: "pending", label: "Waiting" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
] as const;

const when = (v: string | null) => (v ? new Date(v).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "");

export default function OnlineApplicationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("pending");
  const [accepting, setAccepting] = useState<OnlineApp | null>(null);
  const [rejecting, setRejecting] = useState<OnlineApp | null>(null);
  const [notice, setNotice] = useState<{ text: string; acctId?: number } | null>(null);

  const { data, isLoading, error } = useQuery<{ rows: OnlineApp[] }>({
    queryKey: ["online-applications", tab],
    queryFn: () => apiGet(`/api/online-applications?status=${tab}`),
    refetchInterval: tab === "pending" ? 60_000 : false,
  });

  function done(text: string, acctId?: number) {
    setAccepting(null);
    setRejecting(null);
    setNotice({ text, acctId });
    qc.invalidateQueries({ queryKey: ["online-applications"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  const rows = data?.rows ?? [];

  return (
    <div>
      <div className="page-head">
        <h1>Online Applications</h1>
      </div>
      <p className="count">
        New-connection applications sent in from the official website. Nothing here is on file yet — accepting one
        creates the application (Pending Payment, with its account number), just like New Application.
      </p>

      <div className="mode-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "mode-tab active" : "mode-tab"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {notice && (
        <div className="form-notice action-notice" style={{ margin: "10px 0" }}>
          {notice.text}{" "}
          {notice.acctId && <Link to={`/accounts/${notice.acctId}`}>Open the account</Link>}{" "}
          <button className="link-button" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {!isLoading && !rows.length && (
        <p className="count" style={{ marginTop: 16 }}>
          {tab === "pending" ? "Nothing waiting. Applications from the website appear here." : "None yet."}
        </p>
      )}

      {rows.length > 0 && (
        <table className="data-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Reference</th><th>Applicant</th><th>Where</th><th>Contact</th><th>Details</th>
              <th>{tab === "pending" ? "Sent" : "Decided"}</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><code>{r.reference}</code></td>
                <td>
                  <span className="cell-name">{r.name}</span>
                  {r.isSenior === "Yes" && <span className="cell-sub">SC/PWD{r.seniorId ? ` · ${r.seniorId}` : ""}</span>}
                </td>
                <td>
                  <span className="cell-name">{r.barangay}{r.cluster ? ` · ${r.cluster}` : ""}</span>
                  {r.streetAddress && <span className="cell-sub">{r.streetAddress}</span>}
                </td>
                <td>
                  <span className="cell-name">{r.contactNum}</span>
                  {r.email && <span className="cell-sub">{r.email}</span>}
                </td>
                <td style={{ maxWidth: 260 }}>
                  {r.consumerType && <span className="cell-name">{r.consumerType}</span>}
                  <span className="cell-sub">
                    {[r.householdMembers != null ? `${r.householdMembers} in household` : "", r.gender].filter(Boolean).join(" · ")}
                  </span>
                  {r.notes && <span className="cell-sub" style={{ whiteSpace: "normal" }}>&ldquo;{r.notes}&rdquo;</span>}
                </td>
                <td>
                  {tab === "pending" ? when(r.submittedAt) : (
                    <>
                      {when(r.decidedAt)}
                      {r.decidedBy && <span className="cell-sub">by {r.decidedBy}</span>}
                    </>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {r.status === "pending" && (
                    <>
                      <button className="primary small" onClick={() => setAccepting(r)}>Accept…</button>{" "}
                      <button className="clear-filters" onClick={() => setRejecting(r)}>Reject…</button>
                    </>
                  )}
                  {r.status === "accepted" && r.acctId && <Link to={`/accounts/${r.acctId}`}>{r.accountNo ?? "Account"}</Link>}
                  {r.status === "rejected" && <span className="muted" style={{ whiteSpace: "normal" }}>{r.decisionNote}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {accepting && <AcceptDialog app={accepting} onClose={() => setAccepting(null)} onDone={done} />}
      {rejecting && <RejectDialog app={rejecting} onClose={() => setRejecting(null)} onDone={done} />}
    </div>
  );
}

function AcceptDialog({ app, onClose, onDone }: { app: OnlineApp; onClose: () => void; onDone: (t: string, id?: number) => void }) {
  const { data: options } = useQuery<Options>({ queryKey: ["filter-options"], queryFn: () => apiGet<Options>("/api/filters") });
  const [f, setF] = useState({
    name: app.name,
    streetAddress: app.streetAddress,
    barangayId: app.barangayId,
    clusterId: app.clusterId,
    contactNum: app.contactNum,
    gender: app.gender,
    isSenior: app.isSenior,
    seniorId: app.seniorId,
    householdMembers: app.householdMembers == null ? "" : String(app.householdMembers),
    seniorCount: app.seniorCount == null ? "" : String(app.seniorCount),
    consumerTypeId: app.consumerTypeId,
    classificationId: 0,
    meterSizeId: 0,
    applicationOption: "pay",
    decisionNote: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | number) => setF((x) => ({ ...x, [k]: v, ...(k === "barangayId" ? { clusterId: 0 } : {}) }));

  const type = options?.consumerTypes.find((t) => t.id === f.consumerTypeId);
  const offerNoDown = !!options?.downpaymentEnabled && type?.needsCollection === 1;
  const ready = f.name.trim() && f.barangayId > 0 && f.consumerTypeId > 0 && f.classificationId > 0 && f.meterSizeId > 0;

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ id: number; accountNo: string }>(`/api/online-applications/${app.id}/accept`, {
        ...f,
        householdMembers: Number(f.householdMembers) || 0,
        seniorCount: Number(f.seniorCount) || 0,
        applicationOption: offerNoDown ? f.applicationOption : "pay",
      });
      onDone(`${app.reference} accepted — account ${r.accountNo} created.`, r.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const sel = (label: string, key: "barangayId" | "clusterId" | "consumerTypeId" | "classificationId" | "meterSizeId", list: { id: number; name: string }[], hint?: string) => (
    <label className="field-input">
      <span>{label}</span>
      <select value={f[key]} onChange={(e) => set(key, Number(e.target.value))}>
        <option value={0}>{key === "clusterId" ? "—" : "Choose…"}</option>
        {list.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {hint && <span className="setting-note">{hint}</span>}
    </label>
  );
  const input = (label: string, key: "name" | "streetAddress" | "contactNum" | "seniorId" | "householdMembers" | "seniorCount", type = "text") => (
    <label className="field-input">
      <span>{label}</span>
      <input type={type} min={type === "number" ? 0 : undefined} value={f[key]} onChange={(e) => set(key, e.target.value)} />
    </label>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Accept {app.reference}</h2>
        <p className="modal-sub">Check what the applicant sent, then add what only the office can decide.</p>
        {!options ? <p className="count">Loading…</p> : (
          <>
            <div className="form-grid">
              {input("Name", "name")}
              {input("Street address", "streetAddress")}
              {sel("Barangay", "barangayId", options.barangays)}
              {sel("Purok / cluster", "clusterId", options.clusters.filter((c) => c.barangayId === f.barangayId))}
              {input("Contact number", "contactNum")}
              <label className="field-input">
                <span>Gender</span>
                <select value={f.gender} onChange={(e) => set("gender", e.target.value)}>
                  <option value="">-</option><option value="Male">Male</option><option value="Female">Female</option>
                </select>
              </label>
              <label className="field-input">
                <span>SC/PWD</span>
                <select value={f.isSenior} onChange={(e) => set("isSenior", e.target.value)}>
                  <option value="No">No</option><option value="Yes">Yes</option>
                </select>
              </label>
              {input("SC/PWD ID", "seniorId")}
              {input("Household members", "householdMembers", "number")}
              {input("Senior count", "seniorCount", "number")}
            </div>
            <h3 style={{ margin: "14px 0 6px" }}>Decided by the office</h3>
            <div className="form-grid">
              {sel("Account type", "consumerTypeId", options.consumerTypes, app.consumerType ? `The applicant chose ${app.consumerType}.` : "The applicant didn't say.")}
              {sel("Classification", "classificationId", options.classifications)}
              {sel("Meter size", "meterSizeId", options.meterSizes)}
            </div>
            {offerNoDown && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "10px 0" }}>
                <label style={{ display: "flex", gap: 8 }}>
                  <input type="radio" checked={f.applicationOption === "pay"} onChange={() => set("applicationOption", "pay")} />
                  Make payment — collect the application fee at the counter
                </label>
                <label style={{ display: "flex", gap: 8 }}>
                  <input type="radio" checked={f.applicationOption === "noDown"} onChange={() => set("applicationOption", "noDown")} />
                  No down payment — straight to Installation; the fee becomes an installment on future bills
                </label>
              </div>
            )}
            <label className="field-input" style={{ marginTop: 8 }}>
              <span>Note (optional)</span>
              <input value={f.decisionNote} maxLength={300} onChange={(e) => set("decisionNote", e.target.value)} />
            </label>
          </>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || !ready} onClick={accept}>{busy ? "Creating…" : "Accept and create the application"}</button>
          <button className="clear-filters" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function RejectDialog({ app, onClose, onDone }: { app: OnlineApp; onClose: () => void; onDone: (t: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reject() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/online-applications/${app.id}/reject`, { note });
      onDone(`${app.reference} rejected.`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Reject {app.reference}</h2>
        <p className="modal-sub">{app.name} · {app.barangay}</p>
        <label className="field-input">
          <span>Why</span>
          <input value={note} autoFocus maxLength={300} placeholder="e.g. Outside the service area — no line yet in this sitio" onChange={(e) => setNote(e.target.value)} />
          <span className="setting-note">The applicant sees this when they check their reference on the website.</span>
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || note.trim().length < 5} onClick={reject}>{busy ? "Saving…" : "Reject"}</button>
          <button className="clear-filters" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
