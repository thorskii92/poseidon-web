import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * Monthly Billing Overview — summary cards, then billed vs. collected by
 * classification, barangay, cluster (grouped by barangay), a daily
 * collection trend, and every billed account that month, grouped and
 * collapsible by barangay. See billingOverview.ts for the query design and
 * the Excel export sharing the same data-building functions.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");
const plain2 = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ClassRow = {
  classification: string; accounts: number; totalConsump: number; totalAmount: number; totalDue: number;
  collected: number; unpaid: number; penalty: number; discount: number; efficiencyPct: number;
};
type BarangayRow = {
  barangay: string; accounts: number; totalConsump: number; totalDue: number;
  collected: number; unpaid: number; penalty: number; discount: number; efficiencyPct: number;
};
type ClusterRow = BarangayRow & { cluster: string };
type DailyRow = { day: number; dateLabel: string; paidCount: number; collected: number; surcharge: number; cumulative: number };
type AccountRow = {
  barangay: string; accountNo: string; accountName: string; classification: string; isSenior: boolean;
  prevRead: number; presRead: number; consump: number; amount: number; enviFee: number; appFee: number; wmmf: number;
  penalty: number; discount: number; totalDue: number; amountPaid: number; status: string;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  month: string; year: number; generatedAt: string; signatories: SignatorySlot[];
  summary: {
    totalAccounts: number; totalBilled: number; totalCollected: number; totalUnpaid: number;
    totalPenalty: number; totalDiscount: number; totalEnvi: number; totalAppFee: number; totalWmmf: number;
    avgConsump: number; paidCount: number; unpaidCount: number; efficiencyPct: number;
  };
  byClassification: ClassRow[];
  byBarangay: BarangayRow[];
  byCluster: ClusterRow[];
  daily: DailyRow[];
  accounts: AccountRow[];
};

function pesoOrDash(v: number): string {
  return v ? peso.format(v) : "—";
}

export default function MonthlyBillingOverviewPrint() {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const year = params.get("year") ?? "";

  const sig = useSignatories("billing-overview-monthly");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !year || !sig.ready) return;
    apiGet<Report>(`/api/reports/billing-overview/monthly?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}&${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [month, year, sig.ready, sig.query]);

  if (!month || !year) {
    return (
      <div className="print-root">
        <div className="form-error">No month/year given.</div>
      </div>
    );
  }
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

  const s = data.summary;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <a
          className="clear-filters"
          href={`/api/reports/billing-overview/monthly.xlsx?month=${encodeURIComponent(month)}&year=${encodeURIComponent(year)}`}
        >
          Download Excel
        </a>
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
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">Monthly Billing Overview</h1>
        <p className="soa-issued">For the Month of {data.month} {data.year}</p>

        <div className="soa-analytics">
          <div className="soa-stat"><span>Total Accounts Billed</span><b>{plain.format(s.totalAccounts)}</b></div>
          <div className="soa-stat"><span>Total Amount Billed</span><b>{peso.format(s.totalBilled)}</b></div>
          <div className="soa-stat"><span>Total Collected</span><b>{peso.format(s.totalCollected)}</b></div>
          <div className="soa-stat"><span>Collection Efficiency</span><b>{s.efficiencyPct.toFixed(1)}%</b></div>
          <div className="soa-stat"><span>Total Unpaid</span><b>{peso.format(s.totalUnpaid)}</b></div>
          <div className="soa-stat"><span>Total Surcharges</span><b>{peso.format(s.totalPenalty)}</b></div>
          <div className="soa-stat"><span>Total SC Discounts</span><b>{peso.format(s.totalDiscount)}</b></div>
          <div className="soa-stat"><span>Avg. Consumption</span><b>{plain2.format(s.avgConsump)} m³</b></div>
        </div>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Billing Summary by Classification</h2>
        <ClassTable rows={data.byClassification} />

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Billing Summary by Barangay</h2>
        <BarangayTable rows={data.byBarangay} />

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Billing Summary by Cluster (Grouped by Barangay)</h2>
        <ClusterTable rows={data.byCluster} />

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Daily Collection Summary</h2>
        <DailyTable rows={data.daily} />

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Account Detail Listing</h2>
        <AccountDetail accounts={data.accounts} />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}

function ClassTable({ rows }: { rows: ClassRow[] }) {
  const t = rows.reduce(
    (a, r) => ({
      accounts: a.accounts + r.accounts, totalConsump: a.totalConsump + r.totalConsump, totalAmount: a.totalAmount + r.totalAmount,
      totalDue: a.totalDue + r.totalDue, collected: a.collected + r.collected, unpaid: a.unpaid + r.unpaid,
      penalty: a.penalty + r.penalty, discount: a.discount + r.discount,
    }),
    { accounts: 0, totalConsump: 0, totalAmount: 0, totalDue: 0, collected: 0, unpaid: 0, penalty: 0, discount: 0 },
  );
  const eff = t.totalDue ? (t.collected / t.totalDue) * 100 : 0;
  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Classification</th>
          <th className="soa-amt">Accounts</th><th className="soa-amt">Consumption (m³)</th>
          <th className="soa-amt">Water Charges</th><th className="soa-amt">Total Due</th>
          <th className="soa-amt">Collected</th><th className="soa-amt">Unpaid</th>
          <th className="soa-amt">Surcharge</th><th className="soa-amt">SC Discount</th><th className="soa-amt">Efficiency</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: "left" }}>{r.classification}</td>
            <td className="soa-amt">{plain.format(r.accounts)}</td>
            <td className="soa-amt">{plain2.format(r.totalConsump)}</td>
            <td className="soa-amt">{peso.format(r.totalAmount)}</td>
            <td className="soa-amt">{peso.format(r.totalDue)}</td>
            <td className="soa-amt">{peso.format(r.collected)}</td>
            <td className="soa-amt">{peso.format(r.unpaid)}</td>
            <td className="soa-amt">{peso.format(r.penalty)}</td>
            <td className="soa-amt">{peso.format(r.discount)}</td>
            <td className="soa-amt">{r.efficiencyPct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td style={{ textAlign: "left" }}>TOTAL</td>
          <td className="soa-amt">{plain.format(t.accounts)}</td>
          <td className="soa-amt">{plain2.format(t.totalConsump)}</td>
          <td className="soa-amt">{peso.format(t.totalAmount)}</td>
          <td className="soa-amt">{peso.format(t.totalDue)}</td>
          <td className="soa-amt">{peso.format(t.collected)}</td>
          <td className="soa-amt">{peso.format(t.unpaid)}</td>
          <td className="soa-amt">{peso.format(t.penalty)}</td>
          <td className="soa-amt">{peso.format(t.discount)}</td>
          <td className="soa-amt">{eff.toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>
  );
}

function BarangayTable({ rows }: { rows: BarangayRow[] }) {
  const t = rows.reduce(
    (a, r) => ({
      accounts: a.accounts + r.accounts, totalConsump: a.totalConsump + r.totalConsump, totalDue: a.totalDue + r.totalDue,
      collected: a.collected + r.collected, unpaid: a.unpaid + r.unpaid, penalty: a.penalty + r.penalty, discount: a.discount + r.discount,
    }),
    { accounts: 0, totalConsump: 0, totalDue: 0, collected: 0, unpaid: 0, penalty: 0, discount: 0 },
  );
  const eff = t.totalDue ? (t.collected / t.totalDue) * 100 : 0;
  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Barangay</th>
          <th className="soa-amt">Accounts</th><th className="soa-amt">Consumption (m³)</th>
          <th className="soa-amt">Total Billed</th><th className="soa-amt">Collected</th><th className="soa-amt">Unpaid</th>
          <th className="soa-amt">Surcharge</th><th className="soa-amt">SC Discount</th><th className="soa-amt">Efficiency</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: "left" }}>{r.barangay}</td>
            <td className="soa-amt">{plain.format(r.accounts)}</td>
            <td className="soa-amt">{plain.format(r.totalConsump)}</td>
            <td className="soa-amt">{peso.format(r.totalDue)}</td>
            <td className="soa-amt">{peso.format(r.collected)}</td>
            <td className="soa-amt">{peso.format(r.unpaid)}</td>
            <td className="soa-amt">{peso.format(r.penalty)}</td>
            <td className="soa-amt">{peso.format(r.discount)}</td>
            <td className="soa-amt">{r.efficiencyPct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td style={{ textAlign: "left" }}>TOTAL</td>
          <td className="soa-amt">{plain.format(t.accounts)}</td>
          <td className="soa-amt">{plain.format(t.totalConsump)}</td>
          <td className="soa-amt">{peso.format(t.totalDue)}</td>
          <td className="soa-amt">{peso.format(t.collected)}</td>
          <td className="soa-amt">{peso.format(t.unpaid)}</td>
          <td className="soa-amt">{peso.format(t.penalty)}</td>
          <td className="soa-amt">{peso.format(t.discount)}</td>
          <td className="soa-amt">{eff.toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>
  );
}

function ClusterTable({ rows }: { rows: ClusterRow[] }) {
  const groups = new Map<string, ClusterRow[]>();
  for (const r of rows) {
    if (!groups.has(r.barangay)) groups.set(r.barangay, []);
    groups.get(r.barangay)!.push(r);
  }
  const grand = rows.reduce(
    (a, r) => ({
      accounts: a.accounts + r.accounts, totalConsump: a.totalConsump + r.totalConsump, totalDue: a.totalDue + r.totalDue,
      collected: a.collected + r.collected, unpaid: a.unpaid + r.unpaid, penalty: a.penalty + r.penalty, discount: a.discount + r.discount,
    }),
    { accounts: 0, totalConsump: 0, totalDue: 0, collected: 0, unpaid: 0, penalty: 0, discount: 0 },
  );
  const grandEff = grand.totalDue ? (grand.collected / grand.totalDue) * 100 : 0;
  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>Barangay / Cluster</th>
          <th className="soa-amt">Accounts</th><th className="soa-amt">Consumption (m³)</th>
          <th className="soa-amt">Total Billed</th><th className="soa-amt">Collected</th><th className="soa-amt">Unpaid</th>
          <th className="soa-amt">Surcharge</th><th className="soa-amt">SC Discount</th><th className="soa-amt">Efficiency</th>
        </tr>
      </thead>
      <tbody>
        {[...groups.entries()].map(([barangay, clusterRows]) => {
          const sub = clusterRows.reduce(
            (a, r) => ({
              accounts: a.accounts + r.accounts, totalConsump: a.totalConsump + r.totalConsump, totalDue: a.totalDue + r.totalDue,
              collected: a.collected + r.collected, unpaid: a.unpaid + r.unpaid, penalty: a.penalty + r.penalty, discount: a.discount + r.discount,
            }),
            { accounts: 0, totalConsump: 0, totalDue: 0, collected: 0, unpaid: 0, penalty: 0, discount: 0 },
          );
          const subEff = sub.totalDue ? (sub.collected / sub.totalDue) * 100 : 0;
          return (
            <Fragment key={barangay}>
              <tr style={{ background: "#0d3b66" }}>
                <td colSpan={9} style={{ textAlign: "left", fontWeight: 700, color: "#fff" }}>{barangay}</td>
              </tr>
              {clusterRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left", paddingLeft: 20 }}>{r.cluster}</td>
                  <td className="soa-amt">{plain.format(r.accounts)}</td>
                  <td className="soa-amt">{plain.format(r.totalConsump)}</td>
                  <td className="soa-amt">{peso.format(r.totalDue)}</td>
                  <td className="soa-amt">{peso.format(r.collected)}</td>
                  <td className="soa-amt">{peso.format(r.unpaid)}</td>
                  <td className="soa-amt">{peso.format(r.penalty)}</td>
                  <td className="soa-amt">{peso.format(r.discount)}</td>
                  <td className="soa-amt">{r.efficiencyPct.toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ background: "#d6eaf8", fontWeight: 600, fontStyle: "italic" }}>
                <td style={{ textAlign: "left", paddingLeft: 8 }}>Subtotal — {barangay}</td>
                <td className="soa-amt">{plain.format(sub.accounts)}</td>
                <td className="soa-amt">{plain.format(sub.totalConsump)}</td>
                <td className="soa-amt">{peso.format(sub.totalDue)}</td>
                <td className="soa-amt">{peso.format(sub.collected)}</td>
                <td className="soa-amt">{peso.format(sub.unpaid)}</td>
                <td className="soa-amt">{peso.format(sub.penalty)}</td>
                <td className="soa-amt">{peso.format(sub.discount)}</td>
                <td className="soa-amt">{subEff.toFixed(1)}%</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td style={{ textAlign: "left" }}>GRAND TOTAL</td>
          <td className="soa-amt">{plain.format(grand.accounts)}</td>
          <td className="soa-amt">{plain.format(grand.totalConsump)}</td>
          <td className="soa-amt">{peso.format(grand.totalDue)}</td>
          <td className="soa-amt">{peso.format(grand.collected)}</td>
          <td className="soa-amt">{peso.format(grand.unpaid)}</td>
          <td className="soa-amt">{peso.format(grand.penalty)}</td>
          <td className="soa-amt">{peso.format(grand.discount)}</td>
          <td className="soa-amt">{grandEff.toFixed(1)}%</td>
        </tr>
      </tfoot>
    </table>
  );
}

function DailyTable({ rows }: { rows: DailyRow[] }) {
  const totalPaid = rows.reduce((s, r) => s + r.paidCount, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  const totalSurcharge = rows.reduce((s, r) => s + r.surcharge, 0);
  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th className="soa-amt">Day</th><th style={{ textAlign: "left" }}>Date</th>
          <th className="soa-amt">Accounts Paid</th><th className="soa-amt">Collected</th>
          <th className="soa-amt">Surcharge Collected</th><th className="soa-amt">Cumulative</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={6} style={{ textAlign: "center" }}>No payments this month.</td></tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}>
              <td className="soa-amt">{r.day}</td>
              <td style={{ textAlign: "left" }}>{r.dateLabel}</td>
              <td className="soa-amt">{plain.format(r.paidCount)}</td>
              <td className="soa-amt">{peso.format(r.collected)}</td>
              <td className="soa-amt">{pesoOrDash(r.surcharge)}</td>
              <td className="soa-amt">{peso.format(r.cumulative)}</td>
            </tr>
          ))
        )}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td colSpan={2} style={{ textAlign: "left" }}>TOTAL</td>
          <td className="soa-amt">{plain.format(totalPaid)}</td>
          <td className="soa-amt">{peso.format(totalCollected)}</td>
          <td className="soa-amt">{peso.format(totalSurcharge)}</td>
          <td className="soa-amt">{peso.format(totalCollected)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function AccountDetail({ accounts }: { accounts: AccountRow[] }) {
  const groups = new Map<string, AccountRow[]>();
  for (const a of accounts) {
    if (!groups.has(a.barangay)) groups.set(a.barangay, []);
    groups.get(a.barangay)!.push(a);
  }
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(b: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next;
    });
  }
  function toggleAll(expand: boolean) {
    setExpanded(expand ? new Set(groups.keys()) : new Set());
  }

  return (
    <>
      <div className="no-print" style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        <button className="clear-filters" onClick={() => toggleAll(true)}>Expand All</button>
        <button className="clear-filters" onClick={() => toggleAll(false)}>Collapse All</button>
      </div>

      {[...groups.entries()].map(([barangay, rows]) => {
        const paidCount = rows.filter((r) => r.status === "PAID").length;
        const unpaidCount = rows.length - paidCount;
        const seniorCount = rows.filter((r) => r.isSenior).length;
        const regularCount = rows.length - seniorCount;
        const classCounts = new Map<string, number>();
        for (const r of rows) classCounts.set(r.classification, (classCounts.get(r.classification) ?? 0) + 1);
        const isOpen = expanded.has(barangay);

        return (
          <div key={barangay} className="brgy-accordion">
            <div className="brgy-header" onClick={() => toggle(barangay)}>
              <div>
                <div className="brgy-title">{barangay} — {rows.length} account{rows.length === 1 ? "" : "s"}</div>
                <div className="brgy-meta">
                  <span>{[...classCounts.entries()].map(([c, n]) => `${c}: ${n}`).join(" · ")}</span>
                  <span>Senior/PWD: {seniorCount} · Regular: {regularCount}</span>
                  <span>Paid: {paidCount} · Unpaid: {unpaidCount}</span>
                </div>
              </div>
              <div className="brgy-toggle no-print">{isOpen ? "▲" : "▼"}</div>
            </div>
            <div className={`brgy-body ${isOpen ? "open" : ""}`}>
              <table className="brgy-table">
                <thead>
                  <tr>
                    <th>#</th><th>Acct No.</th><th>Account Name</th><th>Classification</th>
                    <th>Prev Read</th><th>Pres Read</th><th>Consump</th>
                    <th>Water Charges</th><th>Envi Fee</th><th>App Fee</th><th>WMMF</th>
                    <th>Surcharge</th><th>SC Disc</th><th>Total Due</th><th>Amt Paid</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="left">{i + 1}</td>
                      <td className="left">{r.accountNo}</td>
                      <td className="left">{r.accountName}{r.isSenior ? " (SC/PWD)" : ""}</td>
                      <td className="left">{r.classification}</td>
                      <td>{plain.format(r.prevRead)}</td>
                      <td>{plain.format(r.presRead)}</td>
                      <td>{plain2.format(r.consump)}</td>
                      <td>{peso.format(r.amount)}</td>
                      <td>{peso.format(r.enviFee)}</td>
                      <td>{peso.format(r.appFee)}</td>
                      <td>{peso.format(r.wmmf)}</td>
                      <td>{peso.format(r.penalty)}</td>
                      <td>{peso.format(r.discount)}</td>
                      <td>{peso.format(r.totalDue)}</td>
                      <td>{peso.format(r.amountPaid)}</td>
                      <td className="left">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </>
  );
}
