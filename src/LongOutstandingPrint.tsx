import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * Long-Outstanding Accounts — which accounts are chronically unpaid, and
 * how much is owed. "Owed" uses the same amount-actually-due formula
 * analytics.ts's dashboard stat uses (after-due bills owe useadue plus
 * whatever else rides on the bill, not the plain useamount). A live
 * snapshot, not a period report — no date picker.
 */

type Grouped = { key: string; count: number; amount: number };
type BucketRow = { label: string; accounts: number; owed: number };
type ChronicRow = { accountNo: string; acctName: string; brgy: string; className: string; unpaidBills: number; owed: number };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { totalAccounts: number; totalBills: number; totalOwed: number; chronic: number };
  insights?: string[];
  buckets?: BucketRow[];
  byBarangay?: Grouped[];
  byClassification?: Grouped[];
  chronicList?: ChronicRow[];
};

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

function GroupTable({ rows, label }: { rows: Grouped[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">Bills</th><th className="n">Owed</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
            <td className="n">{peso.format(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
          <td className="n">{peso.format(rows.reduce((s, r) => s + r.amount, 0))}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function LongOutstandingPrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("long-outstanding");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/long-outstanding?${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [sig.ready, sig.query]);

  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">Long-Outstanding Accounts Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No unpaid bills are on record.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Accounts with unpaid bills" value={data.kpis.totalAccounts.toLocaleString()} />
              <KpiTile label="Unpaid bills" value={data.kpis.totalBills.toLocaleString()} />
              <KpiTile label="Total owed" value={peso.format(data.kpis.totalOwed)} />
              <KpiTile label="Chronic (6+ unpaid)" value={data.kpis.chronic.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the receivables show</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Accounts by how many bills are unpaid</h2></div>
              <table>
                <thead><tr><th>Range</th><th className="n">Accounts</th><th className="n">Owed</th></tr></thead>
                <tbody>
                  {(data.buckets ?? []).map((b) => (
                    <tr key={b.label}>
                      <td>{b.label}</td>
                      <td className="n">{b.accounts}</td>
                      <td className="n">{peso.format(b.owed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <GroupTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <GroupTable rows={data.byClassification ?? []} label="Classification" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head">
                <h2>Chronic accounts</h2>
                <span className="count">6 or more unpaid bills, top 40</span>
              </div>
              <table>
                <thead>
                  <tr><th>Account no.</th><th>Account name</th><th>Barangay</th><th>Class</th><th className="n">Unpaid bills</th><th className="n">Owed</th></tr>
                </thead>
                <tbody>
                  {(data.chronicList ?? []).map((c, i) => (
                    <tr key={`${c.accountNo}-${i}`}>
                      <td>{c.accountNo}</td>
                      <td>{c.acctName}</td>
                      <td>{c.brgy}</td>
                      <td>{c.className}</td>
                      <td className="n">{c.unpaidBills}</td>
                      <td className="n">{peso.format(c.owed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <SignatoryBlock slots={data.signatories ?? []} />
            </div>

            <p className="ecpay-generated">
              Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
