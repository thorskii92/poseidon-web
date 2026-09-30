import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "./api";

/**
 * The IT Dashboard's Security panel, from poseidon-api's securityMonitor.ts:
 * how safely this PC is set up, and what has been tried against it —
 * wrong passwords and lockouts, scanners probing for weak spots, bursts of
 * refused requests, logins from the internet, and user account changes.
 */

type Level = "ok" | "info" | "warn" | "fail";
type PostureCheck = { id: string; label: string; level: Level; detail: string };
type SecEvent = {
  id: number; at: number; kind: string; severity: "info" | "warn" | "alert";
  username: string | null; address: string | null; via: "office" | "internet" | null; path: string | null; detail: string;
};
type Security = {
  posture: PostureCheck[];
  counts: Record<string, number>;
  topAddresses: { address: string; events: number; scans: number; logins: number; last: number }[];
  daily: { date: string; logins: number; scans: number }[];
  recent: SecEvent[];
};

const LEVEL_TEXT: Record<Level, string> = { ok: "OK", warn: "Attention", fail: "Danger", info: "Info" };

const KIND: Record<string, string> = {
  "login-failed": "Wrong password",
  "login-locked": "Locked out",
  "login-ok": "Signed in from the internet",
  probe: "Scanner probe",
  "refused-burst": "Burst of refused requests",
  "user-change": "User account change",
};

const SEVERITY: Record<SecEvent["severity"], string> = { info: "it-info", warn: "it-warn", alert: "it-fail" };

type Filter = "all" | "logins" | "scans" | "users";
const FILTERS: { id: Filter; label: string; kinds: string[] | null }[] = [
  { id: "all", label: "All", kinds: null },
  { id: "logins", label: "Logins", kinds: ["login-failed", "login-locked", "login-ok"] },
  { id: "scans", label: "Scans", kinds: ["probe", "refused-burst"] },
  { id: "users", label: "Account changes", kinds: ["user-change"] },
];

function when(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  return new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Stat({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      <div className="dash-kpi-sub">{sub}</div>
    </div>
  );
}

export default function ITSecurityPanel() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error } = useQuery<Security>({
    queryKey: ["it-security"],
    queryFn: () => apiGet("/api/it/security"),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  if (error) {
    return (
      <section className="record-section">
        <div className="record-head"><h2>Security</h2></div>
        <p className="count">Could not load the security status.</p>
      </section>
    );
  }
  if (!data) return null;

  const c = (k: string) => data.counts[k] ?? 0;
  const kinds = FILTERS.find((f) => f.id === filter)!.kinds;
  const events = kinds ? data.recent.filter((e) => kinds.includes(e.kind)) : data.recent;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Security</h2>
        <span className="count">last 24 hours · events kept 180 days</span>
      </div>

      <div className="dash-kpis">
        <Stat label="Wrong passwords" value={c("login-failed")} sub={`${c("login-locked")} lockout(s)`} />
        <Stat label="Scanner probes" value={c("probe")} sub={`${c("refused-burst")} burst(s) of refused requests`} />
        <Stat label="Internet logins" value={c("login-ok")} sub="successful sign-ins from outside the office" />
        <Stat label="Account changes" value={c("user-change")} sub="users, roles and passwords" />
      </div>

      <div className="it-subhead">This PC's setup</div>
      {data.posture.length === 0 ? (
        <p className="count">Being checked — refresh in a minute.</p>
      ) : (
        <div className="it-checks">
          {data.posture.map((p) => (
            <div key={p.id} className={`it-check it-${p.level}`}>
              <div className="it-check-head">
                <span className="it-check-label">{p.label}</span>
                <span className={`it-pill it-${p.level}`}>{LEVEL_TEXT[p.level]}</span>
              </div>
              <div className="it-check-detail">{p.detail}</div>
            </div>
          ))}
        </div>
      )}

      <div className="it-grid" style={{ marginTop: 6 }}>
        <div>
          <div className="it-subhead">Last 14 days</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.daily} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 11, fill: "#6b7280" }} minTickGap={20} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="logins" name="Wrong passwords / lockouts" fill="#c9992f" isAnimationActive={false} />
              <Bar dataKey="scans" name="Scans" fill="#c0392b" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div className="it-subhead">Most active addresses (24 h)</div>
          {data.topAddresses.length === 0 ? (
            <p className="count">Nothing suspicious in the last 24 hours.</p>
          ) : (
            <table className="it-table">
              <thead><tr><th>Address</th><th className="num">Wrong passwords</th><th className="num">Scans</th><th>Last</th></tr></thead>
              <tbody>
                {data.topAddresses.map((a) => (
                  <tr key={a.address}>
                    <td>{a.address}</td>
                    <td className="num">{a.logins}</td>
                    <td className="num">{a.scans}</td>
                    <td>{when(a.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="record-head" style={{ marginTop: 14 }}>
        <div className="it-subhead" style={{ margin: 0 }}>Latest events</div>
        <div className="stage-tabs">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? "stage-tab current" : "stage-tab"} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {events.length === 0 ? (
        <p className="count">No events yet.</p>
      ) : (
        <table className="it-table">
          <thead><tr><th>When</th><th>What</th><th>Who / from</th><th>Details</th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td title={new Date(e.at).toLocaleString("en-PH")}>{when(e.at)}</td>
                <td><span className={`it-pill ${SEVERITY[e.severity] ?? "it-info"}`}>{KIND[e.kind] ?? e.kind}</span></td>
                <td>
                  {e.username ?? "—"}
                  <div className="it-down-sub">
                    {[e.address, e.via === "internet" ? "via internet" : e.via === "office" ? "office network" : null].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td>
                  {e.detail}
                  {e.path && <div className="it-down-sub">{e.path}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
