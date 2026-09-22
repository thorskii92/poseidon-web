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
 * Collection by Payment Nature — what was collected FOR (Water Bill,
 * Application Fee, Reconnection Fee, ...), not just how much. Every
 * payment nature, not restricted to Water Bill the way the other Main
 * Collection reports are.
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
  kpis?: { total: number; count: number; waterBillTotal: number; waterBillPct: number; feesTotal: number; feesPct: number };
  insights?: string[];
  byNature?: Grouped[];
  byBarangay?: Grouped[];
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

function GroupTable({ rows, label, total }: { rows: Grouped[]; label: string; total: number }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Receipts</th><th className="n">Amount</th><th className="n">Share</th><th>&nbsp;</th></tr>
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

export default function CollectionByNaturePrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("collection-by-nature");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/collection-by-nature?month=${month}&${sig.query}`)
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

        <p className="ecpay-kicker">Collection by Payment Nature Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No payments were posted in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Total collected" value={peso.format(data.kpis.total)} sub={`${data.kpis.count.toLocaleString()} receipts`} />
              <KpiTile label="Water Bill" value={peso.format(data.kpis.waterBillTotal)} sub={`${data.kpis.waterBillPct.toFixed(1)}% of collections`} />
              <KpiTile label="Other fees" value={peso.format(data.kpis.feesTotal)} sub={`${data.kpis.feesPct.toFixed(1)}% of collections`} />
              <KpiTile label="Payment natures" value={(data.byNature?.length ?? 0).toLocaleString()} />
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
              <div className="record-head"><h2>Collections by payment nature</h2></div>
              <GroupTable rows={data.byNature ?? []} label="Nature" total={data.kpis.total} />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <GroupTable rows={data.byBarangay ?? []} label="Barangay" total={data.kpis.total} />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <GroupTable rows={data.byClassification ?? []} label="Classification" total={data.kpis.total} />
              </section>
            </div>

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
