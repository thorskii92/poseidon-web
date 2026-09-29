import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * Accounts Receivable Summary — consumption and billed amount per
 * barangay, grouped under each barangay's water-system zone (labeled by
 * the zone's abbreviation, e.g. "CRWS", matching the VB source's own
 * choice), with a subtotal per zone and one grand total. See
 * accountsReceivableSummary.ts for the legacy naming mismatch this was
 * ported from.
 */

const LABELS = ["Prepared by", "Prepared by", "Verified by", "Noted by"];
const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

type BrgyRow = { barangay: string; consump: number; amount: number };
type ZoneGroup = { zoneAbbrv: string; rows: BrgyRow[]; subtotalConsump: number; subtotalAmount: number };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  month: string; year: number; generatedAt: string; signatories: SignatorySlot[];
  zones: ZoneGroup[];
  grandConsump: number;
  grandAmount: number;
};

export default function AccountsReceivableSummaryPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("accounts-receivable-summary");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    apiGet<Report>(`/api/reports/accounts-receivable-summary?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
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
        <ReportHeader />

        <h1 className="soa-title">Accounts Receivable Summary</h1>
        <p className="soa-issued">{data.month} {data.year}</p>

        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left", width: "25%" }}>SOURCE</th>
              <th style={{ textAlign: "left", width: "35%" }}>Serviced Barangay</th>
              <th className="soa-amt">Consumption</th>
              <th className="soa-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.zones.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: "center" }}>No billing for this month.</td></tr>
            ) : (
              data.zones.map((zone) => (
                <Fragment key={zone.zoneAbbrv}>
                  <tr style={{ background: "#e9ecef" }}>
                    <td colSpan={4} style={{ textAlign: "left", fontWeight: 700 }}>{zone.zoneAbbrv}</td>
                  </tr>
                  {zone.rows.map((r, i) => (
                    <tr key={i}>
                      <td></td>
                      <td style={{ textAlign: "left" }}>{r.barangay}</td>
                      <td className="soa-amt">{plain.format(r.consump)}</td>
                      <td className="soa-amt">{peso.format(r.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, background: "#f8f9fa" }}>
                    <td></td>
                    <td style={{ textAlign: "right", fontStyle: "italic" }}>Sub Total:</td>
                    <td className="soa-amt">{plain.format(zone.subtotalConsump)}</td>
                    <td className="soa-amt">{peso.format(zone.subtotalAmount)}</td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          {data.zones.length > 0 && (
            <tfoot>
              <tr className="soa-total-row">
                <td colSpan={2} style={{ textAlign: "right" }}>GRAND TOTAL:</td>
                <td className="soa-amt">{plain.format(data.grandConsump)}</td>
                <td className="soa-amt">{peso.format(data.grandAmount)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock labels={LABELS} slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
