import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./api";
import { ResidentReports } from "./IncidentReportsPage";
import { INBOX_KEY } from "./mobileInbox";
import {
  EVENT_STATUS_BADGE, META_KEY, NOTICE_STATUS_BADGE, SEVERITY_BADGE,
  fromLocalInput, hours, toLocalInput, when,
  type EmergencyEvent, type EventDetail, type Meta, type PublicNotice,
} from "./emergencyData";

/**
 * Incidents & Emergencies — events that affect service (interruptions,
 * burst mains, contamination), the public notices about them, and what
 * residents report from the mobile app. The rules are in
 * poseidon-api/src/emergency.ts.
 */

const TABS = ["Events", "Public notices", "Residents' reports"] as const;
type Tab = (typeof TABS)[number];

export default function IncidentsPage() {
  const [tab, setTab] = useState<Tab>("Events");
  const [notice, setNotice] = useState("");
  const { data: meta } = useQuery<Meta>({ queryKey: META_KEY, queryFn: () => apiGet("/api/emergencies/meta") });
  const { data: counts } = useQuery<{ openEvents: number; pendingNotices: number | null }>({
    queryKey: ["emergencies", "counts"],
    queryFn: () => apiGet("/api/emergencies/counts"),
    refetchInterval: 30_000,
  });
  const { data: open } = useQuery<{ events: EmergencyEvent[] }>({
    queryKey: ["emergencies", "events", "open"],
    queryFn: () => apiGet("/api/emergencies/events?status=open"),
  });

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Incidents &amp; Emergencies</h1>
          <p className="account-no">
            Service interruptions, major leaks and water quality events — with the public notices that go to the mobile app and website.
          </p>
        </div>
        <div className="detail-head-right">
          <button className="clear-filters" onClick={() => window.open("/incidents/report/print", "_blank")}>Interruption report</button>
        </div>
      </div>

      {notice && <div className="action-notice" onAnimationEnd={() => setNotice("")}>{notice}</div>}

      <div className="stage-tabs">
        {TABS.map((t) => {
          const n = t === "Events" ? counts?.openEvents : t === "Public notices" ? counts?.pendingNotices : 0;
          return (
            <button key={t} className={tab === t ? "stage-tab current" : "stage-tab"} onClick={() => setTab(t)}>
              {t}
              {!!n && <span className="stage-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {tab === "Events" && meta && <EventsTab meta={meta} onNotice={setNotice} />}
      {tab === "Public notices" && meta && <NoticesTab meta={meta} onNotice={setNotice} />}
      {tab === "Residents' reports" && <ResidentReports openEvents={open?.events ?? []} />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["emergencies"] });
    qc.invalidateQueries({ queryKey: ["incidents"] });
    qc.invalidateQueries({ queryKey: INBOX_KEY });
  };
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function EventsTab({ meta, onNotice }: { meta: Meta; onNotice: (s: string) => void }) {
  const [which, setWhich] = useState<"open" | "closed" | "all">("open");
  const [editing, setEditing] = useState<EmergencyEvent | "new" | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery<{ events: EmergencyEvent[] }>({
    queryKey: ["emergencies", "events", which],
    queryFn: () => apiGet(`/api/emergencies/events?status=${which}`),
    refetchInterval: 60_000,
  });
  const events = data?.events ?? [];

  return (
    <section className="record-section">
      <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end" }}>
        <label className="field-input" style={{ margin: 0 }}>
          <span>Show</span>
          <select value={which} onChange={(e) => setWhich(e.target.value as typeof which)}>
            <option value="open">Ongoing</option>
            <option value="closed">Restored, closed &amp; cancelled</option>
            <option value="all">Everything</option>
          </select>
        </label>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => setEditing("new")}>+ Log an event</button>
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && !events.length && <p className="count">{which === "open" ? "Nothing ongoing." : "No events."}</p>}

      {events.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Areas</th>
              <th>Started</th>
              <th className="n">Duration</th>
              <th className="n">Accounts</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="row-link" onClick={() => setOpenId(e.id)}>
                <td>
                  <b>{e.title}</b>
                  <div className="muted">
                    {e.ref} · {e.type} · <span className={`badge setting-badge ${SEVERITY_BADGE[e.severity] ?? "act-gray"}`}>{e.severity}</span>
                  </div>
                </td>
                <td>
                  {e.areaText}
                  {e.systems.length > 0 && <div className="muted">{e.systems.join(", ")}</div>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {when(e.startedMs)}
                  {e.expectedEndMs && e.open && <div className="muted">until ~{when(e.expectedEndMs)}</div>}
                </td>
                <td className="n">{e.upcoming ? <span className="muted">scheduled</span> : hours(e.durationHours)}</td>
                <td className="n">{e.affectedAccounts.toLocaleString("en-PH")}</td>
                <td>
                  <span className={`badge setting-badge ${EVENT_STATUS_BADGE[e.status] ?? "act-gray"}`}>{e.status}</span>
                  {(e.reports > 0 || e.notices > 0) && (
                    <div className="muted">{[e.reports && `${e.reports} report(s)`, e.notices && `${e.notices} notice(s)`].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <EventForm
          meta={meta}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id, msg) => { setEditing(null); onNotice(msg); setOpenId(id); }}
        />
      )}
      {openId && !editing && (
        <EventPanel
          meta={meta}
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(e) => setEditing(e)}
          onNotice={onNotice}
        />
      )}
    </section>
  );
}

/** Water systems and barangays to pick from; picking a system takes all its barangays. */
function AreaPicker({ meta, zoneIds, brgyIds, onChange }: {
  meta: Meta; zoneIds: number[]; brgyIds: number[]; onChange: (zoneIds: number[], brgyIds: number[]) => void;
}) {
  const fromZones = new Set(meta.barangays.filter((b) => zoneIds.includes(b.zoneId)).map((b) => b.id));
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const usedZones = meta.zones.filter((z) => meta.barangays.some((b) => b.zoneId === z.id));
  return (
    <div className="field-input">
      <span>Affected area</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", margin: "4px 0 8px" }}>
        {usedZones.map((z) => (
          <label key={z.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={zoneIds.includes(z.id)} onChange={() => onChange(toggle(zoneIds, z.id), brgyIds)} />
            <b>{z.name}</b>
          </label>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {meta.barangays.map((b) => (
          <label key={b.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }} className={fromZones.has(b.id) ? "muted" : ""}>
            <input
              type="checkbox"
              checked={fromZones.has(b.id) || brgyIds.includes(b.id)}
              disabled={fromZones.has(b.id)}
              onChange={() => onChange(zoneIds, toggle(brgyIds, b.id))}
            />
            {b.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function EventForm({ meta, event, onClose, onSaved }: {
  meta: Meta; event: EmergencyEvent | null; onClose: () => void; onSaved: (id: number, msg: string) => void;
}) {
  const refresh = useRefresh();
  const [f, setF] = useState(() => ({
    type: event?.type ?? meta.types[1]!,
    severity: event?.severity ?? "Major",
    title: event?.title ?? "",
    cause: event?.cause ?? "",
    description: event?.description ?? "",
    // A system's barangays come back expanded; show them as the system again.
    zoneIds: event?.zoneIds ?? [],
    brgyIds: event ? event.brgyIds.filter((b) => !meta.barangays.some((x) => x.id === b && (event.zoneIds ?? []).includes(x.zoneId))) : [],
    wholeArea: !!event && !event.brgyIds.length,
    started: toLocalInput(event?.startedMs ?? Date.now()),
    expectedEnd: toLocalInput(event?.expectedEndMs ?? null),
    estM3Lost: event?.estM3Lost != null ? String(event.estM3Lost) : "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const scheduled = f.type === "Scheduled interruption";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = {
        type: f.type, severity: f.severity, title: f.title, cause: f.cause, description: f.description,
        zoneIds: f.wholeArea ? [] : f.zoneIds, brgyIds: f.wholeArea ? [] : f.brgyIds, wholeArea: f.wholeArea,
        startedMs: fromLocalInput(f.started), expectedEndMs: fromLocalInput(f.expectedEnd),
        estM3Lost: f.estM3Lost, status: scheduled ? "Confirmed" : "Reported",
      };
      if (event) {
        await apiPut(`/api/emergencies/events/${event.id}`, body);
        refresh();
        onSaved(event.id, "Event saved.");
      } else {
        const r = await apiPost<{ id: number }>("/api/emergencies/events", body);
        refresh();
        onSaved(r.id, "Event logged. Draft a public notice from it when you're ready.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{event ? `Edit ${event.ref}` : "Log an event"}</h2>
        <div className="form-grid">
          <label className="field-input">
            <span>What happened</span>
            <select value={f.type} onChange={(e) => set({ type: e.target.value, severity: e.target.value === "Water quality / contamination" ? "Critical" : f.severity })}>
              {meta.types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="field-input">
            <span>Severity</span>
            <select value={f.severity} onChange={(e) => set({ severity: e.target.value })}>
              {meta.severities.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field-input" style={{ gridColumn: "1 / -1" }}>
            <span>Short title</span>
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Burst 4-inch main along the national highway" />
          </label>
          <label className="field-input" style={{ gridColumn: "1 / -1" }}>
            <span>Cause / reason (goes into the public notice)</span>
            <input value={f.cause} onChange={(e) => set({ cause: e.target.value })} placeholder="e.g. Repair of a burst main line near the public market" />
          </label>
          <label className="field-input">
            <span>{scheduled ? "Scheduled start" : "Started"}</span>
            <input type="datetime-local" value={f.started} onChange={(e) => set({ started: e.target.value })} />
          </label>
          <label className="field-input">
            <span>{scheduled ? "Scheduled end" : "Expected restoration (optional)"}</span>
            <input type="datetime-local" value={f.expectedEnd} onChange={(e) => set({ expectedEnd: e.target.value })} />
          </label>
        </div>

        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: "6px 0" }}>
          <input type="checkbox" checked={f.wholeArea} onChange={(e) => set({ wholeArea: e.target.checked })} />
          The whole service area
        </label>
        {!f.wholeArea && (
          <AreaPicker meta={meta} zoneIds={f.zoneIds} brgyIds={f.brgyIds} onChange={(zoneIds, brgyIds) => set({ zoneIds, brgyIds })} />
        )}

        <div className="form-grid">
          <label className="field-input" style={{ gridColumn: "1 / -1" }}>
            <span>Details (internal)</span>
            <textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="What was found, where exactly, who reported it" />
          </label>
          <label className="field-input" title="Your best estimate of water lost — e.g. flow × hours for a burst main">
            <span>Estimated water lost (m³, optional)</span>
            <input type="number" min={0} value={f.estM3Lost} onChange={(e) => set({ estM3Lost: e.target.value })} />
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="clear-filters" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : event ? "Save" : "Log event"}</button>
        </div>
      </div>
    </div>
  );
}

function EventPanel({ meta, id, onClose, onEdit, onNotice }: {
  meta: Meta; id: number; onClose: () => void; onEdit: (e: EmergencyEvent) => void; onNotice: (s: string) => void;
}) {
  const refresh = useRefresh();
  const { data, error } = useQuery<EventDetail>({
    queryKey: ["emergencies", "event", id],
    queryFn: () => apiGet(`/api/emergencies/events/${id}`),
  });
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [drafting, setDrafting] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<PublicNotice | null>(null);

  async function addUpdate() {
    setBusy(true);
    setErr("");
    try {
      await apiPost(`/api/emergencies/events/${id}/updates`, { status, note, atMs: fromLocalInput(at) });
      setStatus("");
      setNote("");
      setAt("");
      refresh();
      onNotice(status ? `Event marked ${status.toLowerCase()}.` : "Update added.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const e = data?.event;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(x) => x.stopPropagation()} style={{ maxWidth: 980 }}>
        {error && <div className="form-error">{(error as Error).message}</div>}
        {!e && !error && <p className="count">Loading…</p>}
        {e && (
          <>
            <h2 className="modal-title">
              {e.title} <span className="muted">· {e.ref}</span>
            </h2>
            <p className="modal-sub">
              {e.type} · <span className={`badge setting-badge ${SEVERITY_BADGE[e.severity] ?? "act-gray"}`}>{e.severity}</span>{" "}
              · <span className={`badge setting-badge ${EVENT_STATUS_BADGE[e.status] ?? "act-gray"}`}>{e.status}</span>
            </p>

            <div className="adj-facts">
              <div className="adj-fact adj-wide"><span>Affected area</span><b>{e.areaText}{e.systems.length ? ` (${e.systems.join(", ")})` : ""}</b></div>
              <div className="adj-fact"><span>Active accounts affected</span><b>{e.affectedAccounts.toLocaleString("en-PH")}</b></div>
              <div className="adj-fact"><span>{e.type === "Scheduled interruption" ? "Scheduled" : "Started"}</span><b>{when(e.startedMs)}</b></div>
              <div className="adj-fact"><span>{e.restoredMs ? "Restored" : "Expected end"}</span><b>{when(e.restoredMs ?? e.expectedEndMs)}</b></div>
              <div className="adj-fact"><span>Duration</span><b>{e.upcoming ? "not started" : hours(e.durationHours)}</b></div>
              {e.estM3Lost != null && <div className="adj-fact"><span>Est. water lost</span><b>{Math.round(e.estM3Lost).toLocaleString("en-PH")} m³</b></div>}
              {e.cause && <div className="adj-fact adj-wide"><span>Cause</span><b>{e.cause}</b></div>}
            </div>
            {e.description && <div className="incident-body">{e.description}</div>}

            <h3 style={{ margin: "16px 0 6px" }}>Timeline</h3>
            <table>
              <tbody>
                {data!.updates.map((u) => (
                  <tr key={u.id}>
                    <td style={{ whiteSpace: "nowrap", width: 170 }}>{when(u.ms)}</td>
                    <td style={{ width: 110 }}>{u.status && <span className={`badge setting-badge ${EVENT_STATUS_BADGE[u.status] ?? "act-gray"}`}>{u.status}</span>}</td>
                    <td>{u.note}</td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>{u.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="form-actions" style={{ alignItems: "flex-end" }}>
              <label className="field-input" style={{ margin: 0 }}>
                <span>Status</span>
                <select value={status} onChange={(x) => setStatus(x.target.value)}>
                  <option value="">— no change —</option>
                  {meta.statuses.filter((s) => s !== e.status).map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="field-input" style={{ margin: 0, flex: 1 }}>
                <span>Note</span>
                <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="e.g. Crew dispatched with a 4-inch clamp" />
              </label>
              <label className="field-input" style={{ margin: 0 }} title="Leave blank for now">
                <span>When (optional)</span>
                <input type="datetime-local" value={at} onChange={(x) => setAt(x.target.value)} />
              </label>
              <button className="primary" disabled={busy || (!status && !note.trim())} onClick={addUpdate}>Add</button>
            </div>
            {err && <div className="form-error">{err}</div>}

            <h3 style={{ margin: "16px 0 6px" }}>Public notices</h3>
            {data!.notices.length > 0 && (
              <table>
                <tbody>
                  {data!.notices.map((n) => (
                    <tr key={n.id} className="row-link" onClick={() => setOpenNotice(n)}>
                      <td>{n.ref}</td>
                      <td>{n.title}</td>
                      <td><span className={`badge setting-badge ${NOTICE_STATUS_BADGE[n.status] ?? "act-gray"}`}>{n.status}</span></td>
                      <td className="muted">{n.publishedMs ? `published ${when(n.publishedMs)}` : `drafted ${when(n.createdMs)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="form-actions" style={{ marginTop: 6 }}>
              <span className="count">Draft a notice:</span>
              {["Interruption", "Boil-water advisory", "Service restored", "Advisory"].map((k) => (
                <button key={k} className="clear-filters" onClick={() => setDrafting(k)}>{k}</button>
              ))}
            </div>

            {data!.reports.length > 0 && (
              <>
                <h3 style={{ margin: "16px 0 6px" }}>Residents' reports</h3>
                <table>
                  <tbody>
                    {data!.reports.map((r) => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: "nowrap" }}>#{r.id} · {when(r.createdMs)}</td>
                        <td>{r.category}</td>
                        <td>{r.location}</td>
                        <td className="incident-details">{r.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <div className="form-actions">
              <button className="clear-filters" onClick={() => onEdit(e)}>Edit event</button>
              <span style={{ flex: 1 }} />
              <button className="clear-filters" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>

      {drafting && (
        <NoticeEditor meta={meta} draftKind={drafting} eventId={id} onClose={() => setDrafting(null)} onDone={(m) => { setDrafting(null); onNotice(m); }} />
      )}
      {openNotice && <NoticeEditor meta={meta} notice={openNotice} onClose={() => setOpenNotice(null)} onDone={(m) => { setOpenNotice(null); onNotice(m); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notices                                                             */
/* ------------------------------------------------------------------ */

const NOTICE_FILTERS = [
  ["Live", "Live now"],
  ["Pending", "Waiting for approval"],
  ["Draft", "Drafts"],
  ["Rejected", "Sent back"],
  ["Published", "All published"],
  ["Withdrawn", "Withdrawn"],
  ["", "Everything"],
] as const;

function NoticesTab({ meta, onNotice }: { meta: Meta; onNotice: (s: string) => void }) {
  const [status, setStatus] = useState<string>(meta.canApprove ? "Pending" : "Live");
  const [open, setOpen] = useState<PublicNotice | "new" | null>(null);
  const { data, isLoading } = useQuery<{ notices: PublicNotice[]; counts: Record<string, number> }>({
    queryKey: ["emergencies", "notices", status],
    queryFn: () => apiGet(`/api/emergencies/notices?status=${status}`),
    refetchInterval: 30_000,
  });
  const notices = data?.notices ?? [];

  return (
    <section className="record-section">
      <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end" }}>
        <label className="field-input" style={{ margin: 0 }}>
          <span>Show</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {NOTICE_FILTERS.map(([v, l]) => (
              <option key={v} value={v}>{l}{v && v !== "Live" && data?.counts[v] ? ` (${data.counts[v]})` : ""}</option>
            ))}
          </select>
        </label>
        <span style={{ flex: 1 }} />
        <button className="primary" onClick={() => setOpen("new")}>+ New notice</button>
      </div>
      <p className="count" style={{ marginTop: 0 }}>
        Published notices show in the mobile app and on the website feed, and phones with accounts in the affected barangays get a notification.
        {meta.canApprove ? " You can approve and publish." : " An approver publishes them."}
      </p>

      {isLoading && <p className="count">Loading…</p>}
      {data && !notices.length && <p className="count">None.</p>}
      {notices.length > 0 && (
        <table>
          <thead>
            <tr><th>Notice</th><th>Areas</th><th>Status</th><th>When</th><th className="n">Phones notified</th></tr>
          </thead>
          <tbody>
            {notices.map((n) => (
              <tr key={n.id} className="row-link" onClick={() => setOpen(n)}>
                <td>
                  <b>{n.title}</b>
                  <div className="muted">
                    {n.ref} · {n.kind}{n.eventRef ? ` · ${n.eventRef}` : ""} · <span className={`badge setting-badge ${SEVERITY_BADGE[n.severity] ?? "act-gray"}`}>{n.severity}</span>
                  </div>
                </td>
                <td>{n.areaText}</td>
                <td><span className={`badge setting-badge ${NOTICE_STATUS_BADGE[n.status] ?? "act-gray"}`}>{n.status}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {n.publishedMs ? when(n.publishedMs) : n.submittedMs ? `sent ${when(n.submittedMs)}` : when(n.createdMs)}
                  <div className="muted">{n.publishedMs ? `by ${n.decidedBy}` : n.createdBy}</div>
                </td>
                <td className="n">{n.pushSent ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <NoticeEditor
          meta={meta}
          notice={open === "new" ? undefined : open}
          draftKind={open === "new" ? "Announcement" : undefined}
          onClose={() => setOpen(null)}
          onDone={(m) => { setOpen(null); onNotice(m); }}
        />
      )}
    </section>
  );
}

type Template = { kind: string; eventId: number | null; severity: string; title: string; body: string; brgyIds: number[]; startsMs: number | null; endsMs: number | null };

/** Write, edit, send for approval, approve, send back, withdraw or print one notice. */
function NoticeEditor({ meta, notice, draftKind, eventId, onClose, onDone }: {
  meta: Meta; notice?: PublicNotice; draftKind?: string; eventId?: number; onClose: () => void; onDone: (msg: string) => void;
}) {
  const refresh = useRefresh();
  // A new notice starts from the server's template (filled from the event).
  const { data: tpl } = useQuery<Template>({
    queryKey: ["emergencies", "template", draftKind, eventId ?? 0],
    queryFn: () => apiGet(`/api/emergencies/template?kind=${encodeURIComponent(draftKind!)}&eventId=${eventId ?? 0}`),
    enabled: !notice && !!draftKind,
    staleTime: Infinity,
  });
  const source = notice ?? tpl;
  if (!source) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}><p className="count">Preparing the notice…</p></div>
      </div>
    );
  }
  return <NoticeForm key={notice?.id ?? "new"} meta={meta} notice={notice} source={source} onClose={onClose} onDone={(m) => { refresh(); onDone(m); }} />;
}

function NoticeForm({ meta, notice, source, onClose, onDone }: {
  meta: Meta; notice?: PublicNotice; source: Template | PublicNotice; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [f, setF] = useState(() => ({
    kind: source.kind,
    severity: source.severity,
    title: source.title,
    body: source.body,
    brgyIds: source.brgyIds,
    wholeArea: !source.brgyIds.length,
    starts: toLocalInput(source.startsMs),
    ends: toLocalInput(source.endsMs),
    expires: toLocalInput(notice?.expiresMs ?? null),
  }));
  const [rejectNote, setRejectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const editable = !notice || ["Draft", "Rejected", "Pending"].includes(notice.status);
  const eventId = notice ? notice.eventId : (source as Template).eventId;

  const body = () => ({
    eventId, kind: f.kind, severity: f.severity, title: f.title, body: f.body,
    brgyIds: f.wholeArea ? [] : f.brgyIds,
    startsMs: fromLocalInput(f.starts), endsMs: fromLocalInput(f.ends), expiresMs: fromLocalInput(f.expires),
  });

  /** Save first (a new or edited notice), then run the action on it. */
  async function run(action: "save" | "submit" | "approve" | "reject" | "withdraw" | "push") {
    setBusy(true);
    setError("");
    try {
      let id = notice?.id;
      if (editable && action !== "reject") {
        if (id) await apiPut(`/api/emergencies/notices/${id}`, body());
        else id = (await apiPost<{ id: number }>("/api/emergencies/notices", body())).id;
      }
      if (action === "submit") await apiPost(`/api/emergencies/notices/${id}/submit`, {});
      if (action === "approve") await apiPost(`/api/emergencies/notices/${id}/approve`, {});
      if (action === "reject") await apiPost(`/api/emergencies/notices/${id}/reject`, { note: rejectNote });
      if (action === "withdraw") await apiPost(`/api/emergencies/notices/${id}/withdraw`, {});
      if (action === "push") await apiPost(`/api/emergencies/notices/${id}/push`, {});
      onDone({
        save: "Draft saved.",
        submit: "Sent for approval.",
        approve: "Published — it's in the app and on the website, and notifications are going out.",
        reject: "Sent back with your note.",
        withdraw: "Withdrawn — it no longer shows in the app or on the website.",
        push: "Notifications are being sent again.",
      }[action]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 920 }}>
        <h2 className="modal-title">
          {notice ? notice.ref : "New public notice"}
          {notice && <> <span className={`badge setting-badge ${NOTICE_STATUS_BADGE[notice.status] ?? "act-gray"}`}>{notice.status}</span></>}
        </h2>
        {notice?.status === "Rejected" && notice.rejectNote && (
          <div className="info-banner">Sent back by {notice.decidedBy}: {notice.rejectNote}</div>
        )}
        {notice?.status === "Published" && (
          <p className="modal-sub">
            Published {when(notice.publishedMs)} by {notice.decidedBy} · {notice.pushSent != null ? `${notice.pushSent} phone(s) notified` : ""}
            {notice.pushNote ? ` · ${notice.pushNote}` : ""}
            {notice.expiresMs ? ` · comes down ${when(notice.expiresMs)}` : ""}
          </p>
        )}

        <div className="form-grid">
          <label className="field-input">
            <span>Kind</span>
            <select value={f.kind} disabled={!editable} onChange={(e) => set({ kind: e.target.value })}>
              {meta.noticeKinds.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
          <label className="field-input">
            <span>Severity</span>
            <select value={f.severity} disabled={!editable} onChange={(e) => set({ severity: e.target.value })}>
              {meta.severities.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="field-input" style={{ gridColumn: "1 / -1" }}>
            <span>Title</span>
            <input value={f.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field-input" style={{ gridColumn: "1 / -1" }}>
            <span>Message (the first line is what shows in the notification)</span>
            <textarea rows={11} value={f.body} disabled={!editable} onChange={(e) => set({ body: e.target.value })} />
          </label>
          <label className="field-input">
            <span>Schedule from (optional)</span>
            <input type="datetime-local" value={f.starts} disabled={!editable} onChange={(e) => set({ starts: e.target.value })} />
          </label>
          <label className="field-input">
            <span>Schedule until (optional)</span>
            <input type="datetime-local" value={f.ends} disabled={!editable} onChange={(e) => set({ ends: e.target.value })} />
          </label>
          <label className="field-input" title="When it stops showing. Blank: a day after the schedule ends, or until withdrawn">
            <span>Take down on (optional)</span>
            <input type="datetime-local" value={f.expires} disabled={!editable} onChange={(e) => set({ expires: e.target.value })} />
          </label>
        </div>

        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: "6px 0" }}>
          <input type="checkbox" checked={f.wholeArea} disabled={!editable} onChange={(e) => set({ wholeArea: e.target.checked })} />
          The whole service area
        </label>
        {!f.wholeArea && editable && (
          <AreaPicker
            meta={meta}
            zoneIds={[]}
            brgyIds={f.brgyIds}
            // A notice keeps barangays only: ticking a system ticks its barangays.
            onChange={(z, brgyIds) => set({ brgyIds: [...new Set([...brgyIds, ...meta.barangays.filter((b) => z.includes(b.zoneId)).map((b) => b.id)])] })}
          />
        )}
        {!f.wholeArea && !editable && <p className="count">Areas: {notice?.areaText}</p>}

        {meta.canApprove && notice?.status === "Pending" && (
          <label className="field-input" style={{ marginTop: 8 }}>
            <span>To send it back, say what needs changing</span>
            <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="e.g. Add the Tagalog version" />
          </label>
        )}

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          {notice && <button className="clear-filters" onClick={() => window.open(`/incidents/notices/${notice.id}/print`, "_blank")}>Print / poster</button>}
          <span style={{ flex: 1 }} />
          <button className="clear-filters" onClick={onClose} disabled={busy}>Close</button>
          {editable && <button className="clear-filters" disabled={busy} onClick={() => run("save")}>Save draft</button>}
          {editable && notice?.status !== "Pending" && <button className="clear-filters" disabled={busy} onClick={() => run("submit")}>Send for approval</button>}
          {meta.canApprove && notice?.status === "Pending" && (
            <button className="danger" disabled={busy || !rejectNote.trim()} onClick={() => run("reject")}>Send back</button>
          )}
          {meta.canApprove && editable && (
            <button className="primary" disabled={busy} onClick={() => run("approve")}>{notice?.status === "Pending" ? "Approve & publish" : "Publish now"}</button>
          )}
          {meta.canApprove && notice?.status === "Published" && (
            <>
              <button className="clear-filters" disabled={busy} onClick={() => run("push")}>Notify phones again</button>
              <button className="danger" disabled={busy} onClick={() => run("withdraw")}>Withdraw</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
