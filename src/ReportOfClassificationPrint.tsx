import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * Report of Classification — consumption, amount and account count per
 * classification, grouped by barangay then cluster, for one billing
 * month. See reportOfClassification.ts for why the amount column reads
 * billing.useAmount rather than billing.amount (the VB source's own
 * choice for this specific report) and why every active cluster appears
 * even with zero billing. Signatories use this app's default 4-slot
 * labels unchanged — they already matched the VB's Prepared/Checked/
 * Approved roles, just with the usual second Prepared-by slot added.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

function dash(v: number, fmt: Intl.NumberFormat): string {
  return v ? fmt.format(v) : "—";
}

type Classification = { id: number; name: string };
type ClassCCA = { classId: number; consump: number; amount: number; count: number };
type ClusterRow = { clusterId: number; cluster: string; byClass: ClassCCA[] };
type BarangayGroup = { barangay: string; rows: ClusterRow[]; subtotal: ClassCCA[] };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  month: string; year: number; generatedAt: string; signatories: SignatorySlot[];
  classifications: Classification[];
  byBarangay: BarangayGroup[];
  grandTotal: ClassCCA[];
};

export default function ReportOfClassificationPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("report-of-classification");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    apiGet<Report>(`/api/reports/report-of-classification?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [month, year, sig.ready, sig.query]);

  if (!month || !year) {
    return (
      <div className="print-root">
        <div className="form-error">No month/year given.</div>
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

  const classCount = data.classifications.length;
  const groups = classCount; // one group of 3 sub-columns per classification
  const labelPct = 14;
  const groupPct = (100 - labelPct) / groups;
  const totalCols = 1 + classCount * 3;

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

        <h1 className="soa-title">Report of Classification</h1>
        <p className="soa-issued">{data.month} {data.year}</p>

        <table className="soa-table soa-table-compact soa-table-many-cols report-table-roomy">
          <colgroup>
            <col style={{ width: `${labelPct}%` }} />
            {Array.from({ length: groups * 3 }).map((_, i) => <col key={i} style={{ width: `${groupPct / 3}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>CLUSTER</th>
              {data.classifications.map((c) => (
                <th key={c.id} className="soa-amt" colSpan={3} style={{ fontSize: "0.8em" }}>{c.name.toUpperCase()}</th>
              ))}
            </tr>
            <tr>
              {data.classifications.map((c) => (
                <Fragment key={c.id}>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Consumption</th>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Amount</th>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Count</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.byBarangay.length === 0 ? (
              <tr><td colSpan={totalCols} style={{ textAlign: "center" }}>No active clusters found.</td></tr>
            ) : (
              data.byBarangay.map((group) => (
                <Fragment key={group.barangay}>
                  <tr style={{ background: "#e8e8e8" }}>
                    <td colSpan={totalCols} style={{ textAlign: "left", fontWeight: 700 }}>{group.barangay}</td>
                  </tr>
                  {group.rows.map((r) => (
                    <tr key={r.clusterId}>
                      <td style={{ textAlign: "left", paddingLeft: 12 }}>{r.cluster}</td>
                      {r.byClass.map((c) => (
                        <Fragment key={c.classId}>
                          <td className="soa-amt">{dash(c.consump, plain)}</td>
                          <td className="soa-amt">{dash(c.amount, peso)}</td>
                          <td className="soa-amt">{dash(c.count, plain)}</td>
                        </Fragment>
                      ))}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, fontStyle: "italic", background: "#f5f5f5" }}>
                    <td style={{ textAlign: "left" }}>SUBTOTAL</td>
                    {group.subtotal.map((c) => (
                      <Fragment key={c.classId}>
                        <td className="soa-amt">{plain.format(c.consump)}</td>
                        <td className="soa-amt">{peso.format(c.amount)}</td>
                        <td className="soa-amt">{plain.format(c.count)}</td>
                      </Fragment>
                    ))}
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {data.byBarangay.length > 0 && (
            <tfoot>
              <tr className="soa-total-row">
                <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
                {data.grandTotal.map((c) => (
                  <Fragment key={c.classId}>
                    <td className="soa-amt">{plain.format(c.consump)}</td>
                    <td className="soa-amt">{peso.format(c.amount)}</td>
                    <td className="soa-amt">{plain.format(c.count)}</td>
                  </Fragment>
                ))}
              </tr>
            </tfoot>
          )}
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
