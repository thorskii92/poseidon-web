import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Reading List print view. See readingList.ts for why the reference
 * reading column reads consumeraccounts.MeterReference rather than a
 * specific month's own billing row, and why a disconnected account still
 * gets a row with its meter/reading cells simply blank.
 */

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
const plain = new Intl.NumberFormat("en-PH");

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}

type Account = {
  acctId: number;
  standpipe: string;
  accountNo: string;
  accountName: string;
  streetAddress: string;
  connectionDate: string | null;
  meterNo: string;
  status: string;
  prevConsumption: number | null;
  readingMonthValue: number | null;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  month: string; year: number;
  readingMonth: string; readingYear: number;
  areaTitle: string; totalAccounts: number;
  generatedAt: string; signatories: SignatorySlot[];
  accounts: Account[];
};

export default function ReadingListPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";
  const barangayId = params.get("barangayId") ?? "";
  const barangayName = params.get("barangayName") ?? "";
  const clusterId = params.get("clusterId") ?? "";
  const clusterName = params.get("clusterName") ?? "";

  const sig = useSignatories("reading-list");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !barangayId || !sig.ready) return;
    const qs = new URLSearchParams({
      month, year, barangayId, barangayName,
      ...(clusterId ? { clusterId, clusterName } : {}),
    });
    apiGet<Report>(`/api/reports/reading-list?${qs.toString()}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, year, barangayId, barangayName, clusterId, clusterName, sig.ready, sig.query]);

  if (!month || !year || !barangayId) {
    return (
      <div className="print-root">
        <div className="form-error">No area/month/year given.</div>
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

  const totalCols = 11;
  const readingLabel = `${data.readingMonth} ${data.readingYear}`;
  const currentLabel = `${data.month} ${data.year}`;

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
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Reading List</h1>
        <p className="soa-issued">{data.areaTitle}</p>
        <p className="soa-issued">
          Billing Month: <strong>{currentLabel}</strong> &nbsp;|&nbsp; Total Accounts: <strong>{plain.format(data.totalAccounts)}</strong>
        </p>

        <table className="soa-table soa-table-compact soa-table-many-cols report-table-roomy">
          <colgroup>
            <col style={{ width: "3%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>#</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Standpipe</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Account No.</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Customer Name</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Service Address</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Date Connection Started</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Meter #</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Status</th>
              <th rowSpan={2} style={{ fontSize: "0.8em" }}>Previous Consumption</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>{readingLabel}</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>{currentLabel}</th>
            </tr>
            <tr>
              <th className="soa-amt" style={{ fontSize: "0.75em" }}>Reading</th>
              <th className="soa-amt" style={{ fontSize: "0.75em" }}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.length === 0 ? (
              <tr><td colSpan={totalCols} style={{ textAlign: "center" }}>No accounts found.</td></tr>
            ) : (
              data.accounts.map((a, i) => (
                <tr key={a.acctId}>
                  <td className="soa-amt">{i + 1}</td>
                  <td style={{ textAlign: "center" }}>{a.standpipe}</td>
                  <td>{a.accountNo}</td>
                  <td>{a.accountName}</td>
                  <td>{a.streetAddress}</td>
                  <td style={{ textAlign: "center" }}>{fmtDate(a.connectionDate)}</td>
                  <td style={{ textAlign: "center" }}>{a.meterNo}</td>
                  <td style={{ textAlign: "center" }}>{a.status}</td>
                  <td className="soa-amt">{a.prevConsumption == null ? "" : plain.format(a.prevConsumption)}</td>
                  <td className="soa-amt">{a.readingMonthValue == null ? "" : plain.format(a.readingMonthValue)}</td>
                  <td className="soa-amt"></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
