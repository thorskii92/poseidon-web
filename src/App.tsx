import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import AccountsPage from "./AccountsPage";
import AccountDetail from "./AccountDetail";
import NewApplication from "./NewApplication";
import BillingPage from "./BillingPage";
import ReadingPage from "./ReadingPage";
import BillPrint from "./BillPrint";
import CollectionPage from "./CollectionPage";
import SettingsPage from "./SettingsPage";
import DisconnectionPage from "./DisconnectionPage";
import PendingPage from "./PendingPage";
import DisconnectionPrint from "./DisconnectionPrint";
import ReceiptPrint from "./ReceiptPrint";
import SoaPrint from "./SoaPrint";
import TransactionsPrint from "./TransactionsPrint";
import AdjustmentsPage from "./AdjustmentsPage";
import ApprovalsPage from "./ApprovalsPage";
import ReceiptsManagerPage from "./ReceiptsManagerPage";
import DailyCollectionPrint from "./DailyCollectionPrint";
import ECPayDailyCollectionReportPrint from "./ECPayDailyCollectionReportPrint";
import JobOrdersPage from "./JobOrdersPage";
import JobOrderPrint from "./JobOrderPrint";
import AdjustmentPrint from "./AdjustmentPrint";
import LoginPage from "./LoginPage";
import ECPayPage from "./ECPayPage";
import UserManagementPage from "./UserManagementPage";
import DashboardPage from "./DashboardPage";
import ReportsPage from "./ReportsPage";
import AbstractMonthlyCollectionPrint from "./AbstractMonthlyCollectionPrint";
import MonthlyConsumptionPrint from "./MonthlyConsumptionPrint";
import AnnualFinancialPerformancePrint from "./AnnualFinancialPerformancePrint";
import AnnualCollectionPrint from "./AnnualCollectionPrint";
import ORAccountabilityPrint from "./ORAccountabilityPrint";
import MonthlyBillingOverviewPrint from "./MonthlyBillingOverviewPrint";
import AnnualBillingOverviewPrint from "./AnnualBillingOverviewPrint";
import SCDSPrint from "./SCDSPrint";
import RevenueFromConsumptionPrint from "./RevenueFromConsumptionPrint";
import RevenueFromConsumptionClusterPrint from "./RevenueFromConsumptionClusterPrint";
import AccountsReceivableSummaryPrint from "./AccountsReceivableSummaryPrint";
import ReportOfClassificationPrint from "./ReportOfClassificationPrint";
import ReadingListPrint from "./ReadingListPrint";
import AccountsReceivablesPrint from "./AccountsReceivablesPrint";
import AdjustedBillsReportPrint from "./AdjustedBillsReportPrint";
import BillEditReportPrint from "./BillEditReportPrint";
import LatestConsumerStatusPrint from "./LatestConsumerStatusPrint";
import ConnectionReportPrint from "./ConnectionReportPrint";
import AnnualConnectionReportPrint from "./AnnualConnectionReportPrint";
import ServiceConnectionStatsPrint from "./ServiceConnectionStatsPrint";
import ForcedPasswordChangeScreen from "./ForcedPasswordChangeScreen";
import { useAuth } from "./AuthContext";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="login-screen">
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (user.mustChangePassword) {
    return <ForcedPasswordChangeScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/bills/print" element={<BillPrint />} />
        <Route path="/collection/receipt" element={<ReceiptPrint />} />
        <Route path="/disconnection/print" element={<DisconnectionPrint />} />
        <Route path="/accounts/:id/soa" element={<SoaPrint />} />
        <Route
          path="/accounts/:id/transactions"
          element={<TransactionsPrint />}
        />
        <Route path="/adjustments/:adjID/print" element={<AdjustmentPrint />} />
        <Route
          path="/receipts/daily-collection/print"
          element={<DailyCollectionPrint />}
        />
        <Route
          path="/ecpay/reports/daily-collection/print"
          element={<ECPayDailyCollectionReportPrint />}
        />
        <Route path="/joborders/:joId/print" element={<JobOrderPrint />} />
        <Route
          path="/reports/abstract-monthly-collection/print"
          element={<AbstractMonthlyCollectionPrint />}
        />
        <Route
          path="/reports/monthly-consumption/print"
          element={<MonthlyConsumptionPrint />}
        />
        <Route
          path="/reports/annual-financial-performance/print"
          element={<AnnualFinancialPerformancePrint />}
        />
        <Route
          path="/reports/annual-collection/print"
          element={<AnnualCollectionPrint />}
        />
        <Route
          path="/reports/or-accountability/print"
          element={<ORAccountabilityPrint />}
        />
        <Route
          path="/reports/billing-overview/monthly/print"
          element={<MonthlyBillingOverviewPrint />}
        />
        <Route
          path="/reports/billing-overview/annual/print"
          element={<AnnualBillingOverviewPrint />}
        />
        <Route
          path="/reports/scds/print"
          element={<SCDSPrint />}
        />
        <Route
          path="/reports/revenue-consumption/by-barangay/print"
          element={<RevenueFromConsumptionPrint />}
        />
        <Route
          path="/reports/revenue-consumption/by-cluster/print"
          element={<RevenueFromConsumptionClusterPrint />}
        />
        <Route
          path="/reports/accounts-receivable-summary/print"
          element={<AccountsReceivableSummaryPrint />}
        />
        <Route
          path="/reports/report-of-classification/print"
          element={<ReportOfClassificationPrint />}
        />
        <Route
          path="/reports/reading-list/print"
          element={<ReadingListPrint />}
        />
        <Route
          path="/reports/accounts-receivables/print"
          element={<AccountsReceivablesPrint />}
        />
        <Route
          path="/reports/adjusted-bills/print"
          element={<AdjustedBillsReportPrint />}
        />
        <Route
          path="/reports/bill-edits/print"
          element={<BillEditReportPrint />}
        />
        <Route
          path="/reports/consumer-status/print"
          element={<LatestConsumerStatusPrint />}
        />
        <Route
          path="/reports/monthly-connections/print"
          element={<ConnectionReportPrint />}
        />
        <Route
          path="/reports/annual-connections/print"
          element={<AnnualConnectionReportPrint />}
        />
        <Route
          path="/reports/service-connection-stats/print"
          element={<ServiceConnectionStatsPrint />}
        />
        <Route
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/accounts" element={<AccountsPage />} />
                <Route path="/accounts/new" element={<NewApplication />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/reading" element={<ReadingPage />} />
                <Route path="/collection" element={<CollectionPage />} />
                <Route path="/pendings" element={<PendingPage />} />
                <Route path="/joborders" element={<JobOrdersPage />} />
                <Route path="/adjustments" element={<AdjustmentsPage />} />
                <Route path="/receipts" element={<ReceiptsManagerPage />} />
                <Route path="/disconnection" element={<DisconnectionPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
                <Route path="/ecpay" element={<ECPayPage />} />
                <Route path="/users" element={<UserManagementPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
