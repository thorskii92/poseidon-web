import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import AdminAuth from "./AdminAuth";
import { LocationPicker } from "./InventoryLocationPicker";
import { Attachments } from "./InventoryParts";
import {
  EVENT_LABEL, INV_KEYS, longDate, openForm, peso, todayIso,
  type Asset, type AssetEvent, type CustodyDoc, type UnregisteredItem,
} from "./inventoryShared";

/**
 * Equipment and water meters, one unit at a time (poseidon-api's
 * inventoryAssets.ts). Units are registered from stock with a property or
 * serial number, then issued to a person (ICS/PAR), transferred (ITR/PTR),
 * returned (RRSP/PRS), installed at an account, or disposed (IIRUP).
 */

type View = "equipment" | "meter" | "docs" | "count";
const PAR_THRESHOLD = 50_000;

type Depreciation = { residual: number; monthly: number; months: number; accumulated: number; bookValue: number } | null;
type Unit = Asset & {
  usefulLife: number | null; residualPct: number; acquiredDate: string; classification: "ppe" | "semi" | "meter"; depreciation: Depreciation;
};

const DOC_LABEL: Record<string, string> = {
  ICS: "Inventory Custodian Slip", PAR: "Property Acknowledgment Receipt", ITR: "Inventory Transfer Report",
  PTR: "Property Transfer Report", RRSP: "Receipt of Returned Semi-expendable Property", PRS: "Property Return Slip",
  IIRUP: "Inventory & Inspection Report of Unserviceable Property", WMR: "Waste Materials Report",
};

const printLabels = (ids: number[]) => openForm("labels", 0, `ids=${ids.join(",")}`);

export default function InventoryAssets({ onChanged }: { onChanged: (message: string) => void }) {
  const [view, setView] = useState<View>("equipment");
  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Equipment & meters</h2>
      </div>
      <div className="stage-tabs">
        <button className={view === "equipment" ? "stage-tab current" : "stage-tab"} onClick={() => setView("equipment")}>Equipment</button>
        <button className={view === "meter" ? "stage-tab current" : "stage-tab"} onClick={() => setView("meter")}>Water meters</button>
        <button className={view === "docs" ? "stage-tab current" : "stage-tab"} onClick={() => setView("docs")}>Property documents</button>
        <button className={view === "count" ? "stage-tab current" : "stage-tab"} onClick={() => setView("count")}>Equipment count</button>
      </div>
      {view === "docs" && <PropertyDocs />}
      {view === "count" && <EquipmentCounts onChanged={onChanged} />}
      {(view === "equipment" || view === "meter") && <Units key={view} kind={view} onChanged={onChanged} />}
    </section>
  );
}

const STATUSES: Record<"equipment" | "meter", { id: string; label: string }[]> = {
  equipment: [
    { id: "all", label: "All" }, { id: "in-stock", label: "In stock" }, { id: "issued", label: "Issued" },
    { id: "damaged", label: "Damaged" }, { id: "lost", label: "Lost" }, { id: "disposed", label: "Disposed" },
  ],
  meter: [
    { id: "all", label: "All" }, { id: "in-stock", label: "In stock" }, { id: "installed", label: "Installed" },
    { id: "defective", label: "Defective" }, { id: "disposed", label: "Disposed" },
  ],
};

const DISPOSABLE = ["in-stock", "damaged", "defective", "lost", "pulled-out"];

function Units({ kind, onChanged }: { kind: "equipment" | "meter"; onChanged: (message: string) => void }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [registering, setRegistering] = useState<UnregisteredItem | null>(null);
  const [action, setAction] = useState<null | "issue" | "return" | "transfer" | "dispose">(null);
  const [open, setOpen] = useState<number | null>(null);
  const qs = new URLSearchParams({ kind, status, search }).toString();
  const { data, isLoading, error } = useQuery<{ rows: Unit[]; items: UnregisteredItem[] }>({
    queryKey: [...INV_KEYS.assets, qs],
    queryFn: () => apiGet(`/api/inventory/assets?${qs}`),
  });
  const pending = (data?.items ?? []).filter((i) => i.kind === kind && i.unregistered > 0);
  const chosen = (data?.rows ?? []).filter((a) => picked.includes(a.id));
  const allIn = (s: string[]) => chosen.length > 0 && chosen.every((a) => s.includes(a.status));
  const done = (m: string) => {
    setPicked([]);
    setAction(null);
    onChanged(m);
  };

  return (
    <>
      {pending.length > 0 && (
        <div className="action-notice" style={{ animation: "none", marginBottom: 12 }}>
          {kind === "meter" ? "Meters" : "Equipment"} in stock without a {kind === "meter" ? "serial" : "property"} number yet:{" "}
          {pending.map((i, n) => (
            <span key={i.id}>
              {n > 0 && " · "}
              <button className="clear-filters" onClick={() => setRegistering(i)}>
                {i.name}: {i.unregistered} — register
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <label className="field-input">
          <span>Search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={kind === "meter" ? "Serial no., account no." : "Property no., serial, person"} />
        </label>
        <label className="field-input">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES[kind].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {picked.length > 0 && (
        <div className="form-actions" style={{ marginTop: 0, marginBottom: 10 }}>
          <strong style={{ alignSelf: "center" }}>{picked.length} selected:</strong>
          {kind === "equipment" && allIn(["in-stock"]) && <button className="primary" onClick={() => setAction("issue")}>Issue to a person…</button>}
          {kind === "equipment" && allIn(["issued"]) && <button className="primary" onClick={() => setAction("return")}>Return…</button>}
          {kind === "equipment" && allIn(["issued"]) && <button className="clear-filters" onClick={() => setAction("transfer")}>Transfer…</button>}
          {allIn(DISPOSABLE) && <button className="danger" onClick={() => setAction("dispose")}>Dispose (IIRUP)…</button>}
          <button className="clear-filters" onClick={() => printLabels(picked)}>Print labels</button>
          <button className="clear-filters" onClick={() => setPicked([])}>Clear selection</button>
        </div>
      )}

      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && (
        <p className="count">
          No {kind === "meter" ? "meters" : "equipment"} registered{status !== "all" || search ? " that match" : " yet — record the delivery, then register each unit's number"}.
        </p>
      )}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={picked.length > 0 && picked.length === data.rows.length}
                  onChange={(e) => setPicked(e.target.checked ? data.rows.map((a) => a.id) : [])}
                />
              </th>
              <th>{kind === "meter" ? "Serial no." : "Property no."}</th>
              <th>Item</th>
              <th>{kind === "meter" ? "Property no." : "Serial no."}</th>
              <th>Status</th>
              <th>{kind === "meter" ? "Account" : "Accountable person"}</th>
              <th className="num">{kind === "meter" ? "Unit cost" : "Cost / book value"}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((a) => (
              <tr key={a.id} className="row-link" onClick={() => setOpen(a.id)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                </td>
                <td>{(kind === "meter" ? a.serialNo : a.propertyNo) || "—"}</td>
                <td>
                  {a.itemName}
                  <div className="muted">{a.itemCode}{kind === "equipment" ? ` · ${a.classification === "ppe" ? "PPE" : "Semi-expendable"}` : ""}</div>
                </td>
                <td>{(kind === "meter" ? a.propertyNo : a.serialNo) || "—"}</td>
                <td>
                  {a.statusLabel}
                  {a.status === "in-stock" && a.location ? <div className="muted">{a.location}</div> : a.statusDate && <div className="muted">since {longDate(a.statusDate)}</div>}
                </td>
                <td>
                  {kind === "meter"
                    ? a.accountNo ? <>{a.accountNo}<div className="muted">{a.accountName}</div></> : ""
                    : a.custodian ? <>{a.custodian}<div className="muted">{[a.office, a.docNo].filter(Boolean).join(" · ")}</div></> : ""}
                </td>
                <td className="num">
                  {peso.format(a.unitCost)}
                  {a.depreciation && <div className="muted">book {peso.format(a.depreciation.bookValue)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {registering && <RegisterUnits item={registering} onClose={() => setRegistering(null)} onDone={(m) => { setRegistering(null); done(m); }} />}
      {action === "issue" && <PersonDialog mode="issue" units={chosen} onClose={() => setAction(null)} onDone={done} />}
      {action === "transfer" && <PersonDialog mode="transfer" units={chosen} onClose={() => setAction(null)} onDone={done} />}
      {action === "return" && <ReturnDialog units={chosen} onClose={() => setAction(null)} onDone={done} />}
      {action === "dispose" && <DisposeDialog units={chosen} onClose={() => setAction(null)} onDone={done} />}
      {open != null && <UnitDialog id={open} onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); done(m); }} />}
    </>
  );
}

function RegisterUnits({ item, onClose, onDone }: { item: UnregisteredItem; onClose: () => void; onDone: (m: string) => void }) {
  const meter = item.kind === "meter";
  const [text, setText] = useState("");
  const [locationId, setLocationId] = useState(0);
  const [usefulLife, setUsefulLife] = useState("");
  const [acquiredDate, setAcquiredDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One unit per line: "serial" for meters; "property no, serial" for equipment.
  const units = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    if (meter) return { serialNo: l };
    const [propertyNo, serialNo] = l.split(",").map((s) => s.trim());
    return { propertyNo: propertyNo ?? "", serialNo: serialNo ?? "" };
  });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ registered: number }>("/api/inventory/assets/register", { itemId: item.id, units, locationId, usefulLife, acquiredDate });
      onDone(`${r.registered} unit(s) of ${item.name} registered.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Register {item.name}</h2>
        <p className="modal-sub">{item.unregistered} unit(s) in stock don't have a number yet.</p>
        <label className="field-input">
          <span>{meter ? "Serial numbers — one per line" : "One unit per line: property no., serial no. (serial optional)"}</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={meter ? "M-2026-0001\nM-2026-0002" : "PROP-2026-001, SN12345\nPROP-2026-002"} />
        </label>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <LocationPicker label="Kept in" value={locationId} onChange={setLocationId} />
          {!meter && (
            <>
              <label className="field-input">
                <span>Estimated useful life (years)</span>
                <input type="number" min={1} max={100} value={usefulLife} onChange={(e) => setUsefulLife(e.target.value)} />
              </label>
              <label className="field-input">
                <span>Date acquired</span>
                <input type="date" value={acquiredDate} max={todayIso()} onChange={(e) => setAcquiredDate(e.target.value)} />
              </label>
            </>
          )}
        </div>
        <p className="count">
          {units.length} of {item.unregistered} entered.
          {!meter && ` Units of ₱${PAR_THRESHOLD.toLocaleString()} and above are depreciated over their useful life.`}
        </p>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || !units.length || units.length > item.unregistered} onClick={save}>Register {units.length || ""}</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PersonFields({ v, set }: { v: { custodian: string; position: string; office: string; date: string }; set: (k: string, val: string) => void }) {
  return (
    <div className="form-grid">
      <label className="field-input">
        <span>Accountable person</span>
        <input value={v.custodian} onChange={(e) => set("custodian", e.target.value)} maxLength={150} />
      </label>
      <label className="field-input">
        <span>Position</span>
        <input value={v.position} onChange={(e) => set("position", e.target.value)} maxLength={150} />
      </label>
      <label className="field-input">
        <span>Office</span>
        <input value={v.office} onChange={(e) => set("office", e.target.value)} maxLength={150} />
      </label>
      <label className="field-input">
        <span>Date</span>
        <input type="date" value={v.date} max={todayIso()} onChange={(e) => set("date", e.target.value)} />
      </label>
    </div>
  );
}

function classOf(units: { unitCost: number }[]) {
  const par = units.some((a) => a.unitCost >= PAR_THRESHOLD);
  return { par, mixed: par && units.some((a) => a.unitCost < PAR_THRESHOLD) };
}

function UnitList({ units }: { units: Unit[] }) {
  return (
    <ul>
      {units.map((a) => (
        <li key={a.id}>{a.itemName} — {a.propertyNo || a.serialNo} (₱{peso.format(a.unitCost)}){a.custodian ? ` · with ${a.custodian}` : ""}</li>
      ))}
    </ul>
  );
}

/** Issue on an ICS/PAR, or transfer on an ITR/PTR plus a new ICS/PAR for the new holder. */
function PersonDialog({ mode, units, onClose, onDone }: { mode: "issue" | "transfer"; units: Unit[]; onClose: () => void; onDone: (m: string) => void }) {
  const [v, setV] = useState({ custodian: "", position: "", office: "", date: todayIso(), remarks: "", fundCluster: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { par, mixed } = classOf(units);
  const slip = par ? "PAR" : "ICS";

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (mode === "issue") {
        const r = await apiPost<{ docId: number; docNo: string; type: string }>("/api/inventory/assets/custody", { ...v, assetIds: units.map((a) => a.id) });
        openForm("custody", r.docId);
        onDone(`${r.type} No. ${r.docNo} issued to ${v.custodian}.`);
      } else {
        const r = await apiPost<{ docId: number; docNo: string; type: string; transferDocId: number; transferDocNo: string }>(
          "/api/inventory/assets/transfer-batch",
          { ...v, assetIds: units.map((a) => a.id) },
        );
        openForm("custody", r.transferDocId);
        openForm("custody", r.docId);
        onDone(`Transferred to ${v.custodian} on ${par ? "PTR" : "ITR"} ${r.transferDocNo}; ${r.type} No. ${r.docNo} issued.`);
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
        <h2 className="modal-title">{mode === "issue" ? "Issue equipment" : "Transfer equipment"}</h2>
        <p className="modal-sub">
          {mixed
            ? `Units of ₱${PAR_THRESHOLD.toLocaleString()} and above and semi-expendable units go on different forms — do them separately.`
            : mode === "issue"
              ? par ? "These go on a Property Acknowledgment Receipt (PAR)." : "These go on an Inventory Custodian Slip (ICS)."
              : `Recorded on ${par ? "a Property Transfer Report (PTR)" : "an Inventory Transfer Report (ITR)"}, and a new ${slip} is issued to the new holder.`}
        </p>
        <UnitList units={units} />
        <PersonFields v={v} set={(k, val) => setV((x) => ({ ...x, [k]: val }))} />
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field-input">
            <span>Fund cluster (optional)</span>
            <input value={v.fundCluster} onChange={(e) => setV((x) => ({ ...x, fundCluster: e.target.value }))} maxLength={30} />
          </label>
          {mode === "transfer" ? (
            <label className="field-input wide">
              <span>Reason for transfer</span>
              <input value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} maxLength={300} />
            </label>
          ) : (
            <label className="field-input wide">
              <span>Remarks (optional)</span>
              <input value={v.remarks} onChange={(e) => setV((x) => ({ ...x, remarks: e.target.value }))} maxLength={300} />
            </label>
          )}
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || mixed || !v.custodian.trim()} onClick={save}>
            {mode === "issue" ? `Issue and print the ${slip}` : "Transfer and print the forms"}
          </button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ReturnDialog({ units, onClose, onDone }: { units: Unit[]; onClose: () => void; onDone: (m: string) => void }) {
  const [condition, setCondition] = useState("good");
  const [date, setDate] = useState(todayIso());
  const [receivedBy, setReceivedBy] = useState("");
  const [remarks, setRemarks] = useState("");
  const [locationId, setLocationId] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { par, mixed } = classOf(units);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ docId: number; docNo: string }>("/api/inventory/assets/return-batch", {
        assetIds: units.map((a) => a.id), condition, date, receivedBy, remarks, locationId,
      });
      openForm("custody", r.docId);
      onDone(`${units.length} unit(s) returned — ${par ? "PRS" : "RRSP"} ${r.docNo}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Return equipment</h2>
        <p className="modal-sub">
          {mixed
            ? "Property and semi-expendable units are returned on different forms — do them separately."
            : `Recorded on ${par ? "a Property Return Slip (PRS)" : "a Receipt of Returned Semi-expendable Property (RRSP)"}.`}
        </p>
        <UnitList units={units} />
        <div className="form-grid">
          <label className="field-input">
            <span>Condition</span>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="good">Serviceable — back into stock</option>
              <option value="damaged">Unserviceable — not back into stock</option>
            </select>
          </label>
          <label className="field-input">
            <span>Date</span>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field-input">
            <span>Received by</span>
            <input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} maxLength={150} placeholder="Supply / property custodian" />
          </label>
          {condition === "good" && <LocationPicker label="Back into" value={locationId} onChange={setLocationId} />}
          <label className="field-input wide">
            <span>Remarks (optional)</span>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={250} />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || mixed} onClick={save}>Record the return and print the slip</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const MODES = ["Destruction", "Sale (public auction)", "Sale (negotiated)", "Transfer to another agency", "Donation", "Condemnation"];

function DisposeDialog({ units, onClose, onDone }: { units: Unit[]; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState({ mode: MODES[0], date: todayIso(), appraisedValue: "", orNumber: "", remarks: "", fundCluster: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ docId: number; docNo: string }>("/api/inventory/assets/dispose", { ...f, assetIds: units.map((a) => a.id) });
      openForm("custody", r.docId);
      onDone(`${units.length} unit(s) disposed — IIRUP ${r.docNo}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Dispose of unserviceable property</h2>
        <p className="modal-sub">Recorded on an Inventory and Inspection Report of Unserviceable Property (IIRUP). Units still in stock leave the stock.</p>
        <UnitList units={units} />
        <div className="form-grid">
          <label className="field-input">
            <span>Mode of disposal</span>
            <select value={f.mode} onChange={set("mode")}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field-input">
            <span>Date</span>
            <input type="date" value={f.date} max={todayIso()} onChange={set("date")} />
          </label>
          <label className="field-input">
            <span>Appraised value (₱, optional)</span>
            <input type="number" min={0} step="any" value={f.appraisedValue} onChange={set("appraisedValue")} />
          </label>
          {f.mode.startsWith("Sale") && (
            <label className="field-input">
              <span>O.R. No. of the sale</span>
              <input value={f.orNumber} onChange={set("orNumber")} maxLength={45} />
            </label>
          )}
          <label className="field-input">
            <span>Fund cluster (optional)</span>
            <input value={f.fundCluster} onChange={set("fundCluster")} maxLength={30} />
          </label>
          <label className="field-input wide">
            <span>Remarks</span>
            <input value={f.remarks} onChange={set("remarks")} maxLength={300} placeholder="e.g. Beyond economical repair, per inspection" />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="danger" disabled={busy} onClick={save}>Dispose and print the IIRUP</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

type UnitAction = null | "edit" | "status" | "install" | "pullout";

function UnitDialog({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (m: string) => void }) {
  const { data: a, error } = useQuery<Unit & { events: AssetEvent[] }>({
    queryKey: [...INV_KEYS.assets, "one", id],
    queryFn: () => apiGet(`/api/inventory/assets/${id}`),
  });
  const [action, setAction] = useState<UnitAction>(null);
  const [f, setF] = useState({ date: todayIso(), remarks: "", status: "lost", outcome: "defective", updateAccountMeter: true });
  const [edit, setEdit] = useState({ propertyNo: "", serialNo: "", usefulLife: "", residualPct: "5", acquiredDate: "" });
  const [acctSearch, setAcctSearch] = useState("");
  const [acct, setAcct] = useState<{ id: number; accountNo: string; name: string; meterNo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const { data: accounts } = useQuery<{ rows: { id: number; accountNo: string; name: string; meterNo: string }[] }>({
    queryKey: [...INV_KEYS.assets, "accounts", acctSearch],
    queryFn: () => apiGet(`/api/inventory/assets/accounts?search=${encodeURIComponent(acctSearch)}`),
    enabled: action === "install" && acctSearch.trim().length >= 2,
  });

  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setErr("");
    try {
      await fn();
      onDone(message);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const meter = a?.kind === "meter";
  const label = a ? `${a.itemName} ${meter ? a.serialNo : a.propertyNo || a.serialNo}` : "";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {a && (
          <>
            <h2 className="modal-title">{a.itemName} <span className="muted">· {meter ? `Serial ${a.serialNo}` : a.propertyNo || a.serialNo}</span></h2>
            <p className="modal-sub">
              {a.statusLabel}
              {a.custodian && ` · with ${a.custodian}${a.office ? `, ${a.office}` : ""}`}
              {a.docNo && ` · ${a.docType} ${a.docNo}`}
              {a.accountNo && ` · at account ${a.accountNo} (${a.accountName})`}
              {a.status === "in-stock" && a.location && ` · ${a.location}`}
              {` · ₱${peso.format(a.unitCost)}`}
            </p>
            {!meter && (
              <p className="count">
                {a.classification === "ppe" ? "Property, plant and equipment" : "Semi-expendable property"}
                {a.acquiredDate && ` · acquired ${longDate(a.acquiredDate)}`}
                {a.usefulLife ? ` · useful life ${a.usefulLife} yr` : ""}
                {a.depreciation &&
                  ` · depreciation ₱${peso.format(a.depreciation.monthly)}/month, ₱${peso.format(a.depreciation.accumulated)} to date, book value ₱${peso.format(a.depreciation.bookValue)}`}
                {a.classification === "ppe" && !a.usefulLife && " · set the useful life (Edit details) to compute depreciation"}
              </p>
            )}
            {a.accountNo && a.accountMeterNo && a.accountMeterNo !== a.serialNo && (
              <p className="count">The account's own meter no. is {a.accountMeterNo} — update it on the account (Meter Replacement) if this meter replaced it.</p>
            )}

            <table>
              <thead><tr><th>Date</th><th>What happened</th><th>Details</th><th>By</th></tr></thead>
              <tbody>
                {a.events.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{longDate(e.date)}</td>
                    <td>{EVENT_LABEL[e.event] ?? e.event}</td>
                    <td>{[e.custodian, e.office, e.docNo, e.accountNo && `Acct ${e.accountNo}`, e.remarks].filter(Boolean).join(" · ")}</td>
                    <td>{e.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {action === "edit" && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="field-input">
                  <span>Property no.</span>
                  <input value={edit.propertyNo} onChange={(e) => setEdit({ ...edit, propertyNo: e.target.value })} maxLength={60} />
                </label>
                <label className="field-input">
                  <span>Serial no.</span>
                  <input value={edit.serialNo} onChange={(e) => setEdit({ ...edit, serialNo: e.target.value })} maxLength={80} />
                </label>
                {!meter && (
                  <>
                    <label className="field-input">
                      <span>Useful life (years)</span>
                      <input type="number" min={1} max={100} value={edit.usefulLife} onChange={(e) => setEdit({ ...edit, usefulLife: e.target.value })} />
                    </label>
                    <label className="field-input">
                      <span>Residual value (% of cost)</span>
                      <input type="number" min={0} max={100} step="any" value={edit.residualPct} onChange={(e) => setEdit({ ...edit, residualPct: e.target.value })} />
                    </label>
                    <label className="field-input">
                      <span>Date acquired</span>
                      <input type="date" value={edit.acquiredDate} max={todayIso()} onChange={(e) => setEdit({ ...edit, acquiredDate: e.target.value })} />
                    </label>
                  </>
                )}
              </div>
            )}
            {action === "status" && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="field-input">
                  <span>Mark as</span>
                  <select value={f.status} onChange={(e) => set("status", e.target.value)}>
                    {!meter && <option value="lost">Lost</option>}
                    {!meter && <option value="damaged">Damaged</option>}
                    {meter && <option value="defective">Defective</option>}
                  </select>
                </label>
                <label className="field-input">
                  <span>Date</span>
                  <input type="date" value={f.date} max={todayIso()} onChange={(e) => set("date", e.target.value)} />
                </label>
              </div>
            )}
            {action === "install" && (
              <div style={{ marginTop: 12 }}>
                <div className="form-grid">
                  <label className="field-input">
                    <span>Find the account</span>
                    <input value={acctSearch} onChange={(e) => { setAcctSearch(e.target.value); setAcct(null); }} placeholder="Account no., name or meter no." />
                  </label>
                  <label className="field-input">
                    <span>Date installed</span>
                    <input type="date" value={f.date} max={todayIso()} onChange={(e) => set("date", e.target.value)} />
                  </label>
                </div>
                {!acct && accounts && accounts.rows.length > 0 && (
                  <table style={{ marginTop: 8 }}>
                    <tbody>
                      {accounts.rows.map((x) => (
                        <tr key={x.id} className="row-link" onClick={() => setAcct(x)}>
                          <td>{x.accountNo}</td><td>{x.name}</td><td className="muted">{x.meterNo && `Meter ${x.meterNo}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {acct && (
                  <p className="count">
                    Installing at {acct.accountNo} — {acct.name}{acct.meterNo ? ` (meter no. on the account now: ${acct.meterNo})` : ""}.{" "}
                    <button className="clear-filters" onClick={() => setAcct(null)}>Change</button>
                  </p>
                )}
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <input type="checkbox" checked={f.updateAccountMeter} onChange={(e) => set("updateAccountMeter", e.target.checked)} />
                  Also set the account's meter no. to {a.serialNo}
                </label>
              </div>
            )}
            {action === "pullout" && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="field-input">
                  <span>Condition</span>
                  <select value={f.outcome} onChange={(e) => set("outcome", e.target.value)}>
                    <option value="defective">Defective</option>
                    <option value="reusable">Reusable — back into stock</option>
                  </select>
                </label>
                <label className="field-input">
                  <span>Date</span>
                  <input type="date" value={f.date} max={todayIso()} onChange={(e) => set("date", e.target.value)} />
                </label>
              </div>
            )}
            {(action === "status" || action === "pullout" || action === "install") && (
              <label className="field-input" style={{ marginTop: 10 }}>
                <span>{action === "status" ? "What happened (memo, report no.)" : "Remarks (optional)"}</span>
                <input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={300} />
              </label>
            )}

            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {!action && (
                <>
                  {meter && a.status === "in-stock" && <button className="primary" onClick={() => setAction("install")}>Install at an account…</button>}
                  {meter && a.status === "installed" && <button className="primary" onClick={() => setAction("pullout")}>Pull out…</button>}
                  <button
                    className="clear-filters"
                    onClick={() => {
                      setEdit({
                        propertyNo: a.propertyNo, serialNo: a.serialNo, usefulLife: a.usefulLife ? String(a.usefulLife) : "",
                        residualPct: String(a.residualPct ?? 5), acquiredDate: a.acquiredDate,
                      });
                      setAction("edit");
                    }}
                  >
                    Edit details
                  </button>
                  {["in-stock", "issued"].includes(a.status) && (
                    <button className="danger" onClick={() => { set("status", meter ? "defective" : "lost"); setAction("status"); }}>
                      {meter ? "Defective…" : "Lost / damaged…"}
                    </button>
                  )}
                  {!meter && <button className="clear-filters" onClick={() => openForm("property-card", a.id)}>Print property card</button>}
                  <button className="clear-filters" onClick={() => printLabels([a.id])}>Print label</button>
                  {a.docId && <button className="clear-filters" onClick={() => openForm("custody", a.docId!)}>Print {a.docType}</button>}
                </>
              )}
              {action === "edit" && (
                <button className="primary" disabled={busy} onClick={() => run(() => apiPut(`/api/inventory/assets/${id}`, edit), `${label} saved.`)}>Save</button>
              )}
              {action === "status" && (
                <button
                  className="danger"
                  disabled={busy || !f.remarks.trim()}
                  onClick={() => run(() => apiPost(`/api/inventory/assets/${id}/status`, { status: f.status, date: f.date, remarks: f.remarks }), `${label} marked ${f.status}.`)}
                >
                  Save
                </button>
              )}
              {action === "install" && (
                <button
                  className="primary"
                  disabled={busy || !acct}
                  onClick={() =>
                    run(
                      () => apiPost(`/api/inventory/assets/${id}/install`, { acctId: acct!.id, date: f.date, remarks: f.remarks, updateAccountMeter: f.updateAccountMeter }),
                      `Meter ${a.serialNo} installed at ${acct!.accountNo}.`,
                    )
                  }
                >
                  Record the installation
                </button>
              )}
              {action === "pullout" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => apiPost(`/api/inventory/assets/${id}/pullout`, { outcome: f.outcome, date: f.date, remarks: f.remarks }),
                      `Meter ${a.serialNo} pulled out${f.outcome === "reusable" ? " and back in stock" : " as defective"}.`,
                    )
                  }
                >
                  Record the pull-out
                </button>
              )}
              <button className="clear-filters" onClick={() => (action ? setAction(null) : onClose())}>{action ? "Back" : "Close"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PropertyDocs() {
  const [type, setType] = useState("all");
  const [papers, setPapers] = useState<CustodyDoc | null>(null);
  const { data, isLoading, error } = useQuery<{ rows: CustodyDoc[] }>({
    queryKey: [...INV_KEYS.assets, "custody"],
    queryFn: () => apiGet("/api/inventory/assets/custody"),
  });
  const rows = (data?.rows ?? []).filter((d) => type === "all" || d.type === type);
  const issuing = (t: string) => t === "ICS" || t === "PAR";
  return (
    <>
      <div className="form-grid" style={{ marginBottom: 10 }}>
        <label className="field-input">
          <span>Form</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">All forms</option>
            {Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
          </select>
        </label>
      </div>
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && rows.length === 0 && <p className="count">No property documents{type !== "all" ? " of this kind" : ""} yet.</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Form</th><th>Date</th><th>Person</th><th>Office</th><th className="num">Units</th><th className="num">Still held</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="row-link" onClick={() => openForm(d.type === "WMR" ? "wmr" : "custody", d.id)} title="Open the printable form">
                <td>{d.type} {d.docNo}<div className="muted">{DOC_LABEL[d.type] ?? ""}</div></td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(d.date)}</td>
                <td>{d.custodian}<div className="muted">{d.position}</div></td>
                <td>{d.office}</td>
                <td className="num">{d.type === "WMR" ? "—" : d.units}</td>
                <td className="num">{issuing(d.type) ? d.stillHeld : ""}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="clear-filters" onClick={() => setPapers(d)}>Scanned papers</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {papers && (
        <div className="modal-backdrop" onClick={() => setPapers(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{papers.type} {papers.docNo}</h2>
            <Attachments refkind={papers.type === "WMR" || papers.type === "IIRUP" ? "disposal" : "custody"} refid={papers.id} title="Signed copies" />
            <div className="form-actions">
              <button className="clear-filters" onClick={() => setPapers(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- Equipment count (RPCPPE / RPCSP) ---------------- */

type AssetCount = {
  id: number; date: string; scope: string; status: string; remarks: string;
  lines: number; checked: number; missing: number; by: string; approvedBy: string;
};
type CountUnit = Unit & { found: boolean | null; condition: string; countRemarks: string };
type AssetCountDetail = { id: number; date: string; scope: string; status: string; remarks: string; approvedBy: string; units: CountUnit[] };

const SCOPE_LABEL: Record<string, string> = { ppe: "Property, plant & equipment", semi: "Semi-expendable property" };

function EquipmentCounts({ onChanged }: { onChanged: (message: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { data } = useQuery<{ rows: AssetCount[] }>({
    queryKey: [...INV_KEYS.assets, "counts"],
    queryFn: () => apiGet("/api/inventory/assets/counts"),
  });

  async function start(scope: "ppe" | "semi") {
    setBusy(true);
    setErr("");
    try {
      const r = await apiPost<{ id: number }>("/api/inventory/assets/counts", { scope, date: todayIso() });
      qc.invalidateQueries({ queryKey: [...INV_KEYS.assets, "counts"] });
      setOpen(r.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="count">
        Check every registered unit — found or not, and its condition. Posting prints the RPCPPE (property, plant & equipment) or RPCSP (semi-expendable property).
      </p>
      <div className="form-actions" style={{ marginTop: 0, marginBottom: 10 }}>
        <button className="primary" disabled={busy} onClick={() => start("ppe")}>Count property, plant & equipment</button>
        <button className="primary" disabled={busy} onClick={() => start("semi")}>Count semi-expendable property</button>
      </div>
      {err && <div className="form-error">{err}</div>}
      {data && data.rows.length === 0 && <p className="count">No equipment counts yet.</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead>
            <tr><th>Count</th><th>Date</th><th>Covers</th><th className="num">Checked</th><th className="num">Not found</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.rows.map((c) => (
              <tr key={c.id} className="row-link" onClick={() => setOpen(c.id)}>
                <td>#{c.id}</td>
                <td>{longDate(c.date)}</td>
                <td>{SCOPE_LABEL[c.scope] ?? c.scope}</td>
                <td className="num">{c.checked} of {c.lines}</td>
                <td className="num">{c.missing || "—"}</td>
                <td>
                  {c.status === "draft"
                    ? <span className="badge setting-badge act-blue">Open</span>
                    : <span className="badge setting-badge act-green">Posted{c.approvedBy ? ` · ${c.approvedBy}` : ""}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open != null && (
        <EquipmentCountSheet
          id={open}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            setOpen(null);
            onChanged(m);
          }}
        />
      )}
    </>
  );
}

function EquipmentCountSheet({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (m: string) => void }) {
  const { data: c, error } = useQuery<AssetCountDetail>({
    queryKey: [...INV_KEYS.assets, "count", id],
    queryFn: () => apiGet(`/api/inventory/assets/counts/${id}`),
  });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {error && <p className="form-error">{(error as Error).message}</p>}
        {!c && !error && <p className="count">Loading…</p>}
        {c && <CountEditor key={`${c.id}-${c.status}`} c={c} onClose={onClose} onDone={onDone} />}
      </div>
    </div>
  );
}

function CountEditor({ c, onClose, onDone }: { c: AssetCountDetail; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState(() =>
    Object.fromEntries(c.units.map((u) => [u.id, { found: u.found, condition: u.condition, remarks: u.countRemarks }])),
  );
  const [dirty, setDirty] = useState(false);
  const [posting, setPosting] = useState(false);
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const draft = c.status === "draft";
  const values = Object.values(rows);
  const checked = values.filter((r) => r.found != null).length;
  const missing = values.filter((r) => r.found === false).length;
  const setRow = (uid: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((r) => ({ ...r, [uid]: { ...r[uid], ...patch } }));
    setDirty(true);
  };

  async function save() {
    await apiPut(`/api/inventory/assets/counts/${c.id}/lines`, {
      lines: Object.entries(rows).map(([assetId, r]) => ({ assetId: Number(assetId), found: r.found, condition: r.condition, remarks: r.remarks })),
    });
    setDirty(false);
    qc.invalidateQueries({ queryKey: [...INV_KEYS.assets, "counts"] });
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

  const markAllFound = () => {
    setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.found == null ? { ...v, found: true, condition: v.condition || "serviceable" } : v])));
    setDirty(true);
  };

  return (
    <>
      <h2 className="modal-title">
        Equipment count #{c.id} <span className="muted">· {longDate(c.date)} · {SCOPE_LABEL[c.scope] ?? c.scope}</span>
      </h2>
      <p className="modal-sub">
        {checked} of {c.units.length} checked · {missing} not found{c.status === "posted" ? ` · posted, approved by ${c.approvedBy}` : ""}
      </p>
      <table>
        <thead>
          <tr><th>Property no.</th><th>Item</th><th>Accountable person / where</th><th>Found?</th><th>Condition</th><th>Remarks</th></tr>
        </thead>
        <tbody>
          {c.units.map((u) => {
            const r = rows[u.id];
            return (
              <tr key={u.id}>
                <td>{u.propertyNo || u.serialNo}</td>
                <td>{u.itemName}</td>
                <td>{u.custodian || (u.status === "in-stock" ? `In stock${u.location ? ` · ${u.location}` : ""}` : u.statusLabel)}</td>
                <td>
                  {draft ? (
                    <select
                      value={r.found == null ? "" : r.found ? "yes" : "no"}
                      onChange={(e) => setRow(u.id, { found: e.target.value === "" ? null : e.target.value === "yes" })}
                    >
                      <option value="">—</option>
                      <option value="yes">Found</option>
                      <option value="no">Not found</option>
                    </select>
                  ) : r.found ? "Found" : "Not found"}
                </td>
                <td>
                  {draft ? (
                    <select value={r.condition} disabled={r.found === false} onChange={(e) => setRow(u.id, { condition: e.target.value })}>
                      <option value="">—</option>
                      <option value="serviceable">Serviceable</option>
                      <option value="unserviceable">Unserviceable</option>
                    </select>
                  ) : r.condition}
                </td>
                <td>
                  {draft
                    ? <input className="table-input" style={{ width: "100%" }} value={r.remarks} maxLength={300} onChange={(e) => setRow(u.id, { remarks: e.target.value })} />
                    : r.remarks}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {draft && posting && (
        <div style={{ marginTop: 14 }}>
          <p className="count">Posting marks the {missing} unit(s) not found as lost, and units found unserviceable as damaged.</p>
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
            <button className="primary" disabled={busy || !dirty} onClick={() => run(save)}>{dirty ? "Save" : "Saved"}</button>
            {checked < c.units.length && <button className="clear-filters" disabled={busy} onClick={markAllFound}>Mark the rest found</button>}
            <button
              className="clear-filters"
              disabled={busy || checked < c.units.length}
              title={checked < c.units.length ? "Check every unit first" : undefined}
              onClick={() => setPosting(true)}
            >
              Post the count…
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                window.confirm("Delete this count?") &&
                run(async () => {
                  await apiDelete(`/api/inventory/assets/counts/${c.id}`);
                  onDone(`Equipment count #${c.id} deleted.`);
                })
              }
            >
              Delete
            </button>
          </>
        )}
        {draft && posting && (
          <button
            className="primary"
            disabled={busy || !adminUser || !adminPass}
            onClick={() =>
              run(async () => {
                if (dirty) await save();
                const r = await apiPost<{ lost: number; damaged: number }>(`/api/inventory/assets/counts/${c.id}/post`, {
                  adminUsername: adminUser, adminPassword: adminPass,
                });
                onDone(`Equipment count #${c.id} posted — ${r.lost} marked lost, ${r.damaged} marked damaged.`);
              })
            }
          >
            Post the count
          </button>
        )}
        {!posting && (
          <button className="clear-filters" onClick={() => openForm("asset-count", c.id)}>
            {draft ? "Print count sheet" : `Print ${c.scope === "ppe" ? "RPCPPE" : "RPCSP"}`}
          </button>
        )}
        <button className="clear-filters" onClick={() => (posting ? setPosting(false) : onClose())}>{posting ? "Back" : "Close"}</button>
      </div>
    </>
  );
}
