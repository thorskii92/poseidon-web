import { useEffect, useState } from "react";
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

/**
 * Daily Collection Report — Rizal's, for now (see poseidon-api's receipts.ts
 * for why: each municipality had its own bespoke Crystal Report for this,
 * and only Rizal's has been rebuilt so far).
 *
 * The O.R. range and serial are fixed once the report is opened — changing
 * them means picking a different range from Receipts Manager. Signatories,
 * paper, orientation and scale are the things worth changing without
 * leaving the page, so they live here as their own controls — the standard
 * 2 Prepared by / 1 Checked by / 1 Approved by (Signatories.tsx's default
 * slate) and the standard paper/orientation/scale trio (PrintLayoutControls)
 * every report gets except bills and O.R.s, which print onto a pre-printed
 * form at a fixed size instead.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Row = {
  orNumber: string;
  date: string | null;
  name: string;
  purok: string;
  period: string;
  waterBill: number;
  pes: number;
  disc: number;
  pen: number;
  connFee: number;
  reconnFee: number;
  otherFees: number;
  total: number;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  initial: string;
  final: string;
  serial: string;
  reportDate: string;
  signatories: SignatorySlot[];
  rows: Row[];
  totals: {
    waterBill: number; pes: number; disc: number; pen: number;
    connFee: number; reconnFee: number; otherFees: number; total: number;
  };
};

function shortDate(v: string | null) {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

function longDate(v: string) {
  const [y, m, d] = v.split("-");
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export default function DailyCollectionPrint() {
  const [params] = useSearchParams();
  const initial = params.get("initial") ?? "";
  const final = params.get("final") ?? "";
  const serial = params.get("serial") ?? "";

  const sig = useSignatories("daily-collection");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!initial || !final || !serial || !sig.ready) return;
    apiGet<Report>(
      `/api/receipts/daily-collection?initial=${initial}&final=${final}&serial=${encodeURIComponent(serial)}&${sig.query}`,
    )
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [initial, final, serial, sig.ready, sig.query]);

  if (!initial || !final || !serial) {
    return (
      <div className="print-root">
        <div className="form-error">No O.R. range given.</div>
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

  const { totals } = data;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <SignatoryPickers
          people={sig.people}
          values={sig.values}
          onChange={sig.setValue}
        />
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />
        <span className="print-hint count">
          {data.rows.length} line{data.rows.length === 1 ? "" : "s"} · {peso.format(totals.total)}
        </span>
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Report of Daily Water Collections</h1>
        <p className="soa-issued">For {longDate(data.reportDate)}</p>

        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>O.R. No.</th>
              <th style={{ textAlign: "left" }}>Name</th>
              <th style={{ textAlign: "left" }}>Purok</th>
              <th>Months</th>
              <th className="soa-amt">Water Bill</th>
              <th className="soa-amt">PES</th>
              <th className="soa-amt">Disc</th>
              <th className="soa-amt">Pen</th>
              <th className="soa-amt">Connection Fee</th>
              <th className="soa-amt">Reconnection Fee</th>
              <th className="soa-amt">Other Fees</th>
              <th className="soa-amt">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={14} style={{ textAlign: "center" }}>
                  Nothing was collected on this O.R. range.
                </td>
              </tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{shortDate(r.date)}</td>
                  <td>{r.orNumber}</td>
                  <td style={{ textAlign: "left" }}>{r.name}</td>
                  <td style={{ textAlign: "left" }}>{r.purok}</td>
                  <td>{r.period}</td>
                  <td className="soa-amt">{r.waterBill ? peso.format(r.waterBill) : ""}</td>
                  <td className="soa-amt">{r.pes ? peso.format(r.pes) : ""}</td>
                  <td className="soa-amt">{r.disc ? `(${peso.format(r.disc)})` : ""}</td>
                  <td className="soa-amt">{r.pen ? peso.format(r.pen) : ""}</td>
                  <td className="soa-amt">{r.connFee ? peso.format(r.connFee) : ""}</td>
                  <td className="soa-amt">{r.reconnFee ? peso.format(r.reconnFee) : ""}</td>
                  <td className="soa-amt">{r.otherFees ? peso.format(r.otherFees) : ""}</td>
                  <td className="soa-amt">{peso.format(r.total)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td colSpan={6} className="soa-total-label">Total</td>
              <td className="soa-amt">{peso.format(totals.waterBill)}</td>
              <td className="soa-amt">{peso.format(totals.pes)}</td>
              <td className="soa-amt">{totals.disc ? `(${peso.format(totals.disc)})` : peso.format(totals.disc)}</td>
              <td className="soa-amt">{peso.format(totals.pen)}</td>
              <td className="soa-amt">{peso.format(totals.connFee)}</td>
              <td className="soa-amt">{peso.format(totals.reconnFee)}</td>
              <td className="soa-amt">{peso.format(totals.otherFees)}</td>
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
