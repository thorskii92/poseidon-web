import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { DeliveryForm } from "./InventoryDeliveries";
import { Attachments } from "./InventoryParts";
import { INV_KEYS, longDate, openForm, peso, qty, todayIso, type ItemsResponse } from "./inventoryShared";

/**
 * Purchasing: Purchase Requests (approved in Approvals, or here by an
 * approver) and Purchase Orders, which deliveries are received against.
 * API: poseidon-api inventoryPurchasing.ts.
 */

export type PrRow = {
  id: number; prNo: string; date: string; office: string; purpose: string; status: string; requestedBy: string;
  approvedBy: string; approverNote: string; fundCluster: string; lines?: number; estimate?: number; poNo: string;
};
type PrDetail = PrRow & {
  items: { itemId: number; code: string; name: string; unit: string; qty: number; estCost: number; onHand: number; avgCost: number; remarks: string }[];
  rights: { inventory: boolean; approve: boolean };
};
type PoRow = {
  id: number; poNo: string; date: string; supplier: string; supplierAddress: string; supplierTin: string; prId: number | null; prNo: string;
  status: string; deliveryPlace: string; deliveryTerm: string; paymentTerm: string; fundCluster: string; remarks: string; total: number;
  lines?: number; receivedPct?: number;
};
type PoDetail = PoRow & {
  items: { itemId: number; code: string; name: string; unit: string; qty: number; unitCost: number; received: number; outstanding: number }[];
  deliveries: { id: number; iarNo: string; date: string; status: string; total: number }[];
};

const PR_STATUS: Record<string, { label: string; badge: string }> = {
  pending: { label: "Waiting for approval", badge: "act-blue" },
  approved: { label: "Approved — make the PO", badge: "act-green" },
  ordered: { label: "Ordered", badge: "act-gray" },
  declined: { label: "Declined", badge: "act-red" },
  cancelled: { label: "Cancelled", badge: "act-gray" },
};
const PO_STATUS: Record<string, { label: string; badge: string }> = {
  open: { label: "Open", badge: "act-blue" },
  partial: { label: "Partly delivered", badge: "act-blue" },
  received: { label: "Received", badge: "act-green" },
  cancelled: { label: "Cancelled", badge: "act-gray" },
};

const KEY = ["inv-purchasing"];

export default function InventoryPurchasing({ onChanged }: { onChanged: (message: string) => void }) {
  const [view, setView] = useState<"prs" | "pos">("prs");
  return (
    <section className="record-section">
      <div className="record-head"><h2>Purchasing</h2></div>
      <div className="stage-tabs">
        <button className={view === "prs" ? "stage-tab current" : "stage-tab"} onClick={() => setView("prs")}>Purchase Requests</button>
        <button className={view === "pos" ? "stage-tab current" : "stage-tab"} onClick={() => setView("pos")}>Purchase Orders</button>
      </div>
      {view === "prs" ? <PrList onChanged={onChanged} /> : <PoList onChanged={onChanged} />}
    </section>
  );
}

/* ---------------- Purchase Requests ---------------- */

function PrList({ onChanged }: { onChanged: (message: string) => void }) {
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [makingPo, setMakingPo] = useState<PrDetail | null>(null);
  const { data, isLoading, error } = useQuery<{ rows: PrRow[] }>({
    queryKey: [...KEY, "prs", status],
    queryFn: () => apiGet(`/api/inventory/purchasing/prs?status=${status}`),
  });
  return (
    <>
      <div className="form-actions" style={{ marginTop: 0, marginBottom: 10 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All</option>
          {Object.entries(PR_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="primary" onClick={() => setCreating(true)}>New purchase request</button>
      </div>
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No purchase requests here.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead><tr><th>PR No.</th><th>Date</th><th>Office</th><th>Purpose</th><th className="num">Items</th><th className="num">Estimate</th><th>Status</th></tr></thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id} className="row-link" onClick={() => setOpen(p.id)}>
                <td>{p.prNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(p.date)}</td>
                <td>{p.office}</td>
                <td className="incident-details">{p.purpose}</td>
                <td className="num">{p.lines}</td>
                <td className="num">{peso.format(p.estimate ?? 0)}</td>
                <td>
                  <span className={`badge setting-badge ${PR_STATUS[p.status]?.badge ?? "act-gray"}`}>{PR_STATUS[p.status]?.label ?? p.status}</span>
                  {p.poNo && <div className="muted">{p.poNo}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <PrForm onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); onChanged(m); }} />}
      {open != null && (
        <PrView
          id={open}
          onClose={() => setOpen(null)}
          onDone={(m) => { setOpen(null); onChanged(m); }}
          onMakePo={(pr) => { setOpen(null); setMakingPo(pr); }}
        />
      )}
      {makingPo && <PoForm fromPr={makingPo} onClose={() => setMakingPo(null)} onSaved={(m) => { setMakingPo(null); onChanged(m); }} />}
    </>
  );
}

type Line = { key: number; pick: string; qty: string; cost: string };
let lineKey = 1;
const blank = (): Line => ({ key: lineKey++, pick: "", qty: "", cost: "" });

/** Item lines picked by "CODE — Name", shared by the PR and PO forms. */
function useItemPicker() {
  const { data } = useQuery<ItemsResponse>({ queryKey: [...INV_KEYS.items, "active=1"], queryFn: () => apiGet("/api/inventory/items?active=1") });
  return useMemo(() => new Map((data?.rows ?? []).map((i) => [`${i.code} — ${i.name}`, i])), [data]);
}

function LinesEditor({ lines, setLines, costLabel, byLabel }: {
  lines: Line[]; setLines: (fn: (ls: Line[]) => Line[]) => void; costLabel: string; byLabel: ReturnType<typeof useItemPicker>;
}) {
  const setL = (key: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0);
  return (
    <>
      <datalist id="inv-pur-picker">{[...byLabel.keys()].map((k) => <option key={k} value={k} />)}</datalist>
      <table style={{ marginTop: 14 }}>
        <thead><tr><th style={{ width: "48%" }}>Item</th><th className="num">Quantity</th><th className="num">{costLabel}</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => {
            const item = byLabel.get(l.pick.trim());
            return (
              <tr key={l.key}>
                <td>
                  <input className="table-input" style={{ width: "100%" }} list="inv-pur-picker" value={l.pick} onChange={(e) => setL(l.key, "pick", e.target.value)} placeholder="Type a code or name…" />
                  {item && <div className="muted">{qty(item.qtyOnHand)} {item.unit} on hand · avg ₱{peso.format(item.avgCost)}</div>}
                </td>
                <td className="num"><input className="table-input" type="number" min={0} step="any" style={{ width: 90, textAlign: "right" }} value={l.qty} onChange={(e) => setL(l.key, "qty", e.target.value)} /></td>
                <td className="num"><input className="table-input" type="number" min={0} step="any" style={{ width: 110, textAlign: "right" }} value={l.cost} onChange={(e) => setL(l.key, "cost", e.target.value)} /></td>
                <td className="num">{peso.format((Number(l.qty) || 0) * (Number(l.cost) || 0))}</td>
                <td>{lines.length > 1 && <button className="clear-filters" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button>}</td>
              </tr>
            );
          })}
          <tr>
            <td><button className="clear-filters" onClick={() => setLines((ls) => [...ls, blank()])}>+ Add a line</button></td>
            <td colSpan={2} className="num"><strong>Total</strong></td>
            <td className="num"><strong>₱{peso.format(total)}</strong></td>
            <td />
          </tr>
        </tbody>
      </table>
    </>
  );
}

function resolveLines(lines: Line[], byLabel: ReturnType<typeof useItemPicker>) {
  const used = lines.filter((l) => l.pick.trim() || l.qty);
  const unknown = used.find((l) => !byLabel.get(l.pick.trim()));
  if (!used.length) return { error: "Add at least one item." };
  if (unknown) return { error: `"${unknown.pick || "(blank)"}" isn't an item — pick one from the list.` };
  if (used.some((l) => !(Number(l.qty) > 0))) return { error: "Every item needs a quantity." };
  return { lines: used.map((l) => ({ itemId: byLabel.get(l.pick.trim())!.id, qty: Number(l.qty), cost: Number(l.cost) || 0 })) };
}

function PrForm({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string) => void }) {
  const byLabel = useItemPicker();
  const [office, setOffice] = useState("");
  const [purpose, setPurpose] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function fillFromReorder() {
    try {
      const r = await apiGet<{ rows: { code: string; name: string; qty: number; avgCost: number }[] }>("/api/inventory/purchasing/prs/suggest");
      if (!r.rows.length) return setError("No item is at or below its reorder level.");
      setLines(r.rows.map((s) => ({ ...blank(), pick: `${s.code} — ${s.name}`, qty: String(s.qty), cost: s.avgCost ? String(s.avgCost) : "" })));
      if (!purpose) setPurpose("Replenishment of stock below reorder level");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function save() {
    setError("");
    if (!office.trim() || !purpose.trim()) return setError("Enter the office and the purpose.");
    const r = resolveLines(lines, byLabel);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const res = await apiPost<{ prNo: string }>("/api/inventory/purchasing/prs", {
        office, purpose, fundCluster, lines: r.lines!.map((l) => ({ itemId: l.itemId, qty: l.qty, estCost: l.cost })),
      });
      onSaved(`Purchase request ${res.prNo} filed — it now waits for approval.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New purchase request</h2>
        <p className="modal-sub">What to buy, for approval. <button className="link-button" onClick={fillFromReorder}>Fill with the items below their reorder level</button></p>
        <div className="form-grid">
          <label className="field-input"><span>Office / section</span><input value={office} onChange={(e) => setOffice(e.target.value)} maxLength={150} /></label>
          <label className="field-input"><span>Fund cluster (optional)</span><input value={fundCluster} onChange={(e) => setFundCluster(e.target.value)} maxLength={30} /></label>
          <label className="field-input wide"><span>Purpose</span><input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} /></label>
        </div>
        <LinesEditor lines={lines} setLines={setLines} costLabel="Est. unit cost (₱)" byLabel={byLabel} />
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy} onClick={save}>File purchase request</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** One PR: approve/decline (approvers), make the PO or cancel (supply office), print. Also used in Approvals. */
export function PrView({ id, onClose, onDone, onMakePo }: {
  id: number; onClose: () => void; onDone: (m: string) => void; onMakePo?: (pr: PrDetail) => void;
}) {
  const { data: p, error } = useQuery<PrDetail>({ queryKey: [...KEY, "pr", id], queryFn: () => apiGet(`/api/inventory/purchasing/prs/${id}`) });
  const [mode, setMode] = useState<"view" | "decline">("view");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(path: string, body: unknown, message: string) {
    setBusy(true);
    setErr("");
    try {
      await apiPost(`/api/inventory/purchasing/prs/${id}/${path}`, body);
      onDone(message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = p?.items.reduce((s, l) => s + l.qty * l.estCost, 0) ?? 0;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {p && (
          <>
            <h2 className="modal-title">
              {p.prNo} <span className={`badge setting-badge ${PR_STATUS[p.status]?.badge ?? "act-gray"}`}>{PR_STATUS[p.status]?.label ?? p.status}</span>
            </h2>
            <p className="modal-sub">{longDate(p.date)} · {p.office} · by {p.requestedBy || "—"}{p.poNo ? ` · ${p.poNo}` : ""}</p>
            <p><strong>Purpose:</strong> {p.purpose}</p>
            <table>
              <thead><tr><th>Item</th><th className="num">Quantity</th><th className="num">On hand</th><th className="num">Est. unit cost</th><th className="num">Est. amount</th></tr></thead>
              <tbody>
                {p.items.map((l) => (
                  <tr key={l.itemId}>
                    <td>{l.name}<div className="muted">{l.code}</div></td>
                    <td className="num">{qty(l.qty)} {l.unit}</td>
                    <td className="num">{qty(l.onHand)}</td>
                    <td className="num">{peso.format(l.estCost)}</td>
                    <td className="num">{peso.format(l.qty * l.estCost)}</td>
                  </tr>
                ))}
                <tr><td colSpan={4} className="num"><strong>Total estimate</strong></td><td className="num"><strong>₱{peso.format(total)}</strong></td></tr>
              </tbody>
            </table>
            {p.approverNote && <p className="count">{p.status === "declined" ? "Declined" : "Approver's note"}: {p.approverNote}{p.approvedBy ? ` — ${p.approvedBy}` : ""}</p>}
            {mode === "decline" && (
              <label className="field-input" style={{ marginTop: 10 }}>
                <span>Why is it declined?</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
              </label>
            )}
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {mode === "view" && p.status === "pending" && p.rights.approve && (
                <>
                  <button className="primary" disabled={busy} onClick={() => run("approve", {}, `${p.prNo} approved — the supply office can issue the PO.`)}>Approve</button>
                  <button className="danger" onClick={() => setMode("decline")}>Decline…</button>
                </>
              )}
              {mode === "decline" && (
                <button className="danger" disabled={busy || !note.trim()} onClick={() => run("decline", { note }, `${p.prNo} declined.`)}>Decline</button>
              )}
              {mode === "view" && p.status === "approved" && p.rights.inventory && onMakePo && (
                <button className="primary" onClick={() => onMakePo(p)}>Make the purchase order…</button>
              )}
              {mode === "view" && p.status === "pending" && p.rights.inventory && (
                <button className="clear-filters" disabled={busy} onClick={() => window.confirm("Cancel this purchase request?") && run("cancel", {}, `${p.prNo} cancelled.`)}>Cancel request</button>
              )}
              <button className="clear-filters" onClick={() => openForm("pr", p.id)}>Print PR</button>
              <button className="clear-filters" onClick={() => (mode === "view" ? onClose() : setMode("view"))}>{mode === "view" ? "Close" : "Back"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Purchase Orders ---------------- */

function PoList({ onChanged }: { onChanged: (message: string) => void }) {
  const [status, setStatus] = useState("outstanding");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery<{ rows: PoRow[] }>({
    queryKey: [...KEY, "pos", status],
    queryFn: () => apiGet(`/api/inventory/purchasing/pos?status=${status}`),
  });
  return (
    <>
      <div className="form-actions" style={{ marginTop: 0, marginBottom: 10 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="outstanding">Waiting for delivery</option>
          <option value="all">All</option>
          {Object.entries(PO_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="primary" onClick={() => setCreating(true)}>New purchase order</button>
      </div>
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No purchase orders here.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead><tr><th>PO No.</th><th>Date</th><th>Supplier</th><th>PR</th><th className="num">Amount</th><th className="num">Delivered</th><th>Status</th></tr></thead>
          <tbody>
            {data.rows.map((o) => (
              <tr key={o.id} className="row-link" onClick={() => setOpen(o.id)}>
                <td>{o.poNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(o.date)}</td>
                <td>{o.supplier}</td>
                <td>{o.prNo}</td>
                <td className="num">{peso.format(o.total)}</td>
                <td className="num">{o.receivedPct ?? 0}%</td>
                <td><span className={`badge setting-badge ${PO_STATUS[o.status]?.badge ?? "act-gray"}`}>{PO_STATUS[o.status]?.label ?? o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <PoForm onClose={() => setCreating(false)} onSaved={(m) => { setCreating(false); onChanged(m); }} />}
      {open != null && <PoView id={open} onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); onChanged(m); }} />}
    </>
  );
}

function PoForm({ fromPr, onClose, onSaved }: { fromPr?: PrDetail; onClose: () => void; onSaved: (m: string) => void }) {
  const byLabel = useItemPicker();
  const [h, setH] = useState({
    date: todayIso(), supplier: "", supplierAddress: "", supplierTin: "", deliveryPlace: "", deliveryTerm: "", paymentTerm: "",
    fundCluster: fromPr?.fundCluster ?? "", remarks: "",
  });
  const [lines, setLines] = useState<Line[]>(() =>
    fromPr ? fromPr.items.map((l) => ({ ...blank(), pick: `${l.code} — ${l.name}`, qty: String(l.qty), cost: l.estCost ? String(l.estCost) : "" })) : [blank(), blank()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof h) => (e: { target: { value: string } }) => setH((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setError("");
    if (!h.supplier.trim()) return setError("Enter the supplier.");
    const r = resolveLines(lines, byLabel);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const res = await apiPost<{ id: number; poNo: string }>("/api/inventory/purchasing/pos", {
        ...h, prId: fromPr?.id, lines: r.lines!.map((l) => ({ itemId: l.itemId, qty: l.qty, unitCost: l.cost })),
      });
      openForm("po", res.id);
      onSaved(`Purchase order ${res.poNo} issued to ${h.supplier}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New purchase order{fromPr ? ` from ${fromPr.prNo}` : ""}</h2>
        <div className="form-grid">
          <label className="field-input wide"><span>Supplier</span><input value={h.supplier} onChange={set("supplier")} maxLength={200} /></label>
          <label className="field-input"><span>Supplier TIN</span><input value={h.supplierTin} onChange={set("supplierTin")} maxLength={30} /></label>
          <label className="field-input wide"><span>Supplier address</span><input value={h.supplierAddress} onChange={set("supplierAddress")} maxLength={300} /></label>
          <label className="field-input"><span>Place of delivery</span><input value={h.deliveryPlace} onChange={set("deliveryPlace")} maxLength={200} /></label>
          <label className="field-input"><span>Delivery term</span><input value={h.deliveryTerm} onChange={set("deliveryTerm")} maxLength={100} placeholder="e.g. 15 days from receipt of PO" /></label>
          <label className="field-input"><span>Payment term</span><input value={h.paymentTerm} onChange={set("paymentTerm")} maxLength={100} /></label>
          <label className="field-input"><span>Fund cluster</span><input value={h.fundCluster} onChange={set("fundCluster")} maxLength={30} /></label>
        </div>
        <LinesEditor lines={lines} setLines={setLines} costLabel="Unit cost (₱)" byLabel={byLabel} />
        <label className="field-input" style={{ marginTop: 10 }}><span>Remarks (optional)</span><input value={h.remarks} onChange={set("remarks")} maxLength={500} /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy} onClick={save}>Issue the PO and print it</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PoView({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (m: string) => void }) {
  const { data: o, error } = useQuery<PoDetail>({ queryKey: [...KEY, "po", id], queryFn: () => apiGet(`/api/inventory/purchasing/pos/${id}`) });
  const [receiving, setReceiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const outstanding = o?.items.filter((l) => l.outstanding > 0) ?? [];

  if (receiving && o) {
    return (
      <DeliveryForm
        fromPo={{ id: o.id, poNo: o.poNo, supplier: o.supplier, fundCluster: o.fundCluster, lines: outstanding.map((l) => ({ code: l.code, name: l.name, qty: l.outstanding, unitCost: l.unitCost })) }}
        onClose={() => setReceiving(false)}
        onSaved={(m) => onDone(m)}
      />
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {o && (
          <>
            <h2 className="modal-title">
              PO No. {o.poNo} <span className={`badge setting-badge ${PO_STATUS[o.status]?.badge ?? "act-gray"}`}>{PO_STATUS[o.status]?.label ?? o.status}</span>
            </h2>
            <p className="modal-sub">{longDate(o.date)} · {o.supplier}{o.prNo ? ` · from ${o.prNo}` : ""}{o.paymentTerm ? ` · ${o.paymentTerm}` : ""}</p>
            <table>
              <thead><tr><th>Item</th><th className="num">Ordered</th><th className="num">Unit cost</th><th className="num">Delivered</th><th className="num">Outstanding</th></tr></thead>
              <tbody>
                {o.items.map((l) => (
                  <tr key={l.itemId}>
                    <td>{l.name}<div className="muted">{l.code}</div></td>
                    <td className="num">{qty(l.qty)} {l.unit}</td>
                    <td className="num">{peso.format(l.unitCost)}</td>
                    <td className="num">{qty(l.received)}</td>
                    <td className="num" style={l.outstanding ? { fontWeight: 600 } : undefined}>{l.outstanding ? qty(l.outstanding) : "—"}</td>
                  </tr>
                ))}
                <tr><td colSpan={4} className="num"><strong>PO amount</strong></td><td className="num"><strong>₱{peso.format(o.total)}</strong></td></tr>
              </tbody>
            </table>
            {o.deliveries.length > 0 && (
              <p className="count">Deliveries: {o.deliveries.map((d) => `IAR ${d.iarNo} (${longDate(d.date)}${d.status === "voided" ? ", voided" : ""})`).join(" · ")}</p>
            )}
            <Attachments refkind="po" refid={o.id} title="Scanned PO / signed conforme" />
            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {(o.status === "open" || o.status === "partial") && <button className="primary" onClick={() => setReceiving(true)}>Record a delivery against it…</button>}
              <button className="clear-filters" onClick={() => openForm("po", o.id)}>Print PO</button>
              {o.status === "open" && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={async () => {
                    const reason = window.prompt("Why is this PO cancelled?");
                    if (reason == null) return;
                    setBusy(true);
                    setErr("");
                    try {
                      await apiPost(`/api/inventory/purchasing/pos/${o.id}/cancel`, { reason });
                      onDone(`PO No. ${o.poNo} cancelled.`);
                    } catch (e) {
                      setErr((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cancel PO
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
