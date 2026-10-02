import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./Layout";
import LoginPage from "./LoginPage";
import ForcedPasswordChangeScreen from "./ForcedPasswordChangeScreen";
import { useAuth } from "./AuthContext";
import { lazy, Suspense, useEffect } from "react";
import { apiGet } from "./api";

// Every page loads on first use (its own chunk), so opening the app downloads
// only the login, the layout and the page in front of you — not every report.
const AccountsPage = lazy(() => import("./AccountsPage"));
const AccountDetail = lazy(() => import("./AccountDetail"));
const NewApplication = lazy(() => import("./NewApplication"));
const BillingPage = lazy(() => import("./BillingPage"));
const ReadingPage = lazy(() => import("./ReadingPage"));
const BillPrint = lazy(() => import("./BillPrint"));
const CollectionPage = lazy(() => import("./CollectionPage"));
const SettingsPage = lazy(() => import("./SettingsPage"));
const DisconnectionPage = lazy(() => import("./DisconnectionPage"));
const PendingPage = lazy(() => import("./PendingPage"));
const DisconnectionPrint = lazy(() => import("./DisconnectionPrint"));
const ReceiptPrint = lazy(() => import("./ReceiptPrint"));
const SoaPrint = lazy(() => import("./SoaPrint"));
const TransactionsPrint = lazy(() => import("./TransactionsPrint"));
const AdjustmentsPage = lazy(() => import("./AdjustmentsPage"));
const ApprovalsPage = lazy(() => import("./ApprovalsPage"));
const ReceiptsManagerPage = lazy(() => import("./ReceiptsManagerPage"));
const DailyCollectionPrint = lazy(() => import("./DailyCollectionPrint"));
const CollectionsDepositReportPrint = lazy(() => import("./CollectionsDepositReportPrint"));
const ECPayDailyCollectionReportPrint = lazy(() => import("./ECPayDailyCollectionReportPrint"));
const ECPayMonthlyCollectionReportPrint = lazy(() => import("./ECPayMonthlyCollectionReportPrint"));
const ECPayAnnualCollectionReportPrint = lazy(() => import("./ECPayAnnualCollectionReportPrint"));
const CollectionEfficiencyReportPrint = lazy(() => import("./CollectionEfficiencyReportPrint"));
const ECPayAdoptionReportPrint = lazy(() => import("./ECPayAdoptionReportPrint"));
const ECPayPaymentTimingReportPrint = lazy(() => import("./ECPayPaymentTimingReportPrint"));
const ECPaySeniorDiscountReportPrint = lazy(() => import("./ECPaySeniorDiscountReportPrint"));
const JobOrdersPage = lazy(() => import("./JobOrdersPage"));
const JobOrderPrint = lazy(() => import("./JobOrderPrint"));
const AdjustmentPrint = lazy(() => import("./AdjustmentPrint"));
const ECPayPage = lazy(() => import("./ECPayPage"));
const UserManagementPage = lazy(() => import("./UserManagementPage"));
const DashboardPage = lazy(() => import("./DashboardPage"));
const ReportsPage = lazy(() => import("./ReportsPage"));
const SyncPage = lazy(() => import("./SyncPage"));
const SyncConflictsPage = lazy(() => import("./SyncConflictsPage"));
const ITDashboardPage = lazy(() => import("./ITDashboardPage"));
const IncidentsPage = lazy(() => import("./IncidentsPage"));
const NoticePrint = lazy(() => import("./NoticePrint"));
const InterruptionReportPrint = lazy(() => import("./InterruptionReportPrint"));
const InventoryPage = lazy(() => import("./InventoryPage"));
const ClusterManagerPage = lazy(() => import("./ClusterManagerPage"));
const MeterManagerPage = lazy(() => import("./MeterManagerPage"));
const SequencingPage = lazy(() => import("./SequencingPage"));
const GisMapPage = lazy(() => import("./GisMapPage"));
const ForecastPage = lazy(() => import("./ForecastPage"));
const ForecastPrint = lazy(() => import("./ForecastPrint"));
const NonRevenueWaterPage = lazy(() => import("./NonRevenueWaterPage"));
const NrwPrint = lazy(() => import("./NrwPrint"));
const IncidentRegisterPrint = lazy(() => import("./IncidentRegisterPrint"));
const IncidentResponsePrint = lazy(() => import("./IncidentResponsePrint"));
const MobileAdjustmentRequestsPrint = lazy(() => import("./MobileAdjustmentRequestsPrint"));
const MobileAppUsagePrint = lazy(() => import("./MobileAppUsagePrint"));
const InventoryReportPrint = lazy(() => import("./InventoryReportPrint"));
const InventoryFormPrint = lazy(() => import("./InventoryFormPrint"));
const ReaderExceptionsPrint = lazy(() => import("./ReaderReportsPrint").then((m) => ({ default: m.ReaderExceptionsPrint })));
const ReaderFieldReportPrint = lazy(() => import("./ReaderReportsPrint").then((m) => ({ default: m.ReaderFieldReportPrint })));
const AbstractMonthlyCollectionPrint = lazy(() => import("./AbstractMonthlyCollectionPrint"));
const MonthlyConsumptionPrint = lazy(() => import("./MonthlyConsumptionPrint"));
const AnnualFinancialPerformancePrint = lazy(() => import("./AnnualFinancialPerformancePrint"));
const AnnualCollectionPrint = lazy(() => import("./AnnualCollectionPrint"));
const ORAccountabilityPrint = lazy(() => import("./ORAccountabilityPrint"));
const PaymentTimingReportPrint = lazy(() => import("./PaymentTimingReportPrint"));
const CollectionEfficiencyMainPrint = lazy(() => import("./CollectionEfficiencyMainPrint"));
const ServiceTurnaroundPrint = lazy(() => import("./ServiceTurnaroundPrint"));
const AccountStatusCensusPrint = lazy(() => import("./AccountStatusCensusPrint"));
const ZeroConsumptionPrint = lazy(() => import("./ZeroConsumptionPrint"));
const SeniorAccountsPrint = lazy(() => import("./SeniorAccountsPrint"));
const AccountTenurePrint = lazy(() => import("./AccountTenurePrint"));
const MeterReplacementReportPrint = lazy(() => import("./MeterReplacementReportPrint"));
const TransferActivityReportPrint = lazy(() => import("./TransferActivityReportPrint"));
const ServiceBacklogPrint = lazy(() => import("./ServiceBacklogPrint"));
const MainMonthlyCollectionPrint = lazy(() => import("./MainMonthlyCollectionPrint"));
const CollectionByNaturePrint = lazy(() => import("./CollectionByNaturePrint"));
const PenaltyCollectionPrint = lazy(() => import("./PenaltyCollectionPrint"));
const MainSeniorDiscountPrint = lazy(() => import("./MainSeniorDiscountPrint"));
const ChannelSummaryPrint = lazy(() => import("./ChannelSummaryPrint"));
const FieldCollectionPrint = lazy(() => import("./FieldCollectionPrint"));
const CollectorAccountabilityPrint = lazy(() => import("./CollectorAccountabilityPrint"));
const LongOutstandingPrint = lazy(() => import("./LongOutstandingPrint"));
const ConsumptionBracketsPrint = lazy(() => import("./ConsumptionBracketsPrint"));
const BillingCompletenessPrint = lazy(() => import("./BillingCompletenessPrint"));
const EnvironmentalFeePrint = lazy(() => import("./EnvironmentalFeePrint"));
const ConsumptionTrendPrint = lazy(() => import("./ConsumptionTrendPrint"));
const FieldStaffActivityPrint = lazy(() => import("./FieldStaffActivityPrint"));
const AdjustmentProcessingPrint = lazy(() => import("./AdjustmentProcessingPrint"));
const UserRosterPrint = lazy(() => import("./UserRosterPrint"));
const JobOrderRegisterPrint = lazy(() => import("./JobOrderRegisterPrint"));
const JobOrderTurnaroundPrint = lazy(() => import("./JobOrderTurnaroundPrint"));
const JobOrderCompletionDetailPrint = lazy(() => import("./JobOrderCompletionDetailPrint"));
const IPAllocationPrint = lazy(() => import("./IPAllocationPrint"));
const MonthlyBillingOverviewPrint = lazy(() => import("./MonthlyBillingOverviewPrint"));
const AnnualBillingOverviewPrint = lazy(() => import("./AnnualBillingOverviewPrint"));
const SCDSPrint = lazy(() => import("./SCDSPrint"));
const RevenueFromConsumptionPrint = lazy(() => import("./RevenueFromConsumptionPrint"));
const RevenueFromConsumptionClusterPrint = lazy(() => import("./RevenueFromConsumptionClusterPrint"));
const AccountsReceivableSummaryPrint = lazy(() => import("./AccountsReceivableSummaryPrint"));
const ReportOfClassificationPrint = lazy(() => import("./ReportOfClassificationPrint"));
const ReadingListPrint = lazy(() => import("./ReadingListPrint"));
const AccountsReceivablesPrint = lazy(() => import("./AccountsReceivablesPrint"));
const AdjustedBillsReportPrint = lazy(() => import("./AdjustedBillsReportPrint"));
const BillEditReportPrint = lazy(() => import("./BillEditReportPrint"));
const LatestConsumerStatusPrint = lazy(() => import("./LatestConsumerStatusPrint"));
const ConnectionReportPrint = lazy(() => import("./ConnectionReportPrint"));
const AnnualConnectionReportPrint = lazy(() => import("./AnnualConnectionReportPrint"));
const ServiceConnectionStatsPrint = lazy(() => import("./ServiceConnectionStatsPrint"));

export default function App() {
  const { user, loading } = useAuth();

  // The browser tab title is static in index.html ("POSEIDON" — shared by
  // both a main and a satellite build), so it's set here instead, once,
  // regardless of sign-in state — same unauthenticated check the login
  // screen and sidebar already use to brand themselves. The [data-satellite]
  // attribute drives OSCARS's own color palette (see index.css's :root
  // override) the same way — one flag, set once, at the document root.
  useEffect(() => {
    apiGet<{ isSatellite: boolean }>("/api/deployment")
      .then((d) => {
        document.title = d.isSatellite ? "OSCARS" : "POSEIDON";
        document.documentElement.toggleAttribute("data-satellite", d.isSatellite);
      })
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
      <Suspense fallback={<PageLoading />}>
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
          path="/receipts/collections-deposit/print"
          element={<CollectionsDepositReportPrint />}
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
        <Route path="/forecast/print" element={<ForecastPrint />} />
        <Route path="/nrw/print" element={<NrwPrint />} />
        <Route path="/incidents/notices/:id/print" element={<NoticePrint />} />
        <Route path="/incidents/report/print" element={<InterruptionReportPrint />} />
        <Route path="/reports/incident-register/print" element={<IncidentRegisterPrint />} />
        <Route path="/reports/incident-response/print" element={<IncidentResponsePrint />} />
        <Route path="/reports/mobile-adjustment-requests/print" element={<MobileAdjustmentRequestsPrint />} />
        <Route path="/reports/mobile-app-usage/print" element={<MobileAppUsagePrint />} />
        <Route path="/reports/inventory/:report/print" element={<InventoryReportPrint />} />
        <Route path="/inventory/print/:form/:id" element={<InventoryFormPrint />} />
        <Route path="/reports/reader-field-reading/print" element={<ReaderFieldReportPrint />} />
        <Route path="/reports/reader-exceptions/print" element={<ReaderExceptionsPrint />} />
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
          path="/reports/field-collection/print"
          element={<FieldCollectionPrint />}
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
              <Suspense fallback={<PageLoading />}>
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
                <Route path="/it" element={<ITDashboardPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/clusters" element={<ClusterManagerPage />} />
                <Route path="/meters" element={<MeterManagerPage />} />
                <Route path="/sequencing" element={<SequencingPage />} />
                <Route path="/map" element={<GisMapPage />} />
                <Route path="/forecast" element={<ForecastPage />} />
                <Route path="/nrw" element={<NonRevenueWaterPage />} />
              </Routes>
              </Suspense>
            </Layout>
          }
        />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

/** Shown for the moment a page's code is being fetched. */
function PageLoading() {
  return <p className="count" style={{ padding: 24 }}>Loading…</p>;
}
