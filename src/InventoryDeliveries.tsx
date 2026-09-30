import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { INV_KEYS, longDate, openForm, peso, qty, todayIso, type ItemsResponse, type Receipt } from "./inventoryShared";

/**
 * Deliveries — each one an Inspection and Acceptance Report (IAR). Recording
 * one adds the stock and re-averages each item's cost; a mistake is voided,
 * never edited, so the stock card keeps the trail.
 */
export default function InventoryDeliveries({ onChanged }: { onChanged: (message: string) => void }) {
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const qs = new URLSearchParams({ search, from, to }).toString();
  const { data, isLoading, error } = useQuery<{ rows: Receipt[] }>({
    queryKey: [...INV_KEYS.receipts, qs],
    queryFn: () => apiGet(`/api/inventory/receipts?${qs}`),
  });

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Deliveries (IAR)</h2>
        <button className="primary" onClick={() => setCreating(true)}>Record delivery</button>
      </div>

      <div className="form-grid" style={{ marginBottom: 14 }}>
        <label className="field-input">
          <span>Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Supplier, IAR, PO or DR no." />
        </label>
        <label className="field-input">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field-input">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No deliveries recorded{search || from || to ? " that match" : " yet"}.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr><th>IAR No.</th><th>Date</th><th>Supplier</th><th>PO / DR</th><th className="num">Items</th><th className="num">Total</th><th /></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => setOpen(r.id)}>
                <td>{r.iarNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(r.date)}</td>
                <td>{r.supplier}</td>
                <td>{[r.poNumber && `PO ${r.poNumber}`, r.drNumber && `DR ${r.drNumber}`].filter(Boolean).join(" · ")}</td>
                <td className="num">{r.lines}</td>
                <td className="num">{peso.format(r.totalCost)}</td>
                <td>{r.status === "voided" && <span className="badge setting-badge act-gray">Voided</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <DeliveryForm
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false);
            onChanged(m);
          }}
        />
      )}
      {open != null && (
        <DeliveryView
          id={open}
          onClose={() => setOpen(null)}
          onVoided={(m) => {
            setOpen(null);
            onChanged(m);
          }}
        />
      )}
    </section>
  );
}

type Line = { key: number; pick: string; qty: string; unitCost: string };
let lineKey = 1;
const blankLine = (): Line => ({ key: lineKey++, pick: "", qty: "", unitCost: "" });

function DeliveryForm({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { data: items } = useQuery<ItemsResponse>({
    queryKey: [...INV_KEYS.items, "active=1"],
    queryFn: () => apiGet("/api/inventory/items?active=1"),
  });
  const [head, setHead] = useState({ date: todayIso(), supplier: "", poNumber: "", drNumber: "", invoiceNo: "", iarNo: "", remarks: "" });
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // "CODE — Name" is what the picker shows and what the reader types or picks.
  const byLabel = useMemo(() => new Map((items?.rows ?? []).map((i) => [`${i.code} — ${i.name}`, i])), [items]);
  const setH = (k: keyof typeof head) => (e: { target: { value: string } }) => setHead((h) => ({ ...h, [k]: e.target.value }));
  const setL = (key: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

  const used = lines.filter((l) => l.pick.trim() || l.qty || l.unitCost);
  const resolved = used.map((l) => ({ line: l, item: byLabel.get(l.pick.trim()) ?? null }));
  const total = resolved.reduce((s, r) => s + (Number(r.line.qty) || 0) * (Number(r.line.unitCost) || 0), 0);

  async function save() {
    setError("");
    if (!head.supplier.trim()) return setError("Enter the supplier.");
    if (!resolved.length) return setError("Add at least one item.");
    const unknown = resolved.find((r) => !r.item);
    if (unknown) return setError(`"${unknown.line.pick || "(blank)"}" isn't an item — pick one from the list, or add it under Items first.`);
    if (resolved.some((r) => !(Number(r.line.qty) > 0))) return setError("Every item needs a quantity above zero.");
    if (resolved.some((r) => r.line.unitCost === "" || Number(r.line.unitCost) < 0)) return setError("Every item needs its unit cost.");
    setBusy(true);
    try {
      const r = await apiPost<{ id: number; iarNo: string }>("/api/inventory/receipts", {
        ...head,
        lines: resolved.map((x) => ({ itemId: x.item!.id, qty: Number(x.line.qty), unitCost: Number(x.line.unitCost) })),
      });
      onSaved(`Delivery recorded as IAR No. ${r.iarNo} — ₱${peso.format(total)}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Record a delivery</h2>
        <p className="modal-sub">Inspection and Acceptance Report — adds the stock and updates each item's average cost.</p>

        <div className="form-grid">
          <label className="field-input">
            <span>Date received</span>
            <input type="date" value={head.date} max={todayIso()} onChange={setH("date")} />
          </label>
          <label className="field-input wide">
            <span>Supplier</span>
            <input value={head.supplier} onChange={setH("supplier")} maxLength={200} />
          </label>
          <label className="field-input">
            <span>PO No.</span>
            <input value={head.poNumber} onChange={setH("poNumber")} maxLength={60} />
          </label>
          <label className="field-input">
            <span>DR No.</span>
            <input value={head.drNumber} onChange={setH("drNumber")} maxLength={60} />
          </label>
          <label className="field-input">
            <span>Invoice No.</span>
            <input value={head.invoiceNo} onChange={setH("invoiceNo")} maxLength={60} />
          </label>
          <label className="field-input">
            <span>IAR No. (blank = next number)</span>
            <input value={head.iarNo} onChange={setH("iarNo")} maxLength={30} placeholder={`${head.date.slice(0, 7)}-0001`} />
          </label>
        </div>

        <datalist id="inv-item-picker">
          {[...byLabel.keys()].map((label) => <option key={label} value={label} />)}
        </datalist>
        <table style={{ marginTop: 16 }}>
          <thead>
            <tr><th style={{ width: "46%" }}>Item</th><th className="num">Quantity</th><th className="num">Unit cost (₱)</th><th className="num">Amount</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const item = byLabel.get(l.pick.trim());
              return (
                <tr key={l.key}>
                  <td>
                    <input
                      className="table-input"
                      style={{ width: "100%" }}
                      list="inv-item-picker"
                      value={l.pick}
                      onChange={(e) => setL(l.key, "pick", e.target.value)}
                      placeholder="Type a code or name…"
                    />
                    {item && <div className="muted">{qty(item.qtyOnHand)} {item.unit} on hand · avg ₱{peso.format(item.avgCost)}</div>}
                  </td>
                  <td className="num">
                    <input className="table-input" type="number" min={0} step="any" style={{ width: 100, textAlign: "right" }} value={l.qty} onChange={(e) => setL(l.key, "qty", e.target.value)} />
                    {item && <span className="muted"> {item.unit}</span>}
                  </td>
                  <td className="num">
                    <input className="table-input" type="number" min={0} step="any" style={{ width: 110, textAlign: "right" }} value={l.unitCost} onChange={(e) => setL(l.key, "unitCost", e.target.value)} />
                  </td>
                  <td className="num">{peso.format((Number(l.qty) || 0) * (Number(l.unitCost) || 0))}</td>
                  <td>
                    {lines.length > 1 && (
                      <button className="clear-filters" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td><button className="clear-filters" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add a line</button></td>
              <td colSpan={2} className="num"><strong>Total</strong></td>
              <td className="num"><strong>₱{peso.format(total)}</strong></td>
              <td />
            </tr>
          </tbody>
        </table>

        <label className="field-input" style={{ marginTop: 12 }}>
          <span>Remarks (optional)</span>
          <input value={head.remarks} onChange={setH("remarks")} maxLength={500} placeholder="e.g. Inspected and found complete" />
        </label>

        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy} onClick={save}>Record delivery</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DeliveryView({ id, onClose, onVoided }: { id: number; onClose: () => void; onVoided: (message: string) => void }) {
  const { data: r, error } = useQuery<Receipt>({
    queryKey: [...INV_KEYS.receipts, "one", id],
    queryFn: () => apiGet(`/api/inventory/receipts/${id}`),
  });
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function doVoid() {
    setBusy(true);
    setErr("");
    try {
      await apiPost(`/api/inventory/receipts/${id}/void`, { reason });
      onVoided(`IAR No. ${r?.iarNo} voided — its stock was taken back out.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {r && (
          <>
            <h2 className="modal-title">
              IAR No. {r.iarNo} {r.status === "voided" && <span className="badge setting-badge act-gray">Voided</span>}
            </h2>
            <p className="modal-sub">
              {longDate(r.date)} · {r.supplier}
              {[r.poNumber && ` · PO ${r.poNumber}`, r.drNumber && ` · DR ${r.drNumber}`, r.invoiceNo && ` · Invoice ${r.invoiceNo}`].filter(Boolean).join("")}
              {r.by && ` · recorded by ${r.by}`}
            </p>
            {r.status === "voided" && <p className="form-error">Voided: {r.voidReason}</p>}
            <table>
              <thead>
                <tr><th>Item</th><th className="num">Quantity</th><th className="num">Unit cost</th><th className="num">Amount</th></tr>
              </thead>
              <tbody>
                {(r.items ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>{m.itemName}<div className="muted">{m.itemCode}</div></td>
                    <td className="num">{qty(m.qty)} {m.unit}</td>
                    <td className="num">{peso.format(m.unitCost)}</td>
                    <td className="num">{peso.format(m.totalCost)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="num"><strong>Total</strong></td>
                  <td className="num"><strong>₱{peso.format(r.totalCost)}</strong></td>
                </tr>
              </tbody>
            </table>
            {r.remarks && <p className="count">Remarks: {r.remarks}</p>}

            {r.status === "posted" && voiding && (
              <label className="field-input" style={{ marginTop: 12 }}>
                <span>Why is this delivery being voided?</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Entered twice; wrong quantities" />
              </label>
            )}
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {!voiding && <button className="clear-filters" onClick={() => openForm("iar", r.id)}>Print IAR</button>}
              {r.status === "posted" && !voiding && (
                <button className="danger" onClick={() => setVoiding(true)}>Void this delivery</button>
              )}
              {r.status === "posted" && voiding && (
                <button className="danger" disabled={busy || !reason.trim()} onClick={doVoid}>Void and take the stock back out</button>
              )}
              <button className="clear-filters" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
