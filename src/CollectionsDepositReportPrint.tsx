import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import { PAPERS, type PaperKey } from "./orLayout";
import { REPORT_PAPERS, pageBoxInches } from "./PrintLayoutControls";
import "./print.css";

/**
 * Report of Collections and Deposit — a cell-for-cell reproduction of the
 * LGU's paper form: black and white, one outer border per page, fixed row
 * counts on every table, portrait page one (Collections, Remittances /
 * Deposits) then landscape page two (Accountable Forms, Summary,
 * Certification / Verification). Paper size is selectable (Letter / Legal /
 * A4); orientation isn't — each page's is fixed by the form itself — and
 * neither is scale, since the fixed tables already fill the page width.
 *
 * LGU name, Fund, Form Type (the "A.F. #" accountable-form designation),
 * Report No. and the three signatory names are free text, typed at print
 * time — nothing in the database tracks who countersigns a paper form or
 * which fund a bundle was collected under.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

/** Row counts of the paper form's own tables. */
const COLLECTOR_ROWS = 10;
const LIQUIDATING_ROWS = 4;
const REMITTANCE_ROWS = 4;
const ACCOUNTABILITY_ROWS = 10;

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

type FreeText = {
  lguName: string; reportNo: string; fund: string; formType: string;
  accountable: string; liquidating: string; treasurer: string;
  liquidatingTitle: string; treasurerTitle: string;
};

const STORE_KEY = "poseidon.collectionsDeposit.fields";
const PAPER_KEY = "poseidon.collectionsDeposit.paper";

function loadPaper(): PaperKey {
  try {
    const v = localStorage.getItem(PAPER_KEY) as PaperKey | null;
    if (v && REPORT_PAPERS.includes(v)) return v;
  } catch {
    /* falls back to Letter */
  }
  return "letter";
}
const DEFAULTS: FreeText = {
  lguName: "", reportNo: "", fund: "", formType: "A.F. #51",
  accountable: "", liquidating: "", treasurer: "",
  liquidatingTitle: "", treasurerTitle: "",
};

function loadSaved(): FreeText {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* private windows and cleared site data both land here */
  }
  return DEFAULTS;
}

function save(v: FreeText) {
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

/** Pads to the form's row count with nulls (blank lines); never truncates. */
function padTo<T>(rows: T[], min: number): (T | null)[] {
  const out: (T | null)[] = [...rows];
  while (out.length < min) out.push(null);
  return out;
}

/** Two page sizes in one document: @page can't read CSS variables, so the
 *  inch sizes are injected here (same technique as
 *  PrintLayoutControls.usePrintPageSize), with a named landscape page that
 *  .rcd-page-landscape selects. */
function useTwoPageSize(paper: PaperKey) {
  const portrait = pageBoxInches(paper, "portrait");
  const landscape = pageBoxInches(paper, "landscape");
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @page { size: ${portrait.width}in ${portrait.height}in; margin: 0.45in 0.55in; }
      @page rcd-landscape { size: ${landscape.width}in ${landscape.height}in; margin: 0.45in 0.55in; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [portrait.width, portrait.height, landscape.width, landscape.height]);
  return { portrait, landscape };
}

/** Page one's column grid — shared by all three tables so their lines
 *  line up down the page, narrow blank column on the right included. */
function PageOneCols() {
  return (
    <colgroup>
      <col style={{ width: "28.4%" }} />
      <col style={{ width: "18.8%" }} />
      <col style={{ width: "18.8%" }} />
      <col style={{ width: "28.5%" }} />
      <col style={{ width: "5.5%" }} />
    </colgroup>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <label className="field-input">
      <span>{label}</span>
      <input className="filter-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function CollectionsDepositReportPrint() {
  const [params] = useSearchParams();
  const ogIds = params.get("ogIds") ?? "";

  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<PaperKey>(loadPaper);
  const pages = useTwoPageSize(paper);

  function choosePaper(p: PaperKey) {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {
      /* just won't be remembered */
    }
  }

  const [fields, setFields] = useState<FreeText>(loadSaved);

  useEffect(() => {
    if (!ogIds) return;
    apiGet<Report>(`/api/receipts/collections-deposit-report?ogIds=${encodeURIComponent(ogIds)}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [ogIds]);

  function update(patch: Partial<FreeText>) {
    setFields((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
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

  const date = longDate(data.reportDate);
  const balance = data.beginningBalance + data.totalCollections - data.remittance;
  const lgu = fields.lguName || data.office.municipality;
  const collectorRows = padTo(data.collections, COLLECTOR_ROWS);
  const accountRows = padTo(data.accountability, ACCOUNTABILITY_ROWS);
  const defaultTreasurerTitle = `Asst. Municipal Treasurer${data.office.municipality ? ` (${data.office.municipality})` : ""}/Acting MT`;
  const liquidatingTitle = fields.liquidatingTitle || "Liquidating Officer";
  const treasurerTitle = fields.treasurerTitle || defaultTreasurerTitle;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <label className="toolbar-check">
          Paper
          <select value={paper} onChange={(e) => choosePaper(e.target.value as PaperKey)}>
            {REPORT_PAPERS.map((k) => (
              <option key={k} value={k}>{PAPERS[k].label}</option>
            ))}
          </select>
        </label>
        <Field label="LGU" value={fields.lguName} placeholder={data.office.municipality} onChange={(v) => update({ lguName: v })} />
        <Field label="Fund" value={fields.fund} onChange={(v) => update({ fund: v })} />
        <Field label="Report No." value={fields.reportNo} onChange={(v) => update({ reportNo: v })} />
        <Field label="Form Type" value={fields.formType} onChange={(v) => update({ formType: v })} />
        <Field label="Accountable Officer" value={fields.accountable} onChange={(v) => update({ accountable: v })} />
        <Field label="Liquidating Officer" value={fields.liquidating} onChange={(v) => update({ liquidating: v })} />
        <Field label="Liquidating Officer title" value={fields.liquidatingTitle} placeholder="Liquidating Officer" onChange={(v) => update({ liquidatingTitle: v })} />
        <Field label="Asst. Municipal Treasurer" value={fields.treasurer} onChange={(v) => update({ treasurer: v })} />
        <Field label="Treasurer title" value={fields.treasurerTitle} placeholder={defaultTreasurerTitle} onChange={(v) => update({ treasurerTitle: v })} />
      </div>

      {/* ---- Page 1 — portrait ---- */}
      <section className="rcd-page" style={{ width: `${pages.portrait.width}in` }}>
        <div className="rcd-box">
          <div className="rcd-head">
            <div className="rcd-title">Report of Collections and Deposit</div>
            {lgu && <div className="rcd-muni">{lgu}</div>}
            <div className="rcd-lgu">LGU</div>
          </div>

          <div className="rcd-meta">
            <div className="rcd-meta-row">
              <b>Fund: {fields.fund}</b>
              <span>Date : {date}</span>
            </div>
            <div className="rcd-meta-row">
              <span>
                <small>Name of Accountable Officer :</small>
                <b className="rcd-officer">{fields.accountable}</b>
              </span>
              <span>Report No. {fields.reportNo}</span>
            </div>
          </div>

          <div className="rcd-section">A.&nbsp;&nbsp;COLLECTIONS</div>
          <div className="rcd-sub">1.&nbsp;&nbsp;For Collectors</div>
          <table className="rcd-table">
            <PageOneCols />
            <thead>
              <tr>
                <th>Type (Form No. )</th>
                <th colSpan={2}>Official Receipt/ Serial No.</th>
                <th>Amount</th>
                <th></th>
              </tr>
              <tr>
                <th></th>
                <th>From</th>
                <th>To</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {collectorRows.map((c, i) => (
                <tr key={i}>
                  <td className="rcd-l">{i === 0 ? fields.formType : ""}</td>
                  <td>{c?.from ?? ""}</td>
                  <td>{c?.to ?? ""}</td>
                  <td className="rcd-r">{c ? peso.format(c.amount) : ""}</td>
                  <td></td>
                </tr>
              ))}
              <tr>
                <td className="rcd-l rcd-total">TOTAL</td>
                <td></td>
                <td></td>
                <td className="rcd-r rcd-b">{peso.format(data.totalCollections)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          <div className="rcd-sub rcd-gap">2.&nbsp;&nbsp;For Liquidating Officers/Treasurers</div>
          <table className="rcd-table">
            <PageOneCols />
            <thead>
              <tr>
                <th colSpan={2} className="rcd-l">Name of Accountable Officers</th>
                <th>Report No.</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: LIQUIDATING_ROWS }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={2}></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rcd-section rcd-gap">B.&nbsp;&nbsp;REMITTANCES / DEPOSITS</div>
          <table className="rcd-table rcd-table-last">
            <PageOneCols />
            <thead>
              <tr>
                <th colSpan={2} className="rcd-l">&nbsp;&nbsp;Accountable Officer / Bank</th>
                <th>Report No.</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: REMITTANCE_ROWS }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={2}></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- Page 2 — landscape ---- */}
      <section className="rcd-page rcd-page-landscape" style={{ width: `${pages.landscape.width}in` }}>
        <div className="rcd-box">
          <table className="rcd-table rcd-table-first">
            <colgroup>
              <col style={{ width: "11%" }} />
              {Array.from({ length: 4 }).flatMap((_, g) => [
                <col key={`${g}-qty`} style={{ width: "6.75%" }} />,
                <col key={`${g}-from`} style={{ width: "7.75%" }} />,
                <col key={`${g}-to`} style={{ width: "7.75%" }} />,
              ])}
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th colSpan={12}></th>
              </tr>
              <tr>
                <th rowSpan={3}>Name of Forms &amp; No.</th>
                <th colSpan={3}>Beginning Balance</th>
                <th colSpan={3}>Receipt</th>
                <th colSpan={3}>Issued</th>
                <th colSpan={3}>Ending Balance</th>
              </tr>
              <tr>
                {Array.from({ length: 4 }).flatMap((_, g) => [
                  <th key={`${g}-q`} rowSpan={2}>Qty.</th>,
                  <th key={`${g}-s`} colSpan={2}>Inclusive Serial No.</th>,
                ])}
              </tr>
              <tr>
                {Array.from({ length: 4 }).flatMap((_, g) => [
                  <th key={`${g}-f`}>From</th>,
                  <th key={`${g}-t`}>To</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {accountRows.map((a, i) => (
                <tr key={i}>
                  <td className="rcd-l">{i === 0 ? fields.formType : ""}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td>{a ? plain.format(a.receiptQty) : ""}</td>
                  <td>{a?.receiptFrom ?? ""}</td>
                  <td>{a?.receiptTo ?? ""}</td>
                  <td>{a ? plain.format(a.issuedQty) : ""}</td>
                  <td>{a?.issuedFrom ?? ""}</td>
                  <td>{a?.issuedTo ?? ""}</td>
                  <td>{a && a.endingQty > 0 ? plain.format(a.endingQty) : ""}</td>
                  <td>{a?.endingFrom ?? ""}</td>
                  <td>{a?.endingTo ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="rcd-summary-block">
            <div className="rcd-section" style={{ marginTop: 4 }}>
              D.&nbsp;&nbsp;SUMMARY OF COLLECTIONS AND REMITTANCES/DEPOSITS
            </div>
            <table className="rcd-summary">
              <colgroup>
                <col />
                <col style={{ width: "0.8in" }} />
                <col style={{ width: "1.5in" }} />
              </colgroup>
              <tbody>
                <tr>
                  <td>
                    Beginning Balance <span className="rcd-blank" style={{ width: "1.3in" }} /> 20
                    <span className="rcd-blank" style={{ width: "0.9in" }} />
                  </td>
                  <td>Php.</td>
                  {/* The office fills this line with the period's total, same
                      as the two below — mirrored as-is from their own forms. */}
                  <td className="rcd-amt">{peso.format(data.beginningBalance + data.totalCollections)}</td>
                </tr>
                <tr>
                  <td>Add: Collections</td>
                  <td></td>
                  <td className="rcd-amt rcd-underline">{peso.format(data.totalCollections)}</td>
                </tr>
                <tr>
                  <td>Less: Remittance/Deposit to Cashier/Treasurer/Depository Bank</td>
                  <td></td>
                  <td className="rcd-amt rcd-underline">{peso.format(data.remittance)}</td>
                </tr>
                <tr>
                  <td>Balance</td>
                  <td></td>
                  <td className="rcd-amt">{balance ? peso.format(balance) : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rcd-signoff">
            <div className="rcd-cert">
              <div className="rcd-signoff-title">Certification</div>
              <p>I hereby certify that the foregoing of collections and deposit accountable forms is true and correct.</p>
              <div className="rcd-cert-sign">
                <div>
                  <span className="rcd-name">{fields.accountable}</span>
                  <div>Name and Signature</div>
                  <div>Accountable Officer</div>
                </div>
                <span className="rcd-cert-date">{date}</span>
              </div>
            </div>

            <div className="rcd-verify">
              <div className="rcd-signoff-title">Verification and Acknowledgment</div>
              <p>
                I hereby certify that the foregoing report of collections has been verified and acknowledge
                receipt of (<span className="rcd-ack-amt">{peso.format(data.totalCollections)}</span>)
              </p>
              <div className="rcd-verify-signs">
                <div>
                  <span className="rcd-name">{fields.liquidating}</span>
                  <div>Name &amp; Signature</div>
                  <div>{liquidatingTitle}</div>
                </div>
                <div>
                  <span className="rcd-name">{fields.treasurer}</span>
                  <div>Name &amp; Signature</div>
                  <div>{treasurerTitle}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
