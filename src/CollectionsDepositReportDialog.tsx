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

/** A picked booklet and the part of it being remitted now — the whole
 *  booklet until the clerk narrows it (selective remittance). Kept as the
 *  typed text so a half-typed number isn't rewritten under the cursor. */
type Pick = { bundle: Bundle; from: string; to: string };

/** Why a pick's range can't be used, or "" when it's fine. */
function rangeProblem(p: Pick): string {
  const from = Number(p.from);
  const to = Number(p.to);
  const { initial, final } = p.bundle;
  if (!p.from || !p.to || !Number.isInteger(from) || !Number.isInteger(to)) return "Enter both O.R. numbers";
  if (from < initial || to > final) return `Must stay within ${pad7(initial)}–${pad7(final)}`;
  if (from > to) return "From is after To";
  return "";
}

export default function CollectionsDepositReportDialog({ onClose }: { onClose: () => void }) {
  const [serial, setSerial] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, Pick>>(new Map());
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
      else next.set(b.ogId, { bundle: b, from: String(b.initial), to: String(b.final) });
      return next;
    });
    setError("");
  }

  function setRange(ogId: number, patch: Partial<Pick>) {
    setSelected((prev) => {
      const cur = prev.get(ogId);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(ogId, { ...cur, ...patch });
      return next;
    });
    setError("");
  }

  function open() {
    if (!selected.size) {
      setError("Choose at least one bundle");
      return;
    }
    const bad = selectedList.find((p) => rangeProblem(p));
    if (bad) {
      setError(`${pad7(bad.bundle.initial)}–${pad7(bad.bundle.final)}: ${rangeProblem(bad)}`);
      return;
    }
    const ranges = selectedList.map((p) => `${p.bundle.ogId}:${Number(p.from)}-${Number(p.to)}`).join(",");
    window.open(`/receipts/collections-deposit/print?ranges=${ranges}`, "_blank");
    onClose();
  }

  const rows = bundleList?.bundles ?? [];
  const selectedList = [...selected.values()].sort((a, b) => a.bundle.initial - b.bundle.initial);

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
          <div className="form-notice rcd-picks" style={{ marginBottom: 10 }}>
            <strong>
              {selectedList.length} bundle{selectedList.length === 1 ? "" : "s"} picked
            </strong>
            <span className="rcd-picks-hint">
              {" "}— narrow From/To to remit only part of a booklet.
            </span>
            <table>
              <thead>
                <tr><th>Booklet</th><th>From O.R.</th><th>To O.R.</th><th /></tr>
              </thead>
              <tbody>
                {selectedList.map((p) => {
                  const problem = rangeProblem(p);
                  const whole = Number(p.from) === p.bundle.initial && Number(p.to) === p.bundle.final;
                  return (
                    <tr key={p.bundle.ogId}>
                      <td>
                        {pad7(p.bundle.initial)}–{pad7(p.bundle.final)} ({p.bundle.serial})
                        <div className={problem ? "rcd-picks-problem" : "rcd-picks-note"}>
                          {problem || (whole ? "Whole booklet" : `${Number(p.to) - Number(p.from) + 1} O.R.s`)}
                        </div>
                      </td>
                      <td>
                        <input
                          className="filter-input"
                          inputMode="numeric"
                          value={p.from}
                          aria-label="From O.R. number"
                          onChange={(e) => setRange(p.bundle.ogId, { from: e.target.value.replace(/\D/g, "") })}
                        />
                      </td>
                      <td>
                        <input
                          className="filter-input"
                          inputMode="numeric"
                          value={p.to}
                          aria-label="To O.R. number"
                          onChange={(e) => setRange(p.bundle.ogId, { to: e.target.value.replace(/\D/g, "") })}
                        />
                      </td>
                      <td>
                        <button className="link-button" onClick={() => toggle(p.bundle)}>Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
