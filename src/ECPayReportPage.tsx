import { useState } from "react";
import ECPayDailyCollectionReportDialog from "./ECPayDailyCollectionReportDialog";
import ECPayMonthlyCollectionReportDialog from "./ECPayMonthlyCollectionReportDialog";
import ECPayAnnualCollectionReportDialog from "./ECPayAnnualCollectionReportDialog";
import CollectionEfficiencyReportDialog from "./CollectionEfficiencyReportDialog";
import ECPayAdoptionReportDialog from "./ECPayAdoptionReportDialog";
import ECPayPaymentTimingReportDialog from "./ECPayPaymentTimingReportDialog";
import ECPaySeniorDiscountReportDialog from "./ECPaySeniorDiscountReportDialog";
import { IconReceipt, IconCalendarBars } from "./ReportIcons";

/**
 * ECPay Report — ported from frmECPayReportMenu's seven buttons. Only Daily
 * Collection Report has real source behind it so far; the rest stay
 * "Coming soon" tiles, same pattern the main Reports page uses for anything
 * not yet built.
 */

type ReportAction = { kind: "dialog"; open: () => void } | { kind: "soon" };
type Report = { title: string; note: string; action: ReportAction };

export default function ECPayReportPage() {
  const [dialog, setDialog] = useState<
    "daily" | "monthly" | "annual" | "efficiency" | "adoption" | "timing" | "senior" | null
  >(null);

  const REPORTS: Report[] = [
    {
      title: "ECPay Daily Collection Report",
      note: "Every ECPay transaction on one date — by branch, hour, classification, barangay, zone, and O.R. accountability.",
      action: { kind: "dialog", open: () => setDialog("daily") },
    },
    {
      title: "ECPay Monthly Collection Report",
      note: "The month's ECPay collections — daily and weekday trends, branch/classification/barangay/cluster/zone breakdowns, bill-period ageing, and the six-month trend.",
      action: { kind: "dialog", open: () => setDialog("monthly") },
    },
    {
      title: "ECPay Annual Collection Report",
      note: "The full calendar year's ECPay collections — monthly/quarterly trends, branch/classification/barangay/cluster/zone breakdowns, bill-period ageing, O.R. booklets, and the highest-paying accounts.",
      action: { kind: "dialog", open: () => setDialog("annual") },
    },
    {
      title: "Collection Efficiency Report",
      note: "What was billed for the month against what's been collected so far, by barangay, water system, classification, and cluster.",
      action: { kind: "dialog", open: () => setDialog("efficiency") },
    },
    {
      title: "ECPay Adoption Report",
      note: "Who is actually using ECPay — new, returning, and lapsed users, a 13-month trend, and where this month's users are.",
      action: { kind: "dialog", open: () => setDialog("adoption") },
    },
    {
      title: "ECPay Payment Timing Report",
      note: "How long consumers take to pay after the bill is issued, and how close to the due date, by barangay, classification, water system, and branch.",
      action: { kind: "dialog", open: () => setDialog("timing") },
    },
    {
      title: "ECPay Senior Discount Report",
      note: "Senior citizen discounts granted on bills settled through ECPay, reconciled against the gross amount due, by barangay and bill period.",
      action: { kind: "dialog", open: () => setDialog("senior") },
    },
  ];

  return (
    <div>
      <div className="reports-category">
        <div className="reports-category-head">
          <IconReceipt size={20} />
          <h2>ECPay Reports</h2>
        </div>
        <div className="reports-grid">
          {REPORTS.map((r) => {
            const soon = r.action.kind === "soon";
            return (
              <button
                key={r.title}
                className={soon ? "report-card disabled" : "report-card"}
                onClick={() => !soon && r.action.kind === "dialog" && r.action.open()}
                disabled={soon}
              >
                <span className="report-card-icon"><IconCalendarBars size={18} /></span>
                <span className="report-card-title">{r.title}</span>
                {r.note && <span className="report-card-note">{r.note}</span>}
                {soon && <span className="report-card-soon">Coming soon</span>}
              </button>
            );
          })}
        </div>
      </div>

      {dialog === "daily" && (
        <ECPayDailyCollectionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "monthly" && (
        <ECPayMonthlyCollectionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "annual" && (
        <ECPayAnnualCollectionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "efficiency" && (
        <CollectionEfficiencyReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "adoption" && (
        <ECPayAdoptionReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "timing" && (
        <ECPayPaymentTimingReportDialog onClose={() => setDialog(null)} />
      )}
      {dialog === "senior" && (
        <ECPaySeniorDiscountReportDialog onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
