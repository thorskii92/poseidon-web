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
 * IP Community Fund Allocation — 1% of everything collected in the chosen
 * month, set aside for the Indigenous Peoples community fund of Rizal,
 * Palawan. Specific to that municipality; the API refuses (notApplicable)
 * anywhere else.
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
type TrendRow = { month: string; monthLabel: string; total: number; allocation: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  notApplicable?: boolean;
  kpis?: {
    total: number; ipAllocation: number; retained: number;
    ipAccountsTotal: number; ipAccountsPct: number; ipAccountsCount: number;
    onlineTotal: number; counterTotal: number; ytdAllocation: number;
  };
  insights?: string[];
  trend?: TrendRow[];
  byBarangay?: Grouped[];
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

export default function IPAllocationPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("ip-allocation");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/ip-allocation?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">IP Community Fund Allocation Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.notApplicable ? (
          <p className="count">{data.insights?.[0] ?? "This report is specific to the Municipality of Rizal, Palawan."}</p>
        ) : data.empty || !data.kpis ? (
          <p className="count">Nothing was collected in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile label="Total collected" value={peso.format(data.kpis.total)} />
              <KpiTile label="IP fund allocation (1%)" value={peso.format(data.kpis.ipAllocation)} />
              <KpiTile label="Retained (99%)" value={peso.format(data.kpis.retained)} />
              <KpiTile label="From IP Class A/B accounts" value={peso.format(data.kpis.ipAccountsTotal)} sub={`${data.kpis.ipAccountsPct.toFixed(1)}% · ${data.kpis.ipAccountsCount.toLocaleString()} receipts`} />
              <KpiTile label="Year-to-date allocation" value={peso.format(data.kpis.ytdAllocation)} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What this month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>Six-month trend</h2></div>
                <table>
                  <thead><tr><th>Month</th><th className="n">Total collected</th><th className="n">1% allocation</th></tr></thead>
                  <tbody>
                    {(data.trend ?? []).map((t) => (
                      <tr key={t.month}>
                        <td>{t.monthLabel}</td>
                        <td className="n">{peso.format(t.total)}</td>
                        <td className="n">{peso.format(t.allocation)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By channel</h2></div>
                <table>
                  <thead><tr><th>Channel</th><th className="n">Collected</th></tr></thead>
                  <tbody>
                    <tr><td>ECPay</td><td className="n">{peso.format(data.kpis.onlineTotal)}</td></tr>
                    <tr><td>Over the counter</td><td className="n">{peso.format(data.kpis.counterTotal)}</td></tr>
                  </tbody>
                  <tfoot>
                    <tr><td>Total</td><td className="n">{peso.format(data.kpis.total)}</td></tr>
                  </tfoot>
                </table>
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>Total collection by barangay</h2></div>
              <table>
                <thead><tr><th>Barangay</th><th className="n">Receipts</th><th className="n">Collected</th></tr></thead>
                <tbody>
                  {(data.byBarangay ?? []).map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="n">{r.count}</td>
                      <td className="n">{peso.format(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{(data.byBarangay ?? []).reduce((s, r) => s + r.count, 0)}</td>
                    <td className="n">{peso.format((data.byBarangay ?? []).reduce((s, r) => s + r.amount, 0))}</td>
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
