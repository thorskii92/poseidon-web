import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
 * ECPay Adoption Report — ported from frmECPayAdoptionReport (BuildHtml).
 * Same new/returning/reactivated/lapsed classification and the same
 * 13-month trend as the desktop version, dressed the same way as the other
 * three ECPay reports — see ECPayDailyCollectionReportPrint.tsx for why.
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

type TrendRow = {
  monthKey: number; label: string; shortLabel: string; users: number; newUsers: number;
  payments: number; amount: number; perAccount: number; change: number | null;
};
type BarangayRow = { label: string; users: number; amount: number };

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
    thisMonthUsers: number; thisMonthAmt: number; newUsers: number; returning: number;
    reactivated: number; lapsed: number; everUsers: number; accountsOnFile: number;
  };
  insights?: string[];
  trend?: TrendRow[];
  usage?: { once: number; twoToThree: number; fourPlus: number; total: number };
  byBarangay?: BarangayRow[];
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

function pctStr(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";
}

export default function ECPayAdoptionReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ecpay-adoption");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/ecpay/reports/adoption?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">ECPay Adoption Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>Channel usage for {data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">There are no ECPay payments on record yet.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile
                label="Accounts using ECPay"
                value={data.kpis.thisMonthUsers.toLocaleString()}
                sub={`${peso.format(data.kpis.thisMonthAmt)} paid this month`}
              />
              <KpiTile
                label="First-time users"
                value={data.kpis.newUsers.toLocaleString()}
                sub="Never used ECPay before"
              />
              <KpiTile
                label="Returning users"
                value={data.kpis.returning.toLocaleString()}
                sub={`${data.kpis.reactivated} came back after a break`}
              />
              <KpiTile
                label="Lapsed users"
                value={data.kpis.lapsed.toLocaleString()}
                sub="Active recently, absent this month"
              />
              <KpiTile
                label="Reach of the channel"
                value={pctStr(data.kpis.everUsers, data.kpis.accountsOnFile)}
                sub={`${data.kpis.everUsers.toLocaleString()} of ${data.kpis.accountsOnFile.toLocaleString()} accounts`}
              />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What adoption looks like</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Users and payments by month</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.trend ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="shortLabel" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                    <Tooltip
                      cursor={{ stroke: "#cbd5e1" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as TrendRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.label}</div>
                            <div className="chart-tip-row"><span>Accounts</span><span>{p.users}</span></div>
                            <div className="chart-tip-row total"><span>Amount</span><span>{peso.format(p.amount)}</span></div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="users" name="Accounts" stroke="var(--navy)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Month</th><th className="n">Accounts</th><th className="n">First-time</th>
                    <th className="n">Payments</th><th className="n">Amount</th><th className="n">Per account</th>
                    <th className="n">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.trend ?? []).map((t) => (
                    <tr key={t.monthKey} className={t.users === 0 ? "muted" : undefined}>
                      <td>{t.label}</td>
                      <td className="n">{t.users}</td>
                      <td className="n">{t.newUsers}</td>
                      <td className="n">{t.payments}</td>
                      <td className="n">{peso.format(t.amount)}</td>
                      <td className="n">{peso.format(t.perAccount)}</td>
                      <td className="n">{t.change != null ? `${t.change >= 0 ? "+" : ""}${t.change.toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head">
                <h2>How often accounts use ECPay</h2>
                <span className="count">Last twelve months</span>
              </div>
              <table>
                <thead>
                  <tr><th>Usage</th><th className="n">Accounts</th><th className="n">Share</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Used once</td>
                    <td className="n">{data.usage!.once}</td>
                    <td className="n">{pctStr(data.usage!.once, data.usage!.total)}</td>
                  </tr>
                  <tr>
                    <td>Used two or three times</td>
                    <td className="n">{data.usage!.twoToThree}</td>
                    <td className="n">{pctStr(data.usage!.twoToThree, data.usage!.total)}</td>
                  </tr>
                  <tr>
                    <td>Used four or more times</td>
                    <td className="n">{data.usage!.fourPlus}</td>
                    <td className="n">{pctStr(data.usage!.fourPlus, data.usage!.total)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>Accounts reached</td>
                    <td className="n">{data.usage!.total}</td>
                    <td className="n">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Where this month's users are</h2></div>
              <table>
                <thead>
                  <tr><th>Barangay</th><th className="n">Accounts</th><th className="n">Share</th><th className="n">Amount</th></tr>
                </thead>
                <tbody>
                  {(data.byBarangay ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.users}</td>
                      <td className="n">{pctStr(b.users, data.kpis!.thisMonthUsers)}</td>
                      <td className="n">{peso.format(b.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.thisMonthUsers}</td>
                    <td className="n">100.0%</td>
                    <td className="n">{peso.format(data.kpis.thisMonthAmt)}</td>
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
