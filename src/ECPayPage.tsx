import { useState } from "react";
import ECPayDashboardPage from "./ECPayDashboardPage";
import ECPayPaymentPage from "./ECPayPaymentPage";
import ECPayReportPage from "./ECPayReportPage";

/** ECPay — ported from frmECPayMenu's three buttons. */

type Tab = "dashboard" | "payment" | "report";

const TABS: { key: Tab; label: string }[] = [
  { key: "dashboard", label: "Extract Payables" },
  { key: "payment", label: "Process Payment" },
  { key: "report", label: "ECPay Report" },
];

export default function ECPayPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>ECPay</h1>
          <p className="account-no">
            Online payments — extracting who can pay this period, and
            reconciling the channel's own report back into receipts.
          </p>
        </div>
      </div>

      <div className="stage-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "stage-tab current" : "stage-tab"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && <ECPayDashboardPage />}
      {tab === "payment" && <ECPayPaymentPage />}
      {tab === "report" && <ECPayReportPage />}
    </div>
  );
}
