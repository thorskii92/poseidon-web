import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import "./print.css";

/**
 * Report of Collections and Deposit — the LGU's own COA-style accountability
 * form. Report No. and the three signatory names are free text, filled in at
 * print time — see receipts.ts's own comment on the endpoint for why: same
 * partial-signatory exception AdjustmentPrint/JobOrderPrint already
 * established, just without even the picker, since these aren't drawn from
 * the signatories list at all.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

type Collection = { from: string; to: string; amount: number };
type Accountability = {
  initial: string; final: string; serial: string;
  receiptQty: number; receiptFrom: string; receiptTo: string;
  issuedQty: number; issuedFrom: string; issuedTo: string;
  endingQty: number; endingFrom: string; endingTo: string;
};
type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  reportDate: string;
  collections: Collection[];
  accountability: Accountability[];
  totalCollections: number;
  beginningBalance: number;
  remittance: number;
};

const STORE_KEY = "poseidon.collectionsDeposit.signatories";

function loadSavedNames(): { accountable: string; liquidating: string; treasurer: string } {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* private windows and cleared site data both land here */
  }
  return { accountable: "", liquidating: "", treasurer: "" };
}

function saveNames(v: { accountable: string; liquidating: string; treasurer: string }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* the choice just won't be remembered next time */
  }
}

function longDate(v: string) {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export default function CollectionsDepositReportPrint() {
  const [params] = useSearchParams();
  const ogIds = params.get("ogIds") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  const saved = loadSavedNames();
  const [reportNo, setReportNo] = useState("");
  const [accountable, setAccountable] = useState(saved.accountable);
  const [liquidating, setLiquidating] = useState(saved.liquidating);
  const [treasurer, setTreasurer] = useState(saved.treasurer);

  useEffect(() => {
    if (!ogIds) return;
    apiGet<Report>(`/api/receipts/collections-deposit-report?ogIds=${encodeURIComponent(ogIds)}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [ogIds]);

  function updateNames(next: Partial<{ accountable: string; liquidating: string; treasurer: string }>) {
    const merged = { accountable, liquidating, treasurer, ...next };
    if ("accountable" in next) setAccountable(next.accountable!);
    if ("liquidating" in next) setLiquidating(next.liquidating!);
    if ("treasurer" in next) setTreasurer(next.treasurer!);
    saveNames(merged);
  }

  if (!ogIds) {
    return (
      <div className="print-root">
        <div className="form-error">No O.R. bundle chosen.</div>
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

  const balanceEnding = data.beginningBalance + data.totalCollections - data.remittance;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <label className="field-input">
          <span>Report No.</span>
          <input className="filter-input" value={reportNo} onChange={(e) => setReportNo(e.target.value)} />
        </label>
        <label className="field-input">
          <span>Accountable Officer</span>
          <input
            className="filter-input"
            value={accountable}
            onChange={(e) => updateNames({ accountable: e.target.value })}
          />
        </label>
        <label className="field-input">
          <span>Liquidating Officer</span>
          <input
            className="filter-input"
            value={liquidating}
            onChange={(e) => updateNames({ liquidating: e.target.value })}
          />
        </label>
        <label className="field-input">
          <span>Asst. Municipal Treasurer</span>
          <input
            className="filter-input"
            value={treasurer}
            onChange={(e) => updateNames({ treasurer: e.target.value })}
          />
        </label>
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
          {data.office.municipalHeader && <div>{data.office.municipalHeader}</div>}
          {data.office.officeHeader && <div>{data.office.officeHeader}</div>}
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Report of Collections and Deposit</h1>
        <p className="soa-issued">
          {reportNo ? <>Report No. {reportNo} · </> : null}
          {longDate(data.reportDate)}
        </p>

        <h2 className="soa-issued" style={{ marginTop: 16, textAlign: "left" }}>Collections</h2>
        <table className="soa-table">
          <thead>
            <tr>
              <th className="soa-amt">O.R. From</th>
              <th className="soa-amt">O.R. To</th>
              <th className="soa-amt">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.collections.map((c, i) => (
              <tr key={i}>
                <td className="soa-amt">{c.from}</td>
                <td className="soa-amt">{c.to}</td>
                <td className="soa-amt">{peso.format(c.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="soa-total-row">
              <td colSpan={2} className="soa-total-label">Total Collections</td>
              <td className="soa-amt">{peso.format(data.totalCollections)}</td>
            </tr>
          </tfoot>
        </table>

        <h2 className="soa-issued" style={{ marginTop: 20, textAlign: "left" }}>Cash Summary</h2>
        <table className="soa-meta" style={{ maxWidth: "4in" }}>
          <tbody>
            <tr>
              <td className="lbl">Beginning Balance</td>
              <td style={{ textAlign: "right" }}>{peso.format(data.beginningBalance)}</td>
            </tr>
            <tr>
              <td className="lbl">Add: Collections</td>
              <td style={{ textAlign: "right" }}>{peso.format(data.totalCollections)}</td>
            </tr>
            <tr>
              <td className="lbl">Total</td>
              <td style={{ textAlign: "right" }}>{peso.format(data.beginningBalance + data.totalCollections)}</td>
            </tr>
            <tr>
              <td className="lbl">Less: Remittance / Deposit</td>
              <td style={{ textAlign: "right" }}>{peso.format(data.remittance)}</td>
            </tr>
            <tr>
              <td className="lbl" style={{ fontWeight: 700 }}>Balance</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{peso.format(balanceEnding)}</td>
            </tr>
          </tbody>
        </table>

        <div className="sign-block sign-block-4" style={{ marginTop: 30, maxWidth: "6.5in" }}>
          <div className="sign-cell">
            <span className="sign-label">&nbsp;</span>
            <span className="sign-name">{accountable || " "}</span>
            <span className="sign-title">Accountable Officer</span>
          </div>
          <div className="sign-cell">
            <span className="sign-label">&nbsp;</span>
            <span className="sign-name">{liquidating || " "}</span>
            <span className="sign-title">Liquidating Officer</span>
          </div>
          <div className="sign-cell">
            <span className="sign-label">&nbsp;</span>
            <span className="sign-name">{treasurer || " "}</span>
            <span className="sign-title">Asst. Municipal Treasurer</span>
          </div>
        </div>

        <div className="report-page-break" />

        <h2 className="soa-issued" style={{ marginTop: 6, textAlign: "left" }}>
          Accountability for Accountable Forms
        </h2>
        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Serial</th>
              <th className="soa-amt">Receipt Qty</th>
              <th className="soa-amt">Receipt From</th>
              <th className="soa-amt">Receipt To</th>
              <th className="soa-amt">Issued Qty</th>
              <th className="soa-amt">Issued From</th>
              <th className="soa-amt">Issued To</th>
              <th className="soa-amt">Ending Qty</th>
              <th className="soa-amt">Ending From</th>
              <th className="soa-amt">Ending To</th>
            </tr>
          </thead>
          <tbody>
            {data.accountability.map((a, i) => (
              <tr key={i}>
                <td style={{ textAlign: "left" }}>{a.serial}</td>
                <td className="soa-amt">{plain.format(a.receiptQty)}</td>
                <td className="soa-amt">{a.receiptFrom}</td>
                <td className="soa-amt">{a.receiptTo}</td>
                <td className="soa-amt">{plain.format(a.issuedQty)}</td>
                <td className="soa-amt">{a.issuedFrom}</td>
                <td className="soa-amt">{a.issuedTo}</td>
                <td className="soa-amt">{plain.format(a.endingQty)}</td>
                <td className="soa-amt">{a.endingFrom}</td>
                <td className="soa-amt">{a.endingTo}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="soa-foot">
          Generated {new Date().toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}
        </p>
      </article>
    </div>
  );
}
