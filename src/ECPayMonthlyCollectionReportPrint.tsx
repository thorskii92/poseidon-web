import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";

/**
 * ECPay Monthly Collection Report — ported from frmMonthlyCollectionReportLoad
 * (BuildHtml). Same grouping and the same six-month trend as the desktop
 * version, dressed the same way as the Daily Collection Report: header/
 * logos, paper/orientation/scale, four-slot signatories — see
 * ECPayDailyCollectionReportPrint.tsx for why this report gets that
 * treatment instead of BillEditReportPrint's unsigned-audit-view one.
 */

const LOGO_SRC = {
  municipal: "/api/settings/logo/municipal",
  office: "/api/settings/logo/office",
} as const;

function Seal({ which }: { which: keyof typeof LOGO_SRC }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return <img className="bill-seal" src={LOGO_SRC[which]} alt="" onError={hide} />;
}

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type Grouped = { key: string; count: number; amount: number };
type DailyRow = { day: number; weekday: number; count: number; amount: number; running: number };
type WeekdayRow = { label: string; count: number; amount: number; occurrences: number; avgPerOccurrence: number };
type AgeRow = { label: string; count: number; amount: number };
type TrendRow = { month: string; monthLabel: string; count: number; amount: number; avgTxn: number };
type TopAccount = {
  rank: number; accountNo: string; acctName: string; brgyName: string; className: string;
  count: number; amount: number; share: number;
};

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: {
    total: number; count: number; distinctAccounts: number; avgTxn: number;
    avgPerActiveDay: number; activeDays: number; daysInMonth: number;
    bestDay: { day: number; count: number; amount: number; label: string };
    consump: number;
  };
  vsPreviousMonth?: { prevMonthLabel: string; prevTotal: number; prevCount: number; deltaPct: number | null } | null;
  insights?: string[];
  unlinked?: number;
  afterDue?: number;
  daily?: DailyRow[];
  weekday?: WeekdayRow[];
  byBranch?: Grouped[];
  ageing?: AgeRow[];
  byClassification?: Grouped[];
  byBarangay?: Grouped[];
  byCluster?: Grouped[];
  byZone?: Grouped[];
  byBClass?: Grouped[];
  bySenior?: Grouped[];
  sixMonthTrend?: TrendRow[];
  breakdown?: { wsf: number; enviFee: number; appFee: number; scDiscountAmount: number; scDiscountCount: number };
  cashProof?: { received: number; billedTotal: number; penaltyTotal: number; difference: number };
  topAccounts?: TopAccount[];
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

/** Plain table + a lightweight CSS bar in its own column — the same helper
 * ECPayDailyCollectionReportPrint.tsx uses, duplicated here rather than
 * shared since every print view in this app keeps its own small
 * presentational helpers instead of a common import. */
function GroupTable({ rows, label, total }: { rows: Grouped[]; label: string; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <table>
      <thead>
        <tr>
          <th>{label}</th>
          <th className="n">Payments</th>
          <th className="n">Amount</th>
          <th className="n">Share</th>
          <th>&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
            <td className="n">{peso.format(r.amount)}</td>
            <td className="n">{total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : "—"}</td>
            <td style={{ width: 120 }}>
              <div style={{ background: "var(--tint)", borderRadius: 3, overflow: "hidden", height: 8 }}>
                <div style={{ width: `${(r.amount / max) * 100}%`, background: "var(--blue)", height: "100%" }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="n">{peso.format(rows.reduce((s, r) => s + r.amount, 0))}</td>
          <td className="n">100.0%</td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

export default function ECPayMonthlyCollectionReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-monthly-collection");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/monthly-collection?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) {
    return (
      <div className="print-root">
        <div className="form-error">No month given.</div>
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

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header className="ecpay-head">
          <Seal which="municipal" />
          <div>
            <div>Republic of the Philippines</div>
            <div>PROVINCE OF PALAWAN</div>
            <div>{data.office.officeHeader || data.office.municipalHeader}</div>
            <div className="soa-office">{data.office.officeName}</div>
            {data.office.officeAddress && <div className="soa-address">{data.office.officeAddress}</div>}
          </div>
          <Seal which="office" />
        </header>

        <p className="ecpay-kicker">ECPay Monthly Collection Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No ECPay collections were posted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Total collected"
                value={peso.format(data.kpis.total)}
                sub={`${data.kpis.count.toLocaleString()} payments`}
              />
              <KpiTile
                label="Accounts served"
                value={data.kpis.distinctAccounts.toLocaleString()}
                sub={`${peso.format(data.kpis.avgTxn)} average payment`}
              />
              <KpiTile
                label="Daily average"
                value={peso.format(data.kpis.avgPerActiveDay)}
                sub={`${data.kpis.activeDays} of ${data.kpis.daysInMonth} days with activity`}
              />
              <KpiTile
                label="Best day"
                value={peso.format(data.kpis.bestDay.amount)}
                sub={`${data.kpis.bestDay.label}, ${data.kpis.bestDay.count} payments`}
              />
              <KpiTile
                label="Against last month"
                value={data.vsPreviousMonth?.deltaPct != null ? `${data.vsPreviousMonth.deltaPct >= 0 ? "+" : ""}${data.vsPreviousMonth.deltaPct.toFixed(1)}%` : "—"}
                sub={data.vsPreviousMonth ? `${data.vsPreviousMonth.prevMonthLabel}: ${peso.format(data.vsPreviousMonth.prevTotal)}` : "No ECPay collections recorded"}
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Daily collection trend</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.daily ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="day" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ stroke: "#cbd5e1" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as DailyRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">Day {p.day}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="amount" name="Amount" stroke="var(--navy)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="n">Day</th><th>Weekday</th><th className="n">Payments</th>
                    <th className="n">Amount</th><th className="n">Share</th><th className="n">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.daily ?? []).map((d) => (
                    <tr key={d.day} className={d.count === 0 ? "muted" : undefined}>
                      <td className="n">{d.day}</td>
                      <td>{WEEKDAY_SHORT[d.weekday]}</td>
                      <td className="n">{d.count}</td>
                      <td className="n">{peso.format(d.amount)}</td>
                      <td className="n">{data.kpis!.total > 0 ? `${((d.amount / data.kpis!.total) * 100).toFixed(1)}%` : "—"}</td>
                      <td className="n">{peso.format(d.running)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="n">{data.kpis.count}</td>
                    <td className="n">{peso.format(data.kpis.total)}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(data.kpis.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by ECPay branch</h2></div>
              <GroupTable rows={data.byBranch ?? []} label="Branch" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>Age of the bills settled</h2></div>
                <p className="count">How far behind the bill was when the consumer paid.</p>
                <table>
                  <thead>
                    <tr><th>Bill period</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Share</th></tr>
                  </thead>
                  <tbody>
                    {(data.ageing ?? []).map((a) => (
                      <tr key={a.label}>
                        <td>{a.label}</td>
                        <td className="n">{a.count}</td>
                        <td className="n">{peso.format(a.amount)}</td>
                        <td className="n">{data.kpis!.total > 0 ? `${((a.amount / data.kpis!.total) * 100).toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="record-section">
                <div className="record-head"><h2>Weekday pattern</h2></div>
                <p className="count">Average collection per occurrence of each weekday.</p>
                <table>
                  <thead>
                    <tr><th>Weekday</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Average per day</th></tr>
                  </thead>
                  <tbody>
                    {(data.weekday ?? []).map((w) => (
                      <tr key={w.label}>
                        <td>{w.label}</td>
                        <td className="n">{w.count}</td>
                        <td className="n">{peso.format(w.amount)}</td>
                        <td className="n">{peso.format(w.avgPerOccurrence)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Collections by consumer classification</h2></div>
              <GroupTable rows={data.byClassification ?? []} label="Classification" total={data.kpis.total} />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by barangay</h2></div>
              <GroupTable rows={data.byBarangay ?? []} label="Barangay" total={data.kpis.total} />
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Top clusters</h2>
                <span className="count">Top 12 by amount</span>
              </div>
              <GroupTable rows={data.byCluster ?? []} label="Cluster" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By water system</h2></div>
                <GroupTable rows={data.byZone ?? []} label="Zone / water system" total={data.kpis.total} />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Urban and rural</h2></div>
                <GroupTable rows={data.byBClass ?? []} label="Barangay class" total={data.kpis.total} />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Senior citizen accounts</h2></div>
              <GroupTable rows={data.bySenior ?? []} label="Consumer" total={data.kpis.total} />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Six-month collection trend</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.sixMonthTrend ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="monthLabel" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as TrendRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.monthLabel}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr><th>Month</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Average payment</th></tr>
                </thead>
                <tbody>
                  {(data.sixMonthTrend ?? []).map((t) => (
                    <tr key={t.month}>
                      <td>{t.monthLabel}</td>
                      <td className="n">{t.count}</td>
                      <td className="n">{peso.format(t.amount)}</td>
                      <td className="n">{peso.format(t.avgTxn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {data.breakdown && data.cashProof && (
              <section className="record-section">
                <div className="record-head"><h2>Collection breakdown and cash proof</h2></div>
                <div className="notice-columns">
                  <div>
                    <p className="count">Components of the bills settled through ECPay.</p>
                    <table>
                      <thead>
                        <tr><th>Particular</th><th className="n">Amount</th><th className="n">Share</th></tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Water sales and charges</td>
                          <td className="n">{peso.format(data.breakdown.wsf)}</td>
                          <td className="n">{data.cashProof.billedTotal > 0 ? `${((data.breakdown.wsf / data.cashProof.billedTotal) * 100).toFixed(1)}%` : "—"}</td>
                        </tr>
                        <tr>
                          <td>Environmental fee</td>
                          <td className="n">{peso.format(data.breakdown.enviFee)}</td>
                          <td className="n">{data.cashProof.billedTotal > 0 ? `${((data.breakdown.enviFee / data.cashProof.billedTotal) * 100).toFixed(1)}%` : "—"}</td>
                        </tr>
                        <tr>
                          <td>Application fee</td>
                          <td className="n">{peso.format(data.breakdown.appFee)}</td>
                          <td className="n">{data.cashProof.billedTotal > 0 ? `${((data.breakdown.appFee / data.cashProof.billedTotal) * 100).toFixed(1)}%` : "—"}</td>
                        </tr>
                      </tbody>
                      <tfoot>
                        <tr className="bold">
                          <td>Total amount due on the bills</td>
                          <td className="n">{peso.format(data.cashProof.billedTotal)}</td>
                          <td className="n">100.0%</td>
                        </tr>
                      </tfoot>
                    </table>
                    <p className="setting-note">
                      Senior citizen discount of {peso.format(data.breakdown.scDiscountAmount)} on{" "}
                      {data.breakdown.scDiscountCount} bill{data.breakdown.scDiscountCount === 1 ? "" : "s"} is
                      already deducted from the amounts above.
                    </p>
                  </div>
                  <div>
                    <p className="count">Amount received through ECPay against the bills on record.</p>
                    <table>
                      <tbody>
                        <tr><td>Received through ECPay</td><td className="n">{peso.format(data.cashProof.received)}</td></tr>
                        <tr><td>Total amount due on the bills</td><td className="n">{peso.format(data.cashProof.billedTotal)}</td></tr>
                        <tr><td>Consumption covered</td><td className="n">{data.kpis.consump.toLocaleString()} m³</td></tr>
                        <tr><td>Receipts issued</td><td className="n">{data.kpis.count}</td></tr>
                        <tr><td>Settled at the after-due amount</td><td className="n">{data.afterDue ?? 0}</td></tr>
                        <tr><td>Penalty carried on those bills</td><td className="n">{peso.format(data.cashProof.penaltyTotal)}</td></tr>
                        <tr className="bold">
                          <td>{data.cashProof.difference >= 0 ? "Over collection" : "Short of the billed amount"}</td>
                          <td className="n">{peso.format(Math.abs(data.cashProof.difference))}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className="setting-note">
                      A difference is normal when a consumer pays a rounded amount, settles
                      only part of a balance, or pays after the due date.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="record-section">
              <div className="record-head">
                <h2>Highest paying accounts</h2>
                <span className="count">Top 15 for the month</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="n">#</th><th>Account no.</th><th>Account name</th>
                    <th>Barangay</th><th>Class</th><th className="n">Payments</th>
                    <th className="n">Amount</th><th className="n">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.topAccounts ?? []).map((a) => (
                    <tr key={a.accountNo}>
                      <td className="n">{a.rank}</td>
                      <td>{a.accountNo}</td>
                      <td>{a.acctName}</td>
                      <td>{a.brgyName}</td>
                      <td>{a.className}</td>
                      <td className="n">{a.count}</td>
                      <td className="n">{peso.format(a.amount)}</td>
                      <td className="n">{a.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <SignatoryBlock slots={data.signatories ?? []} />
            </div>

            <p className="ecpay-generated">
              Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
