import {
  CountTable, Insights, KpiTile, MobileReportFrame, type BaseReport, type Grouped,
} from "./MobileReportParts";

/**
 * Mobile App Usage Report — how much the consumer mobile app was used in
 * one month, day by day: phones, requests, account checks, and what was
 * sent to the office. Phones are counted by the random install id the app
 * makes for itself — nothing here identifies a person. See poseidon-api's
 * mobileAppReports.ts and mobileAppMonitor.ts.
 */

type Day = {
  day: number; date: string; requests: number; phones: number; opens: number; lookups: number;
  failed: number; accounts: number; incidents: number; adjustments: number; problems: number;
};

type Report = BaseReport & {
  kpis?: {
    requests: number; phones: number; newPhones: number; accounts: number; lookups: number; failed: number;
    incidents: number; adjustments: number; rateLimited: number; errors: number; avgMs: number;
    activeDays: number; avgPhonesPerDay: number;
  };
  insights?: string[];
  days?: Day[];
  hours?: { hour: number; requests: number }[];
  platforms?: Grouped[];
  versions?: Grouped[];
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

function hourLabel(h: number) {
  return `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`;
}

const PLATFORM: Record<string, string> = { android: "Android", ios: "iPhone", web: "Web browser", unknown: "Unknown" };

export default function MobileAppUsagePrint() {
  return (
    <MobileReportFrame<Report>
      reportKey="mobile-app-usage"
      endpoint="/api/reports/mobile-app-usage"
      kicker="Mobile App Usage Report"
      emptyText={(m) => `The mobile app wasn't used in ${m}.`}
      defaultOrientation="landscape"
    >
      {(data) => {
        const k = data.kpis!;
        const days = data.days ?? [];
        const total = (pick: (d: Day) => number) => days.reduce((s, d) => s + pick(d), 0);
        const maxHour = Math.max(1, ...(data.hours ?? []).map((h) => h.requests));
        return (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Phones" value={k.phones.toLocaleString()} sub={`${k.newPhones} new this month · ${k.avgPhonesPerDay} a day on average`} />
              <KpiTile label="Requests" value={k.requests.toLocaleString()} sub={`${k.activeDays} day(s) with activity · avg ${k.avgMs} ms`} />
              <KpiTile label="Account checks" value={k.lookups.toLocaleString()} sub={`${k.accounts} account(s) · ${k.failed} didn't match`} />
              <KpiTile label="Sent to the office" value={(k.incidents + k.adjustments).toLocaleString()} sub={`${k.incidents} incident(s), ${k.adjustments} adjustment request(s)`} />
            </div>

            <Insights lines={data.insights} />

            <section className="record-section">
              <div className="record-head"><h2>By day</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th><th>Day</th><th className="n">Phones</th><th className="n">Requests</th>
                    <th className="n">Opened</th><th className="n">Account checks</th><th className="n">Didn't match</th>
                    <th className="n">Accounts</th><th className="n">Incidents</th><th className="n">Adjustments</th><th className="n">Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className={d.requests ? undefined : "muted"}>
                      <td>{d.date}</td>
                      <td>{weekday(d.date)}</td>
                      <td className="n">{d.phones || "—"}</td>
                      <td className="n">{d.requests || "—"}</td>
                      <td className="n">{d.opens || "—"}</td>
                      <td className="n">{d.lookups || "—"}</td>
                      <td className="n">{d.failed || "—"}</td>
                      <td className="n">{d.accounts || "—"}</td>
                      <td className="n">{d.incidents || "—"}</td>
                      <td className="n">{d.adjustments || "—"}</td>
                      <td className="n">{d.problems || "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    {/* Phones and accounts are distinct for the whole month, not a sum of days. */}
                    <td colSpan={2}>Month</td>
                    <td className="n">{k.phones}</td>
                    <td className="n">{k.requests}</td>
                    <td className="n">{total((d) => d.opens)}</td>
                    <td className="n">{k.lookups}</td>
                    <td className="n">{k.failed}</td>
                    <td className="n">{k.accounts}</td>
                    <td className="n">{k.incidents}</td>
                    <td className="n">{k.adjustments}</td>
                    <td className="n">{total((d) => d.problems)}</td>
                  </tr>
                </tfoot>
              </table>
            </section>

            <div className="notice-columns">
              <section className="record-section">
                <div className="record-head"><h2>Time of day</h2></div>
                <table>
                  <thead><tr><th>Hour</th><th className="n">Requests</th><th /></tr></thead>
                  <tbody>
                    {(data.hours ?? []).filter((h) => h.requests > 0).map((h) => (
                      <tr key={h.hour}>
                        <td>{hourLabel(h.hour)}</td>
                        <td className="n">{h.requests}</td>
                        <td style={{ width: "50%" }}>
                          <div style={{ height: 8, width: `${(h.requests / maxHour) * 100}%`, background: "#2e8bc0", borderRadius: 2 }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section className="record-section">
                <div className="record-head"><h2>Phones by platform</h2></div>
                <CountTable
                  rows={(data.platforms ?? []).map((p) => ({ key: PLATFORM[p.key] ?? p.key, count: p.count }))}
                  label="Platform"
                  unit="Phones"
                />
                <div className="record-head" style={{ marginTop: 14 }}><h2>Phones by app version</h2></div>
                <CountTable rows={data.versions ?? []} label="Version" unit="Phones" />
              </section>
            </div>
          </>
        );
      }}
    </MobileReportFrame>
  );
}
