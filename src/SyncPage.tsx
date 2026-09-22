import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

/**
 * Synchronization — pull-down (Milestone 1) and upload (Milestone 2).
 * Double-payment conflicts raised by an upload are resolved on the main
 * server, not here — see SyncConflictsPage.tsx. The Neon relay is a later
 * milestone. Hidden from the nav entirely on a non-satellite deployment (see
 * Layout.tsx); this page still works if reached directly, it just always
 * shows "not configured as a satellite."
 */

type SyncStatus = {
  isSatellite: boolean;
  mainHost: string | null;
  lastSync: {
    ranAt: string;
    status: string;
    referenceRows: number;
    accountRows: number;
    billingRows: number;
    durationMs: number;
    detail: string | null;
  } | null;
};

type SyncHistoryRow = {
  ranAt: string;
  direction: string;
  username: string | null;
  status: string;
  referenceRows: number;
  accountRows: number;
  billingRows: number;
  durationMs: number;
  detail: string | null;
};

type PendingUpload = {
  pending: number;
  uploaded: number;
  conflict: number;
  error: number;
};

type PushSummary = {
  status: string;
  uploaded: number;
  conflict: number;
  error: number;
  durationMs: number;
};

function shortDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function SyncPage() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadResult, setUploadResult] = useState<PushSummary | null>(null);

  const { data: status } = useQuery<SyncStatus>({
    queryKey: ["sync-status"],
    queryFn: () => apiGet<SyncStatus>("/api/sync/status"),
    retry: false,
  });

  const { data: history } = useQuery<SyncHistoryRow[]>({
    queryKey: ["sync-history"],
    queryFn: () => apiGet<SyncHistoryRow[]>("/api/sync/history"),
    retry: false,
  });

  const { data: pendingUpload } = useQuery<PendingUpload>({
    queryKey: ["sync-pending-upload"],
    queryFn: () => apiGet<PendingUpload>("/api/sync/pending-upload"),
    retry: false,
    enabled: !!status?.isSatellite,
  });

  async function syncNow() {
    setRunning(true);
    setError("");
    try {
      await apiPost("/api/sync/pull", {});
      await qc.invalidateQueries({ queryKey: ["sync-status"] });
      await qc.invalidateQueries({ queryKey: ["sync-history"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function uploadNow() {
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const summary = await apiPost<PushSummary>("/api/sync/upload", {});
      setUploadResult(summary);
      await qc.invalidateQueries({ queryKey: ["sync-pending-upload"] });
      await qc.invalidateQueries({ queryKey: ["sync-history"] });
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Synchronization</h1>
          <p className="account-no">
            Refresh accounts, bills and fee rates from the main server before
            heading out, or any time there is a connection.
          </p>
        </div>
      </div>

      {!status?.isSatellite ? (
        <section className="record-section">
          <p className="count">
            This server is not configured as a satellite — MAIN_SYNC_URL and
            SYNC_API_KEY are not set. Nothing to synchronize here.
          </p>
        </section>
      ) : (
        <>
          <section className="record-section">
            <div className="record-head"><h2>Status</h2></div>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Main server</div>
                <div className="dash-kpi-value" style={{ fontSize: 16 }}>{status.mainHost ?? "—"}</div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Last synced</div>
                <div className="dash-kpi-value" style={{ fontSize: 16 }}>{shortDateTime(status.lastSync?.ranAt ?? null)}</div>
                {status.lastSync && <div className="dash-kpi-sub">{status.lastSync.status === "ok" ? "Succeeded" : "Failed"}</div>}
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Accounts / Bills pulled</div>
                <div className="dash-kpi-value">
                  {status.lastSync ? `${status.lastSync.accountRows.toLocaleString()} / ${status.lastSync.billingRows.toLocaleString()}` : "—"}
                </div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Took</div>
                <div className="dash-kpi-value">
                  {status.lastSync ? `${(status.lastSync.durationMs / 1000).toFixed(1)}s` : "—"}
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="primary" onClick={syncNow} disabled={running}>
                {running ? "Syncing…" : "Sync now"}
              </button>
            </div>

            {error && <div className="form-error">{error}</div>}
            {status.lastSync?.status === "failed" && status.lastSync.detail && (
              <div className="form-error">Last sync failed: {status.lastSync.detail}</div>
            )}
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Upload</h2></div>
            <p className="count">
              Payments collected offline, waiting to go back to the main
              server. A bill or fee that turns out to be already settled
              another way lands in Synchronization Conflicts on main instead
              of being applied twice.
            </p>
            <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
              <div className="dash-kpi">
                <div className="dash-kpi-label">Pending</div>
                <div className="dash-kpi-value">{pendingUpload?.pending ?? 0}</div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Uploaded</div>
                <div className="dash-kpi-value">{pendingUpload?.uploaded ?? 0}</div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Conflicts</div>
                <div className="dash-kpi-value">{pendingUpload?.conflict ?? 0}</div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Errors</div>
                <div className="dash-kpi-value">{pendingUpload?.error ?? 0}</div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                className="primary"
                onClick={uploadNow}
                disabled={uploading || !pendingUpload?.pending}
              >
                {uploading ? "Uploading…" : "Upload now"}
              </button>
            </div>

            {uploadResult && (
              <div className="form-notice">
                Uploaded {uploadResult.uploaded}, {uploadResult.conflict} needs
                review on main, {uploadResult.error} failed
                {" "}({(uploadResult.durationMs / 1000).toFixed(1)}s).
              </div>
            )}
            {uploadError && <div className="form-error">{uploadError}</div>}
          </section>

          <section className="record-section">
            <div className="record-head"><h2>Recent syncs</h2></div>
            {!history?.length ? (
              <p className="count">No syncs recorded yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ran</th><th>By</th><th>Status</th>
                    <th className="n">Reference</th><th className="n">Accounts</th><th className="n">Bills</th>
                    <th className="n">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>{shortDateTime(h.ranAt)}</td>
                      <td>{h.username ?? "—"}</td>
                      <td>{h.status === "ok" ? "Succeeded" : "Failed"}</td>
                      <td className="n">{h.referenceRows.toLocaleString()}</td>
                      <td className="n">{h.accountRows.toLocaleString()}</td>
                      <td className="n">{h.billingRows.toLocaleString()}</td>
                      <td className="n">{(h.durationMs / 1000).toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
