import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import { hours, when, type EmergencyEvent } from "./emergencyData";
import "./print.css";
import ReportHeader from "./ReportHeader";

/** Service Interruption & Emergency Report — every event in a date range, with totals by type and water system. */

type Report = {
  from: string;
  to: string;
  events: EmergencyEvent[];
  byType: { type: string; count: number; hours: number; accounts: number }[];
  bySystem: { system: string; events: number; hours: number }[];
  totals: { events: number; hours: number; averageHoursToRestore: number | null; estM3Lost: number; noticesPublished: number };
  signatories: SignatorySlot[];
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const longDate = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });

export default function InterruptionReportPrint() {
  const [params, setParams] = useSearchParams();
  const now = new Date();
  const from = params.get("from") ?? iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = params.get("to") ?? iso(now);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("interruption-report");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Report>(`/api/emergencies/report?from=${from}&to=${to}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [from, to, sig.ready, sig.query]);

  const setRange = (f: string, t: string) => setParams({ from: f, to: t });

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()} disabled={!data}>Print</button>
        <label>From <input type="date" value={from} onChange={(e) => e.target.value && setRange(e.target.value, to)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => e.target.value && setRange(from, e.target.value)} /></label>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      {error && <div className="form-error">{error}</div>}
      {!data && !error && <p className="count">Building the report…</p>}

      {data && (
        <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
          <ReportHeader />
          <p className="ecpay-kicker">Service Interruption &amp; Emergency Report</p>
          <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{longDate(data.from)} – {longDate(data.to)}</h1>

          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <div className="dash-kpi"><div className="dash-kpi-label">Events</div><div className="dash-kpi-value">{data.totals.events}</div></div>
            <div className="dash-kpi"><div className="dash-kpi-label">Hours of interruption</div><div className="dash-kpi-value">{data.totals.hours.toFixed(1)}</div></div>
            <div className="dash-kpi"><div className="dash-kpi-label">Average time to restore</div><div className="dash-kpi-value">{hours(data.totals.averageHoursToRestore)}</div></div>
            <div className="dash-kpi"><div className="dash-kpi-label">Public notices published</div><div className="dash-kpi-value">{data.totals.noticesPublished}</div>
              {data.totals.estM3Lost > 0 && <div className="dash-kpi-sub">est. {data.totals.estM3Lost.toLocaleString("en-PH")} m³ lost</div>}
            </div>
          </div>

          {data.events.length === 0 ? (
            <p className="count">No events in this period.</p>
          ) : (
            <>
              <section className="record-section">
                <div className="record-head"><h2>Events</h2></div>
                <table>
                  <thead>
                    <tr><th>Ref</th><th>Event</th><th>Area</th><th>Started</th><th>Restored</th><th className="n">Duration</th><th className="n">Accounts</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {data.events.map((e) => (
                      <tr key={e.id}>
                        <td>{e.ref}</td>
                        <td>{e.title}<div className="count">{e.type} · {e.severity}{e.cause ? ` · ${e.cause}` : ""}</div></td>
                        <td>{e.areaText}</td>
                        <td>{when(e.startedMs)}</td>
                        <td>{when(e.restoredMs)}</td>
                        <td className="n">{hours(e.durationHours)}</td>
                        <td className="n">{e.affectedAccounts.toLocaleString("en-PH")}</td>
                        <td>{e.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <section className="record-section">
                  <div className="record-head"><h2>By kind</h2></div>
                  <table>
                    <thead><tr><th>Kind</th><th className="n">Events</th><th className="n">Hours</th><th className="n">Accounts affected</th></tr></thead>
                    <tbody>
                      {data.byType.map((t) => (
                        <tr key={t.type}><td>{t.type}</td><td className="n">{t.count}</td><td className="n">{t.hours.toFixed(1)}</td><td className="n">{t.accounts.toLocaleString("en-PH")}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="record-section">
                  <div className="record-head"><h2>By water system</h2></div>
                  <table>
                    <thead><tr><th>System</th><th className="n">Events</th><th className="n">Hours</th></tr></thead>
                    <tbody>
                      {data.bySystem.map((s) => (
                        <tr key={s.system}><td>{s.system}</td><td className="n">{s.events}</td><td className="n">{s.hours.toFixed(1)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <SignatoryBlock slots={data.signatories ?? []} />
          </div>
          <p className="ecpay-generated">
            Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        </article>
      )}
    </div>
  );
}
