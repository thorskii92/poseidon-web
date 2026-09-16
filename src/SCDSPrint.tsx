import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Service Connection Data Sheet — connections applied vs. active,
 * disconnected and reconnected, by zone and barangay, with a per-
 * classification breakdown whose column set comes from whatever
 * classifications are Active right now (see scds.ts). Signatory slots are
 * relabeled Prepared/Prepared/Checked/Noted, matching the VB form's own
 * three roles (two preparers) rather than this app's usual Approved by.
 */

const LABELS = ["Prepared by", "Prepared by", "Checked by", "Noted by"];
const plain = new Intl.NumberFormat("en-PH");

type Classification = { id: number; name: string };
type BrgyRow = {
  brgyId: number; barangay: string;
  totalApplied: number; active: number; installed: number; reconnected: number;
  newApplicants: number; disconTotal: number; nonPayment: number; volTemp: number;
  appliedByClass: number[]; activeByClass: number[];
};
type Totals = Omit<BrgyRow, "brgyId" | "barangay">;
type ZoneGroup = { plantName: string; rows: BrgyRow[]; subtotal: Totals };

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  generatedAt: string; signatories: SignatorySlot[];
  asOfHeaderStr: string; prevAsOfRowStr: string;
  classifications: Classification[];
  zones: ZoneGroup[];
  grandTotal: Totals;
  prevTotal: Totals;
};

function dashIfZero(v: number): string {
  return v ? plain.format(v) : "—";
}

export default function SCDSPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("scds");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [groupByZone, setGroupByZone] = useState(true);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    apiGet<Report>(`/api/reports/scds?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
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
  const totalCols = 10 + classCount * 2;
  // TOTAL APPLIED and NEW APPLICANTS are standalone columns (not split
  // under a shared sub-header the way the 3-column groups are), so an
  // even per-column share left them too narrow for their own header text
  // to fit on one line — it spilled into the neighboring column. They get
  // a wider, dedicated share instead; everything else still splits the
  // remainder evenly.
  const noPct = 3;
  const brgyPct = 8;
  const totalAppliedPct = 7;
  const newApplicantsPct = 7;
  const groupCols = 6 + classCount * 2; // active group(3) + discon group(3) + per-class columns
  const groupPct = (100 - noPct - brgyPct - totalAppliedPct - newApplicantsPct) / groupCols;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <a className="clear-filters" href={`/api/reports/scds/export.xlsx?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`}>
          Download Excel
        </a>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={groupByZone} onChange={(e) => setGroupByZone(e.target.checked)} />
          Group by Zone
        </label>
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

        <h1 className="soa-title">Service Connection Data Sheet</h1>
        <p className="soa-issued">For the Month of {data.asOfHeaderStr}</p>

        <table className="soa-table soa-table-compact soa-table-many-cols report-table-roomy">
          <colgroup>
            <col style={{ width: `${noPct}%` }} />
            <col style={{ width: `${brgyPct}%` }} />
            <col style={{ width: `${totalAppliedPct}%` }} />
            {Array.from({ length: 3 }).map((_, i) => <col key={`active-${i}`} style={{ width: `${groupPct}%` }} />)}
            <col style={{ width: `${newApplicantsPct}%` }} />
            {Array.from({ length: 3 }).map((_, i) => <col key={`discon-${i}`} style={{ width: `${groupPct}%` }} />)}
            {Array.from({ length: classCount * 2 }).map((_, i) => <col key={`class-${i}`} style={{ width: `${groupPct}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>NO.</th>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>BRGYS.</th>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>TOTAL APPLIED</th>
              <th className="soa-amt" colSpan={3} style={{ fontSize: "0.8em" }}>TOTAL ACTIVE CONSUMERS</th>
              <th className="soa-amt" rowSpan={2} style={{ fontSize: "0.8em" }}>NEW APPLICANTS</th>
              <th className="soa-amt" colSpan={3} style={{ fontSize: "0.8em" }}>DISCONNECTED</th>
              <th className="soa-amt" colSpan={classCount} style={{ fontSize: "0.8em" }}>TOTAL APPLIED</th>
              <th className="soa-amt" colSpan={classCount} style={{ fontSize: "0.8em" }}>ACTIVE CONSUMERS</th>
            </tr>
            <tr>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Total</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Installed (w/ Meter)</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Reconnected</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Total</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Non-Payment</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Voluntary / Temp.</th>
              {data.classifications.map((c) => <th key={`a-${c.id}`} className="soa-amt" style={{ fontSize: "0.8em" }}>{c.name}</th>)}
              {data.classifications.map((c) => <th key={`v-${c.id}`} className="soa-amt" style={{ fontSize: "0.8em" }}>{c.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {(() => {
              let line = 0;
              const brgyRow = (r: BrgyRow) => {
                line += 1;
                return (
                  <tr key={r.brgyId}>
                    <td className="soa-amt">{line}</td>
                    <td style={{ textAlign: "left" }}>{r.barangay}</td>
                    <td className="soa-amt">{plain.format(r.totalApplied)}</td>
                    <td className="soa-amt">{plain.format(r.active)}</td>
                    <td className="soa-amt">{plain.format(r.installed)}</td>
                    <td className="soa-amt">{dashIfZero(r.reconnected)}</td>
                    <td className="soa-amt">{dashIfZero(r.newApplicants)}</td>
                    <td className="soa-amt">{plain.format(r.disconTotal)}</td>
                    <td className="soa-amt">{plain.format(r.nonPayment)}</td>
                    <td className="soa-amt">{dashIfZero(r.volTemp)}</td>
                    {r.appliedByClass.map((v, i) => <td key={i} className="soa-amt">{dashIfZero(v)}</td>)}
                    {r.activeByClass.map((v, i) => <td key={i} className="soa-amt">{dashIfZero(v)}</td>)}
                  </tr>
                );
              };

              if (!groupByZone) {
                return data.zones.flatMap((zone) => zone.rows).map(brgyRow);
              }

              return data.zones.map((zone) => (
                <Fragment key={zone.plantName}>
                  <tr style={{ background: "#0d3b66" }}>
                    <td colSpan={totalCols} style={{ textAlign: "left", fontWeight: 700, color: "#fff" }}>{zone.plantName}</td>
                  </tr>
                  {zone.rows.map(brgyRow)}
                  <tr style={{ background: "#e2efda", fontWeight: 700 }}>
                    <td colSpan={2}>Sub-total</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.totalApplied)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.active)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.installed)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.reconnected)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.newApplicants)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.disconTotal)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.nonPayment)}</td>
                    <td className="soa-amt">{plain.format(zone.subtotal.volTemp)}</td>
                    {zone.subtotal.appliedByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
                    {zone.subtotal.activeByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
                  </tr>
                </Fragment>
              ));
            })()}
            <tr style={{ background: "#ffff00", fontWeight: 700 }}>
              <td colSpan={2}>TOTAL</td>
              <td className="soa-amt">{plain.format(data.grandTotal.totalApplied)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.active)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.installed)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.reconnected)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.newApplicants)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.disconTotal)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.nonPayment)}</td>
              <td className="soa-amt">{plain.format(data.grandTotal.volTemp)}</td>
              {data.grandTotal.appliedByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
              {data.grandTotal.activeByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
            </tr>
            <tr style={{ background: "#d9d9d9", fontWeight: 700 }}>
              <td colSpan={2} style={{ textAlign: "left" }}>AS OF {data.prevAsOfRowStr}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.totalApplied)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.active)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.installed)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.reconnected)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.newApplicants)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.disconTotal)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.nonPayment)}</td>
              <td className="soa-amt">{plain.format(data.prevTotal.volTemp)}</td>
              {data.prevTotal.appliedByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
              {data.prevTotal.activeByClass.map((v, i) => <td key={i} className="soa-amt">{plain.format(v)}</td>)}
            </tr>
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock labels={LABELS} slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
