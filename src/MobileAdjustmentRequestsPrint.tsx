import { dateTimeMs, hours, peso } from "./mobileReportFormat";
import {
  CountTable, Insights, KpiTile, MobileReportFrame, type BaseReport, type Grouped,
} from "./MobileReportParts";

/**
 * Mobile Adjustment Requests Report — bill adjustment requests consumers
 * sent from the mobile app in one month: how many, the office's decisions
 * and how long they took, and where the accepted ones now stand in the
 * adjustment chain. See poseidon-api's mobileAppReports.ts.
 */

type Row = {
  id: number; createdMs: number; accountNo: string; name: string; barangay: string;
  period: string; amount: number; reason: string; remarks: string; requestedBy: string;
  contactNo: string; status: string; decidedMs: number | null; decisionHours: number | null;
  handledBy: string; adjStatus: string; declineReason: string;
};

type Report = BaseReport & {
  kpis?: {
    received: number; accepted: number; declined: number; pending: number;
    acceptanceRate: number; avgDecisionHours: number | null; amountDisputed: number;
  };
  insights?: string[];
  byReason?: { key: string; count: number; accepted: number; declined: number; pending: number; amount: number }[];
  outcomes?: Grouped[];
  byBarangay?: Grouped[];
  detail?: Row[];
};

/** The adjustment chain's own stage names, as the Adjustments page shows them. */
const STAGE: Record<string, string> = {
  Inspection: "For inspection",
  "Pending Approval": "Awaiting approval",
  Approved: "Approved, not yet adjusted",
  Done: "Adjusted",
  Rejected: "Rejected",
};

export default function MobileAdjustmentRequestsPrint() {
  return (
    <MobileReportFrame<Report>
      reportKey="mobile-adjustment-requests"
      endpoint="/api/reports/mobile-adjustment-requests"
      kicker="Mobile Adjustment Requests Report"
      emptyText={(m) => `No bill adjustment requests came in from the mobile app in ${m}.`}
      defaultOrientation="landscape"
    >
      {(data) => {
        const k = data.kpis!;
        return (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Requests received" value={k.received.toLocaleString()} sub={`₱${peso.format(k.amountDisputed)} in bills`} />
              <KpiTile label="Accepted" value={k.accepted.toLocaleString()} sub={`${k.acceptanceRate.toFixed(1)}% of decided`} />
              <KpiTile label="Declined" value={k.declined.toLocaleString()} sub={`${k.pending} still waiting for a call`} />
              <KpiTile label="Average time to decide" value={hours(k.avgDecisionHours)} />
            </div>

            <Insights lines={data.insights} />

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>By reason</h2></div>
                <table>
                  <thead>
                    <tr><th>Reason</th><th className="n">Received</th><th className="n">Accepted</th><th className="n">Declined</th><th className="n">Pending</th><th className="n">Bills (₱)</th></tr>
                  </thead>
                  <tbody>
                    {(data.byReason ?? []).map((r) => (
                      <tr key={r.key}>
                        <td>{r.key}</td>
                        <td className="n">{r.count}</td>
                        <td className="n">{r.accepted}</td>
                        <td className="n">{r.declined}</td>
                        <td className="n">{r.pending}</td>
                        <td className="n">{peso.format(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Where accepted requests stand</h2></div>
                {(data.outcomes ?? []).length === 0 ? (
                  <p className="count">None accepted yet.</p>
                ) : (
                  <CountTable
                    rows={(data.outcomes ?? []).map((o) => ({ key: STAGE[o.key] ?? o.key, count: o.count }))}
                    label="Adjustment stage"
                    unit="Requests"
                  />
                )}
              </section>
            </div>

            <section className="record-section">
              <div className="record-head"><h2>By barangay</h2></div>
              <CountTable rows={data.byBarangay ?? []} label="Barangay" unit="Requests" />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Requests received</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Ref.</th><th>Sent</th><th>Account</th><th>Bill</th><th className="n">Amount</th>
                    <th>Reason</th><th>Requested by</th><th>Decision</th><th>Decided by</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.detail ?? []).map((r) => (
                    <tr key={r.id}>
                      <td>{r.id}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{dateTimeMs(r.createdMs)}</td>
                      <td>{r.accountNo} — {r.name}</td>
                      <td>{r.period}</td>
                      <td className="n">{peso.format(r.amount)}</td>
                      <td>
                        {r.reason}
                        {r.remarks && <div className="muted">{r.remarks}</div>}
                      </td>
                      <td>{r.requestedBy}<div className="muted">{r.contactNo}</div></td>
                      <td>
                        {r.status === "Pending" ? "Waiting for a call" : r.status}
                        {r.status === "Accepted" && r.adjStatus && <div className="muted">{STAGE[r.adjStatus] ?? r.adjStatus}</div>}
                        {r.status === "Declined" && r.declineReason && <div className="muted">“{r.declineReason}”</div>}
                      </td>
                      <td>
                        {r.handledBy || <span className="muted">—</span>}
                        {r.decidedMs && <div className="muted">{dateTimeMs(r.decidedMs)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        );
      }}
    </MobileReportFrame>
  );
}
