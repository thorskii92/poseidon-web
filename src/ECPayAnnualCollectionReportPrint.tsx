import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
 * ECPay Annual Collection Report — ported from frmECPayAnnualCollectionReport
 * (BuildHtml). Same grouping as the desktop version, dressed the same way as
 * the Daily and Monthly Collection Reports — see
 * ECPayDailyCollectionReportPrint.tsx for why.
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
type BranchRow = Grouped & { avg: number; firstDate: string };
type MonthRow = {
  month: number; label: string; shortLabel: string; count: number; accounts: number;
  activeDays: number; amount: number; consump: number; prior: number;
  change: number | null; changeIsNew: boolean;
};
type QuarterRow = { label: string; count: number; amount: number };
type AgeRow = { label: string; count: number; amount: number };
type Serial = { serial: string; count: number; amount: number; min: string; max: string };
type TopAccount = {
  rank: number; accountNo: string; acctName: string; brgyName: string; className: string;
  count: number; amount: number; avg: number; share: number;
};

type Report = {
  year: number;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: {
    total: number; count: number; distinctAccounts: number; avgTxn: number;
    avgMonth: number; monthsWith: number;
    bestMonth: { label: string; amount: number; count: number };
    consump: number; activeDays: number;
  };
  vsPriorYear?: { priorYear: number; priorTotal: number; deltaPct: number } | null;
  insights?: string[];
  unlinked?: number;
  afterDue?: number;
  monthly?: MonthRow[];
  quarters?: QuarterRow[];
  ageing?: AgeRow[];
  byBranch?: BranchRow[];
  byClassification?: Grouped[];
  byBarangay?: Grouped[];
  byCluster?: Grouped[];
  byZone?: Grouped[];
  byBClass?: Grouped[];
  bySenior?: Grouped[];
  breakdown?: { wsf: number; enviFee: number; appFee: number; scDiscountAmount: number; scDiscountCount: number };
  cashProof?: { received: number; billedTotal: number; penaltyTotal: number; difference: number };
  orBooklets?: Serial[];
  topAccounts?: TopAccount[];
};

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
 * the other two ECPay collection reports use, duplicated here rather than
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

function pctStr(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

export default function ECPayAnnualCollectionReportPrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-annual-collection");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!year || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/annual-collection?year=${year}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [year, sig.ready, sig.query]);

  if (!year) {
    return (
      <div className="print-root">
        <div className="form-error">No year given.</div>
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

        <p className="ecpay-kicker">ECPay Annual Collection Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>Calendar year {data.year}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No ECPay collections were posted in {data.year}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Collected for the year"
                value={peso.format(data.kpis.total)}
                sub={`${data.kpis.count.toLocaleString()} payments`}
              />
              <KpiTile
                label="Accounts served"
                value={data.kpis.distinctAccounts.toLocaleString()}
                sub={`${peso.format(data.kpis.avgTxn)} average payment`}
              />
              <KpiTile
                label="Monthly average"
                value={peso.format(data.kpis.avgMonth)}
                sub={`${data.kpis.monthsWith} month(s) with activity`}
              />
              <KpiTile
                label="Peak month"
                value={peso.format(data.kpis.bestMonth.amount)}
                sub={`${data.kpis.bestMonth.label}, ${data.kpis.bestMonth.count} payments`}
              />
              <KpiTile
                label={`Against ${data.year - 1}`}
                value={data.vsPriorYear ? `${data.vsPriorYear.deltaPct >= 0 ? "+" : ""}${data.vsPriorYear.deltaPct.toFixed(1)}%` : "—"}
                sub={data.vsPriorYear ? `${data.vsPriorYear.priorYear} total: ${peso.format(data.vsPriorYear.priorTotal)}` : "No ECPay collections recorded"}
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>The year at a glance</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Collections by month</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={data.monthly ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="shortLabel" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ fill: "#f4f7fa" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as MonthRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" name="Amount" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Month</th><th className="n">Payments</th><th className="n">Accounts</th>
                    <th className="n">Active days</th><th className="n">Amount</th><th className="n">Share</th>
                    <th className="n">Average payment</th><th className="n">{data.year - 1}</th><th className="n">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.monthly ?? []).map((m) => (
                    <tr key={m.month} className={m.count === 0 ? "muted" : undefined}>
                      <td>{m.label}</td>
                      <td className="n">{m.count}</td>
                      <td className="n">{m.accounts}</td>
                      <td className="n">{m.activeDays}</td>
                      <td className="n">{peso.format(m.amount)}</td>
                      <td className="n">{pctStr(m.amount, data.kpis!.total)}</td>
                      <td className="n">{m.count > 0 ? peso.format(m.amount / m.count) : "0.00"}</td>
                      <td className="n">{peso.format(m.prior)}</td>
                      <td className="n">
                        {m.changeIsNew ? "new" : m.change != null ? `${m.change >= 0 ? "+" : ""}${m.change.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.count}</td>
                    <td className="n">{data.kpis.distinctAccounts}</td>
                    <td className="n">{data.kpis.activeDays}</td>
                    <td className="n">{peso.format(data.kpis.total)}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(data.kpis.avgTxn)}</td>
                    <td className="n">{peso.format(data.vsPriorYear?.priorTotal ?? 0)}</td>
                    <td className="n">
                      {data.vsPriorYear ? `${data.vsPriorYear.deltaPct >= 0 ? "+" : ""}${data.vsPriorYear.deltaPct.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>Quarterly summary</h2></div>
                <table>
                  <thead>
                    <tr><th>Quarter</th><th className="n">Payments</th><th className="n">Amount</th><th className="n">Share</th></tr>
                  </thead>
                  <tbody>
                    {(data.quarters ?? []).map((q) => (
                      <tr key={q.label}>
                        <td>{q.label}</td>
                        <td className="n">{q.count}</td>
                        <td className="n">{peso.format(q.amount)}</td>
                        <td className="n">{pctStr(q.amount, data.kpis!.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="n">{data.kpis.count}</td>
                      <td className="n">{peso.format(data.kpis.total)}</td>
                      <td className="n">100.0%</td>
                    </tr>
                  </tfoot>
                </table>
              </section>

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
                        <td className="n">{pctStr(a.amount, data.kpis!.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Collections by ECPay branch</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Branch</th><th className="n">Payments</th><th className="n">Amount</th>
                    <th className="n">Share</th><th className="n">Average</th><th>First transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.byBranch ?? []).map((b) => (
                    <tr key={b.key}>
                      <td>{b.key}</td>
                      <td className="n">{b.count}</td>
                      <td className="n">{peso.format(b.amount)}</td>
                      <td className="n">{pctStr(b.amount, data.kpis!.total)}</td>
                      <td className="n">{peso.format(b.avg)}</td>
                      <td>{b.firstDate}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.count}</td>
                    <td className="n">{peso.format(data.kpis.total)}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(data.kpis.avgTxn)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </section>

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
                <span className="count">Top 15 by amount</span>
              </div>
              <GroupTable rows={data.byCluster ?? []} label="Cluster" total={data.kpis.total} />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by water system</h2></div>
              <GroupTable rows={data.byZone ?? []} label="Zone / water system" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>Urban and rural</h2></div>
                <GroupTable rows={data.byBClass ?? []} label="Barangay class" total={data.kpis.total} />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Senior citizen accounts</h2></div>
                <GroupTable rows={data.bySenior ?? []} label="Consumer" total={data.kpis.total} />
              </section>
            </div>

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
              <div className="record-head"><h2>Official receipt booklets used</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Booklet serial</th><th className="n">Receipts</th>
                    <th>From O.R.</th><th>To O.R.</th><th className="n">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.orBooklets ?? []).map((s) => (
                    <tr key={s.serial}>
                      <td>{s.serial}</td>
                      <td className="n">{s.count}</td>
                      <td>{s.min}</td>
                      <td>{s.max}</td>
                      <td className="n">{peso.format(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.count}</td>
                    <td /><td />
                    <td className="n">{peso.format(data.kpis.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>Highest paying accounts</h2>
                <span className="count">Top 20 for the year</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="n">#</th><th>Account no.</th><th>Account name</th>
                    <th>Barangay</th><th>Class</th><th className="n">Payments</th>
                    <th className="n">Amount</th><th className="n">Average</th><th className="n">Share</th>
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
                      <td className="n">{peso.format(a.avg)}</td>
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
