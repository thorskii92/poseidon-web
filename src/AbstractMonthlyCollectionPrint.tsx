import { useEffect, useState } from "react";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Abstract of Monthly Collection — a fixed trailing 12 months, no filters
 * to set, so unlike the other print views this opens straight from its
 * Reports card with nothing to configure first beyond who signs it.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Discount here is a deduction already folded into `water` upstream, not
 *  a further one — see reports.ts for why it prints in parens rather than
 *  being subtracted from the row again. */
function pesoParen(v: number): string {
  return v ? `(${peso.format(v)})` : peso.format(0);
}

type Totals = {
  water: number; pes: number; surcharge: number; discount: number;
  connFee: number; reconnFee: number; others: number; total: number;
};
type Row = Totals & { period: string };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  generatedAt: string;
  signatories: SignatorySlot[];
  rows: Row[];
  totals: Totals;
};

export default function AbstractMonthlyCollectionPrint() {
  const sig = useSignatories("abstract-monthly-collection");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/abstract-monthly-collection?${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [sig.ready, sig.query]);

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

  const { totals } = data;

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
        <span className="print-hint count">
          {data.rows.length} months · {peso.format(totals.total)}
        </span>
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Abstract of Monthly Collection</h1>
        <p className="soa-issued">
          Generated {new Date(data.generatedAt).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}
        </p>

        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Period</th>
              <th className="soa-amt">Water Bills</th>
              <th className="soa-amt">P.E.S</th>
              <th className="soa-amt">Surcharge</th>
              <th className="soa-amt">Discount</th>
              <th className="soa-amt">Connection Fee</th>
              <th className="soa-amt">Reconnection Fee</th>
              <th className="soa-amt">Others</th>
              <th className="soa-amt">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ textAlign: "left", fontWeight: 600 }}>{r.period.toUpperCase()}</td>
                <td className="soa-amt">{peso.format(r.water)}</td>
                <td className="soa-amt">{peso.format(r.pes)}</td>
                <td className="soa-amt">{peso.format(r.surcharge)}</td>
                <td className="soa-amt">{pesoParen(r.discount)}</td>
                <td className="soa-amt">{peso.format(r.connFee)}</td>
                <td className="soa-amt">{peso.format(r.reconnFee)}</td>
                <td className="soa-amt">{peso.format(r.others)}</td>
                <td className="soa-amt" style={{ fontWeight: 600 }}>{peso.format(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
              <td className="soa-amt">{peso.format(totals.water)}</td>
              <td className="soa-amt">{peso.format(totals.pes)}</td>
              <td className="soa-amt">{peso.format(totals.surcharge)}</td>
              <td className="soa-amt">{pesoParen(totals.discount)}</td>
              <td className="soa-amt">{peso.format(totals.connFee)}</td>
              <td className="soa-amt">{peso.format(totals.reconnFee)}</td>
              <td className="soa-amt">{peso.format(totals.others)}</td>
              <td className="soa-amt">{peso.format(totals.total)}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
