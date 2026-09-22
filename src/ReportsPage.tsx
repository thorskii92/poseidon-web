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
import PaymentTimingReportDialog from "./PaymentTimingReportDialog";
import CollectionEfficiencyMainDialog from "./CollectionEfficiencyMainDialog";
import DisconnectionTurnaroundDialog from "./DisconnectionTurnaroundDialog";
import NewConnectionTurnaroundDialog from "./NewConnectionTurnaroundDialog";
import ZeroConsumptionDialog from "./ZeroConsumptionDialog";
import TempClosureTurnaroundDialog from "./TempClosureTurnaroundDialog";
import MeterReplacementReportDialog from "./MeterReplacementReportDialog";
import TransferActivityReportDialog from "./TransferActivityReportDialog";
import MainMonthlyCollectionDialog from "./MainMonthlyCollectionDialog";
import CollectionByNatureDialog from "./CollectionByNatureDialog";
import PenaltyCollectionDialog from "./PenaltyCollectionDialog";
import MainSeniorDiscountDialog from "./MainSeniorDiscountDialog";
import ChannelSummaryDialog from "./ChannelSummaryDialog";
import CollectorAccountabilityDialog from "./CollectorAccountabilityDialog";
import ConsumptionBracketsDialog from "./ConsumptionBracketsDialog";
import BillingCompletenessDialog from "./BillingCompletenessDialog";
import EnvironmentalFeeDialog from "./EnvironmentalFeeDialog";
import ConsumptionTrendDialog from "./ConsumptionTrendDialog";
import FieldStaffActivityDialog from "./FieldStaffActivityDialog";
import AdjustmentProcessingDialog from "./AdjustmentProcessingDialog";
import JobOrderRegisterDialog from "./JobOrderRegisterDialog";
import JobOrderTurnaroundDialog from "./JobOrderTurnaroundDialog";
import JobOrderCompletionDetailDialog from "./JobOrderCompletionDetailDialog";
import { IconClock, IconIdCard, IconListOrdered } from "./NavIcons";
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
  const [dialog, setDialog] = useState<"daily" | "consumption" | "annual-performance" | "annual-collection" | "or-accountability" | "billing-overview-monthly" | "billing-overview-annual" | "scds" | "revenue-consumption" | "accounts-receivable-summary" | "report-of-classification" | "reading-list" | "accounts-receivables" | "adjusted-bills" | "bill-edits" | "consumer-status" | "monthly-connections" | "annual-connections" | "service-connection-stats" | "payment-timing" | "collection-efficiency" | "disconnection-turnaround" | "connection-turnaround" | "zero-consumption" | "temp-closure-turnaround" | "meter-replacement" | "transfer-activity" |
    "main-monthly-collection" | "collection-by-nature" | "penalty-collection" | "main-senior-discount" | "channel-summary" | "collector-accountability" |
    "consumption-brackets" | "billing-completeness" | "environmental-fee" | "consumption-trend" |
    "field-staff-activity" | "adjustment-processing" | "job-order-register" | "job-order-turnaround" | "job-order-completion-detail" | null
  >(null);

  const CATEGORIES: Category[] = [
    {
      title: "Collection Reports",
      icon: IconReceipt,
      reports: [
        { title: "Daily Collection Report", note: "Every payment on an O.R. range, totalled by nature.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("daily") } },
        { title: "Annual Financial Performance Report", note: "Billed vs. collected, Jan-Dec, for one calendar year.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("annual-performance") } },
        { title: "Annual Collection Report", note: "Collections and billing logs by barangay, cluster, classification, senior status and fee component.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("annual-collection") } },
        { title: "O.R. Accountability Report", note: "Booklets on issue, skipped or duplicate numbers, and receipts no booklet covers.", icon: IconReceipt, action: { kind: "dialog", open: () => setDialog("or-accountability") } },
        { title: "Payment Timing Report", note: "How long consumers take to pay over the counter, and how close to the due date, by barangay, classification and water system.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("payment-timing") } },
        { title: "Collection Efficiency Report", note: "Billed vs. collected for the month, and how much of it came from the counter vs. ECPay, by barangay, water system, classification and cluster.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("collection-efficiency") } },
        { title: "Monthly Collection Report", note: "Over-the-counter water bill collections for one month — daily/weekday trends, the six-month trend, and breakdowns by barangay, water system and classification.", icon: IconCalendarBars, action: { kind: "dialog", open: () => setDialog("main-monthly-collection") } },
        { title: "Collection by Payment Nature Report", note: "What was collected for — Water Bill, Application Fee, Reconnection Fee, and the rest — by barangay and classification.", icon: IconReceipt, action: { kind: "dialog", open: () => setDialog("collection-by-nature") } },
        { title: "Penalty & Surcharge Collection Report", note: "How much penalty revenue was collected on water bills, and what share of collections it made up, by barangay and classification.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("penalty-collection") } },
        { title: "Senior/PWD Discount Collection Report", note: "Discounts granted on over-the-counter receipts, reconciled against the gross billed amount, including missing senior IDs.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("main-senior-discount") } },
        { title: "Online vs Counter Collection Summary", note: "How much of everything collected came through ECPay versus the counter, by barangay and classification.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("channel-summary") } },
        { title: "Collector Accountability Report", note: "Who receipted how much over the counter, and how many receipts each collector handled.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("collector-accountability") } },
        { title: "Long-Outstanding Accounts Report", note: "Which accounts are chronically unpaid, how much is owed, and where — a live snapshot.", icon: IconInvoice, action: { kind: "dialog", open: () => window.open("/reports/long-outstanding/print", "_blank") } },
        { title: "Abstract of Monthly Collection", note: "Water bills, fees and totals for the last 12 months.", icon: IconCalendarBars, action: { kind: "dialog", open: () => window.open("/reports/abstract-monthly-collection/print", "_blank") } },
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
        { title: "Consumption Bracket Analysis Report", note: "How many bills fall into each consumption range, and revenue by bracket — a rate-setting lens, by classification and barangay.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("consumption-brackets") } },
        { title: "Billing Generation Completeness Report", note: "Whether every billable account actually got billed for the month, with the list of accounts that were missed.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("billing-completeness") } },
        { title: "Environmental Fee Report", note: "How much environmental fee was billed, and what share of total billing it made up, by barangay and classification.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("environmental-fee") } },
        { title: "Average Consumption Trend Report", note: "The six-month trailing trend in average consumption per bill — demand and infrastructure planning.", icon: IconTrendUp, action: { kind: "dialog", open: () => setDialog("consumption-trend") } },
      ],
    },
    {
      title: "Account Management Reports",
      icon: IconUsers,
      reports: [
        { title: "Latest Consumer Status", note: "Active vs. disconnected accounts by classification, per barangay or per cluster.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("consumer-status") } },
        { title: "Monthly Connection Report", note: "New service connections for one month — trend, forecast, and where they are.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("monthly-connections") } },
        { title: "Annual Connection Report", note: "New service connections for a calendar year — monthly/quarterly spread, long-run growth.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("annual-connections") } },
        { title: "Account Status Census", note: "Every account by its actual status — Connected, Disconnected, and the in-progress statuses in between — by barangay, water system and classification.", icon: IconUsers, action: { kind: "dialog", open: () => window.open("/reports/account-status-census/print", "_blank") } },
        { title: "Zero-Consumption Accounts Report", note: "Accounts billed at 0 m³ for a chosen month, and which have read zero for three months running — a field-check flag.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("zero-consumption") } },
        { title: "Senior Citizen Accounts Report", note: "The roster of senior/PWD-discounted accounts, including which ones have no senior ID on file.", icon: IconUsers, action: { kind: "dialog", open: () => window.open("/reports/senior-accounts/print", "_blank") } },
        { title: "Account Tenure Report", note: "How long accounts have been connected, bucketed — infrastructure and asset-age planning.", icon: IconClock, action: { kind: "dialog", open: () => window.open("/reports/account-tenure/print", "_blank") } },
      ],
    },
    {
      title: "Services Operations Reports",
      icon: IconWrench,
      reports: [
        { title: "Service Connection Statistics", note: "Application, installation, disconnection and transfer activity, by zone, barangay and classification.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("service-connection-stats") } },
        { title: "Disconnection & Reconnection Turnaround Report", note: "How many days disconnected accounts wait to be reconnected, and which ones still are, by barangay, water system and classification.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("disconnection-turnaround") } },
        { title: "New Service Connection Turnaround Report", note: "How many days applications wait to be installed, and which ones are still pending, by barangay, water system and classification.", icon: IconUsers, action: { kind: "dialog", open: () => setDialog("connection-turnaround") } },
        { title: "Temporary Closure Turnaround Report", note: "How many days temporarily-closed accounts wait to be reconnected, and which ones still are.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("temp-closure-turnaround") } },
        { title: "Meter Replacement Report", note: "Meter replacements requested, how fast they were completed, and which are still pending, by barangay and classification.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("meter-replacement") } },
        { title: "Transfer Activity Report", note: "Meter and owner transfer requests filed, how fast they were completed, and which are still pending, by type and barangay.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("transfer-activity") } },
        { title: "Service Request Backlog", note: "Every account currently waiting on installation, reconnection, a transfer, a meter swap, or a temporary closure — and for how long.", icon: IconClock, action: { kind: "dialog", open: () => window.open("/reports/service-backlog/print", "_blank") } },
        { title: "Monthly Consumption Report", note: "Cu.m. billed by barangay, cluster, classification and senior/PWD status.", icon: IconDroplet, action: { kind: "dialog", open: () => setDialog("consumption") } },
      ],
    },
    {
      title: "Staff Activity Reports",
      icon: IconIdCard,
      reports: [
        { title: "Field Staff Activity Report", note: "Account actions logged for one month — installations, (re)connections, closures, transfers and meter work — by staff member and action type.", icon: IconIdCard, action: { kind: "dialog", open: () => setDialog("field-staff-activity") } },
        { title: "Bill Adjustment Processing Report", note: "Who requested, processed and completed bill-adjustment requests in one month, and how long it took.", icon: IconInvoice, action: { kind: "dialog", open: () => setDialog("adjustment-processing") } },
        { title: "User Roster & Access Report", note: "Every system user account, active or not, by position — a live snapshot.", icon: IconUsers, action: { kind: "dialog", open: () => window.open("/reports/user-roster/print", "_blank") } },
      ],
    },
    {
      title: "Job Orders Reports",
      icon: IconListOrdered,
      reports: [
        { title: "Job Order Register", note: "Every job order issued for one month — installation, reconnection, meter transfer, meter replacement, inspection and closure orders — by type, status and preparer.", icon: IconListOrdered, action: { kind: "dialog", open: () => setDialog("job-order-register") } },
        { title: "Job Order Turnaround Report", note: "How many days job orders take from issue to completion, by type, and which are still open.", icon: IconClock, action: { kind: "dialog", open: () => setDialog("job-order-turnaround") } },
        { title: "Job Order Completion Detail Report", note: "Field results for completed job orders — meter and standpipe readings, materials used and findings, by who completed them.", icon: IconWrench, action: { kind: "dialog", open: () => setDialog("job-order-completion-detail") } },
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
      {dialog === "payment-timing" && (
        <PaymentTimingReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "collection-efficiency" && (
        <CollectionEfficiencyMainDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "disconnection-turnaround" && (
        <DisconnectionTurnaroundDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "connection-turnaround" && (
        <NewConnectionTurnaroundDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "zero-consumption" && (
        <ZeroConsumptionDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "temp-closure-turnaround" && (
        <TempClosureTurnaroundDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "meter-replacement" && (
        <MeterReplacementReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "transfer-activity" && (
        <TransferActivityReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "main-monthly-collection" && (
        <MainMonthlyCollectionDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "collection-by-nature" && (
        <CollectionByNatureDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "penalty-collection" && (
        <PenaltyCollectionDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "main-senior-discount" && (
        <MainSeniorDiscountDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "channel-summary" && (
        <ChannelSummaryDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "collector-accountability" && (
        <CollectorAccountabilityDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "consumption-brackets" && (
        <ConsumptionBracketsDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "billing-completeness" && (
        <BillingCompletenessDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "environmental-fee" && (
        <EnvironmentalFeeDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "consumption-trend" && (
        <ConsumptionTrendDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "field-staff-activity" && (
        <FieldStaffActivityDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "adjustment-processing" && (
        <AdjustmentProcessingDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "job-order-register" && (
        <JobOrderRegisterDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "job-order-turnaround" && (
        <JobOrderTurnaroundDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "job-order-completion-detail" && (
        <JobOrderCompletionDetailDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
