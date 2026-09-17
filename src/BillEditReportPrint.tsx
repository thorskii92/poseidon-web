import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";

/**
 * Monthly Bill Modification Report. See billEditReport.ts for the change-
 * detection rule (numeric tolerance, else exact string compare) and why
 * "edited before" looks at the whole billeditorlog table, not just this
 * month. Styled after this app's own DashboardPage, same as the Monthly
 * Adjusted Bills Report — KPI tiles, plain tables, one chart — rather than
 * the printed-statement convention: this is an audit view for browsing,
 * not a document anyone signs.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

function signed(v: number): string {
  return `${v < 0 ? "−" : "+"}${peso.format(Math.abs(v))}`;
}
function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

type ChangedField = { label: string; before: string; after: string };
type LedgerRow = {
  id: number; billId: string; acctId: string; accountNo: string; accountName: string;
  standpipe: string; barangay: string; cluster: string; classification: string;
  consumerType: string; meterSize: string;
  editedOn: string | null; editedBy: string; reason: string; computation: string;
  scope: string; storedSummary: string;
  oldBill: number | null; newBill: number | null; consDelta: number | null; billDelta: number | null;
  editedBefore: boolean; flags: string[]; changes: ChangedField[];
};

type Report = {
  empty: boolean;
  month: string; year: number; generatedAt: string;
  summary: {
    total: number; accountsAffected: number; net: number;
    loweredN: number; loweredAmt: number; raisedN: number; raisedAmt: number;
    consNet: number; withReason: number; reasonPct: number; noNameN: number; staffCount: number;
  };
  byDay: { days: { day: number; count: number; net: number }[]; busiest: number; activeDays: number; daysInMonth: number };
  staffRows: { staff: string; edits: number; accounts: number; net: number }[];
  whatChanged: { label: string; count: number }[];
  reasonsGiven: { reason: string; count: number }[];
  needsReview: { key: string; title: string; count: number; note: string }[];
  ledger: LedgerRow[];
};

const FLAG_LABELS: Record<string, string> = {
  noreason: "No reason recorded",
  noname: "No staff name recorded",
  big: "Change of ₱5,000 or more",
  reading: "Meter reading changed",
  repeat: "Bill edited more than once",
  nochange: "No change detected",
};

function ord(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default function BillEditReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!month || !year) return;
    apiGet<Report>(`/api/reports/bill-edits?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, year]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.ledger.filter((r) => {
      if (staffFilter && r.editedBy !== staffFilter) return false;
      if (flagFilter && !r.flags.includes(flagFilter)) return false;
      if (!needle) return true;
      return (
        r.billId.toLowerCase().includes(needle) ||
        r.accountNo.toLowerCase().includes(needle) ||
        r.accountName.toLowerCase().includes(needle)
      );
    });
  }, [data, staffFilter, flagFilter, search]);

  if (!month || !year) {
    return (
      <div className="print-root">
        <div className="form-error">No month/year given.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="print-root">
        <div className="form-error">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="print-root">
        <p className="count">Building the report…</p>
      </div>
    );
  }

  const staffNames = [...new Set(data.ledger.map((r) => r.editedBy).filter(Boolean))].sort();

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <p className="account-no" style={{ textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Monthly Bill Modification Report
          </p>
          <h1>{data.month} {data.year}</h1>
        </div>
        <div className="head-actions no-print">
          <span className="count">Generated {new Date(data.generatedAt).toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          <button className="clear-filters" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {data.empty ? (
        <p className="count">No bills were edited in {data.month} {data.year}.</p>
      ) : (
        <>
          <p className="account-no" style={{ maxWidth: "60ch", fontSize: 15 }}>
            <strong>{data.summary.total}</strong> bill{data.summary.total === 1 ? " was" : "s were"} edited
            {data.summary.staffCount > 0
              ? ` by ${data.summary.staffCount} staff member${data.summary.staffCount === 1 ? "" : "s"}${data.summary.noNameN > 0 ? ` (plus ${data.summary.noNameN} entries with no name stored)` : ""}`
              : " by staff whose names were not recorded"}
            . Together the edits {data.summary.net < 0 ? "lowered" : data.summary.net > 0 ? "raised" : "left unchanged, net,"} billed charges by <strong>{peso.format(Math.abs(data.summary.net))}</strong>.
          </p>

          <section className="record-section">
            <div className="record-head">
              <h2>Edits by day</h2>
              <span className="count">{data.byDay.activeDays} of {data.byDay.daysInMonth} days had edits · busiest was the {data.byDay.busiest}{ord(data.byDay.busiest)}</span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.byDay.days} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} interval={2} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "#f4f7fa" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0]!.payload as (typeof data.byDay.days)[number];
                      return (
                        <div className="chart-tip">
                          <div className="chart-tip-head">{data.month} {p.day}</div>
                          <div className="chart-tip-row"><span>Edits</span><span>{p.count}</span></div>
                          {p.count > 0 && <div className="chart-tip-row total"><span>Net</span><span>{signed(p.net)}</span></div>}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Edits" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="dash-kpis">
            <KpiTile label="Bills edited" value={data.summary.total.toLocaleString()} sub={`${data.summary.accountsAffected} account${data.summary.accountsAffected === 1 ? "" : "s"} affected`} />
            <KpiTile label="Charges lowered" value={data.summary.loweredN.toLocaleString()} sub={data.summary.loweredN === 0 ? "—" : `${peso.format(data.summary.loweredAmt)} removed`} />
            <KpiTile label="Charges raised" value={data.summary.raisedN.toLocaleString()} sub={data.summary.raisedN === 0 ? "—" : `${peso.format(data.summary.raisedAmt)} added`} />
            <KpiTile label="Net billing effect" value={signed(data.summary.net)} sub="against original bills" />
            <KpiTile label="Consumption adjusted" value={`${data.summary.consNet > 0 ? "+" : data.summary.consNet < 0 ? "−" : ""}${Math.abs(data.summary.consNet).toLocaleString()}`} sub="cubic metres, net" />
            <KpiTile label="Reason recorded" value={`${data.summary.reasonPct}%`} sub={`${data.summary.withReason} of ${data.summary.total} entries`} />
          </div>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>Who edited</h2><span className="count">by EditedBy</span></div>
              <table>
                <thead><tr><th>Staff</th><th className="num">Edits</th><th className="num">Accounts</th><th className="num">Net billing change</th></tr></thead>
                <tbody>
                  {data.staffRows.map((s) => (
                    <tr key={s.staff || "—"}>
                      <td>{s.staff || <span className="muted">No name recorded</span>}</td>
                      <td className="num">{s.edits}</td><td className="num">{s.accounts}</td>
                      <td className="num">{s.net === 0 ? peso.format(0) : signed(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>What changed</h2><span className="count">how often each field was altered</span></div>
              <table>
                <thead><tr><th>Field</th><th className="num">Times changed</th></tr></thead>
                <tbody>
                  {data.whatChanged.length === 0 ? (
                    <tr><td colSpan={2} className="muted">No field changes recorded.</td></tr>
                  ) : (
                    data.whatChanged.map((f) => (
                      <tr key={f.label}><td>{f.label}</td><td className="num">{f.count}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </div>

          <div className="dash-charts">
            <section className="record-section">
              <div className="record-head"><h2>Reasons given</h2></div>
              <table>
                <thead><tr><th>Reason</th><th className="num">Count</th></tr></thead>
                <tbody>
                  {data.reasonsGiven.map((r) => (
                    <tr key={r.reason || "—"}>
                      <td>{r.reason || <span className="muted">Left blank</span>}</td>
                      <td className="num">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Needs review</h2><span className="count">before the month is signed off</span></div>
              {data.needsReview.length === 0 ? (
                <p className="dash-insight">Nothing flagged — every edit this month has a named editor, a stated reason, and no unusual pattern.</p>
              ) : (
                <div className="dash-insights">
                  {data.needsReview.map((f) => (
                    <div key={f.key} className="dash-insight">
                      <strong>{f.count}</strong> — {f.title}. {f.note}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="record-section">
            <div className="record-head"><h2>Every edit</h2><span className="count">{filtered.length} of {data.ledger.length} entries</span></div>
            <div className="chip-row" style={{ marginBottom: 12 }}>
              <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
                <option value="">All staff</option>
                {staffNames.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)}>
                <option value="">All entries</option>
                {Object.entries(FLAG_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <input
                className="search"
                style={{ width: 220 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bill or account number"
              />
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 28 }} />
                  <th>Date</th><th>Bill</th><th>Account</th><th>Staff</th><th>Reason</th>
                  <th className="num">Consumption</th><th className="num">Bill amount</th><th className="num">Change</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={r.flags.length ? "row-warning" : undefined}
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        <td>{isOpen ? "−" : "+"}</td>
                        <td>{fmtDate(r.editedOn)}</td>
                        <td>{r.billId}</td>
                        <td>{r.accountNo || `#${r.acctId}`}{r.accountName && <span className="cell-sub">{r.accountName}</span>}</td>
                        <td>{r.editedBy || <span className="muted">not recorded</span>}
                          {r.flags.length > 0 && (
                            <div style={{ marginTop: 2 }}>
                              {r.flags.map((f) => <span key={f} className="cell-sub" style={{ marginRight: 6 }}>{FLAG_LABELS[f]}</span>)}
                            </div>
                          )}
                        </td>
                        <td>{r.reason || <span className="muted">—</span>}</td>
                        <td className="num">{r.consDelta == null || r.consDelta === 0 ? "—" : `${r.consDelta > 0 ? "+" : "−"}${Math.abs(r.consDelta)}`}</td>
                        <td className="num">{r.newBill == null ? "—" : peso.format(r.newBill)}</td>
                        <td className="num">{r.billDelta == null || Math.abs(r.billDelta) < 0.005 ? "—" : signed(r.billDelta)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={9}>
                            <EditDetail row={r} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <p className="count" style={{ marginTop: 12 }}>No edits match this filter.</p>}
          </section>

          <section className="record-section">
            <div className="record-head"><h2>About this report</h2></div>
            <div className="dash-insights">
              <div className="dash-insight">Every figure is drawn from billeditorlog, which stores a full before/after copy of the bill each time it's saved from the bill editor — the field-by-field comparison here is exact, not inferred from a note.</div>
              <div className="dash-insight">The month shown is the month the edit was made, not the month the bill covers — a bill for March can appear in a June report if that's when someone changed it.</div>
              <div className="dash-insight">Edit timestamps have no time of day, so edits made on the same day cannot be put in order.</div>
              <div className="dash-insight">A blank reason does not necessarily mean the edit was improper — the reason box is optional in the bill editor, only that nothing was written down.</div>
              <div className="dash-insight">Money movement is measured from Bill amount, not Total amount due — on many older log entries the before-edit Total amount due and After-due amount hold the previous log entry's values rather than the bill being edited.</div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

function EditDetail({ row }: { row: LedgerRow }) {
  return (
    <div className="detail-wrap">
      <div className="detail-side" style={{ minWidth: 220 }}>
        <div className="field"><span className="field-label">Account</span><span className="field-value">{row.accountNo || `#${row.acctId}`}</span></div>
        {row.accountName && <div className="field"><span className="field-label">Consumer</span><span className="field-value">{row.accountName}</span></div>}
        {row.standpipe && <div className="field"><span className="field-label">Standpipe</span><span className="field-value">{row.standpipe}</span></div>}
        {row.barangay && <div className="field"><span className="field-label">Barangay</span><span className="field-value">{row.barangay}</span></div>}
        {row.cluster && <div className="field"><span className="field-label">Cluster</span><span className="field-value">{row.cluster}</span></div>}
        {row.classification && <div className="field"><span className="field-label">Classification</span><span className="field-value">{row.classification}</span></div>}
        {row.meterSize && <div className="field"><span className="field-label">Meter size</span><span className="field-value">{row.meterSize}</span></div>}
      </div>
      <div style={{ flex: 1 }}>
        {row.changes.length === 0 ? (
          <p className="count">The editor saved bill {row.billId} but every stored field matches the original.</p>
        ) : (
          <>
            <p className="count">
              {row.changes.length} field{row.changes.length > 1 ? "s" : ""} changed · bill {row.billId}
              {row.computation && ` · ${row.computation} computation`}
            </p>
            <table>
              <thead><tr><th>Field</th><th className="num">Before</th><th /><th className="num">After</th></tr></thead>
              <tbody>
                {row.changes.map((c) => (
                  <tr key={c.label}>
                    <td>{c.label}</td><td className="num">{c.before}</td><td style={{ textAlign: "center" }}>→</td>
                    <td className="num"><strong>{c.after}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="cell-sub" style={{ marginTop: 8 }}>
              {row.storedSummary
                ? `The system also stored its own summary: ${row.storedSummary}.`
                : "Reconstructed by comparing the stored before and after columns; this entry predates the system's own change summary."}
              {row.scope === "Previous Details" && " The edit was applied to the carried-forward previous balance, not the current month's charges."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
