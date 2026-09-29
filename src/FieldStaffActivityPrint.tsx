import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
 * Field Staff Activity — account actions logged in tblaccountlogs for the
 * chosen month, by staff member and action type. logtype is free text, not
 * a lookup, and some of it embeds the actor's name in the string instead
 * of the resname column — the API normalises both before this renders.
 */

type Grouped = { key: string; count: number };
type DetailRow = { date: string; staff: string; category: string; accountNo: string; acctName: string };

type Report = {
  month: string;
  monthLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { totalActions: number; attributed: number; unattributed: number; activeStaff: number };
  insights?: string[];
  byStaff?: Grouped[];
  byCategory?: Grouped[];
  detail?: DetailRow[];
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
      <thead><tr><th>{label}</th><th className="n">Actions</th></tr></thead>
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

export default function FieldStaffActivityPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("field-staff-activity");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<Report>(`/api/reports/field-staff-activity?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [month, sig.ready, sig.query]);

  if (!month) return <div className="print-root"><div className="form-error">No month given.</div></div>;
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

        <p className="ecpay-kicker">Field Staff Activity Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No account actions were logged in {data.monthLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Total actions logged" value={data.kpis.totalActions.toLocaleString()} />
              <KpiTile label="Tied to a staff member" value={data.kpis.attributed.toLocaleString()} sub={`of ${data.kpis.totalActions.toLocaleString()} total`} />
              <KpiTile label="Active staff" value={data.kpis.activeStaff.toLocaleString()} />
              <KpiTile label="No staff on record" value={data.kpis.unattributed.toLocaleString()} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What this month shows</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By staff member</h2></div>
                <CountTable rows={data.byStaff ?? []} label="Staff" />
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By action type</h2></div>
                <CountTable rows={data.byCategory ?? []} label="Action" />
              </section>
            </div>

            <section className="record-section">
              <div className="record-head">
                <h2>Recent actions</h2>
                <span className="count">Top 60</span>
              </div>
              <table>
                <thead><tr><th>Date</th><th>Staff</th><th>Action</th><th>Account no.</th><th>Account name</th></tr></thead>
                <tbody>
                  {(data.detail ?? []).map((r, i) => (
                    <tr key={`${r.date}-${i}`}>
                      <td>{r.date}</td>
                      <td>{r.staff}</td>
                      <td>{r.category}</td>
                      <td>{r.accountNo}</td>
                      <td>{r.acctName}</td>
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
