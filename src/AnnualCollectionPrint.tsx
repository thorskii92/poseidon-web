import { Fragment, useEffect, useState, type JSX } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Annual Collection Report — the desktop's biggest report: collections and
 * billing logs by barangay, cluster (grouped by barangay), classification
 * and senior/regular status, then the same 4 breakdowns again per fee
 * component (Environmental Fee, Penalties, Installation, Meter Transfer,
 * Owner Transfer, Reconnection, Consumption, and WMMF when enabled) — up to
 * ~40 tables. See reports.ts for why this reads consumeraccounts' current
 * barangay/cluster/classification rather than billing's own snapshot (a
 * deliberate difference from Monthly Consumption Report, carried over from
 * the VB source), and the senior/regular case-sensitivity fix.
 *
 * The VB print-out embedded live Chart.js bar/line charts and donut charts.
 * Every other report in this app is a static print table, so this one is
 * too — the same monthly/quarterly numbers appear as a table instead.
 */

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

function fmt(v: number, isConsumption: boolean): string {
  if (!v) return "—";
  return isConsumption ? plain.format(v) : peso.format(v);
}

type PairRow = { label: string; primary: number[]; secondary: number[]; totalPrimary: number; totalSecondary: number };
type FlatRow = { label: string; months: number[]; total: number };
type ClusterPairRow = { barangay: string; cluster: string; primary: number[]; secondary: number[]; totalPrimary: number; totalSecondary: number };
type ClusterFlatRow = { barangay: string; cluster: string; months: number[]; total: number };

type FeeComponent = {
  key: string;
  title: string;
  isConsumption: boolean;
  byBarangay: FlatRow[];
  byClusterGrouped: ClusterFlatRow[];
  byClassification: FlatRow[];
  bySeniorStatus: FlatRow[];
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  year: number;
  signatories: SignatorySlot[];
  overview: {
    totalAssessedBills: number;
    totalCollected: number;
    monthly: { amount: number[]; count: number[] };
    quarterly: { amount: number[]; count: number[] };
  };
  collections: { byBarangay: PairRow[]; byClusterGrouped: ClusterFlatRow[]; byClassification: PairRow[]; bySeniorStatus: PairRow[] };
  billingLogs: { byBarangay: PairRow[]; byClusterGrouped: ClusterPairRow[]; byClassification: PairRow[]; bySeniorStatus: PairRow[] };
  feeComponents: FeeComponent[];
};

function sumCols(rows: number[][]): number[] {
  const out = new Array(12).fill(0);
  for (const months of rows) for (let i = 0; i < 12; i += 1) out[i] += months[i] ?? 0;
  return out;
}
function sumOf(vals: number[]): number {
  return vals.reduce((s, v) => s + v, 0);
}

/**
 * Explicit per-column widths for the 26-column Amount/Count and Billed/
 * Collected tables — table-layout: fixed needs *something* unambiguous to
 * size columns from, and left to derive them itself from a header row full
 * of identical colSpan={2} cells, browsers fall back to the second header
 * row and distribute space inconsistently (one month rendering wider than
 * its neighbors for no visible reason). A <colgroup> pins every column
 * explicitly instead. When the second column is a plain count (not a peso
 * amount), it only needs room for ~5 digits, so the Amount column gets the
 * space Count doesn't need rather than splitting 50/50 and starving both.
 */
function pairColGroup(labelWidthPct: number, secondaryIsCount: boolean): JSX.Element {
  const pairs = 13; // 12 months + Total
  const secondaryPct = secondaryIsCount ? 2.6 : (100 - labelWidthPct) / (pairs * 2);
  const primaryPct = secondaryIsCount ? (100 - labelWidthPct) / pairs - secondaryPct : secondaryPct;
  return (
    <colgroup>
      <col style={{ width: `${labelWidthPct}%` }} />
      {Array.from({ length: pairs }).map((_, i) => (
        <Fragment key={i}>
          <col style={{ width: `${primaryPct}%` }} />
          <col style={{ width: `${secondaryPct}%` }} />
        </Fragment>
      ))}
    </colgroup>
  );
}

/** Same reasoning as pairColGroup, for the single-value 14-column tables
 *  (fee-component breakdowns, classification, senior status): don't trust
 *  table-layout: fixed to split the 13 unlabeled columns evenly on its
 *  own — pin every one explicitly. */
function flatColGroup(labelWidthPct: number): JSX.Element {
  const cols = 13; // 12 months + Total
  const pct = (100 - labelWidthPct) / cols;
  return (
    <colgroup>
      <col style={{ width: `${labelWidthPct}%` }} />
      {Array.from({ length: cols }).map((_, i) => (
        <col key={i} style={{ width: `${pct}%` }} />
      ))}
    </colgroup>
  );
}

function SectionBanner({ label }: { label: string }) {
  return (
    <div className="soa-issued" style={{ marginTop: 28, marginBottom: 4, background: "#2f5d8a", color: "#fff", padding: "6px 10px", fontWeight: 700 }}>
      {label}
    </div>
  );
}

function PairTable({
  title, labelHeader, primaryLabel, secondaryLabel, rows, secondaryIsCount = false,
}: {
  title: string;
  labelHeader: string;
  primaryLabel: string;
  secondaryLabel: string;
  rows: PairRow[];
  secondaryIsCount?: boolean;
}) {
  const primaryTotals = sumCols(rows.map((r) => r.primary));
  const secondaryTotals = sumCols(rows.map((r) => r.secondary));
  const grandPrimary = sumOf(primaryTotals);
  const grandSecondary = sumOf(secondaryTotals);
  return (
    <>
      <h2 className="soa-issued" style={{ marginTop: 20 }}>{title}</h2>
      <table className="soa-table soa-table-compact soa-table-many-cols">
        {pairColGroup(8, secondaryIsCount)}
        <thead>
          <tr>
            <th rowSpan={2} style={{ textAlign: "left" }}>{labelHeader}</th>
            {MONTH_SHORT.map((m) => <th key={m} colSpan={2}>{m}</th>)}
            <th colSpan={2}>Total</th>
          </tr>
          <tr>
            {MONTH_SHORT.map((m) => (
              <Fragment key={m}>
                <th className="soa-amt" style={{ fontSize: "0.8em" }}>{primaryLabel}</th>
                <th className="soa-amt" style={{ fontSize: "0.8em" }}>{secondaryLabel}</th>
              </Fragment>
            ))}
            <th className="soa-amt" style={{ fontSize: "0.8em" }}>{primaryLabel}</th>
            <th className="soa-amt" style={{ fontSize: "0.8em" }}>{secondaryLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={26} style={{ textAlign: "center" }}>No data for this year.</td></tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: "left" }}>{r.label}</td>
                {r.primary.map((v, mi) => (
                  <Fragment key={mi}>
                    <td className="soa-amt">{fmt(v, false)}</td>
                    <td className="soa-amt">{secondaryIsCount ? (r.secondary[mi] || "—") : fmt(r.secondary[mi] ?? 0, false)}</td>
                  </Fragment>
                ))}
                <td className="soa-amt" style={{ fontWeight: 600 }}>{fmt(r.totalPrimary, false)}</td>
                <td className="soa-amt" style={{ fontWeight: 600 }}>{secondaryIsCount ? r.totalSecondary : fmt(r.totalSecondary, false)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="soa-total-row">
            <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
            {primaryTotals.map((v, i) => (
              <Fragment key={i}>
                <td className="soa-amt">{fmt(v, false)}</td>
                <td className="soa-amt">{secondaryIsCount ? secondaryTotals[i] : fmt(secondaryTotals[i] ?? 0, false)}</td>
              </Fragment>
            ))}
            <td className="soa-amt">{fmt(grandPrimary, false)}</td>
            <td className="soa-amt">{secondaryIsCount ? grandSecondary : fmt(grandSecondary, false)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function ClusterPairTable({
  title, primaryLabel, secondaryLabel, rows,
}: {
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  rows: ClusterPairRow[];
}) {
  const groups = new Map<string, ClusterPairRow[]>();
  for (const r of rows) {
    if (!groups.has(r.barangay)) groups.set(r.barangay, []);
    groups.get(r.barangay)!.push(r);
  }
  const primaryTotals = sumCols(rows.map((r) => r.primary));
  const secondaryTotals = sumCols(rows.map((r) => r.secondary));
  return (
    <>
      <h2 className="soa-issued" style={{ marginTop: 20 }}>{title}</h2>
      <table className="soa-table soa-table-compact soa-table-many-cols">
        {pairColGroup(10, false)}
        <thead>
          <tr>
            <th rowSpan={2} style={{ textAlign: "left" }}>Barangay / Cluster</th>
            {MONTH_SHORT.map((m) => <th key={m} colSpan={2}>{m}</th>)}
            <th colSpan={2}>Total</th>
          </tr>
          <tr>
            {MONTH_SHORT.map((m) => (
              <Fragment key={m}>
                <th className="soa-amt" style={{ fontSize: "0.8em" }}>{primaryLabel}</th>
                <th className="soa-amt" style={{ fontSize: "0.8em" }}>{secondaryLabel}</th>
              </Fragment>
            ))}
            <th className="soa-amt" style={{ fontSize: "0.8em" }}>{primaryLabel}</th>
            <th className="soa-amt" style={{ fontSize: "0.8em" }}>{secondaryLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={26} style={{ textAlign: "center" }}>No data for this year.</td></tr>
          ) : (
            [...groups.entries()].map(([barangay, clusterRows]) => {
              const subPrimary = sumCols(clusterRows.map((r) => r.primary));
              const subSecondary = sumCols(clusterRows.map((r) => r.secondary));
              return (
                <Fragment key={barangay}>
                  <tr style={{ background: "#eef2f7" }}>
                    <td colSpan={26} style={{ textAlign: "left", fontWeight: 700 }}>{barangay}</td>
                  </tr>
                  {clusterRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "left", paddingLeft: 16 }}>{r.cluster}</td>
                      {r.primary.map((v, mi) => (
                        <Fragment key={mi}>
                          <td className="soa-amt">{fmt(v, false)}</td>
                          <td className="soa-amt">{fmt(r.secondary[mi] ?? 0, false)}</td>
                        </Fragment>
                      ))}
                      <td className="soa-amt">{fmt(r.totalPrimary, false)}</td>
                      <td className="soa-amt">{fmt(r.totalSecondary, false)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td style={{ textAlign: "left", paddingLeft: 16 }}>Subtotal</td>
                    {subPrimary.map((v, i) => (
                      <Fragment key={i}>
                        <td className="soa-amt">{fmt(v, false)}</td>
                        <td className="soa-amt">{fmt(subSecondary[i] ?? 0, false)}</td>
                      </Fragment>
                    ))}
                    <td className="soa-amt">{fmt(sumOf(subPrimary), false)}</td>
                    <td className="soa-amt">{fmt(sumOf(subSecondary), false)}</td>
                  </tr>
                </Fragment>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="soa-total-row">
            <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
            {primaryTotals.map((v, i) => (
              <Fragment key={i}>
                <td className="soa-amt">{fmt(v, false)}</td>
                <td className="soa-amt">{fmt(secondaryTotals[i] ?? 0, false)}</td>
              </Fragment>
            ))}
            <td className="soa-amt">{fmt(sumOf(primaryTotals), false)}</td>
            <td className="soa-amt">{fmt(sumOf(secondaryTotals), false)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function FlatTable({
  title, labelHeader, rows, isConsumption = false,
}: { title: string; labelHeader: string; rows: FlatRow[]; isConsumption?: boolean }) {
  const monthTotals = sumCols(rows.map((r) => r.months));
  const grandTotal = sumOf(monthTotals);
  return (
    <>
      <h2 className="soa-issued" style={{ marginTop: 20 }}>{title}</h2>
      <table className="soa-table soa-table-compact soa-table-many-cols">
        {flatColGroup(10)}
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
                {r.months.map((v, mi) => <td key={mi} className="soa-amt">{fmt(v, isConsumption)}</td>)}
                <td className="soa-amt" style={{ fontWeight: 600 }}>{fmt(r.total, isConsumption)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="soa-total-row">
            <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
            {monthTotals.map((v, i) => <td key={i} className="soa-amt">{fmt(v, isConsumption)}</td>)}
            <td className="soa-amt">{fmt(grandTotal, isConsumption)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function ClusterFlatTable({
  title, rows, isConsumption = false,
}: { title: string; rows: ClusterFlatRow[]; isConsumption?: boolean }) {
  const groups = new Map<string, ClusterFlatRow[]>();
  for (const r of rows) {
    if (!groups.has(r.barangay)) groups.set(r.barangay, []);
    groups.get(r.barangay)!.push(r);
  }
  const grandMonths = sumCols(rows.map((r) => r.months));
  const grandTotal = sumOf(grandMonths);
  return (
    <>
      <h2 className="soa-issued" style={{ marginTop: 20 }}>{title}</h2>
      <table className="soa-table soa-table-compact soa-table-many-cols">
        {flatColGroup(10)}
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
              const subMonths = sumCols(clusterRows.map((r) => r.months));
              const subTotal = sumOf(subMonths);
              return (
                <Fragment key={barangay}>
                  <tr style={{ background: "#eef2f7" }}>
                    <td colSpan={14} style={{ textAlign: "left", fontWeight: 700 }}>{barangay}</td>
                  </tr>
                  {clusterRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: "left", paddingLeft: 16 }}>{r.cluster}</td>
                      {r.months.map((v, mi) => <td key={mi} className="soa-amt">{fmt(v, isConsumption)}</td>)}
                      <td className="soa-amt">{fmt(r.total, isConsumption)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td style={{ textAlign: "left", paddingLeft: 16 }}>Subtotal</td>
                    {subMonths.map((v, i) => <td key={i} className="soa-amt">{fmt(v, isConsumption)}</td>)}
                    <td className="soa-amt">{fmt(subTotal, isConsumption)}</td>
                  </tr>
                </Fragment>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="soa-total-row">
            <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
            {grandMonths.map((v, i) => <td key={i} className="soa-amt">{fmt(v, isConsumption)}</td>)}
            <td className="soa-amt">{fmt(grandTotal, isConsumption)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

export default function AnnualCollectionPrint() {
  const [params] = useSearchParams();
  const year = params.get("year") ?? "";

  const sig = useSignatories("annual-collection");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!year || !sig.ready) return;
    apiGet<Report>(`/api/reports/annual-collection?year=${encodeURIComponent(year)}&${sig.query}`)
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
        <p className="count">Building the report — this pulls every barangay, cluster, classification and fee breakdown for the year, so it can take a moment…</p>
      </div>
    );
  }

  const ov = data.overview;

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

        <h1 className="soa-title">Annual Collection Report</h1>
        <p className="soa-issued" style={{ textAlign: "center" }}>Calendar Year {data.year}</p>

        <div style={{ display: "flex", gap: 24, justifyContent: "center", margin: "12px 0" }}>
          <div><strong>Total Assessed Bills:</strong> {peso.format(ov.totalAssessedBills)}</div>
          <div><strong>Total Collected:</strong> {peso.format(ov.totalCollected)}</div>
        </div>

        <h2 className="soa-issued">Quarterly Summary</h2>
        <table className="soa-table soa-table-compact" style={{ maxWidth: 500 }}>
          <thead>
            <tr><th style={{ textAlign: "left" }}>Quarter</th><th className="soa-amt">Collected</th><th className="soa-amt">Payments</th></tr>
          </thead>
          <tbody>
            {["Q1", "Q2", "Q3", "Q4"].map((q, i) => (
              <tr key={q}>
                <td style={{ textAlign: "left" }}>{q}</td>
                <td className="soa-amt">{peso.format(ov.quarterly.amount[i] ?? 0)}</td>
                <td className="soa-amt">{ov.quarterly.count[i] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Monthly Collection Trend</h2>
        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>&nbsp;</th>
              {MONTH_SHORT.map((m) => <th key={m} className="soa-amt">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "left" }}>Collected</td>
              {ov.monthly.amount.map((v, i) => <td key={i} className="soa-amt">{fmt(v, false)}</td>)}
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Payments</td>
              {ov.monthly.count.map((v, i) => <td key={i} className="soa-amt">{v || "—"}</td>)}
            </tr>
          </tbody>
        </table>

        <SectionBanner label="COLLECTIONS OVERVIEW" />
        <PairTable title="Collections per Month per Barangay" labelHeader="Barangay" primaryLabel="Amount" secondaryLabel="Count" secondaryIsCount rows={data.collections.byBarangay} />
        <ClusterFlatTable title="Collections per Month per Cluster (Grouped by Barangay)" rows={data.collections.byClusterGrouped} />
        <PairTable title="Collections per Month per Classification" labelHeader="Classification" primaryLabel="Amount" secondaryLabel="Count" secondaryIsCount rows={data.collections.byClassification} />
        <PairTable title="Senior Citizen vs Regular Consumer Collections" labelHeader="Consumer Type" primaryLabel="Amount" secondaryLabel="Count" secondaryIsCount rows={data.collections.bySeniorStatus} />

        <SectionBanner label="BILLING LOGS" />
        <PairTable title="Annual Billing Logs per Month per Barangay" labelHeader="Barangay" primaryLabel="Billed" secondaryLabel="Collected" rows={data.billingLogs.byBarangay} />
        <ClusterPairTable title="Annual Billing Logs per Month per Cluster (Grouped by Barangay)" primaryLabel="Billed" secondaryLabel="Collected" rows={data.billingLogs.byClusterGrouped} />
        <PairTable title="Annual Billing Logs per Month per Classification" labelHeader="Classification" primaryLabel="Billed" secondaryLabel="Collected" rows={data.billingLogs.byClassification} />
        <PairTable title="Annual Billing Logs per Month (Senior vs Regular)" labelHeader="Consumer Type" primaryLabel="Billed" secondaryLabel="Collected" rows={data.billingLogs.bySeniorStatus} />

        <SectionBanner label="FEE COMPONENT BREAKDOWNS" />
        {data.feeComponents.map((fc) => (
          <Fragment key={fc.key}>
            <FlatTable title={`Collected ${fc.title} per Month per Barangay`} labelHeader="Barangay" rows={fc.byBarangay} isConsumption={fc.isConsumption} />
            <ClusterFlatTable title={`Collected ${fc.title} per Month per Cluster (Grouped by Barangay)`} rows={fc.byClusterGrouped} isConsumption={fc.isConsumption} />
            <FlatTable title={`Collected ${fc.title} per Month per Classification`} labelHeader="Classification" rows={fc.byClassification} isConsumption={fc.isConsumption} />
            <FlatTable title={`Collected ${fc.title} per Month (Senior vs Regular)`} labelHeader="Consumer Type" rows={fc.bySeniorStatus} isConsumption={fc.isConsumption} />
          </Fragment>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
