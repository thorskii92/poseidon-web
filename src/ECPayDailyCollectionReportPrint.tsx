import { useEffect, useState } from "react";
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
import ReportHeader from "./ReportHeader";

/**
 * ECPay Daily Collection Report — ported from frmECPayDailyCollectionReportLoad
 * (BuildHtml). Same content and grouping as the desktop's version, dressed
 * as a signed report (header/logos, paper/orientation/scale, four-slot
 * signatories) like every other report in this app except bills/O.R.s — an
 * earlier version of this file treated it as an unsigned audit view
 * (BillEditReportPrint's convention) instead, which was the wrong call for
 * a report that reconciles actual money received.
 *
 * transactiontime is free text carried over verbatim from whatever the
 * payment channel's own export contained. Real data bears out the VB
 * report's own caveat about it: it is very often a full "YYYY-MM-DD
 * 00:00:00" timestamp with no real time of day in it, not a usable hour —
 * ecpayReports.ts already accounts for this (see parseHour there) and
 * sends an empty byHour array when nothing on the date has a real hour;
 * this view just needs to render that state honestly instead of an empty
 * chart.
 */

const AXIS_TICK = { fontSize: 11, fill: "#6b7280" };
const GRID = "#eef1f4";
const AXIS_LINE = { stroke: "#e3e6ea" };

type Group = { key: string; count: number; amount: number };
type HourBucket = { hour: number; amount: number; count: number };
type Serial = { serial: string; count: number; amount: number; min: string; max: string };
type Txn = {
  amount: number;
  billId: number;
  consump: number;
  paidAfterDue: boolean;
  accountNo: string;
  acctName: string;
  isSenior: boolean;
  branchName: string;
  hour: number;
  time: string;
  serial: string;
  orNum: string;
  refNo: string;
  className: string;
  brgyName: string;
  zoneName: string;
  billPeriod: string;
  periodCovered: string;
};

type Report = {
  date: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: {
    total: number; count: number; distinctAccounts: number; avgTxn: number;
    biggestAmount: number; branchCount: number; topBranch: string; consump: number;
  };
  unlinked?: number;
  afterDue?: number;
  breakdown?: { wsf: number; enviFee: number; appFee: number; scDiscountAmount: number; scDiscountCount: number };
  cashProof?: { received: number; billedTotal: number; penaltyTotal: number; difference: number };
  byBranch?: Group[];
  byHour?: HourBucket[];
  byClassification?: Group[];
  byBarangay?: Group[];
  byZone?: Group[];
  bySenior?: Group[];
  orAccountability?: Serial[];
  transactions?: Txn[];
};

function dateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
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

/** Plain table + a lightweight CSS bar in its own column — avoids a second
 * chart orientation just for a handful of rows (branches, classifications,
 * barangays, zones are all short lists in practice). */
function GroupTable({ rows, label, total }: { rows: Group[]; label: string; total: number }) {
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

export default function ECPayDailyCollectionReportPrint() {
  const [params] = useSearchParams();
  const date = params.get("date") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-daily-collection");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!date || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/daily-collection?date=${date}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [date, sig.ready, sig.query]);

  if (!date) {
    return (
      <div className="print-root">
        <div className="form-error">No date given.</div>
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
        <ReportHeader />

        <p className="ecpay-kicker">ECPay Daily Collection Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{dateLabel(data.date)}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No ECPay collections were posted on {dateLabel(data.date)}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Total collected"
                value={peso.format(data.kpis.total)}
                sub={`${data.kpis.count} transaction${data.kpis.count === 1 ? "" : "s"}`}
              />
              <KpiTile
                label="Payments posted"
                value={data.kpis.count.toLocaleString()}
                sub={`${data.kpis.distinctAccounts} distinct account${data.kpis.distinctAccounts === 1 ? "" : "s"}`}
              />
              <KpiTile
                label="Average per payment"
                value={peso.format(data.kpis.avgTxn)}
                sub={`Largest ${peso.format(data.kpis.biggestAmount)}`}
              />
              <KpiTile
                label="Paying branches"
                value={data.kpis.branchCount.toLocaleString()}
                sub={data.kpis.topBranch ? `Top: ${data.kpis.topBranch}` : undefined}
              />
              <KpiTile
                label="Consumption covered"
                value={`${data.kpis.consump.toLocaleString()} m³`}
                sub="Across the bills settled"
              />
            </div>

            {(data.unlinked ?? 0) > 0 && (
              <div className="form-notice">
                {data.unlinked} payment{data.unlinked === 1 ? "" : "s"} on this date{" "}
                {data.unlinked === 1 ? "is" : "are"} not linked to a bill record. Its bill
                components are excluded from the breakdowns below.
              </div>
            )}
            {(data.afterDue ?? 0) > 0 && (
              <div className="form-notice">
                {data.afterDue} payment{data.afterDue === 1 ? "" : "s"} settled after the
                bill's due date.
              </div>
            )}

            <section className="record-section">
              <div className="record-head">
                <h2>Payment activity by hour</h2>
                <span className="count">Based on the recorded transaction time</span>
              </div>
              {!data.byHour?.length ? (
                <div className="form-notice">
                  Every transaction on this date carries a blank or midnight
                  transaction time, so the hourly pattern cannot be shown.
                </div>
              ) : (
                <div className="chart">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.byHour.filter((h) => h.hour >= 6 && h.hour <= 21)} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={AXIS_LINE}
                        tickFormatter={(h) => new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" })}
                      />
                      <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: "#f4f7fa" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0]!.payload as HourBucket;
                          return (
                            <div className="chart-tip">
                              <div className="chart-tip-head">
                                {new Date(2000, 0, 1, p.hour).toLocaleTimeString("en-US", { hour: "numeric" })}
                              </div>
                              <div className="chart-tip-row"><span>Payments</span><span>{p.count}</span></div>
                              <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="amount" name="Amount" fill="var(--navy)" radius={[2, 2, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by ECPay branch</h2></div>
              <GroupTable rows={data.byBranch ?? []} label="Branch" total={data.kpis.total} />
            </section>

            {data.breakdown && data.cashProof && (
              <div className="notice-columns">
                <section className="record-section">
                  <div className="record-head"><h2>Collection breakdown</h2></div>
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
                </section>

                <section className="record-section">
                  <div className="record-head"><h2>Cash proof</h2></div>
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
                </section>
              </div>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Collections by consumer classification</h2></div>
              <GroupTable rows={data.byClassification ?? []} label="Classification" total={data.kpis.total} />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Collections by barangay</h2></div>
              <GroupTable rows={data.byBarangay ?? []} label="Barangay" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By water system</h2></div>
                <GroupTable rows={data.byZone ?? []} label="Zone / water system" total={data.kpis.total} />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Senior citizen accounts</h2></div>
                <GroupTable rows={data.bySenior ?? []} label="Consumer" total={data.kpis.total} />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Official receipts issued</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Booklet serial</th>
                    <th className="n">Receipts</th>
                    <th>From O.R.</th>
                    <th>To O.R.</th>
                    <th className="n">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.orAccountability ?? []).map((s) => (
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
              <div className="record-head"><h2>Transaction detail</h2></div>
              <table>
                <thead>
                  <tr>
                    <th className="n">#</th>
                    <th>Time</th>
                    <th>O.R. no.</th>
                    <th>Serial</th>
                    <th>Reference no.</th>
                    <th>Account no.</th>
                    <th>Account name</th>
                    <th>Barangay</th>
                    <th>Class</th>
                    <th>Branch</th>
                    <th>Bill period</th>
                    <th>Period covered</th>
                    <th className="n">Cu. m.</th>
                    <th className="n">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.transactions ?? []).map((t, i) => (
                    <tr key={`${t.orNum}-${i}`}>
                      <td className="n">{i + 1}</td>
                      <td>{t.time || "—"}</td>
                      <td>{t.orNum}</td>
                      <td>{t.serial}</td>
                      <td>{t.refNo}</td>
                      <td>{t.accountNo}</td>
                      <td>
                        {t.acctName}
                        {t.isSenior && <span className="muted"> (SC)</span>}
                      </td>
                      <td>{t.brgyName}</td>
                      <td>{t.className}</td>
                      <td>{t.branchName}</td>
                      <td>{t.billPeriod}</td>
                      <td>{t.periodCovered}</td>
                      <td className="n">{t.consump > 0 ? t.consump : ""}</td>
                      <td className="n">{peso.format(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={13}>Total for {dateLabel(data.date)}</td>
                    <td className="n">{peso.format(data.kpis.total)}</td>
                  </tr>
                </tfoot>
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
