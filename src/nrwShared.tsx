import type { ReactNode } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { m3, nrwTone, peso, shortDate, type Balance, type BalanceRow } from "./nrwData";

/**
 * Non-revenue water's pieces, shared by the page and its print view: the
 * produced-vs-billed and NRW % charts, the balance table and the tiles.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const PRODUCED = "var(--navy)";
const BILLED = "var(--blue-soft)";
const kTick = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));

const TONE_COLOR = { good: "#1f7a4d", warn: "#a36200", bad: "#b42318", "": "inherit" } as const;

export function NrwPct({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="count">—</span>;
  const tone = nrwTone(pct);
  return <b style={{ color: TONE_COLOR[tone] }}>{pct.toFixed(1)}%</b>;
}

/** Produced and billed per month, for the systems that have a balance that month. */
export function BalanceChart({ data, height = 240, animate = true }: { data: Balance; height?: number; animate?: boolean }) {
  const rows = data.byMonth.filter((m) => m.produced != null).map((m) => ({ ...m, billedShown: m.billedCounted }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 4 }} barGap={2}>
        <CartesianGrid stroke="#eef1f4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#e3e6ea" }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={kTick} />
        <Tooltip
          cursor={{ fill: "#f4f7fa" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as (typeof rows)[number];
            return (
              <div className="chart-tip">
                <div className="chart-tip-head">{p.label}</div>
                <div className="chart-tip-row"><span>Produced</span><span>{m3(p.produced!)}</span></div>
                <div className="chart-tip-row"><span>Billed</span><span>{m3(p.billedCounted)}</span></div>
                <div className="chart-tip-row total"><span>Non-revenue</span><span>{m3(p.nrw!)} · {p.nrwPct?.toFixed(1)}%</span></div>
                {p.systemsWithBalance < p.systems && (
                  <div className="chart-tip-row"><span>Systems counted</span><span>{p.systemsWithBalance} of {p.systems}</span></div>
                )}
              </div>
            );
          }}
        />
        <Bar dataKey="produced" name="Produced" fill={PRODUCED} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
        <Bar dataKey="billedShown" name="Billed" fill={BILLED} radius={[4, 4, 0, 0]} isAnimationActive={animate} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BalanceLegend() {
  const sw = (color: string) => <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />;
  return (
    <div className="count" style={{ display: "flex", gap: 16, marginTop: 4 }}>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{sw(PRODUCED)}Produced</span>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>{sw(BILLED)}Billed</span>
    </div>
  );
}

/** NRW as a share of production, month by month, with the usual 20% target. */
export function NrwPctChart({ data, height = 180, animate = true }: { data: Balance; height?: number; animate?: boolean }) {
  const rows = data.byMonth.filter((m) => m.nrwPct != null);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="#eef1f4" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "#e3e6ea" }} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} unit="%" domain={[0, (max: number) => Math.max(40, Math.ceil(max / 10) * 10)]} />
        <ReferenceLine y={20} stroke="#1f7a4d" strokeDasharray="4 4" label={{ value: "20% target", position: "insideTopRight", fontSize: 11, fill: "#1f7a4d" }} />
        <Tooltip
          cursor={{ stroke: "#cbd5e1" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]!.payload as (typeof rows)[number];
            return (
              <div className="chart-tip">
                <div className="chart-tip-head">{p.label}</div>
                <div className="chart-tip-row total"><span>NRW</span><span>{p.nrwPct?.toFixed(1)}%</span></div>
                {p.lossValue != null && <div className="chart-tip-row"><span>Value of losses</span><span>{peso(p.lossValue)}</span></div>}
              </div>
            );
          }}
        />
        <Line dataKey="nrwPct" name="NRW %" stroke="var(--navy)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={animate} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function KpiTile({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

export function NrwKpis({ data }: { data: Balance }) {
  const s = data.summary;
  return (
    <>
      <KpiTile
        label="NRW, latest month"
        value={s.latest ? <NrwPct pct={s.latest.nrwPct} /> : "—"}
        sub={s.latest ? `${s.latest.label} · ${m3(s.latest.nrw ?? 0)} not billed` : "no production logged yet"}
      />
      <KpiTile
        label="Average NRW"
        value={s.averageNrwPct != null ? <NrwPct pct={s.averageNrwPct} /> : "—"}
        sub={s.monthsWithBalance ? `over ${s.monthsWithBalance} month${s.monthsWithBalance === 1 ? "" : "s"} with a balance` : undefined}
      />
      <KpiTile label="Value of losses" value={peso(s.lossValueLast12)} sub="at each month's billed ₱ per m³, last 12 months" />
      <KpiTile label="Production sources" value={String(s.sources)} sub="active, logging daily" />
    </>
  );
}

/** The water balance, one row per system and billing month. */
export function BalanceTable({ rows, onAllowances }: { rows: BalanceRow[]; onAllowances?: (r: BalanceRow) => void }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Month</th>
          <th>System</th>
          <th className="n">Produced</th>
          <th className="n">Billed</th>
          <th className="n">Authorised unbilled</th>
          <th className="n">Non-revenue</th>
          <th className="n">NRW %</th>
          <th className="n">Losses</th>
          <th className="n">Value of losses</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.zoneId}-${r.year}-${r.month}`}>
            <td>
              {r.label}
              <div className="count">{shortDate(r.from)} – {shortDate(r.to)}</div>
            </td>
            <td title={r.system}>{r.short || r.system}</td>
            <td className="n">
              {r.produced != null ? m3(r.produced) : <span className="count">{r.sources ? `${r.coverage}% logged` : "no source"}</span>}
              {r.produced != null && (r.coverage < 100 || r.estimated > 0) && (
                <div className="count" title="Days with no log are filled at the source's average; pump-hour sources are estimates">
                  {r.coverage < 100 ? `${r.coverage}% logged` : ""}
                  {r.coverage < 100 && r.estimated > 0 ? " · " : ""}
                  {r.estimated > 0 ? `${m3(r.estimated)} est.` : ""}
                </div>
              )}
            </td>
            <td className="n">{m3(r.billed)}</td>
            <td className="n">
              {r.authorised ? m3(r.authorised) : "—"}
              {onAllowances && (
                <div><button className="link-button" onClick={() => onAllowances(r)}>{r.authorised ? "edit" : "add"}</button></div>
              )}
            </td>
            <td className="n">{r.nrw != null ? m3(r.nrw) : "—"}</td>
            <td className="n">
              <NrwPct pct={r.nrwPct} />
              {r.suspect && <div className="count" title="Billed more than was produced — check the production readings or a source missing from this system">check readings</div>}
            </td>
            <td className="n">{r.losses != null ? m3(r.losses) : "—"}</td>
            <td className="n">{r.lossValue != null ? peso(r.lossValue) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
