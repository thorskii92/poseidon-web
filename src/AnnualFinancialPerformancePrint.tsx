import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Annual Financial Performance Report — one calendar year, billed vs.
 * collected, Jan-Dec, grouped into the same four sections the VB print-out
 * used (Billings, Collections, Performance Indicators, Averages). See
 * reports.ts for the two real differences from the VB: Cash Receipts is now
 * real total cash for the month rather than a manual column sum that had no
 * term for Meter Replacement Fee collections, and the connection-fee-
 * collected total drops a second code path that never actually ran.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function cellNum(v: number): string {
  return v ? num.format(v) : "—";
}
function cellParen(v: number): string {
  return v ? `(${num.format(v)})` : "—";
}
function cellPct(v: number): string {
  return v ? `${num.format(v)} %` : "—";
}
function cellPctSigned(v: number): string {
  return `${v > 0 ? "+" : ""}${num.format(v)} %`;
}

type Metrics = {
  consumptionBillings: number[]; connectionFeeBilled: number[]; penalty: number[];
  discount: number[]; envFee: number[]; revenue: number[];
  billsCollected: number[]; connectionFeeCollected: number[]; penaltiesCollected: number[];
  envFeeCollected: number[]; discountCollected: number[]; reconnectionFee: number[];
  meterTransferFee: number[]; ownerTransferFee: number[]; cashReceipts: number[];
  collectionEfficiency: number[]; avgConsumptionResidential: number[];
  avgBillingAmount: number[]; avgBillingWithPenalty: number[]; revenueGrowth: number[];
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  year: number;
  signatories: SignatorySlot[];
  metrics: Metrics;
};

function SectionHead({ label }: { label: string }) {
  return (
    <tr style={{ background: "#2f5d8a" }}>
      <td colSpan={13} style={{ textAlign: "left", fontWeight: 700, color: "#fff", padding: "5px 8px" }}>
        {label}
      </td>
    </tr>
  );
}

function MetricRow({
  label, values, format = "num", indent = false,
}: {
  label: string;
  values: number[];
  format?: "num" | "paren" | "pct" | "pctsigned";
  indent?: boolean;
}) {
  const fmt = format === "paren" ? cellParen : format === "pct" ? cellPct : format === "pctsigned" ? cellPctSigned : cellNum;
  return (
    <tr>
      <td style={{ textAlign: "left", paddingLeft: indent ? 20 : undefined }}>{label}</td>
      {values.map((v, i) => <td key={i} className="soa-amt">{fmt(v)}</td>)}
    </tr>
  );
}

export default function AnnualFinancialPerformancePrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";

  const sig = useSignatories("annual-financial-performance");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!year || !sig.ready) return;
    apiGet<Report>(`/api/reports/annual-financial-performance?year=${encodeURIComponent(year)}&${sig.query}`)
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

  const m = data.metrics;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
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

        <h1 className="soa-title">Annual Financial Performance Report</h1>
        <p className="soa-issued" style={{ textAlign: "center" }}>Calendar Year {data.year}</p>

        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left", width: 220 }}>Particulars</th>
              {MONTH_SHORT.map((mo) => <th key={mo} className="soa-amt">{mo.toUpperCase()}</th>)}
            </tr>
          </thead>
          <tbody>
            <SectionHead label="BILLINGS" />
            <MetricRow label="Consumption Billings" values={m.consumptionBillings} />
            <MetricRow label="Connection Fee" values={m.connectionFeeBilled} />
            <MetricRow label="Penalty" values={m.penalty} />
            <MetricRow label="Discount" values={m.discount} format="paren" />
            <MetricRow label="Environmental Fee" values={m.envFee} />
            <MetricRow label="Revenue" values={m.revenue} />

            <SectionHead label="COLLECTIONS" />
            <MetricRow label="Bills Collected" values={m.billsCollected} />
            <MetricRow label="Connection Fee" values={m.connectionFeeCollected} />
            <MetricRow label="Penalties" values={m.penaltiesCollected} />
            <MetricRow label="Environmental Fee" values={m.envFeeCollected} />
            <MetricRow label="Discount" values={m.discountCollected} format="paren" />
            <MetricRow label="Reconnection Fee" values={m.reconnectionFee} />
            <MetricRow label="Meter Transfer Fee" values={m.meterTransferFee} />
            <MetricRow label="Owner Transfer Fee" values={m.ownerTransferFee} />
            <MetricRow label="Cash Receipts" values={m.cashReceipts} />

            <SectionHead label="PERFORMANCE INDICATORS" />
            <MetricRow label="Collection Efficiency" values={m.collectionEfficiency} format="pct" />
            <MetricRow label="% Revenue Growth" values={m.revenueGrowth} format="pctsigned" />

            <SectionHead label="AVERAGES" />
            <MetricRow label="Avg. Water Consumption / Client (Residential)" values={m.avgConsumptionResidential} />
            <MetricRow label="Avg. Billing / Client (Amount)" values={m.avgBillingAmount} />
            <MetricRow label="Avg. Billing / Client (w/ Penalty)" values={m.avgBillingWithPenalty} />
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
