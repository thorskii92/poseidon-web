import { dateTimeMs } from "./mobileReportFormat";
import {
  CountTable, Insights, KpiTile, MobileReportFrame, type BaseReport, type Grouped,
} from "./MobileReportParts";

/**
 * Incident Report Register — every incident reported from the mobile app in
 * one month, by category and status, with the full list. See
 * poseidon-api's mobileAppReports.ts.
 */

type Report = BaseReport & {
  kpis?: { reported: number; open: number; resolved: number; dismissed: number; withGps: number; resolvedRate: number };
  insights?: string[];
  byCategory?: { key: string; count: number; open: number; resolved: number; dismissed: number }[];
  byStatus?: Grouped[];
  detail?: {
    id: number; createdMs: number; category: string; location: string; hasGps: boolean;
    reporterName: string; contactNo: string; status: string; handledBy: string; notes: string;
  }[];
};

export default function IncidentRegisterPrint() {
  return (
    <MobileReportFrame<Report>
      reportKey="incident-register"
      endpoint="/api/reports/incident-register"
      kicker="Incident Report Register"
      emptyText={(m) => `No incidents were reported from the mobile app in ${m}.`}
      defaultOrientation="landscape"
    >
      {(data) => (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Incidents reported" value={data.kpis!.reported.toLocaleString()} />
            <KpiTile label="Resolved" value={data.kpis!.resolved.toLocaleString()} sub={`${data.kpis!.resolvedRate.toFixed(1)}%`} />
            <KpiTile label="Still open" value={data.kpis!.open.toLocaleString()} sub="New or acknowledged" />
            <KpiTile label="Dismissed" value={data.kpis!.dismissed.toLocaleString()} sub={`${data.kpis!.withGps} with GPS location`} />
          </div>

          <Insights lines={data.insights} />

          <div className="notice-columns">
            <section className="record-section">
              <div className="record-head"><h2>By category</h2></div>
              <table>
                <thead>
                  <tr><th>Category</th><th className="n">Reported</th><th className="n">Open</th><th className="n">Resolved</th><th className="n">Dismissed</th></tr>
                </thead>
                <tbody>
                  {(data.byCategory ?? []).map((c) => (
                    <tr key={c.key}>
                      <td>{c.key}</td>
                      <td className="n">{c.count}</td>
                      <td className="n">{c.open}</td>
                      <td className="n">{c.resolved}</td>
                      <td className="n">{c.dismissed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="record-section">
              <div className="record-head"><h2>By status</h2></div>
              <CountTable rows={data.byStatus ?? []} label="Status" unit="Reports" />
            </section>
          </div>

          <section className="record-section">
            <div className="record-head"><h2>Incidents reported</h2></div>
            <table>
              <thead>
                <tr><th>Ref.</th><th>Reported</th><th>Category</th><th>Location</th><th>Reported by</th><th>Status</th><th>Handled by</th><th>Office notes</th></tr>
              </thead>
              <tbody>
                {(data.detail ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{dateTimeMs(r.createdMs)}</td>
                    <td>{r.category}</td>
                    <td>{r.location}{r.hasGps ? " (GPS)" : ""}</td>
                    <td>{r.reporterName}<div className="muted">{r.contactNo}</div></td>
                    <td>{r.status}</td>
                    <td>{r.handledBy || <span className="muted">—</span>}</td>
                    <td>{r.notes || <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </MobileReportFrame>
  );
}
