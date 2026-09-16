import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Revenue from Consumption — billed volume and amount by classification,
 * per barangay, for one billing month. See revenueFromConsumption.ts for
 * why this reads billing.brgyID directly rather than the consumer's
 * current barangay (unlike the by-cluster view, which does) — a
 * deliberate mismatch carried over from the VB source, not reconciled.
 */

const LABELS = ["Prepared by", "Prepared by", "Verified by", "Attested by"];
const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

function dash(v: number, fmt: Intl.NumberFormat): string {
  return v ? fmt.format(v) : "—";
}

type Classification = { id: number; name: string };
type ClassAmt = { classId: number; vol: number; amt: number };
type BrgyRow = { brgyId: number; barangay: string; byClass: ClassAmt[]; totalVol: number; totalAmt: number };
type Totals = { byClass: ClassAmt[]; totalVol: number; totalAmt: number };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  month: string; year: number; generatedAt: string; signatories: SignatorySlot[];
  classifications: Classification[];
  rows: BrgyRow[];
  totals: Totals;
};

export default function RevenueFromConsumptionPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("revenue-consumption-barangay");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    apiGet<Report>(`/api/reports/revenue-consumption/by-barangay?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
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
  const pairs = classCount + 1; // classifications + Monthly Total
  const labelPct = 12;
  const pairPct = (100 - labelPct) / pairs;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} labels={LABELS} />
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

        <h1 className="soa-title">Revenue from Consumption</h1>
        <p className="soa-issued">{data.month} {data.year}</p>

        <table className="soa-table soa-table-compact soa-table-many-cols report-table-roomy">
          <colgroup>
            <col style={{ width: `${labelPct}%` }} />
            {Array.from({ length: pairs * 2 }).map((_, i) => <col key={i} style={{ width: `${pairPct / 2}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>BGY.</th>
              {data.classifications.map((c) => (
                <th key={c.id} className="soa-amt" colSpan={2} style={{ fontSize: "0.8em" }}>{c.name.toUpperCase()}</th>
              ))}
              <th className="soa-amt" colSpan={2} style={{ fontSize: "0.8em" }}>MONTHLY TOTAL</th>
            </tr>
            <tr>
              {Array.from({ length: pairs }).map((_, i) => (
                <Fragment key={i}>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Billed Vol (m³)</th>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Billed Amount (Php)</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={1 + pairs * 2} style={{ textAlign: "center" }}>No billing for this month.</td></tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={r.brgyId}>
                  <td style={{ textAlign: "left" }}>{i + 1}. {r.barangay}</td>
                  {r.byClass.map((c) => (
                    <Fragment key={c.classId}>
                      <td className="soa-amt">{dash(c.vol, plain)}</td>
                      <td className="soa-amt">{dash(c.amt, peso)}</td>
                    </Fragment>
                  ))}
                  <td className="soa-amt" style={{ fontWeight: 600 }}>{plain.format(r.totalVol)}</td>
                  <td className="soa-amt" style={{ fontWeight: 600 }}>{peso.format(r.totalAmt)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td style={{ textAlign: "left" }}>TOTAL</td>
              {data.totals.byClass.map((c) => (
                <Fragment key={c.classId}>
                  <td className="soa-amt">{plain.format(c.vol)}</td>
                  <td className="soa-amt">{peso.format(c.amt)}</td>
                </Fragment>
              ))}
              <td className="soa-amt">{plain.format(data.totals.totalVol)}</td>
              <td className="soa-amt">{peso.format(data.totals.totalAmt)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock labels={LABELS} slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
