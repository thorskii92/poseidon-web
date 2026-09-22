import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";

/**
 * Synchronization — pull-down only for now (Milestone 1). Uploading
 * satellite-collected payments back to main, double-payment resolution and
 * the Neon relay are later milestones. Hidden from the nav entirely on a
 * non-satellite deployment (see Layout.tsx); this page still works if
 * reached directly, it just always shows "not configured as a satellite."
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
