import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { apiGet } from "./api";

/**
 * IT Dashboard — the running server's own health, performance and
 * connectivity, refreshed every 5 seconds. See poseidon-api's itDashboard.ts
 * for where each figure comes from; the trend charts cover the last hour
 * the server has been up (the history lives in memory, so a restart starts
 * them over).
 */

type Level = "ok" | "warn" | "fail" | "info";
type Check = { id: string; label: string; level: Level; detail: string };
type Probe = { ok: boolean; ms: number | null; detail: string };
type Sample = {
  at: number; cpu: number; procCpu: number; mem: number; rssMb: number;
  loopMs: number; dbMs: number | null; requests: number; errors: number; avgMs: number;
};
type ReqEvent = { at: number; method: string; path: string; status: number; ms: number };
type OutageKind = "server" | "database" | "internet";
type UpWindow = { availability: number | null; downMs: number; incidents: number };
type UptimeSummary = { d1: UpWindow; d7: UpWindow; d30: UpWindow; down: boolean; upSince: number | null };
type Incident = { kind: OutageKind; startedms: number; endedms: number | null; detail: string; ongoing: boolean };

type Growth = { hours: number; schemaBytes: number; dbBytes: number; walBytes: number | null; writes: number | null };
type DbHealth = {
  current: { dbbytes: number; schemabytes: number; walbytes: number | null; writes: number | null; deadrows: number | null } | null;
  tracking: { since: number; count: number } | null;
  growth24h: Growth | null;
  growth7d: Growth | null;
  selfGrowth: boolean;
  history: { at: number; dbbytes: number; schemabytes: number; walbytes: number | null }[];
  tables: { name: string; bytes: number; live: number; dead: number; deadPct: number; vacuumed: string | null }[];
  bloated: { name: string; live: number; dead: number }[];
  sessions: { pid: number; state: string; user: string; app: string; xactSec: number | null; stateSec: number | null; query: string }[];
  stuck: { pid: number }[];
  slots: { name: string; active: boolean; retainedBytes: number | null }[];
};
type HwEvent = { at: string; source: string; id: number; level: number; message: string };
type Hardware =
  | { supported: false }
  | { supported: true; error: string }
  | {
      supported: true;
      checkedAt: string;
      disks: {
        id: string; name: string; media: string; bus: string; health: string; status: string; size: number;
        reliability: { temp: number | null; wear: number | null; readErrors: number | null; writeErrors: number | null; hours: number | null } | null;
      }[];
      reliabilityAvailable: boolean;
      memory: { slot: string; maker: string; size: number; speed: number; part: string }[];
      pagefile: { name: string; sizeMb: number; usedMb: number; peakMb: number }[];
      commitPct: number | null; commitLimit: number | null; committed: number | null;
      diskEvents: HwEvent[]; whea: HwEvent[]; memdiag: HwEvent | null;
    };

const KIND_LABEL: Record<OutageKind, string> = { server: "Server", database: "Database", internet: "Internet" };

type Status = {
  now: string;
  deployment: "main" | "satellite";
  checks: Check[];
  live: {
    cpu: number | null; cpu1m: number | null; procCpu: number | null; mem: number; dbMs: number | null;
    loopMs: number | null; requestsPerMin: number; errors15m: number; requests15m: number;
  };
  server: {
    hostname: string; platform: string; arch: string; cpuModel: string; cores: number;
    totalMem: number; freeMem: number; osUptimeSec: number; node: string; pid: number; port: number;
    startedAt: string; uptimeSec: number; rss: number; heapUsed: number; heapTotal: number;
    cwd: string; addresses: string[];
  };
  disk: { path: string; total: number; free: number } | null;
  database: {
    version: string | null; name: string | null; host: string | null; schema: string;
    sizeBytes: number | null; connections: number | null; maxConnections: number | null;
    uptimeSec: number | null; pingMs: number | null;
    pool: { total: number; idle: number; waiting: number; max: number };
  };
  connectivity: {
    checkedAt: string; dns: Probe; internet: Probe; github: Probe;
    neon: { configured: boolean; neonConnected: boolean; mainViaNeon: boolean; heartbeatAt: string | null; ms: number | null };
    main: Probe | null; mainUrl: string | null;
    tunnel: { running: boolean; detail: string };
  };
  satellites: { name: string; ip: string; lastSeen: number; lastPath: string; calls: number }[];
  build: {
    head: string | null; headSubject: string | null; headTime: string | null; remote: string | null;
    branch: string | null; buildTime: string | null; updateAvailable: boolean;
    buildOlderThanCode: boolean; restartNeeded: boolean;
  };
  dbHealth: DbHealth;
  hardware: Hardware;
  uptime: {
    trackingSince: number | null;
    summary: Record<OutageKind, UptimeSummary>;
    incidents: Incident[];
  };
  backups: {
    dir: string; count: number; totalBytes: number;
    latest: { name: string; size: number; at: string } | null;
    recent: { name: string; size: number; at: string }[];
  };
  startupLog: string[];
  recentErrors: ReqEvent[];
  slowRequests: ReqEvent[];
  history: Sample[];
};

const GRID = "#eef1f4";
const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };

const LEVEL_TEXT: Record<Level, string> = { ok: "OK", warn: "Attention", fail: "Down", info: "Info" };

function bytes(n: number | null | undefined) {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

function duration(sec: number | null | undefined) {
  if (sec == null) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(sec % 60)}s`;
}

function ago(v: string | number | null | undefined) {
  if (v == null) return "never";
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 90) return `${Math.max(s, 0)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function clock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
}

function when(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function ms(v: number | null | undefined) {
  return v == null ? "—" : `${v} ms`;
}

export default function ITDashboardPage() {
  const { data, error, isLoading, dataUpdatedAt } = useQuery<Status>({
    queryKey: ["it-status"],
    queryFn: () => apiGet("/api/it/status"),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  const counts = { ok: 0, warn: 0, fail: 0, info: 0 };
  for (const c of data?.checks ?? []) counts[c.level]++;
  const overall: Level = counts.fail ? "fail" : counts.warn ? "warn" : "ok";

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>IT Dashboard</h1>
          <p className="account-no">
            Server health, performance and connectivity
            {data ? ` — ${data.server.hostname} (${data.deployment === "satellite" ? "OSCARS satellite" : "main server"})` : ""}
          </p>
        </div>
        {data && (
          <div className="it-live">
            <span className="it-live-dot" /> Live · updated {ago(dataUpdatedAt)}
          </div>
        )}
      </div>

      {isLoading && <p className="count">Checking the server…</p>}
      {error && <div className="form-error">{(error as Error).message}</div>}

      {data && (
        <>
          <div className={`it-banner it-${overall}`}>
            <strong>
              {overall === "ok"
                ? "All systems normal"
                : overall === "warn"
                  ? `${counts.warn} item${counts.warn === 1 ? "" : "s"} need attention`
                  : `${counts.fail} problem${counts.fail === 1 ? "" : "s"} found`}
            </strong>
            <span>
              {counts.ok} OK{counts.warn ? ` · ${counts.warn} attention` : ""}{counts.fail ? ` · ${counts.fail} down` : ""}
            </span>
          </div>

          <div className="it-checks">
            {data.checks.map((c) => (
              <div key={c.id} className={`it-check it-${c.level}`}>
                <div className="it-check-head">
                  <span className="it-check-label">{c.label}</span>
                  <span className={`it-pill it-${c.level}`}>{LEVEL_TEXT[c.level]}</span>
                </div>
                <div className="it-check-detail">{c.detail}</div>
              </div>
            ))}
          </div>

          <div className="dash-kpis">
            <Kpi label="CPU" value={data.live.cpu != null ? `${data.live.cpu}%` : "—"} sub={`${data.server.cores} cores · app ${data.live.procCpu ?? 0}%`} />
            <Kpi label="Memory" value={`${data.live.mem}%`} sub={`${bytes(data.server.totalMem - data.server.freeMem)} of ${bytes(data.server.totalMem)}`} />
            <Kpi
              label="Disk free"
              value={data.disk ? bytes(data.disk.free) : "—"}
              sub={data.disk ? `${((data.disk.free / data.disk.total) * 100).toFixed(0)}% of ${bytes(data.disk.total)} on ${data.disk.path}` : "unavailable"}
            />
            <Kpi label="Database response" value={ms(data.database.pingMs)} sub={`${data.database.pool.total - data.database.pool.idle} busy of ${data.database.pool.max} app connections`} />
            <Kpi label="Requests / min" value={String(data.live.requestsPerMin)} sub={`${data.live.errors15m} errors in the last 15 min`} />
            <Kpi label="Server uptime" value={duration(data.server.uptimeSec)} sub={`since ${when(data.server.startedAt)}`} />
          </div>

          <UptimePanel uptime={data.uptime} />

          <div className="it-grid" style={{ marginTop: 0, marginBottom: 18 }}>
            <HardwarePanel hw={data.hardware} />
            <DbHealthPanel h={data.dbHealth} />
          </div>

          <div className="dash-charts">
            <Card title="CPU and memory" note="last hour, %">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.history} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="at" tickFormatter={clock} tick={AXIS_TICK} minTickGap={40} />
                  <YAxis domain={[0, 100]} tick={AXIS_TICK} />
                  <Tooltip labelFormatter={(v) => clock(Number(v))} formatter={(v) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="cpu" name="CPU" stroke="var(--navy)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="mem" name="Memory" stroke="#c9992f" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Responsiveness" note="last hour, ms">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.history} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="at" tickFormatter={clock} tick={AXIS_TICK} minTickGap={40} />
                  <YAxis tick={AXIS_TICK} />
                  <Tooltip labelFormatter={(v) => clock(Number(v))} formatter={(v) => `${v} ms`} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line dataKey="dbMs" name="Database" stroke="var(--navy)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
                  <Line dataKey="avgMs" name="Avg request" stroke="#2e8b57" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line dataKey="loopMs" name="Event-loop lag" stroke="#c9992f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Traffic" note="requests per 10 seconds" wide>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.history} margin={{ top: 10, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="at" tickFormatter={clock} tick={AXIS_TICK} minTickGap={40} />
                  <YAxis allowDecimals={false} tick={AXIS_TICK} />
                  <Tooltip labelFormatter={(v) => clock(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="requests" name="Requests" fill="var(--blue-soft)" isAnimationActive={false} />
                  <Bar dataKey="errors" name="Errors (5xx)" fill="#d03b3b" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div className="it-grid">
            <Card title="Server">
              <Facts
                rows={[
                  ["Host name", data.server.hostname],
                  ["IP address", data.server.addresses.join(", ") || "—"],
                  ["Operating system", `${data.server.platform} (${data.server.arch})`],
                  ["Processor", `${data.server.cpuModel} · ${data.server.cores} cores`],
                  ["Machine uptime", duration(data.server.osUptimeSec)],
                  ["App uptime", `${duration(data.server.uptimeSec)} (PID ${data.server.pid}, port ${data.server.port})`],
                  ["App memory", `${bytes(data.server.rss)} (heap ${bytes(data.server.heapUsed)} of ${bytes(data.server.heapTotal)})`],
                  ["Node.js", data.server.node],
                  ["Folder", data.server.cwd],
                ]}
              />
            </Card>

            <Card title="Database">
              <Facts
                rows={[
                  ["Server", `${data.database.version ?? "—"} on ${data.database.host ?? "—"}`],
                  ["Database / schema", `${data.database.name ?? "—"} / ${data.database.schema}`],
                  ["Size", bytes(data.database.sizeBytes)],
                  ["Response", ms(data.database.pingMs)],
                  ["Connections", data.database.connections != null ? `${data.database.connections} of ${data.database.maxConnections ?? "?"} allowed` : "—"],
                  ["App pool", `${data.database.pool.total} open, ${data.database.pool.idle} idle, ${data.database.pool.waiting} waiting (max ${data.database.pool.max})`],
                  ["Database uptime", duration(data.database.uptimeSec)],
                ]}
              />
            </Card>

            <Card title="Connectivity" note={`checked ${ago(data.connectivity.checkedAt)}`}>
              <table className="it-table">
                <tbody>
                  <ProbeRow label="DNS" p={data.connectivity.dns} />
                  <ProbeRow label="Internet" p={data.connectivity.internet} />
                  <ProbeRow label="GitHub (updates)" p={data.connectivity.github} />
                  <tr>
                    <td>Neon relay</td>
                    <td>
                      {!data.connectivity.neon.configured ? (
                        <span className="it-pill it-info">Not set up</span>
                      ) : data.connectivity.neon.neonConnected ? (
                        <span className="it-pill it-ok">Connected</span>
                      ) : (
                        <span className="it-pill it-fail">Unreachable</span>
                      )}
                    </td>
                    <td className="num">{ms(data.connectivity.neon.ms)}</td>
                  </tr>
                  {data.connectivity.neon.configured && (
                    <tr>
                      <td>Main via Neon</td>
                      <td colSpan={2}>last heartbeat {ago(data.connectivity.neon.heartbeatAt)}</td>
                    </tr>
                  )}
                  {data.deployment === "satellite" && (
                    data.connectivity.main
                      ? <ProbeRow label="Main server" p={data.connectivity.main} />
                      : <tr><td>Main server</td><td colSpan={2}><span className="it-pill it-warn">Not set up</span></td></tr>
                  )}
                  <tr>
                    <td>Cloudflare tunnel</td>
                    <td>
                      <span className={`it-pill ${data.connectivity.tunnel.running ? "it-ok" : "it-info"}`}>
                        {data.connectivity.tunnel.running ? "Running" : "Not running"}
                      </span>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </Card>

            {data.deployment === "main" && (
              <Card title="Satellites" note="since this server started">
                {data.satellites.length === 0 ? (
                  <p className="count">No satellite has contacted this server yet.</p>
                ) : (
                  <table className="it-table">
                    <thead>
                      <tr><th>Satellite</th><th>Address</th><th>Last seen</th><th className="num">Calls</th></tr>
                    </thead>
                    <tbody>
                      {data.satellites.map((s) => (
                        <tr key={s.name}>
                          <td>
                            <span className={`it-dot ${Date.now() - s.lastSeen < 15 * 60_000 ? "it-ok" : "it-warn"}`} /> {s.name}
                          </td>
                          <td>{s.ip}</td>
                          <td title={s.lastPath}>{ago(s.lastSeen)}</td>
                          <td className="num">{s.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>
            )}

            <Card title="Version and updates">
              <Facts
                rows={[
                  ["Running commit", data.build.head ? `${data.build.head} — ${data.build.headSubject ?? ""}` : "—"],
                  ["Committed", when(data.build.headTime)],
                  ["Built", when(data.build.buildTime)],
                  ["Latest on GitHub", data.build.remote ?? "—"],
                  ["Branch", data.build.branch ?? "—"],
                ]}
              />
              {data.startupLog.length > 0 && (
                <>
                  <div className="it-subhead">Startup / update log</div>
                  <pre className="it-log">{data.startupLog.join("\n")}</pre>
                </>
              )}
            </Card>

            <Card title="Backups" note={`${data.backups.count} on file · ${bytes(data.backups.totalBytes)}`}>
              <p className="count" style={{ marginTop: 0 }}>{data.backups.dir}</p>
              {data.backups.recent.length === 0 ? (
                <p className="count">No backups found. Make one from Settings → Backup.</p>
              ) : (
                <table className="it-table">
                  <thead><tr><th>File</th><th>Taken</th><th className="num">Size</th></tr></thead>
                  <tbody>
                    {data.backups.recent.map((b) => (
                      <tr key={b.name}>
                        <td className="it-mono">{b.name}</td>
                        <td>{ago(b.at)}</td>
                        <td className="num">{bytes(b.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="Recent server errors">
              <EventTable events={data.recentErrors} empty="No server errors since the app started." />
            </Card>

            <Card title="Slow requests" note="over 1.5 seconds">
              <EventTable events={data.slowRequests} empty="Nothing slow since the app started." />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function downFor(msTotal: number) {
  if (msTotal <= 0) return "none";
  const m = Math.round(msTotal / 60000);
  if (m < 1) return "under a minute";
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function pct(w: UpWindow) {
  return w.availability == null ? "—" : `${w.availability.toFixed(w.availability === 100 ? 0 : 2)}%`;
}

function pctClass(w: UpWindow) {
  if (w.availability == null) return "";
  return w.availability >= 99.5 ? "it-good" : w.availability >= 97 ? "it-meh" : "it-bad";
}

/** Last 24 hours as a strip: green where up, red where down, grey before
 *  tracking began. */
function Timeline({ incidents, trackingSince }: { incidents: Incident[]; trackingSince: number | null }) {
  const now = Date.now();
  const start = now - 86400_000;
  const pos = (t: number) => `${Math.min(Math.max(((t - start) / 86400_000) * 100, 0), 100)}%`;
  return (
    <div className="it-timeline" title="Last 24 hours">
      {trackingSince != null && trackingSince > start && (
        <span className="it-tl-untracked" style={{ left: 0, width: pos(trackingSince) }} />
      )}
      {incidents
        .filter((o) => (o.endedms ?? now) > start)
        .map((o, i) => {
          const a = Math.max(o.startedms, start);
          const b = o.endedms ?? now;
          return (
            <span
              key={i}
              className="it-tl-down"
              style={{ left: pos(a), width: `max(2px, calc(${pos(b)} - ${pos(a)}))` }}
              title={`${when(new Date(o.startedms).toISOString())} — ${o.ongoing ? "ongoing" : downFor(b - o.startedms)}`}
            />
          );
        })}
    </div>
  );
}

function UptimePanel({ uptime }: { uptime: Status["uptime"] }) {
  const kinds: OutageKind[] = ["server", "database", "internet"];
  return (
    <div className="it-grid" style={{ marginTop: 0, marginBottom: 18 }}>
      <Card title="Uptime" note={uptime.trackingSince ? `tracked since ${when(new Date(uptime.trackingSince).toISOString())}` : "starting…"} wide>
        <table className="it-table it-uptime">
          <thead>
            <tr>
              <th>Service</th>
              <th>Now</th>
              <th>Up for</th>
              <th className="num">24 hours</th>
              <th className="num">7 days</th>
              <th className="num">30 days</th>
              <th className="it-tl-head">
                <span>24h ago</span>
                <span>now</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((k) => {
              const s = uptime.summary[k];
              const mine = uptime.incidents.filter((o) => o.kind === k);
              return (
                <tr key={k}>
                  <td>{KIND_LABEL[k]}</td>
                  <td>
                    <span className={`it-pill ${s.down ? "it-fail" : "it-ok"}`}>{s.down ? "Down" : "Up"}</span>
                  </td>
                  <td>{s.down ? `down ${ago(mine[0]?.startedms).replace(" ago", "")}` : s.upSince ? duration((Date.now() - s.upSince) / 1000) : "—"}</td>
                  {(["d1", "d7", "d30"] as const).map((w) => (
                    <td key={w} className="num" title={`${s[w].incidents} outage(s), ${downFor(s[w].downMs)} down`}>
                      <span className={pctClass(s[w])}>{pct(s[w])}</span>
                      {s[w].downMs > 0 && <div className="it-down-sub">{downFor(s[w].downMs)} down</div>}
                    </td>
                  ))}
                  <td className="it-tl-cell">
                    <Timeline incidents={mine} trackingSince={uptime.trackingSince} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="dash-chart-note">
          Database and internet are only watched while the app is running; the server row counts any time the app
          wasn't running at all.
        </p>
      </Card>

      <Card title="Downtime log" note="last 30 days" wide>
        {uptime.incidents.length === 0 ? (
          <p className="count">No downtime recorded.</p>
        ) : (
          <table className="it-table">
            <thead>
              <tr><th>Service</th><th>Started</th><th>Ended</th><th className="num">Duration</th><th>What happened</th></tr>
            </thead>
            <tbody>
              {uptime.incidents.map((o, i) => (
                <tr key={i}>
                  <td>{KIND_LABEL[o.kind]}</td>
                  <td>{when(new Date(o.startedms).toISOString())}</td>
                  <td>{o.ongoing ? <span className="it-pill it-fail">Ongoing</span> : when(new Date(o.endedms!).toISOString())}</td>
                  <td className="num">{downFor((o.endedms ?? Date.now()) - o.startedms)}</td>
                  <td>{o.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function healthPill(h: string) {
  const cls = h === "Healthy" ? "it-ok" : h === "Unhealthy" ? "it-fail" : h ? "it-warn" : "it-info";
  return <span className={`it-pill ${cls}`}>{h || "Unknown"}</span>;
}

function HardwarePanel({ hw }: { hw: Hardware }) {
  if (!hw.supported) {
    return (
      <Card title="Disk and memory health">
        <p className="count">Hardware health checks are only available on Windows servers.</p>
      </Card>
    );
  }
  if ("error" in hw) {
    return (
      <Card title="Disk and memory health">
        <div className="form-error">{hw.error}</div>
      </Card>
    );
  }
  const events = [...hw.diskEvents, ...hw.whea].sort((a, b) => (a.at < b.at ? 1 : -1));
  return (
    <Card title="Disk and memory health" note={`checked ${ago(hw.checkedAt)}`}>
      <div className="it-subhead" style={{ marginTop: 0 }}>Drives</div>
      <table className="it-table">
        <thead>
          <tr><th>Drive</th><th>Health</th><th className="num">Size</th><th className="num">Temp</th><th className="num">Wear</th><th className="num">Errors</th></tr>
        </thead>
        <tbody>
          {hw.disks.map((d) => (
            <tr key={d.id}>
              <td>{d.name}<div className="it-down-sub">{d.media} · {d.bus}</div></td>
              <td>{healthPill(d.health)}</td>
              <td className="num">{bytes(d.size)}</td>
              <td className="num">{d.reliability?.temp != null ? `${d.reliability.temp}°C` : "—"}</td>
              <td className="num">{d.reliability?.wear != null ? `${d.reliability.wear}%` : "—"}</td>
              <td className="num">
                {d.reliability && (d.reliability.readErrors != null || d.reliability.writeErrors != null)
                  ? (d.reliability.readErrors ?? 0) + (d.reliability.writeErrors ?? 0)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hw.reliabilityAvailable && (
        <p className="dash-chart-note">
          Temperature, wear and error counters need the app to run as an administrator or a Windows service.
        </p>
      )}

      <div className="it-subhead">Memory</div>
      <table className="it-table it-facts">
        <tbody>
          <tr>
            <th>Modules</th>
            <td>
              {hw.memory.length
                ? hw.memory.map((m, i) => (
                    <div key={i}>{m.slot}: {bytes(m.size)} {m.speed ? `@ ${m.speed} MT/s` : ""} <span className="count">{[m.maker, m.part].filter((x) => x && x !== "Unknown").join(" ")}</span></div>
                  ))
                : "—"}
            </td>
          </tr>
          <tr>
            <th>Committed</th>
            <td>
              {hw.commitPct != null ? `${hw.commitPct}%` : "—"}
              {hw.committed != null && hw.commitLimit != null && <span className="count"> ({bytes(hw.committed)} of {bytes(hw.commitLimit)} RAM + page file)</span>}
            </td>
          </tr>
          <tr>
            <th>Page file</th>
            <td>{hw.pagefile.length ? hw.pagefile.map((p) => `${p.name}: ${p.usedMb} MB used of ${p.sizeMb} MB (peak ${p.peakMb} MB)`).join("; ") : "—"}</td>
          </tr>
          <tr>
            <th>Memory test</th>
            <td>{hw.memdiag ? `${hw.memdiag.message} (${when(hw.memdiag.at)})` : "Windows Memory Diagnostic has not been run"}</td>
          </tr>
        </tbody>
      </table>

      <div className="it-subhead">Hardware events in Windows' log (7 days)</div>
      {events.length === 0 ? (
        <p className="count">None — no disk or hardware errors reported.</p>
      ) : (
        <table className="it-table">
          <tbody>
            {events.slice(0, 8).map((e, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{ago(e.at)}</td>
                <td><span className={`it-pill ${e.level <= 2 ? "it-fail" : "it-warn"}`}>{e.level <= 2 ? "Error" : "Warning"}</span></td>
                <td>{e.source} {e.id}<div className="it-down-sub">{e.message}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function signedBytes(n: number) {
  return `${n >= 0 ? "+" : "−"}${bytes(Math.abs(n))}`;
}

function DbHealthPanel({ h }: { h: DbHealth }) {
  const chart = h.history.map((s) => ({ at: s.at, app: Math.round(s.schemabytes / 1048576), all: Math.round(s.dbbytes / 1048576) }));
  return (
    <Card title="Database growth and bloat" note={h.tracking ? `hourly since ${when(new Date(h.tracking.since).toISOString())}` : "collecting"}>
      {h.selfGrowth && (
        <div className="it-banner it-warn" style={{ marginBottom: 10 }}>
          <strong>The database is growing with almost no activity to explain it.</strong>
        </div>
      )}
      <table className="it-table it-facts">
        <tbody>
          <tr><th>App data (this schema)</th><td>{bytes(h.current?.schemabytes)}</td></tr>
          <tr><th>Whole database</th><td>{bytes(h.current?.dbbytes)}</td></tr>
          <tr><th>Transaction log (WAL)</th><td>{h.current?.walbytes != null ? bytes(h.current.walbytes) : "—"}</td></tr>
          <tr>
            <th>Last 24 hours</th>
            <td>
              {h.growth24h
                ? <>{signedBytes(h.growth24h.schemaBytes)} from {h.growth24h.writes != null ? h.growth24h.writes.toLocaleString() : "?"} row change(s)</>
                : "not enough history yet"}
            </td>
          </tr>
          <tr>
            <th>Last 7 days</th>
            <td>
              {h.growth7d && h.growth7d.hours > 30
                ? <>{signedBytes(h.growth7d.schemaBytes)} from {h.growth7d.writes != null ? h.growth7d.writes.toLocaleString() : "?"} row change(s) over {Math.round(h.growth7d.hours / 24)} day(s)</>
                : "not enough history yet"}
            </td>
          </tr>
          <tr><th>Dead rows</th><td>{h.current?.deadrows != null ? h.current.deadrows.toLocaleString() : "—"}</td></tr>
        </tbody>
      </table>

      {chart.length > 1 && (
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={chart} margin={{ top: 12, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="at" tickFormatter={(v) => new Date(v).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} tick={AXIS_TICK} minTickGap={40} />
            <YAxis tick={AXIS_TICK} tickFormatter={(v) => `${v} MB`} width={62} />
            <Tooltip labelFormatter={(v) => when(new Date(Number(v)).toISOString())} formatter={(v) => `${v} MB`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="app" name="App data" stroke="var(--navy)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="all" name="Whole database" stroke="#c9992f" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="it-subhead">Largest tables</div>
      <table className="it-table">
        <thead><tr><th>Table</th><th className="num">Size</th><th className="num">Rows</th><th className="num">Dead</th><th>Last vacuum</th></tr></thead>
        <tbody>
          {h.tables.map((t) => (
            <tr key={t.name}>
              <td className="it-mono">{t.name}</td>
              <td className="num">{bytes(t.bytes)}</td>
              <td className="num">{t.live.toLocaleString()}</td>
              <td className="num">
                <span className={t.deadPct > 20 && t.dead > 10000 ? "it-bad" : t.deadPct > 10 ? "it-meh" : ""}>{t.deadPct}%</span>
              </td>
              <td>{t.vacuumed ? ago(t.vacuumed) : "never"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {(h.stuck.length > 0 || h.slots.length > 0) && (
        <>
          <div className="it-subhead">What can make it grow by itself</div>
          <table className="it-table">
            <tbody>
              {h.sessions
                .filter((s) => h.stuck.some((x) => x.pid === s.pid))
                .map((s) => (
                  <tr key={s.pid}>
                    <td><span className="it-pill it-warn">Open transaction</span></td>
                    <td>
                      PID {s.pid} ({s.user}{s.app ? `, ${s.app}` : ""}) — {s.state}, open {duration(s.xactSec)}
                      <div className="it-down-sub it-mono">{s.query}</div>
                    </td>
                  </tr>
                ))}
              {h.slots.map((s) => (
                <tr key={s.name}>
                  <td><span className={`it-pill ${s.active ? "it-ok" : "it-warn"}`}>{s.active ? "Slot active" : "Slot inactive"}</span></td>
                  <td>{s.name} — holding {bytes(s.retainedBytes)} of log</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

function Card({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section className={wide ? "record-section dash-chart-wide" : "record-section"}>
      <div className="record-head">
        <h2>{title}</h2>
        {note && <span className="count">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="it-table it-facts">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProbeRow({ label, p }: { label: string; p: Probe }) {
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={`it-pill ${p.ok ? "it-ok" : "it-fail"}`} title={p.detail}>
          {p.ok ? "Reachable" : "Unreachable"}
        </span>
      </td>
      <td className="num">{ms(p.ms)}</td>
    </tr>
  );
}

function EventTable({ events, empty }: { events: ReqEvent[]; empty: string }) {
  if (!events.length) return <p className="count">{empty}</p>;
  return (
    <table className="it-table">
      <thead><tr><th>When</th><th>Request</th><th className="num">Status</th><th className="num">Time</th></tr></thead>
      <tbody>
        {events.map((e, i) => (
          <tr key={i}>
            <td>{ago(e.at)}</td>
            <td className="it-mono">{e.method} {e.path}</td>
            <td className="num">{e.status}</td>
            <td className="num">{e.ms} ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
