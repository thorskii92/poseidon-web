import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
 * The printed Job Order — one generic layout serving all six types, since
 * they share the same shape (job order no., date, the account, a signature
 * block) and differ only in one middle section. Matches the Rizal paper
 * forms' own fields.
 *
 * "Prepared by" and "Approved by" share the same signatory picker every
 * other report uses (see Signatories.tsx) — chosen at print time, not baked
 * in when the job order was issued, so a reprint can carry a different
 * approver without needing a new job order number. The
 * "Installed/Conducted/Verified/Acknowledged by" lines stay blank on
 * purpose: those aren't drawn from the signatories list, they're whichever
 * plumber, supervisor or consumer is on this particular job, filled by hand
 * in the field exactly as on the paper original.
 */

const SLOT_TYPES = ["PREP", "APPR"] as const;
const LABELS = ["Prepared by", "Approved by"];

type JobOrder = {
  joId: number;
  type: string;
  label: string;
  jobOrderNo: string;
  dateIssued: string | null;
  issuedBy: string;
  status: string;
  result: {
    meterSerial: string; meterBrand: string; standpipe: string;
    reading: number | null; reading2: number | null; date: string | null;
    remarks: string; materials: string; findings: string;
    newBarangay: string; newCluster: string; completedBy: string;
  };
  signatories: SignatorySlot[];
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  account: {
    acctId: number; accountNo: string; name: string; address: string;
    standpipe: string; meterNo: string; contactNo: string; barangay: string; cluster: string;
  };
  transfer?: {
    from: { address: string; standpipe: string };
    to: { address: string; standpipe: string; barangay: string; cluster: string };
  };
  replacement?: { oldSerial: string; oldBrand: string; oldReference: number };
  adjustment?: { adjId: number; requestedOn: string | null; reason: string; remarks: string };
};

/** Rows shown under "Details of Work" for each type, in the order the paper
 *  form asks for them — blank (writable) until the crew's results are
 *  recorded, then filled with what was entered. */
const RESULT_ROWS: Record<string, { label: string; key: keyof JobOrder["result"] }[]> = {
  installation: [
    { label: "Meter Serial No.", key: "meterSerial" },
    { label: "Meter Brand", key: "meterBrand" },
    { label: "Stand Pipe No.", key: "standpipe" },
    { label: "Initial Reading", key: "reading" },
    { label: "Date Installed", key: "date" },
    { label: "Materials Used", key: "materials" },
    { label: "Remarks / Status", key: "remarks" },
  ],
  reconnection: [
    { label: "Meter Serial No.", key: "meterSerial" },
    { label: "Stand Pipe No.", key: "standpipe" },
    { label: "Date Reconnected", key: "date" },
    { label: "Remarks / Status", key: "remarks" },
  ],
  "meter-transfer": [
    { label: "New Stand Pipe No.", key: "standpipe" },
    { label: "New Barangay", key: "newBarangay" },
    { label: "New Cluster / Purok", key: "newCluster" },
    { label: "Date Installed", key: "date" },
    { label: "Remarks / Status", key: "remarks" },
  ],
  "repair-adjustment": [
    { label: "Meter Serial No.", key: "meterSerial" },
    { label: "Stand Pipe No.", key: "standpipe" },
    { label: "Last Reading", key: "reading" },
    { label: "Actual / Default Reading", key: "reading2" },
    { label: "Date Completed", key: "date" },
    { label: "Materials Used", key: "materials" },
    { label: "Findings", key: "findings" },
  ],
  "temp-closure": [
    { label: "Meter Serial No.", key: "meterSerial" },
    { label: "Stand Pipe No.", key: "standpipe" },
    { label: "Last Reading", key: "reading" },
    { label: "Date Disconnected", key: "date" },
    { label: "Remarks / Status", key: "remarks" },
  ],
};

function longDate(v: string | null) {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td className="lbl">{label}</td>
      <td className="val" colSpan={3}>{value || <span className="muted">—</span>}</td>
    </tr>
  );
}

/** Same row, but a blank value stays truly blank — this is a line the crew
 *  writes on, not a fact that is missing. */
function ResultField({ label, value }: { label: string; value: string | number | null }) {
  return (
    <tr>
      <td className="lbl">{label}</td>
      <td className="val" colSpan={3}>{value === null || value === "" ? "" : value}</td>
    </tr>
  );
}

/** A blank line for something filled out by hand after printing. */
function SignLine({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ borderBottom: "1px solid #000", width: 220, height: 1 }} />
      <div style={{ fontSize: "9pt", marginTop: 3 }}>{label}</div>
    </div>
  );
}

export default function JobOrderPrint() {
  const { joId } = useParams();
  const sig = useSignatories("job-order", SLOT_TYPES);
  const [data, setData] = useState<JobOrder | null>(null);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!joId || !sig.ready) return;
    apiGet<JobOrder>(`/api/joborders/entry/${joId}?${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [joId, sig.ready, sig.query]);

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [data]);

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
        <p className="count">Loading the job order…</p>
      </div>
    );
  }

  const { account } = data;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers
          labels={LABELS}
          slotTypes={SLOT_TYPES}
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
        <span className="print-hint count">{data.jobOrderNo}</span>
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          {data.office.municipalHeader && <div>{data.office.municipalHeader}</div>}
          {data.office.officeHeader && <div>{data.office.officeHeader}</div>}
          <div className="soa-office">{data.office.officeName}</div>
          <div>BILLING SECTION</div>
        </header>

        <h1 className="soa-title">{data.label}</h1>
        <p className="soa-issued">Job Order No. {data.jobOrderNo} · Issued {longDate(data.dateIssued)}</p>

        <table className="soa-meta">
          <tbody>
            <Field label="Account No." value={account.accountNo} />
            <Field label="Account Name" value={account.name} />
            <Field label="Barangay" value={account.barangay} />
            <Field label="Cluster (Purok)" value={account.cluster} />
            <Field label="Contact No." value={account.contactNo} />
            {data.type !== "meter-transfer" && data.type !== "installation" && (
              <Field label="Stand Pipe No." value={account.standpipe} />
            )}
            {data.type !== "meter-replacement" && data.type !== "installation" && (
              <Field label="Meter Serial No." value={account.meterNo} />
            )}
          </tbody>
        </table>

        {data.transfer && (
          <>
            <h2 className="txn-section">Details of Transfer</h2>
            <table className="soa-table" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th></th>
                  <th>Old Location</th>
                  <th>New Location</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Address</td>
                  <td>{data.transfer.from.address || "—"}</td>
                  <td>{data.transfer.to.address || "—"}</td>
                </tr>
                <tr>
                  <td>Stand Pipe</td>
                  <td>{data.transfer.from.standpipe || "—"}</td>
                  <td>{data.transfer.to.standpipe || "—"}</td>
                </tr>
                <tr>
                  <td>Barangay / Cluster</td>
                  <td>—</td>
                  <td>{[data.transfer.to.cluster, data.transfer.to.barangay].filter(Boolean).join(" / ") || "—"}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {data.replacement && (
          <>
            <h2 className="txn-section">Details of Replacement</h2>
            <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
              <table className="soa-meta" style={{ flex: 1 }}>
                <tbody>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700, textAlign: "center", background: "#e8f1f8" }}>
                      Old Water Meter
                    </td>
                  </tr>
                  <Field label="Meter Serial No." value={data.replacement.oldSerial} />
                  <Field label="Meter Brand" value={data.replacement.oldBrand} />
                  <Field label="Last Reading" value={data.replacement.oldReference} />
                  <ResultField label="Actual Reading" value={data.result.reading2} />
                </tbody>
              </table>
              <table className="soa-meta" style={{ flex: 1 }}>
                <tbody>
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700, textAlign: "center", background: "#e8f1f8" }}>
                      New Water Meter
                    </td>
                  </tr>
                  <ResultField label="Meter Serial No." value={data.result.meterSerial} />
                  <ResultField label="Meter Brand" value={data.result.meterBrand} />
                  <ResultField label="Initial Reading" value={data.result.reading} />
                  <ResultField label="Date Installed" value={data.result.date} />
                </tbody>
              </table>
            </div>
            <table className="soa-meta">
              <tbody>
                <ResultField label="Remarks / Status" value={data.result.remarks} />
              </tbody>
            </table>
          </>
        )}

        {data.adjustment && (
          <>
            <h2 className="txn-section">Complaint / Reason</h2>
            <table className="soa-meta">
              <tbody>
                <Field label="Date Filed" value={longDate(data.adjustment.requestedOn)} />
                <Field label="Reason" value={data.adjustment.reason} />
                {data.adjustment.remarks && <Field label="Remarks" value={data.adjustment.remarks} />}
              </tbody>
            </table>
          </>
        )}

        {data.type !== "meter-replacement" && (
          <>
            <h2 className="txn-section">
              {data.type === "meter-transfer"
                ? "New Details (filled by the crew on return)"
                : "Details of Work (filled by the crew on return)"}
            </h2>
            <table className="soa-meta">
              <tbody>
                {(RESULT_ROWS[data.type] ?? []).map((row) => (
                  <ResultField key={row.key} label={row.label} value={data.result[row.key]} />
                ))}
              </tbody>
            </table>
          </>
        )}

        <SignatoryBlock labels={LABELS} slots={data.signatories} />

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 30, flexWrap: "wrap", gap: 20 }}>
          {data.result.completedBy ? (
            <div>
              <div style={{ fontWeight: 700 }}>{data.result.completedBy}</div>
              <div style={{ fontSize: "9pt" }}>
                {data.type === "repair-adjustment" ? "Conducted by" : "Installed by"}
              </div>
            </div>
          ) : (
            <SignLine label={data.type === "repair-adjustment" ? "Conducted by" : "Installed by"} />
          )}
          <SignLine label="Verified by (Area Supervisor)" />
          <SignLine label="Acknowledged by (Consumer Name)" />
        </div>
      </article>
    </div>
  );
}
