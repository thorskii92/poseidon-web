import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import {
  SignatoryBlock,
  SignatoryPickers,
  useSignatories,
  type SignatorySlot,
} from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * Monthly Consumption Report — four breakdowns of the same year's billed
 * consumption (barangay, cluster-within-barangay, classification, senior/
 * PWD vs regular), each Jan–Dec plus a total. Fourteen columns wide, so
 * landscape and a lower scale earn their keep here more than on most
 * reports — see reports.ts for the two real bugs found porting this (an
 * under-counted total from double-subtracting an already-applied discount,
 * and a senior/PWD split that never actually matched anything).
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const num = new Intl.NumberFormat("en-PH");

type FlatRow = { label: string; months: number[]; total: number };
type ClusterRow = { barangay: string; cluster: string; months: number[]; total: number };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  year: number;
  signatories: SignatorySlot[];
  byBarangay: FlatRow[];
  byCluster: ClusterRow[];
  byClassification: FlatRow[];
  bySeniorStatus: FlatRow[];
};

function sumMonths(rows: { months: number[] }[]): number[] {
  const out = new Array(12).fill(0);
  for (const r of rows) for (let i = 0; i < 12; i += 1) out[i] += r.months[i] ?? 0;
  return out;
}
function sumTotal(rows: { total: number }[]): number {
  return rows.reduce((s, r) => s + r.total, 0);
}

export default function MonthlyConsumptionPrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";

  const sig = useSignatories("monthly-consumption");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!year || !sig.ready) return;
    apiGet<Report>(`/api/reports/monthly-consumption?year=${encodeURIComponent(year)}&${sig.query}`)
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
        <ReportHeader />

        <h1 className="soa-title">Monthly Consumption Report for the Year {data.year}</h1>

        <ConsumptionTable title="Consumption per Barangay" labelHeader="Barangay" rows={data.byBarangay} />

        <h2 className="soa-issued" style={{ marginTop: 24 }}>Consumption per Cluster (grouped by barangay)</h2>
        <ClusterTable rows={data.byCluster} />

        <ConsumptionTable title="Consumption per Classification" labelHeader="Classification" rows={data.byClassification} />
        <ConsumptionTable title="Senior Citizen/PWD vs. Regular" labelHeader="Consumer Type" rows={data.bySeniorStatus} />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}

function ConsumptionTable({
  title, labelHeader, rows,
}: { title: string; labelHeader: string; rows: FlatRow[] }) {
  const monthTotals = sumMonths(rows);
  const grandTotal = sumTotal(rows);
  return (
    <>
      <h2 className="soa-issued" style={{ marginTop: 24 }}>{title}</h2>
      <table className="soa-table soa-table-compact">
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>{labelHeader}</th>
            {MONTH_SHORT.map((m) => <th key={m} className="soa-amt">{m}</th>)}
            <th className="soa-amt">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: "center" }}>No data for this year.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: "left" }}>{r.label}</td>
                {r.months.map((v, mi) => <td key={mi} className="soa-amt">{v ? num.format(v) : ""}</td>)}
                <td className="soa-amt" style={{ fontWeight: 600 }}>{num.format(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="soa-total-row">
            <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
            {monthTotals.map((v, i) => <td key={i} className="soa-amt">{num.format(v)}</td>)}
            <td className="soa-amt">{num.format(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function ClusterTable({ rows }: { rows: ClusterRow[] }) {
  const groups = new Map<string, ClusterRow[]>();
  for (const r of rows) {
    if (!groups.has(r.barangay)) groups.set(r.barangay, []);
    groups.get(r.barangay)!.push(r);
  }
  const grandMonths = sumMonths(rows);
  const grandTotal = sumTotal(rows);

  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Barangay / Cluster</th>
          {MONTH_SHORT.map((m) => <th key={m} className="soa-amt">{m}</th>)}
          <th className="soa-amt">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={14} style={{ textAlign: "center" }}>No data for this year.</td></tr>
        ) : (
          [...groups.entries()].map(([barangay, clusterRows]) => {
            const subMonths = sumMonths(clusterRows);
            const subTotal = sumTotal(clusterRows);
            return (
              <Fragment key={barangay}>
                <tr style={{ background: "#eef2f7" }}>
                  <td colSpan={14} style={{ textAlign: "left", fontWeight: 700 }}>{barangay}</td>
                </tr>
                {clusterRows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left", paddingLeft: 16 }}>{r.cluster}</td>
                    {r.months.map((v, mi) => <td key={mi} className="soa-amt">{v ? num.format(v) : ""}</td>)}
                    <td className="soa-amt">{num.format(r.total)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}>
                  <td style={{ textAlign: "left", paddingLeft: 16 }}>Subtotal</td>
                  {subMonths.map((v, i) => <td key={i} className="soa-amt">{num.format(v)}</td>)}
                  <td className="soa-amt">{num.format(subTotal)}</td>
                </tr>
              </Fragment>
            );
          })
        )}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
          {grandMonths.map((v, i) => <td key={i} className="soa-amt">{num.format(v)}</td>)}
          <td className="soa-amt">{num.format(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
