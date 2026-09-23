import { useEffect, useState } from "react";
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
  lastPull: {
    ranAt: string;
    status: string;
    referenceRows: number;
    accountRows: number;
    billingRows: number;
    durationMs: number;
    detail: string | null;
  } | null;
  lastPush: {
    ranAt: string;
    status: string;
    durationMs: number;
    detail: string | null;
  } | null;
};

type SyncHistoryRow = {
  ranAt: string;
  direction: string;
  username: string | null;
  status: string;
  // NULL for a push (upload) row — see syncClient.ts's pushToMain, which
  // only ever writes reference/account/billing counts for a pull.
  referenceRows: number | null;
  accountRows: number | null;
  billingRows: number | null;
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

type Bundle = {
  ogId: number;
  initial: number;
  final: number;
  serial: string;
  dateAdded: string | null;
  accountablePerson: string;
};

type BundlePage = { page: number; totalPages: number; total: number; bundles: Bundle[] };

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
                <div className="dash-kpi-value" style={{ fontSize: 16 }}>{shortDateTime(status.lastPull?.ranAt ?? null)}</div>
                {status.lastPull && <div className="dash-kpi-sub">{status.lastPull.status === "ok" ? "Succeeded" : "Failed"}</div>}
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Accounts / Bills pulled</div>
                <div className="dash-kpi-value">
                  {status.lastPull ? `${status.lastPull.accountRows.toLocaleString()} / ${status.lastPull.billingRows.toLocaleString()}` : "—"}
                </div>
              </div>
              <div className="dash-kpi">
                <div className="dash-kpi-label">Took</div>
                <div className="dash-kpi-value">
                  {status.lastPull ? `${(status.lastPull.durationMs / 1000).toFixed(1)}s` : "—"}
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 16 }}>
              <button className="primary" onClick={syncNow} disabled={running}>
                {running ? "Syncing…" : "Sync now"}
              </button>
            </div>

            {error && <div className="form-error">{error}</div>}
            {status.lastPull?.status === "failed" && status.lastPull.detail && (
              <div className="form-error">Last sync failed: {status.lastPull.detail}</div>
            )}
          </section>

          <BundlesPicker />

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

            {!uploadResult && status.lastPush && (
              <p className="count" style={{ marginTop: 8 }}>
                Last upload: {shortDateTime(status.lastPush.ranAt)} — {status.lastPush.status === "ok" ? "succeeded" : "failed"}
                {status.lastPush.status === "failed" && status.lastPush.detail ? ` (${status.lastPush.detail})` : ""}
              </p>
            )}

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
                    <th>Ran</th><th>Direction</th><th>By</th><th>Status</th>
                    <th className="n">Reference</th><th className="n">Accounts</th><th className="n">Bills</th>
                    <th className="n">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td>{shortDateTime(h.ranAt)}</td>
                      <td>{h.direction === "pull" ? "Pull" : "Upload"}</td>
                      <td>{h.username ?? "—"}</td>
                      <td>{h.status === "ok" ? "Succeeded" : "Failed"}</td>
                      <td className="n">{h.referenceRows?.toLocaleString() ?? "—"}</td>
                      <td className="n">{h.accountRows?.toLocaleString() ?? "—"}</td>
                      <td className="n">{h.billingRows?.toLocaleString() ?? "—"}</td>
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

/**
 * Bundles — Main (not yet carried) on the left, Local/carried on the
 * right, so it reads as a transfer rather than a flat checklist. A bundle
 * moves sides via Add/Remove; both sides refresh together since either
 * action changes both lists at once. Removing one is refused server-side
 * (see sync.ts's DELETE /bundles/:ogId/carry) if it still has an
 * unuploaded payment — refreshKey bump alone can't show that ahead of
 * time, so the refusal message is what actually communicates it.
 */
function BundlesPicker() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyOgId, setBusyOgId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  async function addBundle(bundle: Bundle) {
    setActionError("");
    setBusyOgId(bundle.ogId);
    try {
      await apiPost("/api/sync/bundles/carry", bundle);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyOgId(null);
    }
  }

  async function removeBundle(bundle: Bundle) {
    setActionError("");
    setBusyOgId(bundle.ogId);
    try {
      const r = await fetch(`/api/sync/bundles/${bundle.ogId}/carry`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove that bundle");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyOgId(null);
    }
  }

  return (
    <section className="record-section">
      <div className="record-head"><h2>Bundles</h2></div>
      <p className="count">
        Main lists every bundle registered on main, live — nothing is
        stored here until you add it. Add the ones actually in the bag on
        this trip to Local; only those are accepted at Collection.
        Bundles are registered and managed on main; nothing here changes
        what main itself has reserved.
      </p>
      {actionError && <div className="form-error">{actionError}</div>}
      <div className="bundle-picker-columns">
        <BundleColumn
          title="Main"
          sub="Live from main — not yet carried"
          carried={false}
          refreshKey={refreshKey}
          actionLabel="Add Bundle"
          onAction={addBundle}
          busyOgId={busyOgId}
        />
        <BundleColumn
          title="Local"
          sub="Carried on this trip"
          carried={true}
          refreshKey={refreshKey}
          actionLabel="Remove Bundle"
          onAction={removeBundle}
          busyOgId={busyOgId}
        />
      </div>
    </section>
  );
}

function BundleColumn({
  title, sub, carried, refreshKey, actionLabel, onAction, busyOgId,
}: {
  title: string;
  sub: string;
  carried: boolean;
  refreshKey: number;
  actionLabel: string;
  onAction: (bundle: Bundle) => void;
  busyOgId: number | null;
}) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Bundle[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // A changed search or an add/remove elsewhere resets back to page 1
  // rather than appending onto a now-stale list.
  useEffect(() => {
    setPage(1);
  }, [search, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const qs = new URLSearchParams({ carried: String(carried), page: String(page) });
    if (search) qs.set("search", search);
    apiGet<BundlePage>(`/api/sync/bundles?${qs.toString()}`)
      .then((d) => {
        if (cancelled) return;
        setRows((prev) => (page === 1 ? d.bundles : [...prev, ...d.bundles]));
        setTotalPages(d.totalPages);
        setTotal(d.total);
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carried, page, search, refreshKey]);

  function runSearch() {
    setSearch(searchInput.trim());
  }

  return (
    <div className="bundle-picker-column">
      <div className="bundle-picker-head">
        <h3>{title}</h3>
        <span className="count">{sub} · {total.toLocaleString()}</span>
      </div>

      <div className="filter-row" style={{ marginBottom: 10 }}>
        <input
          placeholder="Search O.R. number"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button className="clear-filters" onClick={runSearch}>Search</button>
        {search && (
          <button className="clear-filters" onClick={() => { setSearchInput(""); setSearch(""); }}>
            Clear
          </button>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {!loading && !rows.length ? (
        <p className="count">{search ? "No bundle matches that number." : "Nothing here."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Serial</th>
              <th className="n">Range</th>
              <th>Accountable person</th>
              <th>Registered</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.ogId}>
                <td>{b.serial}</td>
                <td className="n">{b.initial} – {b.final}</td>
                <td>{b.accountablePerson || "—"}</td>
                <td>{shortDateTime(b.dateAdded)}</td>
                <td>
                  <button
                    className="link-button"
                    disabled={busyOgId === b.ogId}
                    onClick={() => onAction(b)}
                  >
                    {busyOgId === b.ogId ? "…" : actionLabel}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {page < totalPages && (
        <div className="form-actions" style={{ marginTop: 10 }}>
          <button className="clear-filters" disabled={loading} onClick={() => setPage((p) => p + 1)}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
