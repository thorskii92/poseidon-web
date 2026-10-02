import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./api";
import { BalanceChart, BalanceLegend, BalanceTable, KpiTile, NrwKpis, NrwPctChart } from "./nrwShared";
import {
  FLAG_LABEL, m3, meterHealthCsv, rowsToShow, shortDate,
  type Balance, type BalanceRow, type LogSheet, type MeterHealth, type Source, type Systems,
} from "./nrwData";

/**
 * Non-Revenue Water — water produced that never becomes a bill, per water
 * system and billing month, from a daily production log; plus the meters
 * whose billing looks wrong. The maths is in poseidon-api/src/nrw.ts.
 */

const TABS = ["Water balance", "Production log", "Meter health", "Sources"] as const;
type Tab = (typeof TABS)[number];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function NonRevenueWaterPage() {
  const [tab, setTab] = useState<Tab>("Water balance");
  const { data: systems } = useQuery<Systems>({ queryKey: ["nrw", "systems"], queryFn: () => apiGet("/api/nrw/systems") });
  const noSources = !!systems && systems.systems.every((s) => !s.sources.length);

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Non-Revenue Water</h1>
          <p className="account-no">
            Water produced minus water billed, per water system and billing month — and the meters that may be under-reading.
          </p>
        </div>
      </div>

      {noSources && tab !== "Sources" && tab !== "Meter health" && (
        <div className="info-banner">
          No production sources yet. Add each intake or well under{" "}
          <button className="link-button" onClick={() => setTab("Sources")}>Sources</button>, then log their meter readings
          (or pump hours) daily. Meter health works already — it reads billing only.
        </div>
      )}

      <div className="stage-tabs">
        {TABS.map((t) => (
          <button key={t} className={tab === t ? "stage-tab current" : "stage-tab"} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Water balance" && <BalanceTab systems={systems} />}
      {tab === "Production log" && <LogTab systems={systems} />}
      {tab === "Meter health" && <HealthTab systems={systems} />}
      {tab === "Sources" && <SourcesTab systems={systems} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SystemSelect({ systems, value, onChange, label = "Water system" }: { systems?: Systems; value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <label className="field-input" style={{ margin: 0 }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={0}>All systems</option>
        {(systems?.systems ?? []).map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.active ? "" : " (inactive)"}</option>
        ))}
      </select>
    </label>
  );
}

function BalanceTab({ systems }: { systems?: Systems }) {
  const [zoneId, setZoneId] = useState(0);
  const [months, setMonths] = useState(12);
  const [editing, setEditing] = useState<BalanceRow | null>(null);
  const qs = new URLSearchParams({ months: String(months), zoneId: String(zoneId) }).toString();
  const { data, error, isFetching } = useQuery<Balance>({
    queryKey: ["nrw", "summary", qs],
    queryFn: () => apiGet(`/api/nrw/summary?${qs}`),
    placeholderData: (prev) => prev,
  });
  const { shown: rows, hiddenMonths } = rowsToShow(data?.rows ?? []);
  const hasBalance = (data?.summary.monthsWithBalance ?? 0) > 0;

  return (
    <>
      <section className="record-section">
        <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end", flexWrap: "wrap" }}>
          <SystemSelect systems={systems} value={zoneId} onChange={setZoneId} />
          <label className="field-input" style={{ margin: 0 }}>
            <span>Months</span>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[6, 12, 24].map((m) => <option key={m} value={m}>Last {m} billing months</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button className="primary" disabled={!data} onClick={() => window.open(`/nrw/print?${qs}`, "_blank")}>Print</button>
        </div>
      </section>

      {error && <div className="form-error">{(error as Error).message}</div>}
      {!data && !error && <p className="count">Working out the water balance…</p>}

      {data && (
        <div style={{ opacity: isFetching ? 0.6 : 1 }}>
          <div className="dash-kpis"><NrwKpis data={data} /></div>

          {hasBalance && (
            <section className="record-section">
              <div className="record-head"><h2>Produced vs billed</h2><span className="count">systems with production logged</span></div>
              <div className="chart"><BalanceChart data={data} /></div>
              <BalanceLegend />
              <div className="record-head" style={{ marginTop: 16 }}><h2>Non-revenue water</h2><span className="count">share of production</span></div>
              <div className="chart"><NrwPctChart data={data} /></div>
            </section>
          )}

          <section className="record-section">
            <div className="record-head">
              <h2>Water balance</h2>
              <span className="count">Produced − billed − authorised unbilled = losses · a month needs {data.minCoveragePct}% of its days logged</span>
            </div>
            {rows.length ? (
              <>
                <BalanceTable rows={rows} onAllowances={systems?.canEdit ? setEditing : undefined} />
                {hiddenMonths > 0 && <p className="count">{hiddenMonths} earlier month{hiddenMonths === 1 ? "" : "s"} with no production logged not shown.</p>}
              </>
            ) : (
              <p className="count">No billing months yet.</p>
            )}
          </section>

          <p className="count">
            Produced is counted over each billing month's own reading period (e.g. 20 Aug – 20 Sep), so it lines up with what was billed.
            Days without a log are filled at the source's average; pump-hour sources are estimates. Authorised unbilled is water used on
            purpose without a bill (flushing, fire fighting, the office) — the rest of the non-revenue water is losses: leaks, theft and meter error.
          </p>
        </div>
      )}

      {editing && <AllowanceDialog row={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const ALLOWANCE_KINDS = ["Main flushing", "Fire fighting", "Office & plant use", "Tank cleaning", "Other"];

function AllowanceDialog({ row, onClose }: { row: BalanceRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [items, setItems] = useState(
    row.allowances.length ? row.allowances.map((a) => ({ ...a, m3: String(a.m3) })) : [{ kind: ALLOWANCE_KINDS[0]!, m3: "", note: "" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPut("/api/nrw/allowances", {
        zoneId: row.zoneId, year: row.year, month: row.month,
        items: items.map((i) => ({ ...i, m3: Number(i.m3) || 0 })),
      });
      qc.invalidateQueries({ queryKey: ["nrw", "summary"] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const set = (i: number, patch: Partial<(typeof items)[number]>) => setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Authorised unbilled water</h2>
        <p className="modal-sub">{row.system} · {row.label} ({shortDate(row.from)} – {shortDate(row.to)})</p>
        {items.map((it, i) => (
          <div key={i} className="form-actions" style={{ marginTop: 0, alignItems: "flex-end" }}>
            <label className="field-input" style={{ margin: 0 }}>
              <span>Use</span>
              <select value={it.kind} onChange={(e) => set(i, { kind: e.target.value })}>
                {[...new Set([...ALLOWANCE_KINDS, it.kind])].map((k) => <option key={k}>{k}</option>)}
              </select>
            </label>
            <label className="field-input" style={{ margin: 0, width: 110 }}>
              <span>m³</span>
              <input type="number" min={0} value={it.m3} onChange={(e) => set(i, { m3: e.target.value })} />
            </label>
            <label className="field-input" style={{ margin: 0, flex: 1 }}>
              <span>Note</span>
              <input value={it.note} onChange={(e) => set(i, { note: e.target.value })} placeholder="e.g. flushing after repair on Rizal St." />
            </label>
            <button className="clear-filters" onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <button className="link-button" onClick={() => setItems((prev) => [...prev, { kind: ALLOWANCE_KINDS[0]!, m3: "", note: "" }])}>+ Add another</button>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="clear-filters" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Draft = { reading: string; pumpHours: string; reset: boolean; volume: string; note: string };

function LogTab({ systems }: { systems?: Systems }) {
  const [date, setDate] = useState(today);
  const [notice, setNotice] = useState("");
  const { data, isFetching, dataUpdatedAt } = useQuery<LogSheet>({
    queryKey: ["nrw", "logs", date],
    queryFn: () => apiGet(`/api/nrw/logs?date=${date}`),
  });

  const shift = (days: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

  return (
    <section className="record-section">
      {notice && <div className="action-notice" onAnimationEnd={() => setNotice("")}>{notice}</div>}
      <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end" }}>
        <button className="clear-filters" onClick={() => shift(-1)}>◀</button>
        <label className="field-input" style={{ margin: 0 }}>
          <span>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <button className="clear-filters" disabled={date >= today()} onClick={() => shift(1)}>▶</button>
        <span className="count">{isFetching ? "Loading…" : "Meter sources: today's reading. Pump sources: hours run."}</span>
      </div>

      {/* Keyed so a new day (or a fresh load after saving) starts a fresh sheet. */}
      {data && data.date === date && (
        <LogSheetForm key={`${date}-${dataUpdatedAt}`} data={data} systems={systems} onSaved={setNotice} />
      )}
      <p className="count">
        Meter readings are running totals, so a missed day is fine — the next reading covers the days in between. Clearing a box deletes that day's entry.
      </p>
    </section>
  );
}

function LogSheetForm({ data, systems, onSaved }: { data: LogSheet; systems?: Systems; onSaved: (notice: string) => void }) {
  const qc = useQueryClient();
  const date = data.date;
  const [drafts, setDrafts] = useState<Record<number, Draft>>(() =>
    Object.fromEntries(data.sources.map((s) => [s.id, {
      reading: s.entry?.reading != null ? String(s.entry.reading) : "",
      pumpHours: s.entry?.pumpHours != null ? String(s.entry.pumpHours) : "",
      reset: !!s.entry?.reset,
      volume: s.entry?.volume != null ? String(s.entry.volume) : "",
      note: s.entry?.note ?? "",
    }])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = !!systems?.canEdit;
  const systemName = new Map((systems?.systems ?? []).map((s) => [s.id, s.short || s.name]));

  const set = (id: number, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPut("/api/nrw/logs", {
        date,
        entries: data.sources.map((s) => ({ sourceId: s.id, ...drafts[s.id] })),
      });
      onSaved(`Saved the log for ${shortDate(date)}`);
      qc.invalidateQueries({ queryKey: ["nrw"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!data.sources.length && <p className="count">No active sources. Add them under Sources.</p>}

      {data.sources.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>System</th>
              <th>Source</th>
              <th>Last entry</th>
              <th>Today</th>
              <th className="n">m³ that day</th>
              <th>Last 7 days (m³)</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => {
              const d = drafts[s.id];
              if (!d) return null;
              return (
                <tr key={s.id}>
                  <td>{systemName.get(s.zoneId) ?? ""}</td>
                  <td>
                    {s.name}
                    <div className="count">{s.method === "meter" ? `meter${s.multiplier !== 1 ? ` × ${s.multiplier}` : ""}` : `pump · ${s.pumpRate} m³/h (estimate)`}</div>
                  </td>
                  <td className="count">
                    {s.previous
                      ? `${shortDate(s.previous.date)}: ${s.method === "meter" ? s.previous.reading?.toLocaleString("en-PH") : `${s.previous.pumpHours} h`}`
                      : "—"}
                  </td>
                  <td>
                    {s.method === "meter" ? (
                      <>
                        <input
                          type="number" min={0} step="any" style={{ width: 130 }} disabled={!canEdit}
                          value={d.reading} placeholder="Meter reading"
                          onChange={(e) => set(s.id, { reading: e.target.value })}
                        />
                        <label className="count" style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }} title="The meter was replaced or rolled over: this reading starts again">
                          <input type="checkbox" disabled={!canEdit} checked={d.reset} onChange={(e) => set(s.id, { reset: e.target.checked })} /> New meter
                        </label>
                        {d.reset && (
                          <input
                            type="number" min={0} step="any" style={{ width: 130, marginTop: 4 }} disabled={!canEdit}
                            value={d.volume} placeholder="m³ that day (est.)"
                            onChange={(e) => set(s.id, { volume: e.target.value })}
                          />
                        )}
                      </>
                    ) : (
                      <input
                        type="number" min={0} max={24} step="0.25" style={{ width: 90 }} disabled={!canEdit}
                        value={d.pumpHours} placeholder="Hours"
                        onChange={(e) => set(s.id, { pumpHours: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="n">{s.todayM3 != null ? m3(s.todayM3) : "—"}</td>
                  <td className="count" style={{ whiteSpace: "nowrap" }}>
                    {s.week.map((w) => (w.m3 == null ? "·" : Math.round(w.m3).toLocaleString("en-PH"))).join("  ")}
                  </td>
                  <td>
                    <input value={d.note} disabled={!canEdit} onChange={(e) => set(s.id, { note: e.target.value })} placeholder="optional" />
                    {s.entry?.by && <div className="count">by {s.entry.by}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && <div className="form-error" style={{ whiteSpace: "pre-line" }}>{error}</div>}
      {canEdit ? (
        data && data.sources.length > 0 && (
          <div className="form-actions">
            <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : `Save ${shortDate(date)}`}</button>
          </div>
        )
      ) : (
        <p className="count">Recording production needs the “Record water production” permission.</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function HealthTab({ systems }: { systems?: Systems }) {
  const [zoneId, setZoneId] = useState(0);
  const [flag, setFlag] = useState<"" | "stuck" | "backwards" | "drop">("");
  const { data, error, isFetching } = useQuery<MeterHealth>({
    queryKey: ["nrw", "health", zoneId],
    queryFn: () => apiGet(`/api/nrw/meter-health?zoneId=${zoneId}`),
    placeholderData: (prev) => prev,
  });
  const [showAll, setShowAll] = useState(false);
  const shown = (data?.flags ?? []).filter((f) => !flag || f.flag === flag);
  const listed = showAll ? shown : shown.slice(0, 50);

  function exportCsv() {
    if (!data) return;
    const blob = new Blob(["﻿" + meterHealthCsv({ ...data, flags: shown })], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meter-health.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <section className="record-section">
        <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end" }}>
          <SystemSelect systems={systems} value={zoneId} onChange={setZoneId} />
          <label className="field-input" style={{ margin: 0 }}>
            <span>Show</span>
            <select value={flag} onChange={(e) => setFlag(e.target.value as typeof flag)}>
              <option value="">Everything flagged</option>
              {(Object.keys(FLAG_LABEL) as (keyof typeof FLAG_LABEL)[]).map((k) => <option key={k} value={k}>{FLAG_LABEL[k]}</option>)}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button className="clear-filters" disabled={!shown.length} onClick={exportCsv}>Export CSV</button>
        </div>
      </section>

      {error && <div className="form-error">{(error as Error).message}</div>}
      {data && (
        <div style={{ opacity: isFetching ? 0.6 : 1 }}>
          <div className="dash-kpis">
            <KpiTile label="Stuck meters" value={String(data.counts.stuck)} sub="0 m³ on three bills in a row" />
            <KpiTile label="Sudden drops" value={String(data.counts.drop)} sub="last 3 bills under 40% of before" />
            <KpiTile label="Readings went backwards" value={String(data.counts.backwards)} />
            <KpiTile label="Possibly unbilled" value={m3(data.lostPerMonth)} sub={`a month, from ${data.accountsChecked.toLocaleString("en-PH")} active accounts`} />
          </div>
          <section className="record-section">
            <div className="record-head">
              <h2>Meters to check</h2>
              <span className="count">{shown.length} account(s) · largest likely loss first</span>
            </div>
            {shown.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Barangay</th>
                    <th>Meter No.</th>
                    <th>Why</th>
                    <th className="n">Earlier avg</th>
                    <th className="n">Last 3 avg</th>
                    <th className="n">Est. unbilled / month</th>
                    <th>Last read</th>
                  </tr>
                </thead>
                <tbody>
                  {listed.map((f) => (
                    <tr key={f.acctId}>
                      <td><Link to={`/accounts/${f.acctId}`}>{f.accountNo}</Link><div className="count">{f.name}</div></td>
                      <td>{f.barangay}{f.system ? <div className="count">{f.system}</div> : null}</td>
                      <td>{f.meterNo || "—"}</td>
                      <td>{FLAG_LABEL[f.flag]}</td>
                      <td className="n">{f.priorAvg != null ? `${f.priorAvg} m³` : "—"}</td>
                      <td className="n">{f.recentAvg} m³</td>
                      <td className="n">{f.lostPerMonth != null ? m3(f.lostPerMonth) : "—"}</td>
                      <td>{shortDate(f.lastRead)}<div className="count">{f.lastReading.toLocaleString("en-PH")}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="count">Nothing flagged.</p>
            )}
            {shown.length > listed.length && (
              <div className="form-actions">
                <button className="clear-filters" onClick={() => setShowAll(true)}>Show all {shown.length}</button>
                <span className="count">Export CSV has every one.</span>
              </div>
            )}
          </section>
          <p className="count">
            From the last 11 months of bills of active accounts (fire hydrants left out). A flag isn't proof — a vacant house reads 0 too —
            but each is worth a field check: a stuck or tampered meter is water delivered and never billed.
          </p>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

type SourceForm = { id?: number; zoneId: number; name: string; method: "meter" | "pump"; multiplier: string; pumpRate: string; active: boolean; note: string };
const blankSource = (zoneId: number): SourceForm => ({ zoneId, name: "", method: "meter", multiplier: "1", pumpRate: "", active: true, note: "" });

function SourcesTab({ systems }: { systems?: Systems }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<SourceForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = !!systems?.canEdit;

  async function save() {
    if (!form) return;
    setBusy(true);
    setError("");
    try {
      const body = { ...form, multiplier: Number(form.multiplier) || 1, pumpRate: Number(form.pumpRate) || 0 };
      if (form.id) await apiPut(`/api/nrw/sources/${form.id}`, body);
      else await apiPost("/api/nrw/sources", body);
      qc.invalidateQueries({ queryKey: ["nrw"] });
      setForm(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const edit = (s: Source) => setForm({ id: s.id, zoneId: s.zoneId, name: s.name, method: s.method, multiplier: String(s.multiplier), pumpRate: String(s.pumpRate || ""), active: s.active, note: s.note });

  return (
    <>
      {(systems?.systems ?? []).filter((z) => z.active || z.sources.length || z.barangays).map((z) => (
        <section key={z.id} className="record-section">
          <div className="record-head">
            <h2>{z.name}{z.active ? "" : " (inactive)"}</h2>
            {canEdit && <button className="clear-filters" onClick={() => { setError(""); setForm(blankSource(z.id)); }}>+ Add source</button>}
          </div>
          <p className="count" style={{ marginTop: 0 }}>{z.barangays ? `Serves ${z.barangays}` : "No barangays assigned"}</p>
          {z.sources.length ? (
            <table>
              <thead><tr><th>Source</th><th>Measured by</th><th>Status</th><th>Note</th><th /></tr></thead>
              <tbody>
                {z.sources.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.method === "meter" ? `Production meter${s.multiplier !== 1 ? ` (× ${s.multiplier})` : ""}` : `Pump hours × ${s.pumpRate} m³/h — estimate`}</td>
                    <td>{s.active ? "Active" : "Retired"}</td>
                    <td>{s.note}</td>
                    <td>{canEdit && <button className="link-button" onClick={() => { setError(""); edit(s); }}>Edit</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="count">No sources yet — without one, this system has no water balance.</p>
          )}
        </section>
      ))}

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{form.id ? "Edit source" : "Add a source"}</h2>
            <p className="modal-sub">{systems?.systems.find((z) => z.id === form.zoneId)?.name}</p>
            <div className="form-grid">
              <label className="field-input">
                <span>Name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Calupisan intake, Well no. 2" />
              </label>
              <label className="field-input">
                <span>Water system</span>
                <select value={form.zoneId} onChange={(e) => setForm({ ...form, zoneId: Number(e.target.value) })}>
                  {(systems?.systems ?? []).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </label>
              <label className="field-input">
                <span>Measured by</span>
                <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as "meter" | "pump" })}>
                  <option value="meter">Production meter (daily reading)</option>
                  <option value="pump">No meter — pump hours × rated output</option>
                </select>
              </label>
              {form.method === "meter" ? (
                <label className="field-input" title="m³ per unit on the meter's dial — 1 for most meters, 10 or 0.1 for some bulk meters">
                  <span>Multiplier (m³ per unit)</span>
                  <input type="number" min={0} step="any" value={form.multiplier} onChange={(e) => setForm({ ...form, multiplier: e.target.value })} />
                </label>
              ) : (
                <label className="field-input" title="From the pump's nameplate or a bucket/flow test">
                  <span>Pump output (m³ per hour)</span>
                  <input type="number" min={0} step="any" value={form.pumpRate} onChange={(e) => setForm({ ...form, pumpRate: e.target.value })} />
                </label>
              )}
              <label className="field-input">
                <span>Note</span>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional" />
              </label>
              {form.id && (
                <label className="field-input" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                  <span style={{ margin: 0 }}>Active (untick to retire it; its old logs stay)</span>
                </label>
              )}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
              <button className="clear-filters" onClick={() => setForm(null)}>Cancel</button>
              <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {!canEdit && <p className="count">Adding or changing sources needs the “Record water production” permission.</p>}
      <p className="count">
        Each intake or well that feeds a system is a source. Metered sources log their running meter reading; unmetered ones log the
        hours the pump ran, multiplied by its rated output — an estimate until a meter is fitted.
      </p>
    </>
  );
}
