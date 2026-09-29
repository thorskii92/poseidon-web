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
 * Account Status Census — every account by its actual status (Connected,
 * Disconnected, and the in-progress statuses in between: Installation,
 * Reconnection, a transfer, a meter swap, Temporary Closed, ...), not the
 * binary active-vs-disconnected view Latest Consumer Status already gives.
 * A live snapshot, not a period report — no date picker, dressed the same
 * way as the other reports.
 */

type StatusRow = { id: number; name: string; count: number; share: number };
type ThreeWayRow = { label: string; connected: number; disconnected: number; pending: number; total: number };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; connected: number; disconnected: number; pending: number; connectedPct: number; disconnectedPct: number };
  insights?: string[];
  byStatus?: StatusRow[];
  byBarangay?: ThreeWayRow[];
  byZone?: ThreeWayRow[];
  byClassification?: ThreeWayRow[];
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

function ThreeWayTable({ rows, label }: { rows: ThreeWayRow[]; label: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  const t = rows.reduce((s, r) => ({ connected: s.connected + r.connected, disconnected: s.disconnected + r.disconnected, pending: s.pending + r.pending, total: s.total + r.total }), { connected: 0, disconnected: 0, pending: 0, total: 0 });
  return (
    <table>
      <thead>
        <tr><th>{label}</th><th className="n">Connected</th><th className="n">Disconnected</th><th className="n">Pending</th><th className="n">Total</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td className="n">{r.connected}</td>
            <td className="n">{r.disconnected}</td>
            <td className="n">{r.pending}</td>
            <td className="n">{r.total}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td className="n">{t.connected}</td>
          <td className="n">{t.disconnected}</td>
          <td className="n">{t.pending}</td>
          <td className="n">{t.total}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export default function AccountStatusCensusPrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("account-status-census");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/account-status-census?${sig.query}`)
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

        <p className="ecpay-kicker">Account Status Census</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No accounts are on file.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Accounts on file" value={data.kpis.total.toLocaleString()} />
              <KpiTile label="Connected" value={data.kpis.connected.toLocaleString()} sub={`${data.kpis.connectedPct.toFixed(1)}% of accounts`} />
              <KpiTile label="Disconnected" value={data.kpis.disconnected.toLocaleString()} sub={`${data.kpis.disconnectedPct.toFixed(1)}% of accounts`} />
              <KpiTile label="Mid-workflow" value={data.kpis.pending.toLocaleString()} sub="Installation, transfer, etc." />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the census shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Accounts by status</h2></div>
              <table>
                <thead>
                  <tr><th>Status</th><th className="n">Accounts</th><th className="n">Share</th></tr>
                </thead>
                <tbody>
                  {(data.byStatus ?? []).map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td className="n">{s.count.toLocaleString()}</td>
                      <td className="n">{s.share.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{data.kpis.total.toLocaleString()}</td>
                    <td className="n">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By barangay</h2></div>
              <ThreeWayTable rows={data.byBarangay ?? []} label="Barangay" />
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By water system</h2></div>
                <ThreeWayTable rows={data.byZone ?? []} label="Zone / water system" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <ThreeWayTable rows={data.byClassification ?? []} label="Classification" />
              </section>
            </div>

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
