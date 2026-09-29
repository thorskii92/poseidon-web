import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import {
  SignatoryBlock,
  SignatoryPickers,
  useSignatories,
  type SignatorySlot,
} from "./Signatories";
import ReportHeader from "./ReportHeader";

/**
 * The pending disconnection list, as the crew carries it.
 *
 * The desktop rendered crptPendingDisconnection through Crystal Reports with
 * the three signatory names baked into the query via get_signatory_name().
 * Same document; the signatory block is the shared four-slot one, picked here
 * and resolved server-side, so a missing signatory row leaves a blank rule
 * rather than failing the report.
 *
 * The rightmost column is deliberately empty: it is where the crew writes the
 * meter reading and initials at the tap. That is what comes back to the
 * Confirm dialog.
 */

type Row = {
  no: number;
  accountNo: string;
  name: string;
  meterNo: string;
  address: string;
  standpipe: string;
  barangay: string;
  cluster: string;
  balance: number;
  period: string;
};

const LABELS = [
  "Prepared by",
  "Prepared by",
  "Recommending approval",
  "Approved by",
];

type PrintData = {
  office: {
    municipality: string;
    municipalHeader: string;
    officeHeader: string;
    officeName: string;
    officeAddress: string;
  };
  scope: string;
  clustersEnabled: boolean;
  signatories: SignatorySlot[];
  rows: Row[];
};

export default function DisconnectionPrint() {
  const [params] = useSearchParams();
  const [data, setData] = useState<PrintData | null>(null);
  const [error, setError] = useState("");
  const sig = useSignatories("disconnection");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  // A stable string: useSearchParams returns a new object on every render, so
  // depending on it directly re-runs this effect forever.
  const search = params.toString();

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<PrintData>(`/api/disconnection/print?${search}&${sig.query}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [search, sig.ready, sig.query]);

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
        <p className="count">Loading…</p>
      </div>
    );
  }

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>

        <SignatoryPickers
          labels={LABELS}
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
          {data.rows.length} account{data.rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <article className="disc-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <h1 className="disc-title">List of Accounts for Disconnection</h1>
        {data.scope && <p className="disc-scope">{data.scope}</p>}

        <table className="disc-table">
          <thead>
            <tr>
              <th className="disc-no">No.</th>
              <th>Account No.</th>
              <th>Name</th>
              <th>Meter Serial</th>
              <th>Address</th>
              <th>Period Covered</th>
              <th className="disc-amt">Balance</th>
              {/* Filled in by hand at the tap. */}
              <th className="disc-blank">Reading / Initials</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.accountNo + r.no}>
                <td className="disc-no">{r.no}</td>
                <td>{r.accountNo}</td>
                <td>{r.name}</td>
                <td>{r.meterNo}</td>
                <td>
                  {r.address}
                  {data.clustersEnabled && r.cluster ? `, ${r.cluster}` : ""}
                </td>
                <td>{r.period}</td>
                <td className="disc-amt">{peso.format(r.balance)}</td>
                <td className="disc-blank" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="disc-total-label">
                Total
              </td>
              <td className="disc-amt">
                {peso.format(data.rows.reduce((s, r) => s + r.balance, 0))}
              </td>
              <td className="disc-blank" />
            </tr>
          </tfoot>
        </table>

        <SignatoryBlock labels={LABELS} slots={data.signatories} />
      </article>
    </div>
  );
}
