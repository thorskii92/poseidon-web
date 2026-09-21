import { useState } from "react";
import ECPayDailyCollectionReportDialog from "./ECPayDailyCollectionReportDialog";
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
  const [dialog, setDialog] = useState<"daily" | null>(null);

  const REPORTS: Report[] = [
    {
      title: "ECPay Daily Collection Report",
      note: "Every ECPay transaction on one date — by branch, hour, classification, barangay, zone, and O.R. accountability.",
      action: { kind: "dialog", open: () => setDialog("daily") },
    },
    { title: "ECPay Monthly Collection Report", note: "", action: { kind: "soon" } },
    { title: "ECPay Annual Collection Report", note: "", action: { kind: "soon" } },
    { title: "Collection Efficiency Report", note: "", action: { kind: "soon" } },
    { title: "ECPay Adoption Report", note: "", action: { kind: "soon" } },
    { title: "ECPay Payment Timing Report", note: "", action: { kind: "soon" } },
    { title: "Senior Discount Report", note: "", action: { kind: "soon" } },
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
    </div>
  );
}
