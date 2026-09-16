import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import "./print.css";

/**
 * Request for Billing Adjustment.
 *
 * The desktop rendered crtBillAdjustmentForm through Crystal Reports. Same
 * document, same three blocks — request, inspection report, approval details —
 * and the same blanks left for the crew and the consumer to fill in by hand.
 *
 * It is printed at every stage, so each block fills in as the request moves:
 * raise it and the top is complete with an empty inspection report to carry
 * out to the tap; inspect it and the middle fills; approve and adjust and the
 * foot does. The blanks are the point, not an omission.
 */

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function longDate(v: string | null | undefined) {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/** The four findings the printed form lists, in the printed order. */
const FINDINGS = [
  "Leakage after Water Meter",
  "Damaged meter/equipment",
  "Misreading",
  "Others",
];

type Detail = {
  adjID: number;
  status: string;
  billId: number;
  office: {
    municipality: string;
    municipalHeader: string;
    officeHeader: string;
    officeName: string;
    officeAddress: string;
  };
  account: {
    accountNo: string;
    name: string;
    address: string;
    barangay: string;
    classification: string;
  };
  bill: {
    period: string;
    figures: { consumption: number; total: number };
  };
  request: {
    date: string | null;
    reason: string;
    requestedBy: string;
    contactNo: string;
    preparedBy: string;
    approverName: string;
    approverTitle: string;
  };
  inspection: {
    date: string;
    inspector: string;
    findings: string;
    householdMembers: number;
    standpipeLocation: string;
    meterNo: string;
  } | null;
  approval: {
    date: string;
    approvedBy: string;
    remark: string;
    recommendation: string;
  } | null;
  rejection: { comments: string } | null;
  applied: {
    date: string;
    adjustedBy: string;
    type: string;
    fromConsumption: number;
    toConsumption: number;
    fromAmount: number;
    toAmount: number;
  } | null;
};

function Box({ on }: { on: boolean }) {
  return <span className="adjf-box">{on ? "✓" : " "}</span>;
}

export default function AdjustmentPrint() {
  const { adjID } = useParams();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!adjID) return;
    apiGet<Detail>(`/api/adjustment/${adjID}`)
      .then(setD)
      .catch((e) => setError((e as Error).message));
  }, [adjID]);

  if (error) {
    return (
      <div className="print-root">
        <div className="form-error">{error}</div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="print-root">
        <p className="count">Preparing the form…</p>
      </div>
    );
  }

  const approved = !!d.approval && d.status !== "Rejected";
  const rejected = d.status === "Rejected";

  // The findings line is stored as "<finding> - <observations>", so the ticked
  // box is whichever finding the stored text starts with.
  const finding = FINDINGS.find((f) => (d.inspection?.findings ?? "").startsWith(f));
  const observations = d.inspection
    ? d.inspection.findings.replace(/^[^-]*-\s*/, "") === d.inspection.findings
      ? ""
      : d.inspection.findings.replace(/^[^-]*-\s*/, "")
    : "";

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />
        <span className="print-hint count">
          Request #{d.adjID} · {d.status}
        </span>
      </div>

      <article className="adjf-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header className="adjf-head">
          <div className="adjf-office">{d.office.officeName}</div>
          <div className="adjf-mun">
            {d.office.municipality
              ? `Municipality of ${d.office.municipality}`
              : d.office.municipalHeader}
          </div>
        </header>

        <h1 className="adjf-title">Request for Billing Adjustment</h1>

        <table className="adjf-table">
          <tbody>
            <tr>
              <td className="adjf-lbl">Form No.</td>
              <td>{d.adjID}</td>
              <td className="adjf-lbl adjf-right">Date:</td>
              <td>{longDate(d.request.date)}</td>
            </tr>
            <tr>
              <td className="adjf-lbl">Name:</td>
              <td>{d.account.name}</td>
              <td className="adjf-lbl adjf-right">Account No.</td>
              <td>{d.account.accountNo}</td>
            </tr>
            <tr>
              <td className="adjf-lbl">Address:</td>
              <td>
                {d.account.address}
                {d.account.barangay ? `, ${d.account.barangay}` : ""}
              </td>
              <td className="adjf-lbl adjf-right">Contact No.</td>
              <td>{d.request.contactNo}</td>
            </tr>
            <tr>
              <td className="adjf-lbl">Classification:</td>
              <td>{d.account.classification}</td>
              <td className="adjf-lbl adjf-right">Reason of Adjustment:</td>
              <td>{d.request.reason}</td>
            </tr>
            <tr>
              <td className="adjf-lbl">Period Covered:</td>
              <td>{d.bill.period}</td>
              <td className="adjf-lbl adjf-right">Amount Billed:</td>
              <td>
                {peso.format(d.bill.figures.total)}
                <span className="adjf-inline">
                  Consumption: {d.bill.figures.consumption}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="adjf-signrow">
          <div>
            <span className="adjf-lbl">Requested By:</span>
            <span className="adjf-rule">{d.request.requestedBy || " "}</span>
          </div>
          <div>
            <span className="adjf-lbl">Received By:</span>
            <span className="adjf-rule">{d.request.preparedBy || " "}</span>
          </div>
        </div>

        <h2 className="adjf-band">
          Inspection Report <em>(to be filled by Water System Personnel)</em>
        </h2>

        <table className="adjf-table">
          <tbody>
            <tr>
              <td className="adjf-lbl">No. of HH Members:</td>
              <td>{d.inspection?.householdMembers || ""}</td>
              <td className="adjf-lbl">Location Of Standpipe:</td>
              <td>{d.inspection?.standpipeLocation ?? ""}</td>
              <td className="adjf-lbl">Meter Serial No.:</td>
              <td>{d.inspection?.meterNo ?? ""}</td>
            </tr>
            <tr>
              <td className="adjf-lbl">Findings:</td>
              <td colSpan={5} className="adjf-findings">
                {FINDINGS.map((f) => (
                  <span key={f} className="adjf-finding">
                    <Box on={finding === f} /> {f === "Others" ? "Others, specify:" : f}
                  </span>
                ))}
              </td>
            </tr>
            <tr>
              <td colSpan={6} className="adjf-freetext">
                {observations || " "}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="adjf-signrow">
          <div>
            <span className="adjf-lbl">Inspected By:</span>
            <span className="adjf-rule">{d.inspection?.inspector || " "}</span>
          </div>
          <div>
            <span className="adjf-lbl">Inspected Date:</span>
            <span className="adjf-rule">
              {longDate(d.inspection?.date) || " "}
            </span>
          </div>
        </div>

        <h2 className="adjf-band">Billing Adjustment Approval / Details</h2>

        <div className="adjf-approval">
          <div className="adjf-approval-left">
            <div className="adjf-choice">
              <Box on={approved} /> Billing Adjustment Approved
            </div>
            <div className="adjf-choice">
              <Box on={rejected} /> Disapproved — <em>see comments</em>
            </div>
            <div className="adjf-approver">
              <span className="adjf-approver-name">
                {d.approval?.approvedBy || d.request.approverName || " "}
              </span>
              <span className="adjf-approver-title">
                {d.request.approverTitle || " "}
              </span>
            </div>
          </div>

          <div className="adjf-approval-right">
            <div className="adjf-details-title">Details of Adjustment</div>
            <table className="adjf-details">
              <thead>
                <tr>
                  <th />
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Billing Period</td>
                  <td colSpan={2} className="adjf-center">{d.bill.period}</td>
                </tr>
                <tr>
                  <td>Consumption</td>
                  <td>{d.applied ? d.applied.fromConsumption : ""}</td>
                  <td>{d.applied ? d.applied.toConsumption : ""}</td>
                </tr>
                <tr>
                  <td>Billed Amount</td>
                  <td>{d.applied ? peso.format(d.applied.fromAmount) : ""}</td>
                  <td>{d.applied ? peso.format(d.applied.toAmount) : ""}</td>
                </tr>
                <tr>
                  <td>Adjustment Date</td>
                  <td colSpan={2} className="adjf-center">
                    {longDate(d.applied?.date)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {d.approval?.recommendation && !rejected && (
          <p className="adjf-reco">
            Approved recommendation: {d.approval.recommendation}
            {d.applied && d.applied.type !== d.approval.recommendation ? (
              <> · Applied as: {d.applied.type}</>
            ) : null}
          </p>
        )}

        <div className="adjf-foot">
          <div className="adjf-comments">
            <span className="adjf-lbl">Comments / Recommendations:</span>
            <div className="adjf-comments-box">
              {d.rejection?.comments || d.approval?.remark || " "}
            </div>
          </div>
          <div className="adjf-conforme">
            <span className="adjf-lbl">Conforme:</span>
            <span className="adjf-rule adjf-rule-tall">&nbsp;</span>
            <em>Name &amp; Signature of Consumer</em>
          </div>
        </div>
      </article>
    </div>
  );
}
