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
import ECPayMonthlyCollectionReportPrint from "./ECPayMonthlyCollectionReportPrint";
import ECPayAnnualCollectionReportPrint from "./ECPayAnnualCollectionReportPrint";
import CollectionEfficiencyReportPrint from "./CollectionEfficiencyReportPrint";
import ECPayAdoptionReportPrint from "./ECPayAdoptionReportPrint";
import ECPayPaymentTimingReportPrint from "./ECPayPaymentTimingReportPrint";
import ECPaySeniorDiscountReportPrint from "./ECPaySeniorDiscountReportPrint";
import JobOrdersPage from "./JobOrdersPage";
import JobOrderPrint from "./JobOrderPrint";
import AdjustmentPrint from "./AdjustmentPrint";
import LoginPage from "./LoginPage";
import ECPayPage from "./ECPayPage";
import UserManagementPage from "./UserManagementPage";
import DashboardPage from "./DashboardPage";
import ReportsPage from "./ReportsPage";
import SyncPage from "./SyncPage";
import SyncConflictsPage from "./SyncConflictsPage";
import AbstractMonthlyCollectionPrint from "./AbstractMonthlyCollectionPrint";
import MonthlyConsumptionPrint from "./MonthlyConsumptionPrint";
import AnnualFinancialPerformancePrint from "./AnnualFinancialPerformancePrint";
import AnnualCollectionPrint from "./AnnualCollectionPrint";
import ORAccountabilityPrint from "./ORAccountabilityPrint";
import PaymentTimingReportPrint from "./PaymentTimingReportPrint";
import CollectionEfficiencyMainPrint from "./CollectionEfficiencyMainPrint";
import ServiceTurnaroundPrint from "./ServiceTurnaroundPrint";
import AccountStatusCensusPrint from "./AccountStatusCensusPrint";
import ZeroConsumptionPrint from "./ZeroConsumptionPrint";
import SeniorAccountsPrint from "./SeniorAccountsPrint";
import AccountTenurePrint from "./AccountTenurePrint";
import MeterReplacementReportPrint from "./MeterReplacementReportPrint";
import TransferActivityReportPrint from "./TransferActivityReportPrint";
import ServiceBacklogPrint from "./ServiceBacklogPrint";
import MainMonthlyCollectionPrint from "./MainMonthlyCollectionPrint";
import CollectionByNaturePrint from "./CollectionByNaturePrint";
import PenaltyCollectionPrint from "./PenaltyCollectionPrint";
import MainSeniorDiscountPrint from "./MainSeniorDiscountPrint";
import ChannelSummaryPrint from "./ChannelSummaryPrint";
import CollectorAccountabilityPrint from "./CollectorAccountabilityPrint";
import LongOutstandingPrint from "./LongOutstandingPrint";
import ConsumptionBracketsPrint from "./ConsumptionBracketsPrint";
import BillingCompletenessPrint from "./BillingCompletenessPrint";
import EnvironmentalFeePrint from "./EnvironmentalFeePrint";
import ConsumptionTrendPrint from "./ConsumptionTrendPrint";
import FieldStaffActivityPrint from "./FieldStaffActivityPrint";
import AdjustmentProcessingPrint from "./AdjustmentProcessingPrint";
import UserRosterPrint from "./UserRosterPrint";
import JobOrderRegisterPrint from "./JobOrderRegisterPrint";
import JobOrderTurnaroundPrint from "./JobOrderTurnaroundPrint";
import JobOrderCompletionDetailPrint from "./JobOrderCompletionDetailPrint";
import IPAllocationPrint from "./IPAllocationPrint";
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
import { useEffect } from "react";
import { apiGet } from "./api";

export default function App() {
  const { user, loading } = useAuth();

  // The browser tab title is static in index.html ("POSEIDON" — shared by
  // both a main and a satellite build), so it's set here instead, once,
  // regardless of sign-in state — same unauthenticated check the login
  // screen and sidebar already use to brand themselves.
  useEffect(() => {
    apiGet<{ isSatellite: boolean }>("/api/deployment")
      .then((d) => { document.title = d.isSatellite ? "OSCARS" : "POSEIDON"; })
      .catch(() => {});
  }, []);

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
        <Route
          path="/ecpay/reports/monthly-collection/print"
          element={<ECPayMonthlyCollectionReportPrint />}
        />
        <Route
          path="/ecpay/reports/annual-collection/print"
          element={<ECPayAnnualCollectionReportPrint />}
        />
        <Route
          path="/ecpay/reports/collection-efficiency/print"
          element={<CollectionEfficiencyReportPrint />}
        />
        <Route
          path="/ecpay/reports/adoption/print"
          element={<ECPayAdoptionReportPrint />}
        />
        <Route
          path="/ecpay/reports/payment-timing/print"
          element={<ECPayPaymentTimingReportPrint />}
        />
        <Route
          path="/ecpay/reports/senior-discount/print"
          element={<ECPaySeniorDiscountReportPrint />}
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
          path="/reports/payment-timing/print"
          element={<PaymentTimingReportPrint />}
        />
        <Route
          path="/reports/collection-efficiency/print"
          element={<CollectionEfficiencyMainPrint />}
        />
        <Route
          path="/reports/service-turnaround/print"
          element={<ServiceTurnaroundPrint />}
        />
        <Route
          path="/reports/account-status-census/print"
          element={<AccountStatusCensusPrint />}
        />
        <Route
          path="/reports/zero-consumption/print"
          element={<ZeroConsumptionPrint />}
        />
        <Route
          path="/reports/senior-accounts/print"
          element={<SeniorAccountsPrint />}
        />
        <Route
          path="/reports/account-tenure/print"
          element={<AccountTenurePrint />}
        />
        <Route
          path="/reports/meter-replacement/print"
          element={<MeterReplacementReportPrint />}
        />
        <Route
          path="/reports/transfer-activity/print"
          element={<TransferActivityReportPrint />}
        />
        <Route
          path="/reports/service-backlog/print"
          element={<ServiceBacklogPrint />}
        />
        <Route
          path="/reports/main-monthly-collection/print"
          element={<MainMonthlyCollectionPrint />}
        />
        <Route
          path="/reports/collection-by-nature/print"
          element={<CollectionByNaturePrint />}
        />
        <Route
          path="/reports/penalty-collection/print"
          element={<PenaltyCollectionPrint />}
        />
        <Route
          path="/reports/main-senior-discount/print"
          element={<MainSeniorDiscountPrint />}
        />
        <Route
          path="/reports/channel-summary/print"
          element={<ChannelSummaryPrint />}
        />
        <Route
          path="/reports/collector-accountability/print"
          element={<CollectorAccountabilityPrint />}
        />
        <Route
          path="/reports/long-outstanding/print"
          element={<LongOutstandingPrint />}
        />
        <Route
          path="/reports/consumption-brackets/print"
          element={<ConsumptionBracketsPrint />}
        />
        <Route
          path="/reports/billing-completeness/print"
          element={<BillingCompletenessPrint />}
        />
        <Route
          path="/reports/environmental-fee/print"
          element={<EnvironmentalFeePrint />}
        />
        <Route
          path="/reports/consumption-trend/print"
          element={<ConsumptionTrendPrint />}
        />
        <Route
          path="/reports/field-staff-activity/print"
          element={<FieldStaffActivityPrint />}
        />
        <Route
          path="/reports/adjustment-processing/print"
          element={<AdjustmentProcessingPrint />}
        />
        <Route
          path="/reports/user-roster/print"
          element={<UserRosterPrint />}
        />
        <Route
          path="/reports/job-order-register/print"
          element={<JobOrderRegisterPrint />}
        />
        <Route
          path="/reports/job-order-turnaround/print"
          element={<JobOrderTurnaroundPrint />}
        />
        <Route
          path="/reports/job-order-completion-detail/print"
          element={<JobOrderCompletionDetailPrint />}
        />
        <Route
          path="/reports/ip-allocation/print"
          element={<IPAllocationPrint />}
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
                <Route path="/sync" element={<SyncPage />} />
                <Route path="/sync-conflicts" element={<SyncConflictsPage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
