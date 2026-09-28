import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * Picks which registered O.R. bundle(s) to build a Report of Collections
 * and Deposit for — the LGU's own accountability form pairing a
 * collector's collections with how many forms from each booklet have been
 * issued versus remain. Scoped by picking bundles directly (Bundle
 * Manager's own registry), not a date or collector — a bundle's own
 * accountability is cumulative to whenever this report is generated, not
 * tied to any one day, matching the paper form's own "as of" nature.
 */

type Bundle = {
  ogId: number; initial: number; final: number; serial: string;
  count: number; dateAdded: string | null; accountablePerson: string;
};
type BundleList = { page: number; totalPages: number; total: number; bundles: Bundle[] };

function pad7(n: number) {
  return String(n).padStart(7, "0");
}

export default function CollectionsDepositReportDialog({ onClose }: { onClose: () => void }) {
  const [serial, setSerial] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, Bundle>>(new Map());
  const [error, setError] = useState("");

  const { data: serialData } = useQuery<{ serials: string[] }>({
    queryKey: ["receipt-serials"],
    queryFn: () => apiGet("/api/receipts/serials"),
  });

  const { data: bundleList, isLoading } = useQuery<BundleList>({
    queryKey: ["receipt-bundles", serial, search, page],
    queryFn: () =>
      apiGet(
        `/api/receipts/bundles?page=${page}` +
          (serial ? `&serial=${encodeURIComponent(serial)}` : "") +
          (search ? `&search=${encodeURIComponent(search)}` : ""),
      ),
  });

  function toggle(b: Bundle) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(b.ogId)) next.delete(b.ogId);
      else next.set(b.ogId, b);
      return next;
    });
  }

  function open() {
    if (!selected.size) {
      setError("Choose at least one bundle");
      return;
    }
    const ogIds = [...selected.keys()].join(",");
    window.open(`/receipts/collections-deposit/print?ogIds=${ogIds}`, "_blank");
    onClose();
  }

  const rows = bundleList?.bundles ?? [];
  const selectedList = [...selected.values()].sort((a, b) => a.initial - b.initial);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Report of Collections and Deposit</h2>
        <p className="modal-sub">
          Pick every O.R. booklet this report should cover — each one's own collections and
          issued/remaining form count are pulled in as of right now.
        </p>

        <div className="filters-row" style={{ marginBottom: 10 }}>
          <label className="field-input">
            <span>Serial</span>
            <select
              value={serial}
              onChange={(e) => {
                setSerial(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {(serialData?.serials ?? []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="field-input">
            <span>Search (O.R. #)</span>
            <input
              className="filter-input"
              value={search}
              placeholder="e.g. 4782498"
              onChange={(e) => {
                setSearch(e.target.value.replace(/\D/g, ""));
                setPage(1);
              }}
            />
          </label>
        </div>

        {selectedList.length > 0 && (
          <div className="form-notice" style={{ marginBottom: 10 }}>
            <strong>{selectedList.length} bundle{selectedList.length === 1 ? "" : "s"} picked:</strong>{" "}
            {selectedList
              .map((b) => `${pad7(b.initial)}–${pad7(b.final)} (${b.serial})`)
              .join(", ")}
          </div>
        )}

        {isLoading ? (
          <p className="count">Loading…</p>
        ) : !rows.length ? (
          <p className="count">No bundles found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th />
                <th>Initial</th>
                <th>Final</th>
                <th>Serial</th>
                <th className="num">O.R. count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.ogId}
                  className="row-link"
                  onClick={() => toggle(b)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <input type="checkbox" checked={selected.has(b.ogId)} readOnly />
                  </td>
                  <td>{pad7(b.initial)}</td>
                  <td>{pad7(b.final)}</td>
                  <td>{b.serial}</td>
                  <td className="num">{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {bundleList && bundleList.totalPages > 1 && (
          <div className="form-actions" style={{ marginTop: 10 }}>
            <button className="clear-filters" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
            <button className="clear-filters" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            <span className="count" style={{ alignSelf: "center" }}>{bundleList.page} / {bundleList.totalPages}</span>
            <button className="clear-filters" disabled={page >= bundleList.totalPages} onClick={() => setPage((p) => p + 1)}>›</button>
            <button className="clear-filters" disabled={page >= bundleList.totalPages} onClick={() => setPage(bundleList.totalPages)}>»</button>
          </div>
        )}

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
