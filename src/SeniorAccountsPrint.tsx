import { useEffect, useState } from "react";
import { apiGet } from "./api";
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
 * Senior Citizen Accounts — the roster of senior/PWD-discounted accounts,
 * including which ones have no senior ID on file. The same audit flag the
 * ECPay Senior Discount Report raises for that month's ECPay-paid bills;
 * here it's the whole roster, regardless of payment channel or period. A
 * live snapshot, not a period report — no date picker.
 */

type Grouped = { key: string; count: number };
type RosterRow = { accountNo: string; acctName: string; seniorId: string; brgy: string; status: string };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; missingId: number; missingIdPct: number; connected: number; disconnected: number };
  insights?: string[];
  byBarangay?: Grouped[];
  missingByBarangay?: Grouped[];
  byClassification?: Grouped[];
  roster?: RosterRow[];
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

function CountTable({ rows, label }: { rows: Grouped[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Accounts</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td>{r.key}</td>
            <td className="n">{r.count}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function SeniorAccountsPrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("senior-accounts");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/senior-accounts?${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [sig.ready, sig.query]);

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

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
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
        <ReportHeader />

        <p className="ecpay-kicker">Senior Citizen Accounts Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No senior citizen accounts are on file.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Senior/PWD accounts" value={data.kpis.total.toLocaleString()} />
              <KpiTile label="Missing senior ID" value={data.kpis.missingId.toLocaleString()} sub={`${data.kpis.missingIdPct.toFixed(1)}% of the roster`} />
              <KpiTile label="Connected" value={data.kpis.connected.toLocaleString()} />
              <KpiTile label="Disconnected" value={data.kpis.disconnected.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the roster shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <CountTable rows={data.byBarangay ?? []} label="Barangay" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Missing senior ID, by barangay</h2></div>
                <CountTable rows={data.missingByBarangay ?? []} label="Barangay" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>By classification</h2></div>
              <CountTable rows={data.byClassification ?? []} label="Classification" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Roster</h2></div>
              <table>
                <thead>
                  <tr><th>Account no.</th><th>Account name</th><th>Senior ID</th><th>Barangay</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(data.roster ?? []).map((r, i) => (
                    <tr key={`${r.accountNo}-${i}`}>
                      <td>{r.accountNo}</td>
                      <td>{r.acctName}</td>
                      <td>{r.seniorId || <span className="muted">none on file</span>}</td>
                      <td>{r.brgy}</td>
                      <td>{r.status}</td>
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
