import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
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
 * Transfer Activity Report — temptransmeter and temptransown together
 * (Meter Transfer and Owner Transfer), same "filed this month, completed
 * how fast, what's still open" shape as Meter Replacement.
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

type Grouped = { key: string; count: number };
type OpenRow = { type: string; accountNo: string; acctName: string; brgy: string; appliedDate: string; daysWaiting: number };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { filed: number; completed: number; avgDays: number; stillOpenThisCohort: number; openAllTime: number };
  insights?: string[];
  byType?: Grouped[];
  byBarangay?: Grouped[];
  openList?: OpenRow[];
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

function CountTable({ rows, label }: { rows: Grouped[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Requests</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function TransferActivityReportPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("transfer-activity");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/transfer-activity?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Transfer Activity Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No transfer requests were filed in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Filed" value={data.kpis.filed.toLocaleString()} sub={data.monthLabel} />
              <KpiTile label="Completed" value={data.kpis.completed.toLocaleString()} />
              <KpiTile label="Average days" value={data.kpis.avgDays.toFixed(1)} />
              <KpiTile label="Pending, all history" value={data.kpis.openAllTime.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By type</h2></div>
                <CountTable rows={data.byType ?? []} label="Transfer type" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <CountTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head">
                <h2>Still pending</h2>
                <span className="count">Longest-waiting first, across all history</span>
              </div>
              <table>
                <thead>
                  <tr><th>Type</th><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Applied</th><th className="n">Days waiting</th></tr>
                </thead>
                <tbody>
                  {(data.openList ?? []).map((o, i) => (
                    <tr key={`${o.accountNo}-${i}`}>
                      <td>{o.type}</td>
                      <td>{o.accountNo}</td>
                      <td>{o.acctName}</td>
                      <td>{o.brgy}</td>
                      <td>{o.appliedDate}</td>
                      <td className="n">{o.daysWaiting}</td>
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
