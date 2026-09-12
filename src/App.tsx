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
import AdjustmentPrint from "./AdjustmentPrint";
import LoginPage from "./LoginPage";
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
          path="*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<AccountsPage />} />
                <Route path="/accounts/new" element={<NewApplication />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/reading" element={<ReadingPage />} />
                <Route path="/collection" element={<CollectionPage />} />
                <Route path="/pendings" element={<PendingPage />} />
                <Route path="/adjustments" element={<AdjustmentsPage />} />
                <Route path="/disconnection" element={<DisconnectionPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/approvals" element={<ApprovalsPage />} />
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
