import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Latest Consumer Status — active vs. disconnected accounts by
 * classification, per barangay or per cluster. See latestConsumerStatus.ts
 * for why the month/year only label the snapshot rather than filtering it.
 * Three signatories (Prepared/Verified/Attested), not the standard four —
 * the VB dialog only ever asked for three.
 */

const LABELS = ["Prepared by", "Verified by", "Attested by"];
const SLOT_TYPES = ["PREP", "CHECK", "APPR"] as const;
const plain = new Intl.NumberFormat("en-PH");

function dash(v: number): string {
  return v ? plain.format(v) : "—";
}

type Classification = { id: number; name: string };
type ClassAD = { classId: number; active: number; disc: number };
type OfficeInfo = { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };

type BarangayReport = {
  office: OfficeInfo; month: string; year: number; signatories: SignatorySlot[];
  classifications: Classification[];
  rows: { brgyId: number; barangay: string; byClass: ClassAD[]; rowDisc: number; rowActive: number; rowTotal: number }[];
  totals: { byClass: ClassAD[]; totalDisc: number; totalActive: number; grandTotal: number };
};

type ClusterReport = {
  office: OfficeInfo; month: string; year: number; signatories: SignatorySlot[];
  classifications: Classification[];
  groups: {
    barangay: string;
    rows: { cluster: string; byClass: ClassAD[]; rowDisc: number; rowActive: number; rowTotal: number }[];
    subtotal: ClassAD[]; subDisc: number; subActive: number; subTotal: number;
  }[];
  totals: { byClass: ClassAD[]; totalDisc: number; totalActive: number; grandTotal: number };
};

export default function LatestConsumerStatusPrint() {
  const [params] = useSearchParams();
  const view = params.get("view") === "cluster" ? "cluster" : "barangay";
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("consumer-status", SLOT_TYPES);
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<BarangayReport | ClusterReport | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    setData(null);
    apiGet<BarangayReport | ClusterReport>(`/api/reports/consumer-status/by-${view}?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [view, month, year, sig.ready, sig.query]);

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

  const classes = data.classifications;
  const classCount = classes.length;
  const totalCols = 1 + classCount * 2 + 2;
  const labelPct = 20;
  const totalsPct = 8;
  const groupPct = (100 - labelPct - totalsPct * 2) / (classCount * 2);

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} labels={LABELS} slotTypes={SLOT_TYPES} />
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

        <h1 className="soa-title">Active/Inactive Consumer Report</h1>
        <p className="soa-issued">As of {data.month} {data.year}</p>

        <table className="soa-table soa-table-compact soa-table-many-cols report-table-roomy">
          <colgroup>
            <col style={{ width: `${labelPct}%` }} />
            {Array.from({ length: classCount * 2 }).map((_, i) => <col key={i} style={{ width: `${groupPct}%` }} />)}
            <col style={{ width: `${totalsPct}%` }} />
            <col style={{ width: `${totalsPct}%` }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>{view === "cluster" ? "Barangay / Cluster Group" : "Barangay"}</th>
              {classes.map((c) => (
                <th key={c.id} className="soa-amt" colSpan={2} style={{ fontSize: "0.8em" }}>{c.name.toUpperCase()}</th>
              ))}
              <th rowSpan={2} className="soa-amt" style={{ fontSize: "0.75em" }}>Total Disconnected</th>
              <th rowSpan={2} className="soa-amt" style={{ fontSize: "0.75em" }}>Total Active</th>
            </tr>
            <tr>
              {classes.map((c) => (
                <Fragment key={c.id}>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Active</th>
                  <th className="soa-amt" style={{ fontSize: "0.75em" }}>Disc.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {view === "barangay" ? (
              (data as BarangayReport).rows.length === 0 ? (
                <tr><td colSpan={totalCols} style={{ textAlign: "center" }}>No active barangays found.</td></tr>
              ) : (
                (data as BarangayReport).rows.map((r) => (
                  <tr key={r.brgyId}>
                    <td style={{ textAlign: "left", fontWeight: 600 }}>{r.barangay}</td>
                    {r.byClass.map((c) => (
                      <Fragment key={c.classId}>
                        <td className="soa-amt">{dash(c.active)}</td>
                        <td className="soa-amt">{dash(c.disc)}</td>
                      </Fragment>
                    ))}
                    <td className="soa-amt">{dash(r.rowDisc)}</td>
                    <td className="soa-amt">{dash(r.rowActive)}</td>
                  </tr>
                ))
              )
            ) : (data as ClusterReport).groups.length === 0 ? (
              <tr><td colSpan={totalCols} style={{ textAlign: "center" }}>No active clusters found.</td></tr>
            ) : (
              (data as ClusterReport).groups.map((group) => (
                <Fragment key={group.barangay}>
                  <tr style={{ background: "#e8e8e8" }}>
                    <td colSpan={totalCols} style={{ textAlign: "left", fontWeight: 700 }}>BARANGAY: {group.barangay}</td>
                  </tr>
                  {group.rows.map((r) => (
                    <tr key={r.cluster}>
                      <td style={{ textAlign: "left", paddingLeft: 16 }}>{r.cluster}</td>
                      {r.byClass.map((c) => (
                        <Fragment key={c.classId}>
                          <td className="soa-amt">{dash(c.active)}</td>
                          <td className="soa-amt">{dash(c.disc)}</td>
                        </Fragment>
                      ))}
                      <td className="soa-amt">{dash(r.rowDisc)}</td>
                      <td className="soa-amt">{dash(r.rowActive)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, fontStyle: "italic", background: "#f5f5f5" }}>
                    <td style={{ textAlign: "left" }}>SUBTOTAL</td>
                    {group.subtotal.map((c) => (
                      <Fragment key={c.classId}>
                        <td className="soa-amt">{plain.format(c.active)}</td>
                        <td className="soa-amt">{plain.format(c.disc)}</td>
                      </Fragment>
                    ))}
                    <td className="soa-amt">{plain.format(group.subDisc)}</td>
                    <td className="soa-amt">{plain.format(group.subActive)}</td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
              {data.totals.byClass.map((c) => (
                <Fragment key={c.classId}>
                  <td className="soa-amt">{plain.format(c.active)}</td>
                  <td className="soa-amt">{plain.format(c.disc)}</td>
                </Fragment>
              ))}
              <td className="soa-amt">{plain.format(data.totals.totalDisc)}</td>
              <td className="soa-amt">{plain.format(data.totals.totalActive)}</td>
            </tr>
            <tr className="soa-total-row">
              <td colSpan={totalCols - 2} style={{ textAlign: "right" }}>TOTAL NUMBER OF CONSUMERS (DISC. &amp; ACTIVE):</td>
              <td className="soa-amt" colSpan={2}>{plain.format(data.totals.grandTotal)}</td>
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
