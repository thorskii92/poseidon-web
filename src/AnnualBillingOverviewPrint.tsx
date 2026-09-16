import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Annual Billing Overview — the same billed-vs-collected shape as the
 * Monthly report, rolled up by month, plus a classification x month pivot
 * of what was actually collected. See billingOverview.ts.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

type MonthRow = {
  month: string; accounts: number; totalConsump: number; totalBilled: number; totalCollected: number;
  totalUnpaid: number; penalty: number; discount: number; envi: number; efficiencyPct: number;
};
type Totals = {
  accounts: number; totalConsump: number; totalBilled: number; totalCollected: number;
  totalUnpaid: number; penalty: number; discount: number; envi: number; efficiencyPct: number;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  year: number; generatedAt: string; signatories: SignatorySlot[];
  monthly: MonthRow[];
  totals: Totals;
  byClassificationMonthly: { classification: string; months: number[]; total: number }[];
};

export default function AnnualBillingOverviewPrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";

  const sig = useSignatories("billing-overview-annual");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!year || !sig.ready) return;
    apiGet<Report>(`/api/reports/billing-overview/annual?year=${encodeURIComponent(year)}&${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
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

  const t = data.totals;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <a className="clear-filters" href={`/api/reports/billing-overview/annual.xlsx?year=${encodeURIComponent(year)}`}>
          Download Excel
        </a>
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
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Annual Billing Overview</h1>
        <p className="soa-issued">Calendar Year {data.year}</p>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Monthly Billing &amp; Collection Summary</h2>
        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Month</th>
              <th className="soa-amt">Accounts</th><th className="soa-amt">Consumption (m³)</th>
              <th className="soa-amt">Total Billed</th><th className="soa-amt">Total Collected</th>
              <th className="soa-amt">Unpaid Balance</th><th className="soa-amt">Surcharges</th>
              <th className="soa-amt">SC Discounts</th><th className="soa-amt">Envi Fee</th><th className="soa-amt">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {data.monthly.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: "left" }}>{r.month}</td>
                <td className="soa-amt">{plain.format(r.accounts)}</td>
                <td className="soa-amt">{plain.format(r.totalConsump)}</td>
                <td className="soa-amt">{peso.format(r.totalBilled)}</td>
                <td className="soa-amt">{peso.format(r.totalCollected)}</td>
                <td className="soa-amt">{peso.format(r.totalUnpaid)}</td>
                <td className="soa-amt">{peso.format(r.penalty)}</td>
                <td className="soa-amt">{peso.format(r.discount)}</td>
                <td className="soa-amt">{peso.format(r.envi)}</td>
                <td className="soa-amt">{r.efficiencyPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td style={{ textAlign: "left" }}>TOTAL</td>
              <td className="soa-amt">{plain.format(t.accounts)}</td>
              <td className="soa-amt">{plain.format(t.totalConsump)}</td>
              <td className="soa-amt">{peso.format(t.totalBilled)}</td>
              <td className="soa-amt">{peso.format(t.totalCollected)}</td>
              <td className="soa-amt">{peso.format(t.totalUnpaid)}</td>
              <td className="soa-amt">{peso.format(t.penalty)}</td>
              <td className="soa-amt">{peso.format(t.discount)}</td>
              <td className="soa-amt">{peso.format(t.envi)}</td>
              <td className="soa-amt">{t.efficiencyPct.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Collected, by Classification per Month</h2>
        <table className="soa-table soa-table-compact soa-table-many-cols">
          <thead>
            <tr>
              <th style={{ textAlign: "left", width: "12%" }}>Classification</th>
              {MONTH_SHORT.map((m) => <th key={m} className="soa-amt">{m}</th>)}
              <th className="soa-amt">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.byClassificationMonthly.length === 0 ? (
              <tr><td colSpan={14} style={{ textAlign: "center" }}>No data for this year.</td></tr>
            ) : (
              data.byClassificationMonthly.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>{r.classification}</td>
                  {r.months.map((v, mi) => <td key={mi} className="soa-amt">{v ? peso.format(v) : "—"}</td>)}
                  <td className="soa-amt" style={{ fontWeight: 600 }}>{peso.format(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
