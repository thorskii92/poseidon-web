import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";

/**
 * Average Consumption Trend — the six-month trailing trend in average
 * consumption per bill. The existing consumption reports are single-
 * period snapshots by group; this is the trend over time instead.
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

type TrendRow = { month: string; monthLabel: string; bills: number; totalConsump: number; avgConsump: number };
type ClassRow = { label: string; bills: number; avgConsump: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { currentAvg: number; currentBills: number; changePct: number | null; totalConsump: number };
  insights?: string[];
  trend?: TrendRow[];
  byClassification?: ClassRow[];
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

export default function ConsumptionTrendPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("consumption-trend");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/consumption-trend?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) return <div className="print-root"><div className="form-error">No month given.</div></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
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

        <p className="ecpay-kicker">Average Consumption Trend Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>Six months ending {data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No bills were issued in this window.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Average this month" value={`${data.kpis.currentAvg.toFixed(1)} m³`} sub={`${data.kpis.currentBills.toLocaleString()} bills`} />
              <KpiTile
                label="Change vs. 6 months ago"
                value={data.kpis.changePct != null ? `${data.kpis.changePct >= 0 ? "+" : ""}${data.kpis.changePct.toFixed(1)}%` : "—"}
              />
              <KpiTile label="Total consumption" value={`${data.kpis.totalConsump.toLocaleString()} m³`} sub={data.monthLabel} />
              <KpiTile label="Bills this month" value={data.kpis.currentBills.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the trend shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Average consumption per bill</h2></div>
              <div className="chart">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.trend ?? []} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="monthLabel" tick={AXIS_TICK} tickLine={false} axisLine={AXIS_LINE} />
                    <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={30} />
                    <Tooltip
                      cursor={{ stroke: "#cbd5e1" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]!.payload as TrendRow;
                        return (
                          <div className="chart-tip">
                            <div className="chart-tip-head">{p.monthLabel}</div>
                            <div className="chart-tip-row"><span>Bills</span><span>{p.bills}</span></div>
                            <div className="chart-tip-row total"><span>Average</span><span>{p.avgConsump.toFixed(1)} m³</span></div>
                          </div>
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="avgConsump" name="Average m³" stroke="var(--navy)" strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead><tr><th>Month</th><th className="n">Bills</th><th className="n">Total consumption</th><th className="n">Average per bill</th></tr></thead>
                <tbody>
                  {(data.trend ?? []).map((t) => (
                    <tr key={t.month}>
                      <td>{t.monthLabel}</td>
                      <td className="n">{t.bills}</td>
                      <td className="n">{t.totalConsump.toLocaleString()} m³</td>
                      <td className="n">{t.avgConsump.toFixed(1)} m³</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By classification, this month</h2></div>
              <table>
                <thead><tr><th>Classification</th><th className="n">Bills</th><th className="n">Average consumption</th></tr></thead>
                <tbody>
                  {(data.byClassification ?? []).map((c) => (
                    <tr key={c.label}>
                      <td>{c.label}</td>
                      <td className="n">{c.bills}</td>
                      <td className="n">{c.avgConsump.toFixed(1)} m³</td>
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
