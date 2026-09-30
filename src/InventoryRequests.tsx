import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import { LocationPicker } from "./InventoryLocationPicker";
import {
  INV_KEYS, INV_REQUESTS_SEEN_KEY, REQUEST_STATUS, longDate, openForm, peso, qty, todayIso,
  type RequestDetail, type RequestStatus, type Rights, type SupplyRequest,
} from "./inventoryShared";

/**
 * Supply requests (RIS): file → approve → release. What each person can do
 * depends on their role — anyone may file, approvers approve or decline,
 * the supply office releases (see poseidon-api's inventoryRequests.ts).
 */

type CatalogItem = { id: number; code: string; name: string; unit: string; category: string; qtyOnHand: number };

const FILTERS: { id: string; label: string }[] = [
  { id: "pending", label: "Waiting for approval" },
  { id: "approved", label: "To release" },
  { id: "released", label: "Released" },
  { id: "declined", label: "Declined" },
  { id: "all", label: "All" },
];

export default function InventoryRequests({ onChanged }: { onChanged: (message: string) => void }) {
  const qc = useQueryClient();
  // Opening Requests counts as having seen the news on your own requests.
  useEffect(() => {
    try {
      localStorage.setItem(INV_REQUESTS_SEEN_KEY, String(Date.now()));
    } catch {
      /* storage blocked: the badge just keeps counting */
    }
    qc.invalidateQueries({ queryKey: [...INV_KEYS.requests, "waiting", "nav"] });
  }, [qc]);
  const [status, setStatus] = useState("pending");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading, error } = useQuery<{ rows: SupplyRequest[]; rights: Rights }>({
    queryKey: [...INV_KEYS.requests, status],
    queryFn: () => apiGet(`/api/inventory/requests?status=${status}`),
  });
  const { data: waiting } = useQuery<{ toApprove: number; toRelease: number; rights: Rights }>({
    queryKey: [...INV_KEYS.requests, "waiting"],
    queryFn: () => apiGet("/api/inventory/requests/waiting"),
  });
  const rights = waiting?.rights ?? data?.rights;

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Supply requests (RIS)</h2>
        {rights?.request && <button className="primary" onClick={() => setCreating(true)}>New request</button>}
      </div>
      {rights && !rights.inventory && !rights.approve && (
        <p className="count">You see the requests you filed. The supply office releases them once approved.</p>
      )}

      <div className="stage-tabs">
        {FILTERS.map((f) => {
          const n = f.id === "pending" ? waiting?.toApprove : f.id === "approved" ? waiting?.toRelease : 0;
          return (
            <button key={f.id} className={status === f.id ? "stage-tab current" : "stage-tab"} onClick={() => setStatus(f.id)}>
              {f.label}
              {!!n && <span className="stage-count">{n}</span>}
            </button>
          );
        })}
      </div>

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No requests here.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr><th>RIS No.</th><th>Date</th><th>Office</th><th>Purpose</th><th>Requested by</th><th className="num">Items</th><th className="num">Issued value</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => setOpen(r.id)}>
                <td>{r.risNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(r.date)}</td>
                <td>{r.office}</td>
                <td className="incident-details">{r.purpose}</td>
                <td>{r.requestedBy}</td>
                <td className="num">{r.lines}</td>
                <td className="num">{r.status === "released" ? peso.format(r.value ?? 0) : "—"}</td>
                <td><span className={`badge setting-badge ${REQUEST_STATUS[r.status]?.badge ?? "act-gray"}`}>{REQUEST_STATUS[r.status]?.label ?? r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <RequestForm
          onClose={() => setCreating(false)}
          onSaved={(m) => {
            setCreating(false);
            onChanged(m);
          }}
        />
      )}
      {open != null && (
        <RequestView
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

type Line = { key: number; pick: string; qty: string; remarks: string };
let lineKey = 1;
const blankLine = (): Line => ({ key: lineKey++, pick: "", qty: "", remarks: "" });

function RequestForm({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const { data: catalog } = useQuery<{ rows: CatalogItem[] }>({
    queryKey: [...INV_KEYS.requests, "catalog"],
    queryFn: () => apiGet("/api/inventory/requests/catalog"),
  });
  const byLabel = useMemo(() => new Map((catalog?.rows ?? []).map((i) => [`${i.code} — ${i.name}`, i])), [catalog]);
  const [office, setOffice] = useState("");
  const [purpose, setPurpose] = useState("");
  const [fundCluster, setFundCluster] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setL = (key: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [k]: v } : l)));

  async function save() {
    setError("");
    const used = lines.filter((l) => l.pick.trim() || l.qty);
    const unknown = used.find((l) => !byLabel.get(l.pick.trim()));
    if (!office.trim()) return setError("Enter your office.");
    if (!purpose.trim()) return setError("Enter the purpose.");
    if (!used.length) return setError("Add at least one item.");
    if (unknown) return setError(`"${unknown.pick || "(blank)"}" isn't an item — pick one from the list.`);
    if (used.some((l) => !(Number(l.qty) > 0))) return setError("Every item needs a quantity.");
    setBusy(true);
    try {
      const r = await apiPost<{ risNo: string }>("/api/inventory/requests", {
        office, purpose, fundCluster,
        lines: used.map((l) => ({ itemId: byLabel.get(l.pick.trim())!.id, qty: Number(l.qty), remarks: l.remarks })),
      });
      onSaved(`Request filed as RIS No. ${r.risNo} — it now waits for approval.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Request supplies</h2>
        <p className="modal-sub">Requisition and Issue Slip — approved first, then released by the supply office.</p>
        <div className="form-grid">
          <label className="field-input">
            <span>Office / division</span>
            <input value={office} onChange={(e) => setOffice(e.target.value)} maxLength={150} placeholder="e.g. MEEDO — Waterworks" />
          </label>
          <label className="field-input">
            <span>Fund cluster (optional)</span>
            <input value={fundCluster} onChange={(e) => setFundCluster(e.target.value)} maxLength={30} />
          </label>
          <label className="field-input wide">
            <span>Purpose</span>
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={500} placeholder="e.g. Repair of main line, Brgy. Punta Baja" />
          </label>
        </div>
        <datalist id="inv-request-picker">
          {[...byLabel.keys()].map((label) => <option key={label} value={label} />)}
        </datalist>
        <table style={{ marginTop: 16 }}>
          <thead><tr><th style={{ width: "50%" }}>Item</th><th className="num">Quantity</th><th>Remarks</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => {
              const item = byLabel.get(l.pick.trim());
              return (
                <tr key={l.key}>
                  <td>
                    <input className="table-input" style={{ width: "100%" }} list="inv-request-picker" value={l.pick} onChange={(e) => setL(l.key, "pick", e.target.value)} placeholder="Type a code or name…" />
                    {item && <div className="muted">{qty(item.qtyOnHand)} {item.unit} in stock</div>}
                  </td>
                  <td className="num">
                    <input className="table-input" type="number" min={0} step="any" style={{ width: 90, textAlign: "right" }} value={l.qty} onChange={(e) => setL(l.key, "qty", e.target.value)} />
                    {item && <span className="muted"> {item.unit}</span>}
                  </td>
                  <td><input className="table-input" style={{ width: "100%" }} value={l.remarks} maxLength={300} onChange={(e) => setL(l.key, "remarks", e.target.value)} /></td>
                  <td>{lines.length > 1 && <button className="clear-filters" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">✕</button>}</td>
                </tr>
              );
            })}
            <tr><td colSpan={4}><button className="clear-filters" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add a line</button></td></tr>
          </tbody>
        </table>
        <p className="count">Only supplies and materials are requested here. Equipment and water meters are issued by the supply office.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy} onClick={save}>File request</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function RequestView({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (message: string) => void }) {
  const { data: r, error } = useQuery<RequestDetail>({
    queryKey: [...INV_KEYS.requests, "one", id],
    queryFn: () => apiGet(`/api/inventory/requests/${id}`),
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {!r && !error && <p className="count">Loading…</p>}
        {r && <RequestActions key={`${r.id}-${r.status}`} r={r} onClose={onClose} onDone={onDone} />}
      </div>
    </div>
  );
}

type Mode = "view" | "approve" | "decline" | "release";

function RequestActions({ r, onClose, onDone }: { r: RequestDetail; onClose: () => void; onDone: (message: string) => void }) {
  const [mode, setMode] = useState<Mode>("view");
  const [qtys, setQtys] = useState<Record<number, string>>(() =>
    Object.fromEntries(r.items.map((l) => [l.itemId, String(r.status === "approved" ? Math.min(l.qtyApproved ?? 0, l.onHand) : l.qtyRequested)])),
  );
  const [note, setNote] = useState("");
  const [receivedBy, setReceivedBy] = useState(r.requestedBy);
  const [date, setDate] = useState(todayIso());
  const [locationId, setLocationId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const can = r.rights;

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      onDone(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const editing = mode === "approve" || mode === "release";
  const value = r.items.reduce((s, l) => s + (l.qtyIssued ?? 0) * (l.unitCost ?? 0), 0);

  return (
    <>
      <h2 className="modal-title">
        RIS No. {r.risNo}{" "}
        <span className={`badge setting-badge ${REQUEST_STATUS[r.status as RequestStatus]?.badge ?? "act-gray"}`}>{REQUEST_STATUS[r.status as RequestStatus]?.label ?? r.status}</span>
      </h2>
      <p className="modal-sub">
        {longDate(r.date)} · {r.office} · requested by {r.requestedBy || "—"}
      </p>
      <p><strong>Purpose:</strong> {r.purpose}</p>

      <table>
        <thead>
          <tr>
            <th>Item</th><th className="num">Requested</th><th className="num">Approved</th><th className="num">Issued</th>
            {(can.inventory || can.approve) && <th className="num">In stock</th>}
            {editing && <th className="num">{mode === "approve" ? "Approve" : "Issue now"}</th>}
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((l) => (
            <tr key={l.itemId}>
              <td>{l.name}<div className="muted">{l.code}</div></td>
              <td className="num">{qty(l.qtyRequested)} {l.unit}</td>
              <td className="num">{l.qtyApproved == null ? "—" : qty(l.qtyApproved)}</td>
              <td className="num">{l.qtyIssued == null ? "—" : qty(l.qtyIssued)}</td>
              {(can.inventory || can.approve) && (
                <td className="num" style={l.onHand < (l.qtyApproved ?? l.qtyRequested) ? { color: "#c0392b", fontWeight: 600 } : undefined}>{qty(l.onHand)}</td>
              )}
              {editing && (
                <td className="num">
                  <input className="table-input" type="number" min={0} step="any" style={{ width: 90, textAlign: "right" }} value={qtys[l.itemId] ?? ""} onChange={(e) => setQtys((q) => ({ ...q, [l.itemId]: e.target.value }))} />
                </td>
              )}
              <td className="muted">{l.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {r.approverNote && <p className="count">{r.status === "declined" ? "Declined" : "Approver's note"}: {r.approverNote}{r.approvedBy ? ` — ${r.approvedBy}` : ""}</p>}
      {r.status === "released" && (
        <p className="count">
          Released {longDate(r.releaseDate)} by {r.releasedBy || "—"} · received by {r.receivedBy} · value ₱{peso.format(value)}
        </p>
      )}

      {mode === "approve" && (
        <label className="field-input" style={{ marginTop: 10 }}>
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Reduced — the rest next month" />
        </label>
      )}
      {mode === "decline" && (
        <label className="field-input" style={{ marginTop: 10 }}>
          <span>Why is it declined?</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </label>
      )}
      {mode === "release" && (
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field-input">
            <span>Received by</span>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} maxLength={150} />
          </label>
          <label className="field-input">
            <span>Date released</span>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <LocationPicker label="Issue from" value={locationId} onChange={setLocationId} />
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        {mode === "view" && (
          <>
            {r.status === "pending" && can.approve && (
              <>
                <button className="primary" onClick={() => setMode("approve")}>Approve…</button>
                <button className="danger" onClick={() => setMode("decline")}>Decline…</button>
              </>
            )}
            {r.status === "approved" && can.inventory && <button className="primary" onClick={() => setMode("release")}>Release items…</button>}
            {r.status === "approved" && can.approve && <button className="danger" onClick={() => setMode("decline")}>Decline…</button>}
            {r.status === "pending" && (
              <button
                className="clear-filters"
                disabled={busy}
                onClick={() => window.confirm("Cancel this request?") && run(async () => { await apiPost(`/api/inventory/requests/${r.id}/cancel`, {}); return `RIS No. ${r.risNo} cancelled.`; })}
              >
                Cancel request
              </button>
            )}
            <button className="clear-filters" onClick={() => openForm("ris", r.id)}>Print RIS</button>
          </>
        )}
        {mode === "approve" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => run(async () => {
              await apiPost(`/api/inventory/requests/${r.id}/approve`, { note, lines: r.items.map((l) => ({ itemId: l.itemId, qtyApproved: Number(qtys[l.itemId] || 0) })) });
              return `RIS No. ${r.risNo} approved — the supply office can release it.`;
            })}
          >
            Approve
          </button>
        )}
        {mode === "decline" && (
          <button className="danger" disabled={busy || !note.trim()} onClick={() => run(async () => {
            await apiPost(`/api/inventory/requests/${r.id}/decline`, { note });
            return `RIS No. ${r.risNo} declined.`;
          })}>
            Decline
          </button>
        )}
        {mode === "release" && (
          <button
            className="primary"
            disabled={busy || !receivedBy.trim()}
            onClick={() => run(async () => {
              await apiPost(`/api/inventory/requests/${r.id}/release`, { receivedBy, date, locationId, lines: r.items.map((l) => ({ itemId: l.itemId, qtyIssued: Number(qtys[l.itemId] || 0) })) });
              return `RIS No. ${r.risNo} released to ${receivedBy}.`;
            })}
          >
            Release and take out of stock
          </button>
        )}
        <button className="clear-filters" onClick={() => (mode === "view" ? onClose() : setMode("view"))}>{mode === "view" ? "Close" : "Back"}</button>
      </div>
    </>
  );
}
