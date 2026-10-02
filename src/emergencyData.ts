/**
 * Incidents & Emergencies: the shapes /api/emergencies returns
 * (poseidon-api/src/emergency.ts) and helpers shared by the page and its
 * print views.
 */

export type Brgy = { id: number; name: string; zoneId: number };
export type Zone = { id: number; name: string; short: string };

export type Meta = {
  barangays: Brgy[];
  zones: Zone[];
  types: string[];
  severities: string[];
  statuses: string[];
  noticeKinds: string[];
  canApprove: boolean;
  office: { officeName: string; officeContact: string };
};

export type EmergencyEvent = {
  id: number;
  ref: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  cause: string;
  status: string;
  open: boolean;
  upcoming: boolean;
  zoneIds: number[];
  brgyIds: number[];
  systems: string[];
  areaText: string;
  affectedAccounts: number;
  startedMs: number;
  expectedEndMs: number | null;
  restoredMs: number | null;
  closedMs: number | null;
  durationHours: number | null;
  estM3Lost: number | null;
  createdMs: number;
  createdBy: string;
  reports: number;
  notices: number;
};

export type EventUpdate = { id: number; ms: number; status: string; note: string; by: string };

export type PublicNotice = {
  id: number;
  ref: string;
  eventId: number | null;
  eventRef: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  brgyIds: number[];
  areaText: string;
  areas: string[];
  startsMs: number | null;
  endsMs: number | null;
  expiresMs: number | null;
  status: string;
  createdMs: number;
  createdBy: string;
  submittedMs: number | null;
  decidedMs: number | null;
  decidedBy: string;
  rejectNote: string;
  publishedMs: number | null;
  withdrawnMs: number | null;
  pushSent: number | null;
  pushNote: string;
};

export type EventDetail = {
  event: EmergencyEvent;
  updates: EventUpdate[];
  reports: { id: number; createdMs: number; category: string; location: string; details: string; status: string }[];
  notices: PublicNotice[];
};

export const META_KEY = ["emergencies", "meta"];

export const SEVERITY_BADGE: Record<string, string> = { Advisory: "act-gray", Major: "act-orange", Critical: "act-red" };
export const EVENT_STATUS_BADGE: Record<string, string> = {
  Reported: "act-red", Confirmed: "act-orange", Responding: "act-orange", Restored: "act-green", Closed: "act-gray", Cancelled: "act-gray",
};
export const NOTICE_STATUS_BADGE: Record<string, string> = {
  Draft: "act-gray", Pending: "act-orange", Published: "act-green", Rejected: "act-red", Withdrawn: "act-gray",
};

const TZ = "Asia/Manila";
export const when = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-PH", { timeZone: TZ, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const longWhen = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-PH", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
export const hours = (h: number | null) => (h == null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);

/** epoch ms ⇄ the value of an <input type="datetime-local"> (Philippine time). */
export function toLocalInput(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms + 8 * 3_600_000);
  return d.toISOString().slice(0, 16);
}
export function fromLocalInput(v: string): number | null {
  if (!v) return null;
  const ms = Date.parse(`${v}:00+08:00`);
  return Number.isFinite(ms) ? ms : null;
}
