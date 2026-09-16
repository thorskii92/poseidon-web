import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Accounts Receivable Report — one row per unpaid bill. See
 * accountsReceivables.ts for why Water Bill excludes the environmental fee,
 * why Penalty is zeroed for a bill that isn't overdue yet, and why the area
 * filter reads the account's current barangay/cluster.
 */

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "numeric" });
const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function fmtDate(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return dateFmt.format(d);
}
function fmtMoney(v: number, paren = false): string {
  const s = peso.format(Math.abs(v));
  return paren && v > 0 ? `(${s})` : s;
}

type Row = {
  acctNo: string; accountName: string; cluster: string; barangay: string; classification: string;
  waterBill: number; pes: number; discount: number; appFee: number; penalty: number; totalBill: number;
  fromDate: string | null; toDate: string | null; billMonth: string; billYear: number;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  selectBy: "all" | "month" | "year"; month: string; year?: number;
  areaTitle: string; forTheMonth: string;
  generatedAt: string; signatories: SignatorySlot[];
  rows: Row[];
};

export default function AccountsReceivablesPrint() {
  const [params] = useSearchParams();
  const selectBy = (params.get("selectBy") ?? "all") as "all" | "month" | "year";
  const barangayId = params.get("barangayId") ?? "";
  const barangayName = params.get("barangayName") ?? "";
  const clusterId = params.get("clusterId") ?? "";
  const clusterName = params.get("clusterName") ?? "";
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("accounts-receivables");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!barangayId || !sig.ready) return;
    const qs = new URLSearchParams({
      selectBy, barangayId, barangayName,
      ...(clusterId ? { clusterId, clusterName } : {}),
      ...(month ? { month } : {}),
      ...(year ? { year } : {}),
    });
    apiGet<Report>(`/api/reports/accounts-receivables?${qs.toString()}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [selectBy, barangayId, barangayName, clusterId, clusterName, month, year, sig.ready, sig.query]);

  if (!barangayId) {
    return (
      <div className="print-root">
        <div className="form-error">No barangay given.</div>
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

  const totals = data.rows.reduce(
    (acc, r) => ({
      waterBill: acc.waterBill + r.waterBill,
      pes: acc.pes + r.pes,
      discount: acc.discount + r.discount,
      appFee: acc.appFee + r.appFee,
      penalty: acc.penalty + r.penalty,
      totalBill: acc.totalBill + r.totalBill,
    }),
    { waterBill: 0, pes: 0, discount: 0, appFee: 0, penalty: 0, totalBill: 0 },
  );

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

        <h1 className="soa-title">Statement of Account Receivable</h1>
        <p className="soa-issued">{data.areaTitle}</p>
        <p className="soa-issued">{data.forTheMonth}</p>

        <table className="soa-table soa-table-compact soa-table-many-cols">
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "5%" }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ fontSize: "0.8em" }}>Account No</th>
              <th style={{ fontSize: "0.8em" }}>Name</th>
              <th style={{ fontSize: "0.8em" }}>Cluster/Purok</th>
              <th style={{ fontSize: "0.8em" }}>Barangay</th>
              <th style={{ fontSize: "0.8em" }}>Classification</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Water Bill</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>PES</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Discount</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>App Fee</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>Penalty</th>
              <th className="soa-amt" style={{ fontSize: "0.8em" }}>TotalBill</th>
              <th style={{ fontSize: "0.8em" }}>From Date</th>
              <th style={{ fontSize: "0.8em" }}>To Date</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: "center" }}>No unpaid bills found.</td></tr>
            ) : (
              data.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.acctNo}</td>
                  <td>{r.accountName}</td>
                  <td>{r.cluster}</td>
                  <td>{r.barangay}</td>
                  <td>{r.classification}</td>
                  <td className="soa-amt">{fmtMoney(r.waterBill)}</td>
                  <td className="soa-amt">{fmtMoney(r.pes)}</td>
                  <td className="soa-amt">{fmtMoney(r.discount, true)}</td>
                  <td className="soa-amt">{fmtMoney(r.appFee)}</td>
                  <td className="soa-amt">{fmtMoney(r.penalty)}</td>
                  <td className="soa-amt">{fmtMoney(r.totalBill)}</td>
                  <td>{fmtDate(r.fromDate)}</td>
                  <td>{fmtDate(r.toDate)}</td>
                </tr>
              ))
            )}
          </tbody>
          {data.rows.length > 0 && (
            <tfoot>
              <tr className="soa-total-row">
                <td colSpan={5} style={{ textAlign: "right" }}>GRAND TOTAL</td>
                <td className="soa-amt">{fmtMoney(totals.waterBill)}</td>
                <td className="soa-amt">{fmtMoney(totals.pes)}</td>
                <td className="soa-amt">{fmtMoney(totals.discount, true)}</td>
                <td className="soa-amt">{fmtMoney(totals.appFee)}</td>
                <td className="soa-amt">{fmtMoney(totals.penalty)}</td>
                <td className="soa-amt">{fmtMoney(totals.totalBill)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}
