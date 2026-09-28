import { dateTimeMs, hours } from "./mobileReportFormat";
import { Insights, KpiTile, MobileReportFrame, type BaseReport } from "./MobileReportParts";

/**
 * Incident Response Time Report — how quickly the office first acted on
 * and closed the month's mobile-app incident reports, by category and by
 * staff member, plus every report still open today and how long it has
 * waited. See poseidon-api's mobileAppReports.ts.
 */

type Aging = { id: number; createdMs: number; category: string; location: string; status: string; ackBy: string; ageDays: number };

type Report = BaseReport & {
  kpis?: {
    reported: number;
    medianAckHours: number | null;
    avgAckHours: number | null;
    avgCloseHours: number | null;
    within24Rate: number;
    unacknowledged: number;
  };
  insights?: string[];
  byCategory?: { key: string; count: number; avgAckHours: number | null; avgCloseHours: number | null; within24Rate: number }[];
  byStaff?: { key: string; acknowledged: number; closed: number }[];
  aging?: Aging[];
};

function AgingTable({ rows }: { rows: Aging[] }) {
  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Still open today</h2>
        <span className="count">{rows.length} report{rows.length === 1 ? "" : "s"}, any month</span>
      </div>
      {rows.length === 0 ? (
        <p className="count">No incident reports are open.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Ref.</th><th>Reported</th><th>Category</th><th>Location</th><th>Status</th><th>Acknowledged by</th><th className="n">Waiting</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td style={{ whiteSpace: "nowrap" }}>{dateTimeMs(r.createdMs)}</td>
                <td>{r.category}</td>
                <td>{r.location}</td>
                <td>{r.status}</td>
                <td>{r.status === "New" ? <span className="muted">—</span> : r.ackBy}</td>
                <td className="n">{r.ageDays} days</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function IncidentResponsePrint() {
  return (
    <MobileReportFrame<Report>
      reportKey="incident-response"
      endpoint="/api/reports/incident-response"
      kicker="Incident Response Time Report"
      emptyText={(m) => `No incidents were reported from the mobile app in ${m}.`}
      emptyChildren={(data) => <AgingTable rows={data.aging ?? []} />}
    >
      {(data) => {
        const k = data.kpis!;
        return (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Incidents reported" value={k.reported.toLocaleString()} sub={`${k.unacknowledged} not yet acknowledged`} />
              <KpiTile label="Median time to first action" value={hours(k.medianAckHours)} sub={`average ${hours(k.avgAckHours)}`} />
              <KpiTile label="Acknowledged within 24 hr" value={`${k.within24Rate.toFixed(1)}%`} />
              <KpiTile label="Average time to close" value={hours(k.avgCloseHours)} sub="resolved or dismissed" />
            </div>

            <Insights lines={data.insights} />

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By category</h2></div>
                <table>
                  <thead>
                    <tr><th>Category</th><th className="n">Reported</th><th className="n">Avg. to first action</th><th className="n">Avg. to close</th><th className="n">Within 24 hr</th></tr>
                  </thead>
                  <tbody>
                    {(data.byCategory ?? []).map((c) => (
                      <tr key={c.key}>
                        <td>{c.key}</td>
                        <td className="n">{c.count}</td>
                        <td className="n">{hours(c.avgAckHours)}</td>
                        <td className="n">{hours(c.avgCloseHours)}</td>
                        <td className="n">{c.within24Rate.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="record-section">
                <div className="record-head"><h2>By staff member</h2></div>
                {(data.byStaff ?? []).length === 0 ? (
                  <p className="count">No reports from this month have been acted on yet.</p>
                ) : (
                  <table>
                    <thead><tr><th>Staff</th><th className="n">First acted on</th><th className="n">Closed</th></tr></thead>
                    <tbody>
                      {(data.byStaff ?? []).map((s) => (
                        <tr key={s.key}>
                          <td>{s.key}</td>
                          <td className="n">{s.acknowledged}</td>
                          <td className="n">{s.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </div>

            <AgingTable rows={data.aging ?? []} />
          </>
        );
      }}
    </MobileReportFrame>
  );
}
