import { useState, type JSX } from "react";
import DailyReportDialog from "./DailyReportDialog";
import YearReportDialog from "./YearReportDialog";
import ORAccountabilityDialog from "./ORAccountabilityDialog";
import MonthlyBillingOverviewDialog from "./MonthlyBillingOverviewDialog";
import SCDSDialog from "./SCDSDialog";
import RevenueFromConsumptionDialog from "./RevenueFromConsumptionDialog";
import AccountsReceivableSummaryDialog from "./AccountsReceivableSummaryDialog";
import ReportOfClassificationDialog from "./ReportOfClassificationDialog";
import ReadingListDialog from "./ReadingListDialog";
import AccountsReceivablesDialog from "./AccountsReceivablesDialog";
import AdjustedBillsReportDialog from "./AdjustedBillsReportDialog";
import BillEditReportDialog from "./BillEditReportDialog";
import LatestConsumerStatusDialog from "./LatestConsumerStatusDialog";
import ConnectionReportDialog from "./ConnectionReportDialog";
import AnnualConnectionReportDialog from "./AnnualConnectionReportDialog";
import ServiceConnectionStatsDialog from "./ServiceConnectionStatsDialog";
import {
  IconReceipt, IconInvoice, IconUsers, IconWrench, IconTrendUp,
  IconCalendarBars, IconDroplet, type IconProps,
} from "./ReportIcons";

/**
 * The Report Menu, redesigned. The desktop's version was a flat wall of
 * identically-blue buttons — five categories in name only, since nothing
 * distinguished a built report from one that was never wired up until you
 * clicked it. This groups the same five categories under their own icon,
 * and every card says up front whether it does anything yet.
 *
 * Three reports are real: Daily Collection Report (already built for
 * Receipts Manager — this just adds a second door to it), Abstract of
 * Monthly Collection, and the Monthly Consumption Report. The other ~18
 * desktop reports stay "Coming soon" tiles, same pattern as the rest of
 * this app, until their source shows up.
 */

type ReportAction =
  | { kind: "dialog"; open: () => void }
  | { kind: "soon" };

type IconComponent = (p: IconProps) => JSX.Element;
type Report = { title: string; note: string; action: ReportAction; icon?: IconComponent };
type Category = { title: string; icon: IconComponent; reports: Report[] };

export default function ReportsPage() {
  const [dialog, setDialog] = useState<"daily" | "consumption" | "annual-performance" | "annual-collection" | "or-accountability" | "billing-overview-monthly" | "billing-overview-annual" | "scds" | "revenue-consumption" | "accounts-receivable-summary" | "report-of-classification" | "reading-list" | "accounts-receivables" | "adjusted-bills" | "bill-edits" | "consumer-status" | "monthly-connections" | "annual-connections" | "service-connection-stats" | null>(null);

  const CATEGORIES: Category[] = [
    {
      title: "Collection Reports",
      icon: IconReceipt,
      reports: [
        { title: "Daily Collection Report", note: "Every payment on an O.R. range, totalled by nature.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("daily") } },
        { title: "Annual Financial Performance Report", note: "Billed vs. collected, Jan-Dec, for one calendar year.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("annual-performance") } },
        { title: "Annual Collection Report", note: "Collections and billing logs by barangay, cluster, classification, senior status and fee component.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("annual-collection") } },
        { title: "O.R. Accountability Report", note: "Booklets on issue, skipped or duplicate numbers, and receipts no booklet covers.", icon: IconReceipt, action: { kind: "dialog", open: () => setDialog("or-accountability") } },
      ],
    },
    {
      title: "On Going Reports",
      icon: IconTrendUp,
      reports: [
        { title: "Abstract of Monthly Collection", note: "Water bills, fees and totals for the last 12 months.", icon: IconCalendarBars, action: { kind: "dialog", open: () => window.open("/reports/abstract-monthly-collection/print", "_blank") } },
        { title: "Monthly Consumption Report", note: "Cu.m. billed by barangay, cluster, classification and senior/PWD status.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("consumption") } },
      ],
    },
    {
      title: "Billing Reports",
      icon: IconInvoice,
      reports: [
        { title: "Monthly Billing Overview", note: "Billed vs. collected by classification, barangay, cluster, day and account, for one month.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("billing-overview-monthly") } },
        { title: "Annual Billing Overview", note: "The same billed vs. collected view, rolled up by month for a calendar year.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("billing-overview-annual") } },
        { title: "SCDS", note: "Connections applied vs. active, disconnections and reconnections, by zone and barangay.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("scds") } },
        { title: "Revenue From Consumption", note: "Billed volume and amount by classification, per barangay or per cluster.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("revenue-consumption") } },
        { title: "Accounts Receivable Summary", note: "Consumption and billed amount by barangay, grouped by water-system zone.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("accounts-receivable-summary") } },
        { title: "Report of Classification", note: "Consumption, amount and account count by classification, per barangay and cluster.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("report-of-classification") } },
        { title: "Reading List", note: "Every account in a barangay or cluster, with its last recorded reading, for the field.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("reading-list") } },
        { title: "Accounts Receivables", note: "Every unpaid bill for a barangay or cluster — all outstanding, one month, or one year.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("accounts-receivables") } },
        { title: "Monthly Adjusted Bills", note: "Bill-adjustment requests raised, completed and still open for one month.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("adjusted-bills") } },
        { title: "Modified Bills Report", note: "An audit of every bill edited in one month — who changed what, and what needs review.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("bill-edits") } },
      ],
    },
    {
      title: "Account Management Reports",
      icon: IconUsers,
      reports: [
        { title: "Latest Consumer Status", note: "Active vs. disconnected accounts by classification, per barangay or per cluster.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("consumer-status") } },
        { title: "Monthly Connection Report", note: "New service connections for one month — trend, forecast, and where they are.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("monthly-connections") } },
        { title: "Annual Connection Report", note: "New service connections for a calendar year — monthly/quarterly spread, long-run growth.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("annual-connections") } },
      ],
    },
    {
      title: "Services Operations Reports",
      icon: IconWrench,
      reports: [
        { title: "Service Connection Statistics", note: "Application, installation, disconnection and transfer activity, by zone, barangay and classification.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("service-connection-stats") } },
      ],
    },
  ];

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Reports</h1>
          <p className="account-no">Every report the office runs, in one place.</p>
        </div>
      </div>

      {CATEGORIES.map((cat) => (
        <div className="reports-category" key={cat.title}>
          <div className="reports-category-head">
            <cat.icon size={20} />
            <h2>{cat.title}</h2>
          </div>
          <div className="reports-grid">
            {cat.reports.map((r) => {
              const soon = r.action.kind === "soon";
              const Icon = r.icon ?? cat.icon;
              return (
                <button
                  key={r.title}
                  className={soon ? "report-card disabled" : "report-card"}
                  onClick={() => !soon && r.action.kind === "dialog" && r.action.open()}
                  disabled={soon}
                >
                  <span className="report-card-icon"><Icon size={18} /></span>
                  <span className="report-card-title">{r.title}</span>
                  {r.note && <span className="report-card-note">{r.note}</span>}
                  {soon && <span className="report-card-soon">Coming soon</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {dialog === "daily" && <DailyReportDialog onClose={() => setDialog(null)} />}
      {dialog === "consumption" && (
        <YearReportDialog
          title="Monthly Consumption Report"
          blurb="Consumption for the whole billing year, by barangay, cluster, classification and senior/PWD status."
          printPath="/reports/monthly-consumption/print"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "annual-performance" && (
        <YearReportDialog
          title="Annual Financial Performance Report"
          blurb="Billed vs. collected water bills and fees, Jan-Dec, for one calendar year."
          printPath="/reports/annual-financial-performance/print"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "annual-collection" && (
        <YearReportDialog
          title="Annual Collection Report"
          blurb="Collections and billing logs by barangay, cluster, classification, senior status and fee component, for one calendar year. This is a large report — it can take a moment to build."
          printPath="/reports/annual-collection/print"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "or-accountability" && (
        <ORAccountabilityDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "billing-overview-monthly" && (
        <MonthlyBillingOverviewDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "billing-overview-annual" && (
        <YearReportDialog
          title="Annual Billing Overview"
          blurb="Billed vs. collected, rolled up by month, for one calendar year."
          printPath="/reports/billing-overview/annual/print"
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "scds" && (
        <SCDSDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "revenue-consumption" && (
        <RevenueFromConsumptionDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "accounts-receivable-summary" && (
        <AccountsReceivableSummaryDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "report-of-classification" && (
        <ReportOfClassificationDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "reading-list" && (
        <ReadingListDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "accounts-receivables" && (
        <AccountsReceivablesDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "adjusted-bills" && (
        <AdjustedBillsReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "bill-edits" && (
        <BillEditReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "consumer-status" && (
        <LatestConsumerStatusDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "monthly-connections" && (
        <ConnectionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "annual-connections" && (
        <AnnualConnectionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "service-connection-stats" && (
        <ServiceConnectionStatsDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
