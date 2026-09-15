import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, ApiError } from "./api";
import { peso } from "./collectionTypes";
import AdminAuth from "./AdminAuth";

/**
 * Receipts Manager — browsing issued O.R.s by bundle, and the O.R. Bundle
 * Manager behind it.
 *
 * Ported from frmORList / frmORBundle / frmNewORBundle / frmEditOR, moved
 * from a report tile to its own main-nav screen. See poseidon-api's
 * receipts.ts for what was fixed on the way over — including voiding a
 * never-issued slip, which the desktop had no way to do at all.
 */

type Bundle = {
  ogId: number;
  initial: number;
  final: number;
  serial: string;
  count: number;
  dateAdded: string | null;
  addedBy: string;
  accountablePerson: string;
};

type BundleList = { page: number; totalPages: number; total: number; bundles: Bundle[] };

type BundleRow = {
  orNum: string;
  issued: boolean;
  cancelled: boolean;
  orId: number | null;
  accountName: string;
  total: number;
  date: string | null;
  collector: string;
};

type BundleRows = { ogId: number; initial: number; final: number; serial: string; rows: BundleRow[] };

type Receipt = {
  orNumber: string;
  orSerial: string;
  date: string | null;
  accountNo: string;
  accountName: string;
  address: string | null;
  total: number;
  tendered: number;
  change: number;
  paymentType: string;
  amountInWords: string;
  collector: string;
  issuedBy: string | null;
  remark: string | null;
  seniorId: string | null;
  discountType: string;
  totalDiscount: number;
  draweeBank: string | null;
  draweeNum: string | null;
  draweeDate: string | null;
  moneyOrderNum: string | null;
  moneyOrderDate: string | null;
  lines: { nature: string; amount: string }[];
};

type EditOrLine = { nature: string; code: string; amount: number };

type EditOrData = {
  orNumber: string;
  orSerial: string;
  date: string | null;
  accountName: string;
  lines: EditOrLine[];
  total: number;
  paymentType: string;
  draweeBank: string;
  draweeNum: string;
  draweeDate: string;
  moneyOrderNum: string;
  moneyOrderDate: string;
  discountType: string;
  seniorId: string;
  totalDiscount: number;
  collector: string;
};

function shortDate(v: string | null) {
  if (!v) return "";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export default function ReceiptsManagerPage() {
  const [serial, setSerial] = useState("");
  const [page, setPage] = useState(1);
  const [ogId, setOgId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [selectedOr, setSelectedOr] = useState<{ number: string; serial: string } | null>(null);
  const [showBundleManager, setShowBundleManager] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);

  const { data: serialData } = useQuery<{ serials: string[] }>({
    queryKey: ["receipt-serials"],
    queryFn: () => apiGet("/api/receipts/serials"),
  });

  const { data: bundleList, isLoading: bundlesLoading } = useQuery<BundleList>({
    queryKey: ["receipt-bundles", serial, page],
    queryFn: () =>
      apiGet(`/api/receipts/bundles?serial=${encodeURIComponent(serial)}&page=${page}`),
  });

  const { data: rowsData, isLoading: rowsLoading } = useQuery<BundleRows>({
    queryKey: ["receipt-bundle-rows", ogId],
    queryFn: () => apiGet(`/api/receipts/bundles/${ogId}/rows`),
    enabled: ogId !== null,
  });

  function selectSerial(next: string) {
    setSerial(next);
    setPage(1);
    setOgId(null);
  }

  async function runSearch() {
    setSearchError("");
    const digits = search.trim();
    if (!digits) return;
    try {
      const found = await apiGet<{ ogId: number; serial: string; page: number }>(
        `/api/receipts/or/find?number=${encodeURIComponent(digits)}&serial=${encodeURIComponent(serial)}`,
      );
      setSerial(found.serial);
      setPage(found.page);
      setOgId(found.ogId);
      setSelectedOr({ number: digits.padStart(7, "0"), serial: found.serial });
    } catch (err) {
      setSearchError((err as Error).message);
    }
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Receipts Manager</h1>
          <p className="account-no">Every O.R. ever issued, by bundle — search, reprint or cancel one.</p>
        </div>
        <div className="head-actions">
          <button className="clear-filters" onClick={() => setShowDailyReport(true)}>
            Daily Collection Report
          </button>
          <button className="clear-filters" onClick={() => setShowBundleManager(true)}>
            Bundle Manager
          </button>
        </div>
      </div>

      <div className="filter-row">
        <label className="field-input">
          <span>O.R. Serial</span>
          <select value={serial} onChange={(e) => selectSerial(e.target.value)}>
            <option value="">All serials</option>
            {(serialData?.serials ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Search O.R. number</span>
          <input
            className="filter-input"
            value={search}
            placeholder="e.g. 4782498"
            onChange={(e) => setSearch(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
        </label>
        <button className="primary" style={{ alignSelf: "flex-end" }} onClick={runSearch}>
          Search
        </button>
      </div>
      {searchError && <div className="form-error">{searchError}</div>}

      <div className="billing-split">
        <section className="record-section groups">
          <div className="record-head">
            <h2>Bundles</h2>
            <span className="count">{bundleList?.total ?? 0}</span>
          </div>

          {bundlesLoading ? (
            <p className="count">Loading…</p>
          ) : !bundleList?.bundles.length ? (
            <p className="count">No bundles {serial ? "for this serial" : ""} yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Initial</th>
                  <th>Final</th>
                  {!serial && <th>Serial</th>}
                  <th className="num">O.R. count</th>
                </tr>
              </thead>
              <tbody>
                {bundleList.bundles.map((b) => (
                  <tr
                    key={b.ogId}
                    className={ogId === b.ogId ? "row-link row-selected" : "row-link"}
                    onClick={() => setOgId(b.ogId)}
                  >
                    <td>{String(b.initial).padStart(7, "0")}</td>
                    <td>{String(b.final).padStart(7, "0")}</td>
                    {!serial && <td>{b.serial}</td>}
                    <td className="num">{b.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {bundleList && bundleList.totalPages > 1 && (
            <Pager page={bundleList.page} totalPages={bundleList.totalPages} onChange={setPage} />
          )}
        </section>

        <section className="record-section">
          {ogId === null ? (
            <p className="count">Select a bundle to see its O.R. numbers.</p>
          ) : rowsLoading ? (
            <p className="count">Loading…</p>
          ) : !rowsData ? (
            <p className="count">Could not load that bundle.</p>
          ) : (
            <>
              <div className="record-head">
                <h2>
                  {String(rowsData.initial).padStart(7, "0")} to{" "}
                  {String(rowsData.final).padStart(7, "0")} · {rowsData.serial}
                </h2>
                <span className="count">
                  {rowsData.rows.filter((r) => r.issued).length} issued
                </span>
              </div>

              <div className="batch-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>O.R. Number</th>
                      <th>Consumer</th>
                      <th className="num">Total Payment</th>
                      <th>Date</th>
                      <th>Collection Officer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsData.rows.map((r) => (
                      <tr
                        key={r.orNum}
                        className="row-link"
                        onClick={() => setSelectedOr({ number: r.orNum, serial: rowsData.serial })}
                      >
                        <td>{r.orNum}</td>
                        <td>
                          {r.cancelled ? (
                            <span className="badge setting-badge role-none">Cancelled O.R.</span>
                          ) : r.issued ? (
                            r.accountName || <span className="muted">—</span>
                          ) : (
                            <span className="muted">Not issued</span>
                          )}
                        </td>
                        <td className="num">{r.issued && !r.cancelled ? peso.format(r.total) : ""}</td>
                        <td>{shortDate(r.date)}</td>
                        <td>{r.cancelled ? "" : r.collector}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {selectedOr && (
        <OrDetailModal
          number={selectedOr.number}
          serial={selectedOr.serial}
          onClose={() => setSelectedOr(null)}
        />
      )}

      {showBundleManager && (
        <BundleManagerModal
          onClose={() => setShowBundleManager(false)}
          onCreated={(newSerial) => {
            selectSerial(newSerial);
          }}
        />
      )}

      {showDailyReport && (
        <DailyReportDialog serial={serial} onClose={() => setShowDailyReport(false)} />
      )}
    </div>
  );
}

function DailyReportDialog({
  serial, onClose,
}: { serial: string; onClose: () => void }) {
  const [initial, setInitial] = useState("");
  const [final, setFinal] = useState("");
  const [orSerial, setOrSerial] = useState(serial);
  const [error, setError] = useState("");

  const { data: serialData } = useQuery<{ serials: string[] }>({
    queryKey: ["receipt-serials"],
    queryFn: () => apiGet("/api/receipts/serials"),
  });

  function open() {
    setError("");
    if (!initial.trim() || !final.trim()) {
      setError("Enter both the starting and ending O.R. number");
      return;
    }
    if (Number(final) < Number(initial)) {
      setError("The ending O.R. cannot be before the starting one");
      return;
    }
    if (!orSerial) {
      setError("Choose an O.R. serial");
      return;
    }
    window.open(
      `/receipts/daily-collection/print?initial=${Number(initial)}&final=${Number(final)}&serial=${encodeURIComponent(orSerial)}`,
      "_blank",
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Daily Collection Report</h2>
        <p className="modal-sub">
          Rizal's report only, for now — every payment on this O.R. range, grouped and
          totalled the way the Municipal Economic Enterprise office needs it.
        </p>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Initial O.R.</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={initial}
            autoFocus
            onChange={(e) => setInitial(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Final O.R.</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={final}
            onChange={(e) => setFinal(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>O.R. Serial</span>
          <select value={orSerial} onChange={(e) => setOrSerial(e.target.value)}>
            <option value="">Choose…</option>
            {(serialData?.serials ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" onClick={open}>Open report</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function Pager({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  return (
    <div className="form-actions" style={{ marginTop: 10 }}>
      <button className="clear-filters" disabled={page <= 1} onClick={() => onChange(1)}>«</button>
      <button className="clear-filters" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      <span className="count" style={{ alignSelf: "center" }}>{page} / {totalPages}</span>
      <button className="clear-filters" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>›</button>
      <button className="clear-filters" disabled={page >= totalPages} onClick={() => onChange(totalPages)}>»</button>
    </div>
  );
}

/* ==================================================================== *
 * O.R. detail — view, print, cancel
 * ==================================================================== */

function OrDetailModal({
  number, serial, onClose,
}: { number: string; serial: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "cancel" | "editAuth" | "editForm">("view");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [editData, setEditData] = useState<EditOrData | null>(null);
  const [saved, setSaved] = useState<{ orNumber: string } | null>(null);
  const currentNumber = saved?.orNumber ?? number;

  const { data, isLoading, error: loadError } = useQuery<Receipt>({
    queryKey: ["receipt", number, serial],
    queryFn: () =>
      apiGet(`/api/collection/receipt?number=${encodeURIComponent(number)}&serial=${encodeURIComponent(serial)}`),
    retry: false,
  });
  // A blank slip in the booklet — no tblor row exists for it yet, so the
  // receipt fetch 404s. Not an error to show; it just means Cancel below
  // will void the number outright instead of reversing a real transaction.
  const notIssued = (loadError as ApiError | null)?.status === 404;

  function print() {
    window.open(
      `/collection/receipt?number=${encodeURIComponent(currentNumber)}&serial=${encodeURIComponent(serial)}`,
      "_blank",
    );
  }

  async function doCancel() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/receipts/or/${number}/cancel`, { serial, adminUsername, adminPassword });
      setCancelled(true);
      qc.invalidateQueries({ queryKey: ["receipt-bundle-rows"] });
      qc.invalidateQueries({ queryKey: ["receipt-bundles"] });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadEdit() {
    setBusy(true);
    setError("");
    try {
      const d = await apiPost<EditOrData>(`/api/receipts/or/${number}/edit/load`, {
        serial, adminUsername, adminPassword,
      });
      setEditData(d);
      setMode("editForm");
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">O.R. {currentNumber}{serial ? ` (${serial})` : ""}</h2>

        {isLoading && <p className="count">Loading…</p>}
        {loadError && !notIssued && <div className="form-error">{(loadError as Error).message}</div>}
        {cancelled && <div className="form-notice">This O.R. has been cancelled.</div>}
        {saved && <div className="form-notice">Saved — this O.R. is now number {saved.orNumber}.</div>}

        {mode === "editForm" && editData && (
          <EditOrForm
            data={editData}
            oldNumber={number}
            serial={serial}
            adminUsername={adminUsername}
            adminPassword={adminPassword}
            onCancel={() => setMode("view")}
            onSaved={(orNumber) => {
              setSaved({ orNumber });
              setMode("view");
              qc.invalidateQueries({ queryKey: ["receipt-bundle-rows"] });
              qc.invalidateQueries({ queryKey: ["receipt-bundles"] });
            }}
          />
        )}

        {notIssued && !cancelled && mode !== "editForm" && (
          <>
            <p className="modal-sub">
              This O.R. number has not been issued — there is no receipt behind it.
            </p>

            {mode === "cancel" && (
              <>
                <div className="form-notice" style={{ marginBottom: 10 }}>
                  <strong>This is irreversible.</strong> The number will be marked
                  cancelled so it can never be issued.
                </div>
                <AdminAuth
                  username={adminUsername}
                  password={adminPassword}
                  onUsername={setAdminUsername}
                  onPassword={setAdminPassword}
                  onSubmit={doCancel}
                  disabled={busy}
                />
              </>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions" style={{ marginTop: 14 }}>
              {mode === "view" && (
                <button className="danger" onClick={() => setMode("cancel")}>
                  Cancel O.R.
                </button>
              )}
              {mode === "cancel" && (
                <button
                  className="danger"
                  disabled={busy || !adminUsername || !adminPassword}
                  onClick={doCancel}
                >
                  {busy ? "Cancelling…" : "Confirm cancel"}
                </button>
              )}
              {mode === "cancel" && (
                <button className="clear-filters" onClick={() => { setMode("view"); setError(""); }}>
                  Back
                </button>
              )}
              <button className="clear-filters" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {data && mode !== "editForm" && (
          <>
            <p className="modal-sub">
              {shortDate(data.date)} · {data.accountNo} · {data.accountName}
            </p>

            <table className="data-table" style={{ marginBottom: 14 }}>
              <thead>
                <tr>
                  <th>Nature of Collection</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.length === 0 ? (
                  <tr><td colSpan={2} className="count">No lines recorded.</td></tr>
                ) : (
                  data.lines.map((l, i) => (
                    <tr key={i}>
                      <td>{l.nature}</td>
                      <td className="num">{l.amount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="or-current" style={{ marginBottom: 14 }}>
              <div>
                <span className="field-label">Payment Type</span>
                <strong>{data.paymentType || "—"}</strong>
              </div>
              <div>
                <span className="field-label">Total Amount</span>
                <strong>{peso.format(data.total)}</strong>
              </div>
              <div>
                <span className="field-label">Tendered</span>
                <strong>{peso.format(data.tendered)}</strong>
              </div>
              <div>
                <span className="field-label">Change</span>
                <strong>{peso.format(data.change)}</strong>
              </div>
              <div>
                <span className="field-label">Amount in Words</span>
                <strong>{data.amountInWords || "—"}</strong>
              </div>
              <div>
                <span className="field-label">Collection Officer</span>
                <strong>{data.collector || "—"}</strong>
              </div>
              <div>
                <span className="field-label">Discount Type</span>
                <strong>{data.discountType}</strong>
              </div>
              {data.discountType !== "None" && (
                <>
                  <div>
                    <span className="field-label">Senior/PWD ID</span>
                    <strong>{data.seniorId || "—"}</strong>
                  </div>
                  <div>
                    <span className="field-label">Total Discount</span>
                    <strong>{peso.format(data.totalDiscount)}</strong>
                  </div>
                </>
              )}
              {data.paymentType === "Check" && (
                <>
                  <div>
                    <span className="field-label">Drawee Bank</span>
                    <strong>{data.draweeBank || "—"}</strong>
                  </div>
                  <div>
                    <span className="field-label">Check Number</span>
                    <strong>{data.draweeNum || "—"}</strong>
                  </div>
                  <div>
                    <span className="field-label">Check Date</span>
                    <strong>{data.draweeDate || "—"}</strong>
                  </div>
                </>
              )}
              {data.paymentType === "Money Order" && (
                <>
                  <div>
                    <span className="field-label">M.O. Number</span>
                    <strong>{data.moneyOrderNum || "—"}</strong>
                  </div>
                  <div>
                    <span className="field-label">M.O. Date</span>
                    <strong>{data.moneyOrderDate || "—"}</strong>
                  </div>
                </>
              )}
            </div>

            {data.remark === "Cancelled" && !cancelled && (
              <div className="form-notice">This O.R. was already cancelled.</div>
            )}

            {mode === "cancel" && data.remark !== "Cancelled" && !cancelled && (
              <>
                <div className="form-notice" style={{ marginBottom: 10 }}>
                  <strong>Cancelling is irreversible.</strong> The payment, the bill it
                  paid, and every log tied to this O.R. will be reversed.
                </div>
                <AdminAuth
                  username={adminUsername}
                  password={adminPassword}
                  onUsername={setAdminUsername}
                  onPassword={setAdminPassword}
                  onSubmit={doCancel}
                  disabled={busy}
                />
              </>
            )}

            {mode === "editAuth" && data.remark !== "Cancelled" && !cancelled && (
              <>
                <div className="form-notice" style={{ marginBottom: 10 }}>
                  An administrator must authorise editing this O.R.
                </div>
                <AdminAuth
                  username={adminUsername}
                  password={adminPassword}
                  onUsername={setAdminUsername}
                  onPassword={setAdminPassword}
                  onSubmit={loadEdit}
                  disabled={busy}
                />
              </>
            )}

            {error && <div className="form-error">{error}</div>}

            <div className="form-actions" style={{ marginTop: 14 }}>
              <button className="primary" onClick={print}>Print O.R.</button>
              {data.remark !== "Cancelled" && !cancelled && mode === "view" && (
                <>
                  <button className="clear-filters" onClick={() => setMode("editAuth")}>
                    Edit O.R.
                  </button>
                  <button className="danger" onClick={() => setMode("cancel")}>
                    Cancel O.R.
                  </button>
                </>
              )}
              {mode === "cancel" && !cancelled && (
                <button
                  className="danger"
                  disabled={busy || !adminUsername || !adminPassword}
                  onClick={doCancel}
                >
                  {busy ? "Cancelling…" : "Confirm cancel"}
                </button>
              )}
              {mode === "editAuth" && (
                <button
                  className="primary"
                  disabled={busy || !adminUsername || !adminPassword}
                  onClick={loadEdit}
                >
                  {busy ? "Checking…" : "Continue"}
                </button>
              )}
              {(mode === "cancel" || mode === "editAuth") && (
                <button className="clear-filters" onClick={() => { setMode("view"); setError(""); }}>
                  Back
                </button>
              )}
              <button className="clear-filters" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Ported from frmEditOR. Payment-type radios show only the fields that
 *  apply, same as the desktop's rdbCash/rdbCheck/rdbMO handlers. */
function EditOrForm({
  data, oldNumber, serial, adminUsername, adminPassword, onCancel, onSaved,
}: {
  data: EditOrData;
  oldNumber: string;
  serial: string;
  adminUsername: string;
  adminPassword: string;
  onCancel: () => void;
  onSaved: (orNumber: string) => void;
}) {
  const [orNumber, setOrNumber] = useState(data.orNumber);
  const [date, setDate] = useState((data.date ?? "").slice(0, 10));
  const [lines, setLines] = useState<EditOrLine[]>(
    Array.from({ length: 8 }, (_, i) => data.lines[i] ?? { nature: "", code: "", amount: 0 }),
  );
  const [total, setTotal] = useState(String(data.total));
  const [paymentType, setPaymentType] = useState(data.paymentType);
  const [draweeBank, setDraweeBank] = useState(data.draweeBank);
  const [draweeNum, setDraweeNum] = useState(data.draweeNum);
  const [draweeDate, setDraweeDate] = useState(data.draweeDate);
  const [moneyOrderNum, setMoneyOrderNum] = useState(data.moneyOrderNum);
  const [moneyOrderDate, setMoneyOrderDate] = useState(data.moneyOrderDate);
  const [discountType, setDiscountType] = useState(data.discountType);
  const [seniorId, setSeniorId] = useState(data.seniorId);
  const [totalDiscount, setTotalDiscount] = useState(String(data.totalDiscount));
  const [collector, setCollector] = useState(data.collector);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setLine(i: number, patch: Partial<EditOrLine>) {
    setLines((prev) => prev.map((l, x) => (x === i ? { ...l, ...patch } : l)));
  }

  const ready = orNumber.trim() !== "" && date !== "" && total.trim() !== "";

  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await apiPost<{ orNumber: string }>(`/api/receipts/or/${oldNumber}/edit/save`, {
        serial, adminUsername, adminPassword,
        orNumber: orNumber.trim(),
        date,
        lines: lines.map((l) => ({ nature: l.nature, code: l.code, amount: Number(l.amount) || 0 })),
        total: Number(total) || 0,
        paymentType,
        draweeBank, draweeNum, draweeDate,
        moneyOrderNum, moneyOrderDate,
        discountType,
        seniorId,
        totalDiscount: Number(totalDiscount) || 0,
        collector,
      });
      onSaved(result.orNumber);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="modal-sub">{data.accountName || "—"}</p>

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field-input">
          <span>O.R. Number</span>
          <input
            className="filter-input"
            value={orNumber}
            onChange={(e) => setOrNumber(e.target.value.replace(/\D/g, ""))}
          />
        </label>
        <label className="field-input">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field-input">
          <span>Collection Officer</span>
          <input value={collector} onChange={(e) => setCollector(e.target.value)} />
        </label>
      </div>

      <div className="batch-scroll" style={{ marginBottom: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nature of Collection</th>
              <th>Account Code</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>
                  <input
                    className="filter-input"
                    value={l.nature}
                    onChange={(e) => setLine(i, { nature: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="filter-input"
                    value={l.code}
                    onChange={(e) => setLine(i, { code: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="amount-input"
                    type="number"
                    value={l.amount}
                    onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field-input">
          <span>Total</span>
          <input
            className="amount-input"
            type="number"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </label>

        <label className="field-input">
          <span>Payment Type</span>
          <select value={paymentType} onChange={(e) => setPaymentType(e.target.value)}>
            <option value="Cash">Cash</option>
            <option value="Check">Check</option>
            <option value="Money Order">Money Order</option>
          </select>
        </label>

        <label className="field-input">
          <span>Discount Type</span>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
            <option value="Regular">Regular</option>
            <option value="Senior/PWD">Senior/PWD</option>
          </select>
        </label>
      </div>

      {paymentType === "Check" && (
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field-input">
            <span>Bank</span>
            <input value={draweeBank} onChange={(e) => setDraweeBank(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Check Number</span>
            <input value={draweeNum} onChange={(e) => setDraweeNum(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Check Date</span>
            <input value={draweeDate} onChange={(e) => setDraweeDate(e.target.value)} />
          </label>
        </div>
      )}

      {paymentType === "Money Order" && (
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field-input">
            <span>M.O. Number</span>
            <input value={moneyOrderNum} onChange={(e) => setMoneyOrderNum(e.target.value)} />
          </label>
          <label className="field-input">
            <span>M.O. Date</span>
            <input value={moneyOrderDate} onChange={(e) => setMoneyOrderDate(e.target.value)} />
          </label>
        </div>
      )}

      {discountType === "Senior/PWD" && (
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <label className="field-input">
            <span>Senior/PWD ID</span>
            <input value={seniorId} onChange={(e) => setSeniorId(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Total Discount</span>
            <input
              className="amount-input"
              type="number"
              value={totalDiscount}
              onChange={(e) => setTotalDiscount(e.target.value)}
            />
          </label>
        </div>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy || !ready} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="clear-filters" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </>
  );
}

/* ==================================================================== *
 * O.R. Bundle Manager
 * ==================================================================== */

function BundleManagerModal({
  onClose, onCreated,
}: { onClose: () => void; onCreated: (serial: string) => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<BundleList>({
    queryKey: ["receipt-all-bundles", search, page],
    queryFn: () =>
      apiGet(`/api/receipts/bundles?search=${encodeURIComponent(search)}&page=${page}&pageSize=200`),
  });

  async function del(ogId: number) {
    if (!confirm("Delete selected bundle?")) return;
    setError("");
    try {
      const r = await fetch(`/api/receipts/bundles/${ogId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not delete");
      setNotice("Bundle deleted.");
      qc.invalidateQueries({ queryKey: ["receipt-all-bundles"] });
      qc.invalidateQueries({ queryKey: ["receipt-bundles"] });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">O.R. Bundle Manager</h2>
        <p className="modal-sub">Every registered O.R. range, across every serial.</p>

        <div className="filter-row">
          <label className="field-input">
            <span>Search by O.R. number</span>
            <input
              className="filter-input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value.replace(/\D/g, ""));
                setPage(1);
              }}
            />
          </label>
          <button className="primary" style={{ alignSelf: "flex-end" }} onClick={() => setShowNew(true)}>
            New bundle
          </button>
        </div>

        {notice && <div className="form-notice">{notice}</div>}
        {error && <div className="form-error">{error}</div>}

        {isLoading ? (
          <p className="count">Loading…</p>
        ) : !data?.bundles.length ? (
          <p className="count">No bundles found.</p>
        ) : (
          <div className="batch-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Initial</th>
                  <th>Final</th>
                  <th>Serial</th>
                  <th>Date Added</th>
                  <th>Added By</th>
                  <th>Accountable Person</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.bundles.map((b) => (
                  <tr key={b.ogId}>
                    <td>{String(b.initial).padStart(7, "0")}</td>
                    <td>{String(b.final).padStart(7, "0")}</td>
                    <td>{b.serial}</td>
                    <td>{b.dateAdded ? b.dateAdded.slice(0, 16).replace("T", " ") : ""}</td>
                    <td>{b.addedBy}</td>
                    <td>{b.accountablePerson}</td>
                    <td className="num">
                      <button className="link-button" onClick={() => del(b.ogId)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
        )}

        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="clear-filters" onClick={onClose}>Close</button>
        </div>
      </div>

      {showNew && (
        <NewBundleForm
          onClose={() => setShowNew(false)}
          onSaved={(serial) => {
            setShowNew(false);
            setNotice("Bundle has been added.");
            qc.invalidateQueries({ queryKey: ["receipt-all-bundles"] });
            qc.invalidateQueries({ queryKey: ["receipt-bundles"] });
            qc.invalidateQueries({ queryKey: ["receipt-serials"] });
            onCreated(serial);
          }}
        />
      )}
    </div>
  );
}

function NewBundleForm({
  onClose, onSaved,
}: { onClose: () => void; onSaved: (serial: string) => void }) {
  const [initial, setInitial] = useState("");
  const [final, setFinal] = useState("");
  const [serial, setSerial] = useState("");
  const [accountablePerson, setAccountablePerson] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost("/api/receipts/bundles", {
        initial: Number(initial),
        final: Number(final),
        serial,
        accountablePerson,
      });
      onSaved(serial);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready =
    initial.trim() !== "" && final.trim() !== "" && serial.trim() !== "" &&
    Number(initial) > 0 && Number(final) >= Number(initial);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New O.R. Bundle</h2>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Initial OR</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={initial}
            autoFocus
            onChange={(e) => setInitial(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Final OR</span>
          <input
            className="amount-input"
            type="number"
            min={1}
            value={final}
            onChange={(e) => setFinal(e.target.value)}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Serial</span>
          <input
            maxLength={2}
            value={serial}
            onChange={(e) => setSerial(e.target.value.toUpperCase())}
          />
        </label>

        <label className="field-input" style={{ marginBottom: 12 }}>
          <span>Accountable Person</span>
          <input value={accountablePerson} onChange={(e) => setAccountablePerson(e.target.value)} />
        </label>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <button className="primary" disabled={busy || !ready} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="clear-filters" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
