import { CountTable, Insights, KpiTile, MobileReportFrame, type BaseReport, type Grouped } from "./MobileReportParts";

/**
 * Reports on the meter reader app (poseidon-reader), from poseidon-api's
 * fieldReadingReports.ts. The month is the BILLING period the routes were
 * downloaded for.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function when(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function dayLabel(day: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
}

type FieldReport = BaseReport & {
  kpis?: { routes: number; accounts: number; readings: number; coverage: number; billed: number; readers: number; flagged: number; devices: number };
  insights?: string[];
  readers?: { reader: string; routes: number; accounts: number; read: number; coverage: number; days: number; perHour: number | null; flagged: number }[];
  routes?: {
    id: number; area: string; reader: string; device: string; accounts: number; downloadedMs: number; lastUploadMs: number | null;
    read: number; pending: number; billed: number; discarded: number; coverage: number;
  }[];
  days?: { day: string; readings: number; readers: number }[];
};

export function ReaderFieldReportPrint() {
  return (
    <MobileReportFrame<FieldReport>
      reportKey="reader-field-reading"
      endpoint="/api/reports/reader/field-reading"
      kicker="Meter Reading Field Report"
      emptyText={(m) => `No routes were downloaded to the meter reader app for ${m} billing.`}
      defaultOrientation="landscape"
    >
      {(data) => {
        const k = data.kpis!;
        return (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Readings uploaded" value={k.readings.toLocaleString()} sub={`${k.coverage}% of ${k.accounts.toLocaleString()} account(s) on ${k.routes} route(s)`} />
              <KpiTile label="Billed from the phone" value={k.billed.toLocaleString()} sub={`${k.readings - k.billed} not billed yet or set aside`} />
              <KpiTile label="Readers" value={String(k.readers)} sub={`${k.devices} phone(s)`} />
              <KpiTile label="With a warning or note" value={String(k.flagged)} sub="see the Field Reading Exceptions report" />
            </div>

            <Insights lines={data.insights} />

            <section className="record-section">
              <div className="record-head"><h2>By reader</h2></div>
              <table>
                <thead>
                  <tr><th>Meter reader</th><th className="n">Routes</th><th className="n">Accounts</th><th className="n">Read</th><th className="n">Coverage</th><th className="n">Days in the field</th><th className="n">Readings / hour</th><th className="n">Warnings / notes</th></tr>
                </thead>
                <tbody>
                  {(data.readers ?? []).map((r) => (
                    <tr key={r.reader}>
                      <td>{r.reader}</td><td className="n">{r.routes}</td><td className="n">{r.accounts}</td><td className="n">{r.read}</td>
                      <td className="n">{r.coverage}%</td><td className="n">{r.days}</td><td className="n">{r.perHour ?? "—"}</td><td className="n">{r.flagged || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="count">Readings per hour counts the time between each day's first and last reading, breaks included.</p>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By route</h2></div>
              <table>
                <thead>
                  <tr><th>Area</th><th>Reader</th><th>Phone</th><th>Downloaded</th><th>Last upload</th><th className="n">Accounts</th><th className="n">Read</th><th className="n">Coverage</th><th className="n">Not billed yet</th><th className="n">Billed</th><th className="n">Set aside</th></tr>
                </thead>
                <tbody>
                  {(data.routes ?? []).map((r) => (
                    <tr key={r.id} className={r.read ? undefined : "muted"}>
                      <td>{r.area}</td><td>{r.reader}</td><td>{r.device || "—"}</td><td>{when(r.downloadedMs)}</td><td>{when(r.lastUploadMs)}</td>
                      <td className="n">{r.accounts}</td><td className="n">{r.read}</td><td className="n">{r.coverage}%</td>
                      <td className="n">{r.pending || "—"}</td><td className="n">{r.billed || "—"}</td><td className="n">{r.discarded || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>By day</h2></div>
              <table>
                <thead><tr><th>Day</th><th className="n">Readings</th><th className="n">Readers out</th></tr></thead>
                <tbody>
                  {(data.days ?? []).map((d) => (
                    <tr key={d.day}><td>{dayLabel(d.day)}</td><td className="n">{d.readings}</td><td className="n">{d.readers}</td></tr>
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

type Row = { accountNo: string; name: string; area: string; reader: string; readMs: number; prev: number; pres: number; consump: number; status: string };

type Exceptions = BaseReport & {
  kpis?: { readings: number; flagged: number; changed: number; priceDiff: number; discarded: number; printed: number };
  byFlag?: Grouped[];
  flagged?: (Row & { flags: string[]; note: string })[];
  changed?: (Row & { billedPres: number; difference: number })[];
  priceDiff?: (Row & { printedTotal: number; billedTotal: number; difference: number; readingChanged: boolean })[];
  discarded?: Row[];
};

const STATUS: Record<string, string> = { pending: "Not billed yet", billed: "Billed", discarded: "Set aside" };

function Who({ r }: { r: Row }) {
  return <td>{r.accountNo}<div className="muted">{r.name}</div></td>;
}

export function ReaderExceptionsPrint() {
  return (
    <MobileReportFrame<Exceptions>
      reportKey="reader-exceptions"
      endpoint="/api/reports/reader/exceptions"
      kicker="Field Reading Exceptions"
      emptyText={(m) => `No readings were uploaded from the meter reader app for ${m} billing.`}
      defaultOrientation="landscape"
    >
      {(data) => {
        const k = data.kpis!;
        return (
          <>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <KpiTile label="Warnings & notes" value={String(k.flagged)} sub={`of ${k.readings.toLocaleString()} reading(s)`} />
              <KpiTile label="Changed by the biller" value={String(k.changed)} sub="reading differs from the phone's" />
              <KpiTile label="Printed bill differs" value={String(k.priceDiff)} sub={`of ${k.printed} printed on the phone`} />
              <KpiTile label="Set aside" value={String(k.discarded)} sub="not used for billing" />
            </div>

            {(data.byFlag ?? []).length > 0 && (
              <section className="record-section">
                <div className="record-head"><h2>Warnings raised on the phone</h2></div>
                <CountTable rows={data.byFlag ?? []} label="Warning" unit="Readings" />
              </section>
            )}

            {(data.priceDiff ?? []).length > 0 && (
              <section className="record-section">
                <div className="record-head"><h2>Printed bill differs from the generated bill</h2></div>
                <table>
                  <thead><tr><th>Account</th><th>Area</th><th>Reader</th><th className="n">Printed</th><th className="n">Billed</th><th className="n">Difference</th><th>Why</th></tr></thead>
                  <tbody>
                    {(data.priceDiff ?? []).map((r, i) => (
                      <tr key={i}>
                        <Who r={r} /><td>{r.area}</td><td>{r.reader}</td>
                        <td className="n">{peso.format(r.printedTotal)}</td><td className="n">{peso.format(r.billedTotal)}</td><td className="n">{peso.format(r.difference)}</td>
                        <td>{r.readingChanged ? "Reading changed at the office" : "Rates or charges changed after download"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="count">The consumer holds the printed amount — worth a call or a corrected bill.</p>
              </section>
            )}

            {(data.changed ?? []).length > 0 && (
              <section className="record-section">
                <div className="record-head"><h2>Readings changed by the biller</h2></div>
                <table>
                  <thead><tr><th>Account</th><th>Area</th><th>Reader</th><th className="n">Previous</th><th className="n">Phone</th><th className="n">Billed</th><th className="n">Difference</th></tr></thead>
                  <tbody>
                    {(data.changed ?? []).map((r, i) => (
                      <tr key={i}>
                        <Who r={r} /><td>{r.area}</td><td>{r.reader}</td>
                        <td className="n">{r.prev}</td><td className="n">{r.pres}</td><td className="n">{r.billedPres}</td><td className="n">{r.difference > 0 ? "+" : ""}{r.difference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {(data.flagged ?? []).length > 0 && (
              <section className="record-section">
                <div className="record-head"><h2>Readings with a warning or the reader's note</h2></div>
                <table>
                  <thead><tr><th>Account</th><th>Area</th><th>Reader</th><th>Read</th><th className="n">Previous</th><th className="n">Present</th><th className="n">Use (m³)</th><th>Warning</th><th>Note</th><th>Status</th></tr></thead>
                  <tbody>
                    {(data.flagged ?? []).map((r, i) => (
                      <tr key={i}>
                        <Who r={r} /><td>{r.area}</td><td>{r.reader}</td><td>{when(r.readMs)}</td>
                        <td className="n">{r.prev}</td><td className="n">{r.pres}</td><td className="n">{r.consump}</td>
                        <td>{r.flags.join(", ")}</td><td>{r.note}</td><td>{STATUS[r.status] ?? r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {(data.discarded ?? []).length > 0 && (
              <section className="record-section">
                <div className="record-head"><h2>Readings set aside</h2></div>
                <table>
                  <thead><tr><th>Account</th><th>Area</th><th>Reader</th><th>Read</th><th className="n">Previous</th><th className="n">Present</th></tr></thead>
                  <tbody>
                    {(data.discarded ?? []).map((r, i) => (
                      <tr key={i}><Who r={r} /><td>{r.area}</td><td>{r.reader}</td><td>{when(r.readMs)}</td><td className="n">{r.prev}</td><td className="n">{r.pres}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {!k.flagged && !k.changed && !k.priceDiff && !k.discarded && (
              <p className="count">Nothing to look into — every reading went through as the reader took it.</p>
            )}
          </>
        );
      }}
    </MobileReportFrame>
  );
}
