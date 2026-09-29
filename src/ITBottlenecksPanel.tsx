/**
 * The IT Dashboard's Bottlenecks panel — where request time actually goes
 * over the last 15 minutes, and what's slowing things down, in plain
 * language with a suggested fix for each finding. The diagnosis itself is
 * worked out server-side (poseidon-api's bottlenecks.ts); this only lays it
 * out.
 */

type Level = "ok" | "info" | "warn" | "fail";

export type Bottlenecks = {
  windowMinutes: number;
  level: Level;
  headline: string;
  lowTraffic: boolean;
  requests: number;
  avgRequestMs: number;
  split: { dbPct: number; waitPct: number; appPct: number };
  findings: { id: string; level: Level; area: string; title: string; detail: string; fix: string }[];
  endpoints: {
    endpoint: string; requests: number; avgMs: number; p95Ms: number; maxMs: number;
    sharePct: number; dbPct: number; waitPct: number; appPct: number; queriesPerRequest: number;
  }[];
  queries: {
    sql: string; table: string; calls: number; avgMs: number; maxMs: number;
    totalMs: number; failed: number; endpoints: string[];
  }[];
  pool: { max: number; waitsOver100ms: number; maxWaitMs: number };
  postgres: {
    activeSessions: number; lockWaits: number; blocked: number;
    connections: number; maxConnections: number;
    longRunning: { pid: number; seconds: number; waitEvent: string; query: string }[];
    cacheHitPct: number | null;
    settings: Record<string, string>;
  } | null;
  diskIo: { busyPct: number; queue: number; readsPerSec: number; writesPerSec: number } | null;
};

const LEVEL_TEXT: Record<Level, string> = { ok: "OK", info: "Note", warn: "Attention", fail: "Serious" };

function ms(v: number) {
  return v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`;
}

/** Database / waiting / app, as one horizontal bar. */
function SplitBar({ dbPct, waitPct, appPct, compact }: { dbPct: number; waitPct: number; appPct: number; compact?: boolean }) {
  const parts = [
    { key: "db", pct: dbPct, label: "Database queries" },
    { key: "wait", pct: waitPct, label: "Waiting for a connection" },
    { key: "app", pct: appPct, label: "App (CPU)" },
  ];
  return (
    <div className={compact ? "it-split compact" : "it-split"}>
      <div className="it-split-bar" role="img" aria-label={parts.map((p) => `${p.label} ${p.pct}%`).join(", ")}>
        {parts.map((p) => p.pct > 0 && (
          <span key={p.key} className={`it-split-${p.key}`} style={{ width: `${p.pct}%` }} title={`${p.label}: ${p.pct}%`} />
        ))}
      </div>
      {!compact && (
        <div className="it-split-legend">
          {parts.map((p) => (
            <span key={p.key}><i className={`it-split-${p.key}`} /> {p.label} <b>{p.pct}%</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ITBottlenecksPanel({ b }: { b: Bottlenecks }) {
  const serious = b.findings.filter((f) => f.level === "warn" || f.level === "fail");
  const notes = b.findings.filter((f) => f.level === "info");
  const pg = b.postgres;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Bottlenecks</h2>
        <span className="count">last {b.windowMinutes} min · {b.requests.toLocaleString()} requests</span>
      </div>

      <div className={`it-banner it-${b.level === "info" ? "ok" : b.level}`} style={{ marginBottom: 12 }}>
        <strong>{b.headline}</strong>
        {b.lowTraffic && <span>Little traffic so far — figures firm up as the office uses the system.</span>}
      </div>

      {b.requests > 0 && (
        <>
          <div className="it-subhead" style={{ marginTop: 0 }}>Where request time goes</div>
          <SplitBar {...b.split} />
        </>
      )}

      {[...serious, ...notes].map((f) => (
        <div key={f.id} className={`it-finding it-${f.level}`}>
          <div className="it-finding-head">
            <span className={`it-pill it-${f.level}`}>{LEVEL_TEXT[f.level]}</span>
            <span className="it-finding-area">{f.area}</span>
            <strong>{f.title}</strong>
          </div>
          <div className="it-finding-detail">{f.detail}</div>
          <div className="it-finding-fix"><b>What to do:</b> {f.fix}</div>
        </div>
      ))}

      <div className="it-grid" style={{ marginTop: 14 }}>
        <div>
          <div className="it-subhead">Where the time is spent — by page / action</div>
          {b.endpoints.length === 0 ? (
            <p className="count">No requests in the last {b.windowMinutes} minutes.</p>
          ) : (
            <table className="it-table">
              <thead>
                <tr>
                  <th>Request</th><th className="num">Count</th><th className="num">Avg</th>
                  <th className="num">Slowest 5%</th><th className="num">Share</th><th>Spent on</th>
                </tr>
              </thead>
              <tbody>
                {b.endpoints.map((e) => (
                  <tr key={e.endpoint}>
                    <td className="it-mono" title={`${e.queriesPerRequest} queries per request`}>{e.endpoint}</td>
                    <td className="num">{e.requests}</td>
                    <td className="num">{ms(e.avgMs)}</td>
                    <td className="num">{ms(e.p95Ms)}</td>
                    <td className="num">{e.sharePct}%</td>
                    <td style={{ minWidth: 90 }}><SplitBar dbPct={e.dbPct} waitPct={e.waitPct} appPct={e.appPct} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <div className="it-subhead">Heaviest database queries</div>
          {b.queries.length === 0 ? (
            <p className="count">No queries in the last {b.windowMinutes} minutes.</p>
          ) : (
            <table className="it-table">
              <thead>
                <tr><th>Query</th><th className="num">Calls</th><th className="num">Avg</th><th className="num">Slowest</th><th className="num">Total</th></tr>
              </thead>
              <tbody>
                {b.queries.map((q, i) => (
                  <tr key={i}>
                    <td>
                      <span className="it-mono" title={q.sql}>{q.table || "query"}</span>
                      {q.failed > 0 && <span className="it-pill it-fail" style={{ marginLeft: 6 }}>{q.failed} failed</span>}
                      <div className="it-down-sub">{q.endpoints.join(", ")}</div>
                    </td>
                    <td className="num">{q.calls}</td>
                    <td className="num">{ms(q.avgMs)}</td>
                    <td className="num">{ms(q.maxMs)}</td>
                    <td className="num">{ms(q.totalMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="it-grid" style={{ marginTop: 4 }}>
        <div>
          <div className="it-subhead">Database</div>
          <table className="it-table it-facts">
            <tbody>
              <tr><th>App connections</th><td>{b.pool.max} max · {b.pool.waitsOver100ms} wait(s) over 0.1 s · longest {ms(b.pool.maxWaitMs)}</td></tr>
              {pg ? (
                <>
                  <tr><th>Postgres connections</th><td>{pg.connections} of {pg.maxConnections} in use · {pg.activeSessions} running now</td></tr>
                  <tr><th>Lock waits</th><td>{pg.lockWaits === 0 && pg.blocked === 0 ? "None" : `${pg.lockWaits} waiting · ${pg.blocked} blocked`}</td></tr>
                  <tr><th>Reads from memory</th><td>{pg.cacheHitPct != null ? `${pg.cacheHitPct}%` : "—"} (shared_buffers {pg.settings.shared_buffers ?? "?"})</td></tr>
                  <tr><th>Sort memory</th><td>work_mem {pg.settings.work_mem ?? "?"}</td></tr>
                  {pg.longRunning.length > 0 && (
                    <tr>
                      <th>Running over 5 s</th>
                      <td>
                        {pg.longRunning.map((l) => (
                          <div key={l.pid} className="it-down-sub" title={l.query}>
                            {ms(l.seconds * 1000)}{l.waitEvent ? ` · waiting on ${l.waitEvent}` : ""} · {l.query.slice(0, 70)}…
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                <tr><th>Postgres</th><td>Couldn't read Postgres's statistics</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          <div className="it-subhead">Disk activity</div>
          {b.diskIo ? (
            <table className="it-table it-facts">
              <tbody>
                <tr><th>Busy</th><td>{Math.round(b.diskIo.busyPct)}%</td></tr>
                <tr><th>Queued requests</th><td>{b.diskIo.queue}</td></tr>
                <tr><th>Reads / writes</th><td>{Math.round(b.diskIo.readsPerSec)} / {Math.round(b.diskIo.writesPerSec)} per second</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="count">Only available on a Windows server.</p>
          )}
        </div>
      </div>
    </section>
  );
}
