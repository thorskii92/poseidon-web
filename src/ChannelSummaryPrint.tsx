import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
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
 * Online vs Counter Collection Summary — how much of everything collected
 * came through ECPay versus the counter, as its own report rather than a
 * dashboard stat. Same channel split analytics.ts's dashboard uses
 * (matched on O.R. number + serial), across every payment nature.
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

type Grouped = { key: string; count: number; amount: number };

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
    total: number;
    onlineTotal: number; onlinePct: number; onlineCount: number;
    satelliteTotal: number; satellitePct: number; satelliteCount: number;
    counterTotal: number; counterPct: number; counterCount: number;
  };
  insights?: string[];
  byBarangay?: Grouped[];
  byBarangayOnline?: Grouped[];
  byClassification?: Grouped[];
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

function combine(all: Grouped[], online: Grouped[]) {
  const onlineMap = new Map(online.map((r) => [r.key, r]));
  return all.map((r) => {
    const on = onlineMap.get(r.key);
    return { key: r.key, total: r.amount, online: on?.amount ?? 0, counter: money(r.amount - (on?.amount ?? 0)) };
  });
}
function money(v: number) {
  return Math.round(v * 100) / 100;
}

export default function ChannelSummaryPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("channel-summary");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/channel-summary?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) return <div className="print-root"><div className="form-error">No month given.</div></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  const barangayRows = data.byBarangay && data.byBarangayOnline ? combine(data.byBarangay, data.byBarangayOnline) : [];

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

        <p className="ecpay-kicker">Online vs Counter vs Satellite Collection Summary</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No payments were posted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile label="Total collected" value={peso.format(data.kpis.total)} />
              <KpiTile label="ECPay (online)" value={peso.format(data.kpis.onlineTotal)} sub={`${data.kpis.onlinePct.toFixed(1)}% · ${data.kpis.onlineCount.toLocaleString()} payments`} />
              <KpiTile label="Counter" value={peso.format(data.kpis.counterTotal)} sub={`${data.kpis.counterPct.toFixed(1)}% · ${data.kpis.counterCount.toLocaleString()} payments`} />
              <KpiTile label="Satellite" value={peso.format(data.kpis.satelliteTotal)} sub={`${data.kpis.satellitePct.toFixed(1)}% · ${data.kpis.satelliteCount.toLocaleString()} payments`} />
              <KpiTile label="Total payments" value={(data.kpis.onlineCount + data.kpis.satelliteCount + data.kpis.counterCount).toLocaleString()} />
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
              <div className="record-head"><h2>By barangay</h2></div>
              <table>
                <thead>
                  <tr><th>Barangay</th><th className="n">Total</th><th className="n">Online</th><th className="n">Counter</th><th className="n">Online share</th></tr>
                </thead>
                <tbody>
                  {barangayRows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="n">{peso.format(r.total)}</td>
                      <td className="n">{peso.format(r.online)}</td>
                      <td className="n">{peso.format(r.counter)}</td>
                      <td className="n">{r.total > 0 ? `${((r.online / r.total) * 100).toFixed(1)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By classification</h2></div>
              <table>
                <thead><tr><th>Classification</th><th className="n">Payments</th><th className="n">Amount</th></tr></thead>
                <tbody>
                  {(data.byClassification ?? []).map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="n">{r.count}</td>
                      <td className="n">{peso.format(r.amount)}</td>
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
