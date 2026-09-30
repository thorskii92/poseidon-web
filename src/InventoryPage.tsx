import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./api";
import InventoryDeliveries from "./InventoryDeliveries";
import InventoryCounts from "./InventoryCounts";
import InventoryLists from "./InventoryLists";
import InventoryRequests from "./InventoryRequests";
import InventoryAssets from "./InventoryAssets";
import { useAuth } from "./AuthContext";
import {
  INV_KEYS, KIND_LABEL, MOVE_LABEL, longDate, openForm, peso, qty, todayIso,
  type Item, type ItemKind, type ItemsResponse, type ListEntry, type Lists, type Movement, type Summary,
} from "./inventoryShared";

/**
 * Inventory: items, deliveries (IAR) and physical counts. Stock only ever
 * changes through a movement — a delivery, an opening balance, a count
 * adjustment — so every item has a full stock card.
 */

const TABS = ["Items", "Requests", "Deliveries", "Equipment & meters", "Physical count", "Categories & units"] as const;
type Tab = (typeof TABS)[number];

export default function InventoryPage() {
  const { can } = useAuth();
  // Staff who can only file (or approve) requests see just that tab.
  const full = can("inventory");
  const tabs = full ? TABS : (["Requests"] as const);
  const [tab, setTab] = useState<Tab>(full ? "Items" : "Requests");
  const [notice, setNotice] = useState("");
  const qc = useQueryClient();
  const { data: summary } = useQuery<Summary>({
    queryKey: INV_KEYS.summary,
    queryFn: () => apiGet("/api/inventory/summary"),
    enabled: full,
  });
  const { data: waiting } = useQuery<{ toApprove: number; toRelease: number }>({
    queryKey: [...INV_KEYS.requests, "waiting"],
    queryFn: () => apiGet("/api/inventory/requests/waiting"),
  });
  const requestBadge = (waiting?.toApprove ?? 0) + (waiting?.toRelease ?? 0);

  /** After any change: refresh every list on the page and show a notice. */
  function changed(message: string) {
    setNotice(message);
    for (const k of Object.values(INV_KEYS)) qc.invalidateQueries({ queryKey: k });
  }

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Inventory</h1>
          <p className="account-no">Supplies, materials, equipment and water meters — moving-average cost.</p>
        </div>
      </div>

      {notice && (
        <div className="action-notice" onAnimationEnd={() => setNotice("")}>
          {notice}
        </div>
      )}

      {summary && (
        <div className="dash-kpis">
          <Kpi label="Items" value={String(summary.items)} sub="active items" />
          <Kpi label="Stock value" value={`₱${peso.format(summary.value)}`} sub="at moving-average cost" />
          <Kpi label="Below reorder level" value={String(summary.belowReorder)} sub="time to buy more" warn={summary.belowReorder > 0} />
          <Kpi label="Out of stock" value={String(summary.outOfStock)} sub="none on hand" warn={summary.outOfStock > 0} />
        </div>
      )}

      <div className="stage-tabs">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? "stage-tab current" : "stage-tab"} onClick={() => setTab(t)}>
            {t}
            {t === "Items" && !!summary?.belowReorder && <span className="stage-count">{summary.belowReorder}</span>}
            {t === "Requests" && !!requestBadge && <span className="stage-count">{requestBadge}</span>}
          </button>
        ))}
      </div>

      {tab === "Items" && <ItemsTab onChanged={changed} />}
      {tab === "Requests" && <InventoryRequests onChanged={changed} />}
      {tab === "Deliveries" && <InventoryDeliveries onChanged={changed} />}
      {tab === "Equipment & meters" && <InventoryAssets onChanged={changed} />}
      {tab === "Physical count" && <InventoryCounts onChanged={changed} />}
      {tab === "Categories & units" && <InventoryLists onChanged={changed} />}

      {tab === "Items" && summary && summary.recent.length > 0 && (
        <section className="record-section">
          <div className="record-head">
            <h2>Latest movements</h2>
          </div>
          <table>
            <thead>
              <tr><th>Date</th><th>Item</th><th>Movement</th><th className="num">Qty</th><th className="num">Amount</th><th>Reference</th><th>By</th></tr>
            </thead>
            <tbody>
              {summary.recent.map((m) => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{longDate(m.date)}</td>
                  <td>{m.itemName}<div className="muted">{m.itemCode}</div></td>
                  <td>{MOVE_LABEL[m.kind] ?? m.kind}</td>
                  <td className="num">{m.qty > 0 ? "+" : ""}{qty(m.qty)} {m.unit}</td>
                  <td className="num">{peso.format(m.totalCost)}</td>
                  <td>{m.reference}<div className="muted">{m.party}</div></td>
                  <td>{m.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub: string; warn?: boolean }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value" style={warn ? { color: "var(--danger, #c0392b)" } : undefined}>{value}</div>
      <div className="dash-kpi-sub">{sub}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Items
 * ------------------------------------------------------------------ */

function ItemsTab({ onChanged }: { onChanged: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [kind, setKind] = useState("");
  const [show, setShow] = useState<"1" | "0" | "low">("1");
  const [open, setOpen] = useState<Item | "new" | null>(null);

  const qs = new URLSearchParams({
    search, category, kind,
    active: show === "0" ? "0" : "1",
    ...(show === "low" ? { low: "1" } : {}),
  }).toString();
  const { data, isLoading, error } = useQuery<ItemsResponse>({
    queryKey: [...INV_KEYS.items, qs],
    queryFn: () => apiGet(`/api/inventory/items?${qs}`),
  });
  const { data: lists } = useQuery<Lists>({ queryKey: INV_KEYS.lists, queryFn: () => apiGet("/api/inventory/lists") });

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Items</h2>
        <button className="primary" onClick={() => setOpen("new")}>New item</button>
      </div>

      <div className="form-grid" style={{ marginBottom: 14 }}>
        <label className="field-input">
          <span>Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or description" />
        </label>
        <label className="field-input">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {lists?.categories.map((c) => <option key={c.id} value={c.name}>{c.name}{c.active ? "" : " (inactive)"}</option>)}
          </select>
        </label>
        <label className="field-input">
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field-input">
          <span>Show</span>
          <select value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="1">Active items</option>
            <option value="low">Below reorder level</option>
            <option value="0">Inactive items</option>
          </select>
        </label>
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && (
        <p className="count">{search || category || kind || show !== "1" ? "No items match." : "No items yet — add the first one with New item."}</p>
      )}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Code</th><th>Item</th><th>Category</th>
              <th className="num">On hand</th><th className="num">Avg. cost</th><th className="num">Value</th>
              <th className="num">Reorder at</th><th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((i) => (
              <tr key={i.id} className="row-link" onClick={() => setOpen(i)}>
                <td>{i.code}</td>
                <td>{i.name}<div className="muted">{KIND_LABEL[i.kind] ?? i.kind}{i.location ? ` · ${i.location}` : ""}</div></td>
                <td>{i.category}</td>
                <td className="num">{qty(i.qtyOnHand)} {i.unit}</td>
                <td className="num">{peso.format(i.avgCost)}</td>
                <td className="num">{peso.format(i.totalValue)}</td>
                <td className="num">{i.reorderLevel ? qty(i.reorderLevel) : "—"}</td>
                <td>
                  {!i.active ? (
                    <span className="badge setting-badge act-gray">Inactive</span>
                  ) : i.qtyOnHand <= 0 ? (
                    <span className="badge setting-badge act-red">Out of stock</span>
                  ) : i.belowReorder ? (
                    <span className="badge setting-badge act-red">Reorder</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <ItemDialog
          item={open === "new" ? null : open}
          lists={lists ?? { categories: [], units: [] }}
          onClose={() => setOpen(null)}
          onSaved={(m) => {
            onChanged(m);
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}

/** Active entries, plus the item's own value if it has since been deactivated. */
function choices(entries: ListEntry[], current: string) {
  const active = entries.filter((e) => e.active).map((e) => e.name);
  return current && !active.some((n) => n.toLowerCase() === current.toLowerCase()) ? [current, ...active] : active;
}

function ItemDialog({
  item, lists, onClose, onSaved,
}: {
  item: Item | null;
  lists: Lists;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [view, setView] = useState<"details" | "card">(item ? "card" : "details");
  const [form, setForm] = useState({
    code: item?.code ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    unit: item?.unit ?? "",
    category: item?.category ?? "",
    kind: item?.kind ?? ("consumable" as ItemKind),
    location: item?.location ?? "",
    reorderLevel: item ? String(item.reorderLevel || "") : "",
    active: item?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body = { ...form, reorderLevel: Number(form.reorderLevel) || 0 };
      if (item) {
        await apiPut(`/api/inventory/items/${item.id}`, body);
        onSaved(`${form.name} saved.`);
      } else {
        const r = await apiPost<{ id: number; code: string }>("/api/inventory/items", body);
        onSaved(`${form.name} added as ${r.code}. Open it to enter its opening balance.`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {item ? item.name : "New item"} {item && <span className="muted">· {item.code}</span>}
        </h2>
        {item && (
          <p className="modal-sub">
            {qty(item.qtyOnHand)} {item.unit} on hand · average ₱{peso.format(item.avgCost)} · value ₱{peso.format(item.totalValue)}
          </p>
        )}

        {item && (
          <div className="stage-tabs">
            <button className={view === "card" ? "stage-tab current" : "stage-tab"} onClick={() => setView("card")}>Stock card</button>
            <button className={view === "details" ? "stage-tab current" : "stage-tab"} onClick={() => setView("details")}>Details</button>
          </div>
        )}

        {view === "card" && item && <StockCard item={item} onSaved={onSaved} />}

        {view === "details" && (
          <>
            <div className="form-grid">
              <label className="field-input">
                <span>Code {item ? "" : "(blank = next ITM number)"}</span>
                <input value={form.code} onChange={set("code")} maxLength={40} placeholder="e.g. PVC-050" />
              </label>
              <label className="field-input wide">
                <span>Name</span>
                <input value={form.name} onChange={set("name")} maxLength={200} placeholder="e.g. PVC pipe, 1/2 in, Sch 40" />
              </label>
              <label className="field-input">
                <span>Unit</span>
                <select value={form.unit} onChange={set("unit")}>
                  <option value="">— pick a unit —</option>
                  {choices(lists.units, item?.unit ?? "").map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label className="field-input">
                <span>Kind</span>
                <select value={form.kind} onChange={set("kind")}>
                  {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="field-input">
                <span>Category</span>
                <select value={form.category} onChange={set("category")}>
                  <option value="">— none —</option>
                  {choices(lists.categories, item?.category ?? "").map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="field-input">
                <span>Kept at</span>
                <input value={form.location} onChange={set("location")} maxLength={100} placeholder="e.g. Stockroom, Office" />
              </label>
              <label className="field-input">
                <span>Reorder level</span>
                <input type="number" min={0} step="any" value={form.reorderLevel} onChange={set("reorderLevel")} placeholder="0 = no warning" />
              </label>
              <label className="field-input wide">
                <span>Description (optional)</span>
                <input value={form.description} onChange={set("description")} maxLength={500} placeholder="Size, brand, specifications" />
              </label>
            </div>
            {item && (
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Active (inactive items are hidden from deliveries and counts; their history stays)
              </label>
            )}
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
              <button className="primary" disabled={busy || !form.name.trim() || !form.unit.trim()} onClick={save}>
                {item ? "Save" : "Add item"}
              </button>
              <button className="clear-filters" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Every movement of one item, with the running balance — the Stock Card. */
function StockCard({ item, onSaved }: { item: Item; onSaved: (message: string) => void }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ from, to }).toString();
  const { data, isLoading, error } = useQuery<{ forward: { qty: number; value: number }; rows: Movement[] }>({
    queryKey: [...INV_KEYS.items, "card", item.id, qs],
    queryFn: () => apiGet(`/api/inventory/items/${item.id}/card?${qs}`),
  });
  const empty = data && !from && !to && data.rows.length === 0;
  const [returning, setReturning] = useState(false);

  return (
    <>
      {empty ? (
        <OpeningBalance item={item} onSaved={onSaved} />
      ) : (
        <>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label className="field-input">
              <span>From</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field-input">
              <span>To</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <div className="form-actions" style={{ marginTop: 0, marginBottom: 12 }}>
            <button className="clear-filters" onClick={() => openForm("stock-card", item.id, new URLSearchParams({ from, to }).toString())}>Print Stock Card</button>
            <button className="clear-filters" onClick={() => openForm("ledger-card", item.id, new URLSearchParams({ from, to }).toString())}>Print Supplies Ledger Card</button>
            {item.kind === "consumable" && !returning && <button className="clear-filters" onClick={() => setReturning(true)}>Return to stock…</button>}
          </div>
          {returning && <ReturnToStock item={item} onClose={() => setReturning(false)} onSaved={onSaved} />}
        </>
      )}
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && !empty && (
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Movement</th><th>Reference</th>
              <th className="num">In</th><th className="num">Out</th><th className="num">Unit cost</th>
              <th className="num">Balance</th><th className="num">Value</th><th>By</th>
            </tr>
          </thead>
          <tbody>
            {from && (
              <tr>
                <td>{longDate(from)}</td><td colSpan={5} className="muted">Balance brought forward</td>
                <td className="num">{qty(data.forward.qty)}</td><td className="num">{peso.format(data.forward.value)}</td><td />
              </tr>
            )}
            {data.rows.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(m.date)}</td>
                <td>{MOVE_LABEL[m.kind] ?? m.kind}{m.remarks && <div className="muted">{m.remarks}</div>}</td>
                <td>{m.reference}{m.party && <div className="muted">{m.party}</div>}</td>
                <td className="num">{m.qty > 0 ? qty(m.qty) : ""}</td>
                <td className="num">{m.qty < 0 ? qty(-m.qty) : ""}</td>
                <td className="num">{peso.format(m.unitCost)}</td>
                <td className="num">{qty(m.balanceQty)}</td>
                <td className="num">{peso.format(m.balanceValue)}</td>
                <td>{m.by}</td>
              </tr>
            ))}
            {data.rows.length === 0 && (
              <tr><td colSpan={9} className="muted">No movements in this period.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Unused supplies coming back to the stockroom, at the current average cost. */
function ReturnToStock({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/inventory/items/${item.id}/return`, { qty: Number(q), from, reference, date });
      onSaved(`${q} ${item.unit} of ${item.name} returned to stock.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="delete-auth" style={{ marginBottom: 12 }}>
      <div className="form-grid">
        <label className="field-input">
          <span>Quantity returned ({item.unit})</span>
          <input type="number" min={0} step="any" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field-input">
          <span>Returned by (person / office)</span>
          <input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={200} />
        </label>
        <label className="field-input">
          <span>Reference (e.g. RIS No.)</span>
          <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={60} />
        </label>
        <label className="field-input">
          <span>Date</span>
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="primary" disabled={busy || !(Number(q) > 0) || !from.trim()} onClick={save}>Record the return</button>
        <button className="clear-filters" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/** What was already on the shelf when the item was set up — once, before anything else. */
function OpeningBalance({ item, onSaved }: { item: Item; onSaved: (message: string) => void }) {
  const [q, setQ] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPost(`/api/inventory/items/${item.id}/opening`, { qty: Number(q), unitCost: Number(cost), date });
      onSaved(`Opening balance of ${q} ${item.unit} recorded for ${item.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="record-section" style={{ padding: 0, boxShadow: "none" }}>
      <p className="count">
        No stock recorded yet. If some is already on the shelf, enter it here as the opening balance — you won't
        have to re-enter old deliveries. New deliveries go under Deliveries.
      </p>
      <div className="form-grid">
        <label className="field-input">
          <span>Quantity on hand ({item.unit})</span>
          <input type="number" min={0} step="any" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="field-input">
          <span>Unit cost (₱)</span>
          <input type="number" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <label className="field-input">
          <span>As of</span>
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {Number(q) > 0 && Number(cost) >= 0 && (
        <p className="count" style={{ marginTop: 8 }}>Value: ₱{peso.format(Number(q) * Number(cost))}</p>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button className="primary" disabled={busy || !(Number(q) > 0) || cost === "" || !date} onClick={save}>
          Record opening balance
        </button>
      </div>
    </div>
  );
}
