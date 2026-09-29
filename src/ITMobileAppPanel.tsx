import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * The IT Dashboard's Mobile App panel — how the consumer mobile app is
 * being used, from poseidon-api's mobileAppMonitor.ts. Phones are counted
 * by a random install id the app makes for itself; nothing here identifies
 * a person.
 */

type Summary = {
  requests: number; phones: number; opens: number; lookups: number; failedLookups: number;
  accounts: number; incidents: number; adjustments: number; rateLimited: number; errors: number; avgMs: number;
};

export type MobileAppStatus = {
  last15: Summary;
  today: Summary;
  hourly: { at: number; requests: number; phones: number; problems: number }[];
  platforms: { platform: string; phones: number }[];
  recent: { at: number; kind: string; outcome: string; ms: number; platform: string; version: string }[];
  lastSeenMs: number | null;
};

const KIND: Record<string, string> = {
  open: "Opened the app",
  lookup: "Checked an account",
  incident: "Reported an incident",
  adjustment: "Requested an adjustment",
  other: "Other",
};

const OUTCOME: Record<string, { label: string; level: string }> = {
  ok: { label: "OK", level: "it-ok" },
  "no-match": { label: "No matching account", level: "it-warn" },
  invalid: { label: "Incomplete details", level: "it-info" },
  "rate-limited": { label: "Blocked (too many tries)", level: "it-fail" },
  error: { label: "Server error", level: "it-fail" },
};

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

function when(ms: number | null) {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  return new Date(ms).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

export default function ITMobileAppPanel({ m, now }: { m: MobileAppStatus; now: number }) {
  const t = m.today;
  const lookupsTried = t.lookups + t.failedLookups;
  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Mobile App</h2>
        <span className="count">last request {when(m.lastSeenMs)}</span>
      </div>

      <div className="dash-kpis">
        <Stat label="Phones today" value={String(t.phones)} sub={`${m.last15.phones} in the last 15 min`} />
        <Stat label="Requests today" value={String(t.requests)} sub={`${m.last15.requests} in the last 15 min · avg ${t.avgMs} ms`} />
        <Stat
          label="Account checks"
          value={String(t.lookups)}
          sub={lookupsTried ? `${t.accounts} account(s) · ${t.failedLookups} didn't match` : "none yet today"}
        />
        <Stat label="Reports & requests" value={String(t.incidents + t.adjustments)} sub={`${t.incidents} incident(s), ${t.adjustments} adjustment(s)`} />
        <Stat
          label="Problems today"
          value={String(t.errors + t.rateLimited)}
          sub={`${t.errors} server error(s), ${t.rateLimited} blocked`}
        />
      </div>

      <div className="it-grid" style={{ marginTop: 6 }}>
        <div>
          <div className="it-subhead">Last 24 hours</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={m.hourly} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="#eef1f4" vertical={false} />
              <XAxis dataKey="at" tickFormatter={(v) => clock(Number(v))} tick={{ fontSize: 11, fill: "#6b7280" }} minTickGap={30} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip labelFormatter={(v) => clock(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="requests" name="Requests" fill="var(--blue-soft)" isAnimationActive={false} />
              <Bar dataKey="phones" name="Phones" fill="var(--navy)" isAnimationActive={false} />
              <Bar dataKey="problems" name="Not OK" fill="#c9992f" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          {m.platforms.length > 0 && (
            <p className="count" style={{ marginTop: 4 }}>
              Phones in the last 24 hours: {m.platforms.map((p) => `${p.phones} ${p.platform === "ios" ? "iPhone" : p.platform === "android" ? "Android" : p.platform}`).join(" · ")}
            </p>
          )}
        </div>

        <div>
          <div className="it-subhead">Latest requests</div>
          {m.recent.length === 0 ? (
            <p className="count">The mobile app hasn't connected yet.</p>
          ) : (
            <table className="it-table">
              <thead><tr><th>When</th><th>What</th><th>Result</th><th className="num">Time</th></tr></thead>
              <tbody>
                {m.recent.map((r, i) => {
                  const o = OUTCOME[r.outcome] ?? { label: r.outcome, level: "it-info" };
                  return (
                    <tr key={i}>
                      <td title={new Date(r.at).toLocaleString("en-PH")}>{now - r.at < 86_400_000 ? clock(r.at) : when(r.at)}</td>
                      <td>
                        {KIND[r.kind] ?? r.kind}
                        {(r.platform || r.version) && <div className="it-down-sub">{[r.platform, r.version && `v${r.version}`].filter(Boolean).join(" · ")}</div>}
                      </td>
                      <td><span className={`it-pill ${o.level}`}>{o.label}</span></td>
                      <td className="num">{r.ms} ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
