import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { INBOX_KEY, whenMs } from "./mobileInbox";
import type { EmergencyEvent } from "./emergencyData";

/**
 * Residents' reports — what the public reports from the mobile app: a leak
 * on the street, pipes being stolen, an illegal connection. New reports
 * raise an alert in the sidebar (see Layout.tsx); acknowledging one clears
 * it from the New tab, and resolving or dismissing it closes it. A report
 * can be attached to an emergency event (IncidentsPage.tsx) when several
 * people report the same burst main.
 */

type Incident = {
  id: number;
  createdMs: number;
  category: string;
  reporterName: string;
  contactNo: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  details: string;
  status: string;
  handledBy: string;
  handledMs: number | null;
  notes: string;
  eventId: number | null;
  eventLabel: string;
};

type Tab = "New" | "Acknowledged" | "Resolved" | "Dismissed";
const TABS: Tab[] = ["New", "Acknowledged", "Resolved", "Dismissed"];

const STATUS_BADGE: Record<string, string> = {
  New: "act-red",
  Acknowledged: "act-orange",
  Resolved: "act-green",
  Dismissed: "act-gray",
};

function mapUrl(i: Incident) {
  return `https://www.google.com/maps?q=${i.latitude},${i.longitude}`;
}

export function ResidentReports({ openEvents }: { openEvents: EmergencyEvent[] }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("New");
  const [open, setOpen] = useState<Incident | null>(null);
  const [notice, setNotice] = useState("");
  const [alertsAllowed, setAlertsAllowed] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  const { data, isLoading, error } = useQuery<{ counts: Record<string, number>; rows: Incident[] }>({
    queryKey: ["incidents", tab],
    queryFn: () => apiGet(`/api/incidents?status=${tab}`),
    refetchInterval: 30_000,
  });

  function done(message: string) {
    setNotice(message);
    setOpen(null);
    qc.invalidateQueries({ queryKey: ["incidents"] });
    qc.invalidateQueries({ queryKey: INBOX_KEY });
  }

  async function enableAlerts() {
    if (typeof Notification === "undefined") return;
    setAlertsAllowed(await Notification.requestPermission());
  }

  return (
    <>
      <p className="count" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <span>Reported by the public from the mobile app — leaks, pipe theft, illegal connections.</span>
        {alertsAllowed === "default" && (
          <button className="clear-filters" onClick={enableAlerts}>
            Enable desktop alerts
          </button>
        )}
      </p>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      <div className="stage-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "stage-tab current" : "stage-tab"} onClick={() => setTab(t)}>
            {t}
            {!!data?.counts[t] && (t === "New" || t === "Acknowledged") && (
              <span className="stage-count">{data.counts[t]}</span>
            )}
          </button>
        ))}
      </div>

      <section className="record-section">
        {isLoading && <p className="count">Loading…</p>}
        {error && <p className="form-error">{(error as Error).message}</p>}
        {data && data.rows.length === 0 && (
          <p className="count">
            {tab === "New" ? "No new reports." : `No ${tab.toLowerCase()} reports.`}
          </p>
        )}

        {data && data.rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Reported</th>
                <th>Incident</th>
                <th>Location</th>
                <th>Reported by</th>
                <th>Details</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.rows.map((i) => (
                <tr key={i.id} className="row-link" onClick={() => setOpen(i)}>
                  <td style={{ whiteSpace: "nowrap" }}>{whenMs(i.createdMs)}</td>
                  <td>
                    {i.category}
                    {i.eventLabel && <div className="muted">{i.eventLabel}</div>}
                  </td>
                  <td>
                    {i.location}
                    {i.latitude !== null && (
                      <>
                        {" "}
                        <a href={mapUrl(i)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          Map
                        </a>
                      </>
                    )}
                  </td>
                  <td>
                    {i.reporterName}
                    <div className="muted">{i.contactNo}</div>
                  </td>
                  <td className="incident-details">{i.details}</td>
                  <td>
                    <span className={`badge setting-badge ${STATUS_BADGE[i.status] ?? "act-gray"}`}>{i.status}</span>
                  </td>
                  <td>
                    <button className="primary small" onClick={(e) => { e.stopPropagation(); setOpen(i); }}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {open && <IncidentDialog incident={open} openEvents={openEvents} onClose={() => setOpen(null)} onDone={done} />}
    </>
  );
}

function IncidentDialog({
  incident: i, openEvents, onClose, onDone,
}: {
  incident: Incident;
  openEvents: EmergencyEvent[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [notes, setNotes] = useState(i.notes);
  const [eventId, setEventId] = useState(i.eventId ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function setStatus(status: string) {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/incidents/${i.id}/status`, { status, notes });
      onDone(`Report #${i.id} marked ${status.toLowerCase()}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function attach(id: number) {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/emergencies/reports/${i.id}/event`, { eventId: id });
      setEventId(id);
      onDone(id ? `Report #${i.id} attached to the event.` : `Report #${i.id} detached.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The current event stays in the list even once it has closed.
  const choices = openEvents.some((e) => e.id === eventId) || !eventId
    ? openEvents
    : [...openEvents, { id: eventId, ref: "", title: i.eventLabel } as EmergencyEvent];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {i.category} <span className="muted">· Report #{i.id}</span>
        </h2>
        <p className="modal-sub">
          Reported {whenMs(i.createdMs)} ·{" "}
          <span className={`badge setting-badge ${STATUS_BADGE[i.status] ?? "act-gray"}`}>{i.status}</span>
        </p>

        <div className="adj-facts">
          <div className="adj-fact">
            <span>Reported by</span>
            <b>{i.reporterName}</b>
          </div>
          <div className="adj-fact">
            <span>Contact number</span>
            <b>
              <a href={`tel:${i.contactNo}`}>{i.contactNo}</a>
            </b>
          </div>
          <div className="adj-fact adj-wide">
            <span>Location</span>
            <b>{i.location}</b>
          </div>
          {i.latitude !== null && (
            <div className="adj-fact adj-wide">
              <span>Phone's GPS location</span>
              <b>
                <a href={mapUrl(i)} target="_blank" rel="noreferrer">
                  {i.latitude.toFixed(5)}, {i.longitude?.toFixed(5)} — open in Google Maps
                </a>
                {/* <small>, not <span>: .adj-fact span is styled as the field label. */}
                {i.accuracyM !== null && <small className="muted"> (within about {i.accuracyM} m)</small>}
              </b>
            </div>
          )}
        </div>

        <div className="incident-body">{i.details}</div>

        {i.handledBy && (
          <p className="count">
            Last updated by {i.handledBy} {whenMs(i.handledMs)}.
          </p>
        )}

        <label className="field-input" style={{ margin: "12px 0 0" }} title="Several reports about the same problem can be gathered under one event">
          <span>Part of an emergency event</span>
          <select value={eventId} disabled={busy} onChange={(e) => attach(Number(e.target.value))}>
            <option value={0}>— not attached —</option>
            {choices.map((e) => (
              <option key={e.id} value={e.id}>{e.ref ? `${e.ref} · ${e.title}` : e.title}</option>
            ))}
          </select>
        </label>

        <label className="field-input" style={{ margin: "12px 0" }}>
          <span>Office notes (internal)</span>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Crew sent, leak repaired on Sep 30"
          />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          {i.status === "New" && (
            <button className="primary" disabled={busy} onClick={() => setStatus("Acknowledged")}>
              Acknowledge
            </button>
          )}
          {i.status !== "Resolved" && (
            <button className={i.status === "New" ? "clear-filters" : "primary"} disabled={busy} onClick={() => setStatus("Resolved")}>
              Mark resolved
            </button>
          )}
          {i.status !== "Dismissed" && i.status !== "Resolved" && (
            <button className="danger" disabled={busy} onClick={() => setStatus("Dismissed")}>
              Dismiss
            </button>
          )}
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
