import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "./api";

/**
 * Settings → Office hours and closures: when residents can come to the
 * office, the days it's closed (holidays, office events), its email and
 * where it is on the map — shown in the residents' app (poseidon-api
 * officeSchedule.ts). Closures that are over drop off the app by themselves.
 */

type Hours = { day: number; open: string; close: string };
type Closure = { date: string; until: string | null; reason: string };
type Schedule = { hours: Hours[]; closures: Closure[]; email: string; location: { lat: number; lng: number } | null; note: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const longDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export default function OfficeSchedulePanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ schedule: Schedule; today: string }>({
    queryKey: ["office-schedule"],
    queryFn: () => apiGet("/api/settings/office-schedule"),
  });
  const [s, setS] = useState<Schedule | null>(null);
  const [where, setWhere] = useState("");
  const [add, setAdd] = useState<Closure>({ date: "", until: null, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setS(data.schedule);
    setWhere(data.schedule.location ? `${data.schedule.location.lat}, ${data.schedule.location.lng}` : "");
  }, [data]);

  if (isLoading || !s) {
    return (
      <section className="record-section settings-panel">
        <p className="count">Loading…</p>
      </section>
    );
  }
  const today = data?.today ?? "";
  const change = (next: Partial<Schedule>) => {
    setS({ ...s, ...next });
    setSaved(false);
  };
  const dayHours = (day: number) => s.hours.find((h) => h.day === day);
  const setDay = (day: number, h: Hours | null) =>
    change({ hours: [...s.hours.filter((x) => x.day !== day), ...(h ? [h] : [])].sort((a, b) => a.day - b.day) });

  function addClosure() {
    if (!add.date || !add.reason.trim()) return;
    change({ closures: [...s.closures, { ...add, reason: add.reason.trim() }].sort((a, b) => a.date.localeCompare(b.date)) });
    setAdd({ date: "", until: null, reason: "" });
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      let location: Schedule["location"] = null;
      if (where.trim()) {
        const [lat, lng] = where.split(/[,\s]+/).filter(Boolean).map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Give the location as latitude, longitude — e.g. 8.7912, 117.4805");
        location = { lat: lat!, lng: lng! };
      }
      const r = await apiPut<{ schedule: Schedule }>("/api/settings/office-schedule", { ...s, location });
      setS(r.schedule);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["office-schedule"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Office hours and closures</h2>
        <button className="clear-filters" onClick={onClose}>Close</button>
      </div>
      <p className="count">
        Shown in the residents&apos; app: whether the office is open now, its usual hours, the days it&apos;s closed, and
        how to reach it. Add holidays and other closed days ahead of time — a closure shows on the app&apos;s home screen
        on the day, and in the office&apos;s list before that.
      </p>

      <h3 className="field-label" style={{ marginTop: 14 }}>Usual hours</h3>
      <table className="data-table" style={{ maxWidth: 560 }}>
        <tbody>
          {DAYS.map((name, day) => {
            const h = dayHours(day);
            return (
              <tr key={day}>
                <td style={{ width: 130 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input type="checkbox" checked={!!h} onChange={(e) => setDay(day, e.target.checked ? { day, open: "08:00", close: "17:00" } : null)} />
                    {name}
                  </label>
                </td>
                <td>
                  {h ? (
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="time" value={h.open} onChange={(e) => setDay(day, { ...h, open: e.target.value })} />
                      to
                      <input type="time" value={h.close} onChange={(e) => setDay(day, { ...h, close: e.target.value })} />
                    </span>
                  ) : (
                    <span className="muted">Closed</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="field-input" style={{ maxWidth: 560, marginTop: 10 }}>
        <span>Note for residents (optional)</span>
        <input value={s.note} maxLength={200} placeholder="e.g. The cashier stops accepting payments at 4:00 PM." onChange={(e) => change({ note: e.target.value })} />
      </label>

      <h3 className="field-label" style={{ marginTop: 18 }}>Closed days</h3>
      <table className="data-table" style={{ maxWidth: 720 }}>
        <thead>
          <tr><th>Date</th><th>Reason residents see</th><th /></tr>
        </thead>
        <tbody>
          {s.closures.map((c, i) => {
            const over = (c.until ?? c.date) < today;
            return (
              <tr key={`${c.date}-${i}`} style={over ? { opacity: 0.5 } : undefined}>
                <td>{longDate(c.date)}{c.until ? ` to ${longDate(c.until)}` : ""}{over ? <span className="muted"> · over</span> : null}</td>
                <td>{c.reason}</td>
                <td>
                  <button className="clear-filters" onClick={() => change({ closures: s.closures.filter((_, j) => j !== i) })}>Remove</button>
                </td>
              </tr>
            );
          })}
          {!s.closures.length && (
            <tr><td colSpan={3} className="muted">No closed days set.</td></tr>
          )}
          <tr>
            <td>
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} />
                <span className="muted">to</span>
                <input type="date" value={add.until ?? ""} min={add.date || undefined} onChange={(e) => setAdd({ ...add, until: e.target.value || null })} title="Leave empty for a single day" />
              </span>
            </td>
            <td>
              <input value={add.reason} maxLength={80} placeholder="e.g. All Saints' Day" onChange={(e) => setAdd({ ...add, reason: e.target.value })} style={{ width: "100%" }} />
            </td>
            <td>
              <button className="primary small" disabled={!add.date || !add.reason.trim()} onClick={addClosure}>Add</button>
            </td>
          </tr>
        </tbody>
      </table>

      <h3 className="field-label" style={{ marginTop: 18 }}>Reaching the office</h3>
      <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
        <label className="field-input">
          <span>Email (optional)</span>
          <input type="email" value={s.email} maxLength={120} placeholder="e.g. rizalwaterworks2026@gmail.com" onChange={(e) => change({ email: e.target.value })} />
        </label>
        <label className="field-input">
          <span>Location on the map (optional)</span>
          <input
            value={where}
            placeholder="latitude, longitude — e.g. 8.7912, 117.4805"
            onChange={(e) => {
              setWhere(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <p className="count" style={{ margin: 0 }}>
          In Google Maps, right-click the office and click the numbers at the top of the menu to copy them, then paste
          here. The app&apos;s &ldquo;Get directions&rdquo; opens this spot.
          {where.trim() && (
            <>
              {" "}
              <a href={`https://www.google.com/maps?q=${encodeURIComponent(where.trim())}`} target="_blank" rel="noreferrer">Check it on the map</a>
            </>
          )}
        </p>
        <p className="count" style={{ margin: 0 }}>The phone number and address come from Municipal profile.</p>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : saved ? "Saved" : "Save"}</button>
      </div>
    </section>
  );
}
