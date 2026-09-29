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
 * User Roster & Access — who has a system account, whether it's active,
 * and what position they hold. A live snapshot, not a period report — no
 * date picker. Passwords are never included, plaintext or otherwise.
 */

type Grouped = { key: string; count: number };
type RosterRow = { fullname: string; uname: string; position: string; status: string };

type Report = {
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; active: number; inactive: number; positions: number };
  insights?: string[];
  byPosition?: Grouped[];
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

export default function UserRosterPrint() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("user-roster");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/reports/user-roster?${sig.query}`)
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

        <p className="ecpay-kicker">User Roster &amp; Access Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          As of {generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </h1>

        {data.empty || !data.kpis ? (
          <p className="count">No user accounts are on file.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="User accounts" value={data.kpis.total.toLocaleString()} />
              <KpiTile label="Active" value={data.kpis.active.toLocaleString()} />
              <KpiTile label="Inactive / retired" value={data.kpis.inactive.toLocaleString()} />
              <KpiTile label="Distinct positions" value={data.kpis.positions.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What the roster shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>By position</h2></div>
              <table>
                <thead><tr><th>Position</th><th className="n">Users</th></tr></thead>
                <tbody>
                  {(data.byPosition ?? []).map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td>
                      <td className="n">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Roster</h2></div>
              <table>
                <thead><tr><th>Full name</th><th>Username</th><th>Position</th><th>Status</th></tr></thead>
                <tbody>
                  {(data.roster ?? []).map((u, i) => (
                    <tr key={`${u.uname}-${i}`}>
                      <td>{u.fullname}</td>
                      <td>{u.uname}</td>
                      <td>{u.position}</td>
                      <td>{u.status}</td>
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
