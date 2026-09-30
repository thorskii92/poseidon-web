import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import AdminAuth from "./AdminAuth";
import { INV_KEYS, longDate, openForm, peso, qty, todayIso, type CountDetail, type CountSummary, type ItemsResponse } from "./inventoryShared";

/**
 * Physical count (RPCI). Start a count to get a sheet of every item with
 * what the records say; enter what's actually on the shelf; post it and the
 * differences become adjustments at average cost. Posting needs an
 * administrator — it's the one way stock changes without paperwork behind it.
 */
export default function InventoryCounts({ onChanged }: { onChanged: (message: string) => void }) {
  const [starting, setStarting] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery<{ rows: CountSummary[] }>({
    queryKey: INV_KEYS.counts,
    queryFn: () => apiGet("/api/inventory/counts"),
  });
  const draft = data?.rows.find((c) => c.status === "draft");

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Physical count</h2>
        {draft ? (
          <button className="primary" onClick={() => setOpen(draft.id)}>Continue the open count</button>
        ) : (
          <button className="primary" onClick={() => setStarting(true)}>Start a count</button>
        )}
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && (
        <p className="count">No counts yet. A count compares what's on the shelf with the records and corrects the difference.</p>
      )}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Count</th><th>Date</th><th>Covers</th><th className="num">Counted</th><th className="num">Differences</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.rows.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => setOpen(c.id)}>
                <td>#{c.id}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(c.date)}</td>
                <td>{c.category || "All items"}</td>
                <td className="num">{c.counted} of {c.lines}</td>
                <td className="num">{c.differences}</td>
                <td>
                  {c.status === "draft" ? (
                    <span className="badge setting-badge act-blue">Open</span>
                  ) : (
                    <span className="badge setting-badge act-green">Posted{c.approvedBy ? ` · ${c.approvedBy}` : ""}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {starting && (
        <StartCount
          onClose={() => setStarting(false)}
          onStarted={(id) => {
            setStarting(false);
            onChanged("Count started — enter what's actually on the shelf.");
            setOpen(id);
          }}
        />
      )}
      {open != null && (
        <CountSheet
          id={open}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            setOpen(null);
            onChanged(m);
          }}
        />
      )}
    </section>
  );
}

function StartCount({ onClose, onStarted }: { onClose: () => void; onStarted: (id: number) => void }) {
  const { data: items } = useQuery<ItemsResponse>({
    queryKey: [...INV_KEYS.items, "active=1"],
    queryFn: () => apiGet("/api/inventory/items?active=1"),
  });
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ id: number }>("/api/inventory/counts", { date, category, remarks });
      onStarted(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start a physical count</h2>
        <p className="modal-sub">The sheet lists each item with what the records say is on hand right now.</p>
        <div className="form-grid">
          <label className="field-input">
            <span>Count date</span>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Items to count</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All active items</option>
              {items?.categories.map((c) => <option key={c} value={c}>{c} only</option>)}
            </select>
          </label>
          <label className="field-input wide">
            <span>Remarks (optional)</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} placeholder="e.g. Year-end count, counted by the inventory committee" />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || !date} onClick={start}>Start the count</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

type Entry = { counted: string; remarks: string };

function CountSheet({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (message: string) => void }) {
  const { data: c, error } = useQuery<CountDetail>({
    queryKey: [...INV_KEYS.counts, "one", id],
    queryFn: () => apiGet(`/api/inventory/counts/${id}`),
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {!c && !error && <p className="count">Loading…</p>}
        {/* Keyed so the editor starts fresh from what was saved, once per count. */}
        {c && <CountEditor key={`${c.id}-${c.status}`} c={c} onClose={onClose} onDone={onDone} />}
      </div>
    </div>
  );
}

function CountEditor({ c, onClose, onDone }: { c: CountDetail; onClose: () => void; onDone: (message: string) => void }) {
  const qc = useQueryClient();
  const id = c.id;
  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(c.items.map((l) => [l.itemId, { counted: l.countedQty == null ? "" : String(l.countedQty), remarks: l.remarks }])),
  );
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [posting, setPosting] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const draft = c.status === "draft";
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return c.items.filter((l) => !s || l.name.toLowerCase().includes(s) || l.code.toLowerCase().includes(s));
  }, [c, search]);

  const live = c.items.map((l) => {
    const e = entries[l.itemId];
    const counted = e && e.counted !== "" ? Number(e.counted) : null;
    const diff = counted == null ? null : Math.round((counted - l.systemQty) * 1000) / 1000;
    return { l, counted, diff, value: diff == null ? 0 : diff * l.avgCost };
  });
  const countedN = live.filter((x) => x.counted != null).length;
  const diffs = live.filter((x) => x.diff != null && x.diff !== 0);
  const net = diffs.reduce((s, x) => s + x.value, 0);

  const set = (itemId: number, k: keyof Entry, v: string) => {
    setEntries((es) => ({ ...es, [itemId]: { ...(es[itemId] ?? { counted: "", remarks: "" }), [k]: v } }));
    setDirty(true);
  };

  async function save(quiet = false) {
    await apiPut(`/api/inventory/counts/${id}/lines`, {
      lines: Object.entries(entries).map(([itemId, e]) => ({ itemId: Number(itemId), countedQty: e.counted === "" ? null : Number(e.counted), remarks: e.remarks })),
    });
    setDirty(false);
    if (!quiet) qc.invalidateQueries({ queryKey: INV_KEYS.counts });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
          <>
            <h2 className="modal-title">
              Physical count #{c.id} <span className="muted">· {longDate(c.date)} · {c.category || "All items"}</span>
            </h2>
            <p className="modal-sub">
              {countedN} of {c.items.length} counted · {diffs.length} difference(s) · net ₱{peso.format(net)}
              {c.status === "posted" && ` · posted, approved by ${c.approvedBy}`}
            </p>

            <label className="field-input" style={{ maxWidth: 320, marginBottom: 10 }}>
              <span>Find an item</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code" />
            </label>

            <table>
              <thead>
                <tr>
                  <th>Item</th><th className="num">Records</th><th className="num">Counted</th>
                  <th className="num">Difference</th><th className="num">Value</th><th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const e = entries[l.itemId] ?? { counted: "", remarks: "" };
                  const counted = e.counted === "" ? null : Number(e.counted);
                  const diff = counted == null ? null : Math.round((counted - l.systemQty) * 1000) / 1000;
                  return (
                    <tr key={l.itemId}>
                      <td>{l.name}<div className="muted">{l.code}{l.category ? ` · ${l.category}` : ""}</div></td>
                      <td className="num">{qty(l.systemQty)} {l.unit}</td>
                      <td className="num">
                        {draft ? (
                          <input
                            className="table-input"
                            type="number"
                            min={0}
                            step="any"
                            style={{ width: 100, textAlign: "right" }}
                            value={e.counted}
                            onChange={(ev) => set(l.itemId, "counted", ev.target.value)}
                          />
                        ) : counted == null ? "—" : qty(counted)}
                      </td>
                      <td className="num" style={diff ? { color: diff < 0 ? "#c0392b" : "#1e8e5a", fontWeight: 600 } : undefined}>
                        {diff == null ? "" : `${diff > 0 ? "+" : ""}${qty(diff)}`}
                      </td>
                      <td className="num">{diff ? peso.format(diff * l.avgCost) : ""}</td>
                      <td>
                        {draft ? (
                          <input className="table-input" style={{ width: "100%" }} value={e.remarks} maxLength={300} onChange={(ev) => set(l.itemId, "remarks", ev.target.value)} placeholder={diff ? "Why? e.g. damaged, lost" : ""} />
                        ) : e.remarks}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {draft && posting && (
              <div style={{ marginTop: 14 }}>
                <p className="count">
                  Posting adjusts {diffs.length} item(s) to the counted quantities (net ₱{peso.format(net)}). Items left
                  blank aren't changed. This can't be undone — a later count would have to correct it.
                </p>
                <AdminAuth
                  label="An administrator must authorise posting this count"
                  username={adminUser}
                  password={adminPass}
                  onUsername={setAdminUser}
                  onPassword={setAdminPass}
                  disabled={busy}
                />
              </div>
            )}

            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {draft && !posting && (
                <>
                  <button className="primary" disabled={busy || !dirty} onClick={() => run(async () => { await save(); })}>
                    {dirty ? "Save counts" : "Saved"}
                  </button>
                  <button className="clear-filters" disabled={busy || countedN === 0} onClick={() => setPosting(true)}>
                    Post the count…
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm("Delete this count? What was entered on it is lost; stock isn't affected.")) return;
                      run(async () => {
                        await apiDelete(`/api/inventory/counts/${id}`);
                        onDone(`Count #${id} deleted.`);
                      });
                    }}
                  >
                    Delete count
                  </button>
                </>
              )}
              {draft && posting && (
                <button
                  className="primary"
                  disabled={busy || !adminUser || !adminPass}
                  onClick={() =>
                    run(async () => {
                      if (dirty) await save(true);
                      const r = await apiPost<{ adjusted: number }>(`/api/inventory/counts/${id}/post`, { adminUsername: adminUser, adminPassword: adminPass });
                      onDone(`Count #${id} posted — ${r.adjusted} item(s) adjusted.`);
                    })
                  }
                >
                  Post and adjust stock
                </button>
              )}
              {!posting && (
                <button className="clear-filters" onClick={() => openForm("rpci", c.id)}>
                  {draft ? "Print count sheet" : "Print RPCI"}
                </button>
              )}
              <button className="clear-filters" onClick={() => (posting ? setPosting(false) : onClose())}>
                {posting ? "Back" : "Close"}
              </button>
            </div>
          </>
  );
}
