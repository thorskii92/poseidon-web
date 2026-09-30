import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "./api";
import {
  EVENT_LABEL, INV_KEYS, longDate, openForm, peso, todayIso,
  type Asset, type AssetEvent, type CustodyDoc, type UnregisteredItem,
} from "./inventoryShared";

/**
 * Equipment and water meters, one unit at a time (poseidon-api's
 * inventoryAssets.ts). Units are registered from stock with a property or
 * serial number, then issued to a person (ICS/PAR) or installed at an account.
 */

type View = "equipment" | "meter" | "slips";
const PAR_THRESHOLD = 50_000;

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
        <button className={view === "slips" ? "stage-tab current" : "stage-tab"} onClick={() => setView("slips")}>Custody slips (ICS / PAR)</button>
      </div>
      {view === "slips" ? <CustodySlips /> : <Units key={view} kind={view} onChanged={onChanged} />}
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

function Units({ kind, onChanged }: { kind: "equipment" | "meter"; onChanged: (message: string) => void }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [registering, setRegistering] = useState<UnregisteredItem | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const qs = new URLSearchParams({ kind, status, search }).toString();
  const { data, isLoading, error } = useQuery<{ rows: Asset[]; items: UnregisteredItem[] }>({
    queryKey: [...INV_KEYS.assets, qs],
    queryFn: () => apiGet(`/api/inventory/assets?${qs}`),
  });
  const pending = (data?.items ?? []).filter((i) => i.kind === kind && i.unregistered > 0);
  const done = (m: string) => {
    setPicked([]);
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

      {kind === "equipment" && picked.length > 0 && (
        <div className="form-actions" style={{ marginTop: 0, marginBottom: 10 }}>
          <button className="primary" onClick={() => setIssuing(true)}>Issue {picked.length} to a person…</button>
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
              {kind === "equipment" && <th />}
              <th>{kind === "meter" ? "Serial no." : "Property no."}</th>
              <th>Item</th>
              <th>{kind === "meter" ? "Property no." : "Serial no."}</th>
              <th>Status</th>
              <th>{kind === "meter" ? "Account" : "Accountable person"}</th>
              <th className="num">Unit cost</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((a) => (
              <tr key={a.id} className="row-link" onClick={() => setOpen(a.id)}>
                {kind === "equipment" && (
                  <td onClick={(e) => e.stopPropagation()}>
                    {a.status === "in-stock" && (
                      <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, a.id] : p.filter((x) => x !== a.id)))} />
                    )}
                  </td>
                )}
                <td>{(kind === "meter" ? a.serialNo : a.propertyNo) || "—"}</td>
                <td>{a.itemName}<div className="muted">{a.itemCode}</div></td>
                <td>{(kind === "meter" ? a.propertyNo : a.serialNo) || "—"}</td>
                <td>{a.statusLabel}{a.statusDate && <div className="muted">since {longDate(a.statusDate)}</div>}</td>
                <td>
                  {kind === "meter"
                    ? a.accountNo ? <>{a.accountNo}<div className="muted">{a.accountName}</div></> : ""
                    : a.custodian ? <>{a.custodian}<div className="muted">{[a.office, a.docNo].filter(Boolean).join(" · ")}</div></> : ""}
                </td>
                <td className="num">{peso.format(a.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {registering && <RegisterUnits item={registering} onClose={() => setRegistering(null)} onDone={(m) => { setRegistering(null); done(m); }} />}
      {issuing && data && (
        <IssueDialog
          assets={data.rows.filter((a) => picked.includes(a.id))}
          onClose={() => setIssuing(false)}
          onDone={(m) => { setIssuing(false); done(m); }}
        />
      )}
      {open != null && <UnitDialog id={open} onClose={() => setOpen(null)} onDone={(m) => { setOpen(null); done(m); }} />}
    </>
  );
}

function RegisterUnits({ item, onClose, onDone }: { item: UnregisteredItem; onClose: () => void; onDone: (m: string) => void }) {
  const meter = item.kind === "meter";
  const [text, setText] = useState("");
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
      const r = await apiPost<{ registered: number }>("/api/inventory/assets/register", { itemId: item.id, units });
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
        <p className="count">{units.length} of {item.unregistered} entered.</p>
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

function IssueDialog({ assets, onClose, onDone }: { assets: Asset[]; onClose: () => void; onDone: (m: string) => void }) {
  const [v, setV] = useState({ custodian: "", position: "", office: "", date: todayIso(), remarks: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const par = assets.some((a) => a.unitCost >= PAR_THRESHOLD);
  const mixed = par && assets.some((a) => a.unitCost < PAR_THRESHOLD);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = await apiPost<{ docId: number; docNo: string; type: string }>("/api/inventory/assets/custody", { ...v, assetIds: assets.map((a) => a.id) });
      openForm("custody", r.docId);
      onDone(`${r.type} No. ${r.docNo} issued to ${v.custodian}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Issue equipment</h2>
        <p className="modal-sub">
          {mixed
            ? `Units of ₱${PAR_THRESHOLD.toLocaleString()} and above go on a PAR and the rest on an ICS — issue them separately.`
            : par ? "These go on a Property Acknowledgment Receipt (PAR)." : "These go on an Inventory Custodian Slip (ICS)."}
        </p>
        <ul>
          {assets.map((a) => <li key={a.id}>{a.itemName} — {a.propertyNo || a.serialNo} (₱{peso.format(a.unitCost)})</li>)}
        </ul>
        <PersonFields v={v} set={(k, val) => setV((x) => ({ ...x, [k]: val }))} />
        <label className="field-input" style={{ marginTop: 10 }}>
          <span>Remarks (optional)</span>
          <input value={v.remarks} onChange={(e) => setV((x) => ({ ...x, remarks: e.target.value }))} maxLength={300} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <button className="primary" disabled={busy || mixed || !v.custodian.trim()} onClick={save}>Issue and print the {par ? "PAR" : "ICS"}</button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

type UnitAction = null | "return" | "transfer" | "status" | "install" | "pullout";

function UnitDialog({ id, onClose, onDone }: { id: number; onClose: () => void; onDone: (m: string) => void }) {
  const { data: a, error } = useQuery<Asset & { events: AssetEvent[] }>({
    queryKey: [...INV_KEYS.assets, "one", id],
    queryFn: () => apiGet(`/api/inventory/assets/${id}`),
  });
  const [action, setAction] = useState<UnitAction>(null);
  const [f, setF] = useState({ custodian: "", position: "", office: "", date: todayIso(), remarks: "", condition: "good", status: "lost", outcome: "defective" });
  const [acctSearch, setAcctSearch] = useState("");
  const [acct, setAcct] = useState<{ id: number; accountNo: string; name: string; meterNo: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const { data: accounts } = useQuery<{ rows: { id: number; accountNo: string; name: string; meterNo: string }[] }>({
    queryKey: [...INV_KEYS.assets, "accounts", acctSearch],
    queryFn: () => apiGet(`/api/inventory/assets/accounts?search=${encodeURIComponent(acctSearch)}`),
    enabled: action === "install" && acctSearch.trim().length >= 2,
  });

  async function run(path: string, body: unknown, message: string) {
    setBusy(true);
    setErr("");
    try {
      const r = await apiPost<{ docId?: number }>(`/api/inventory/assets/${id}/${path}`, body);
      if (r.docId) openForm("custody", r.docId);
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
              {` · ₱${peso.format(a.unitCost)}`}
            </p>
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

            {action === "transfer" && <div style={{ marginTop: 12 }}><PersonFields v={f} set={set} /></div>}
            {action === "return" && (
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="field-input">
                  <span>Condition</span>
                  <select value={f.condition} onChange={(e) => set("condition", e.target.value)}>
                    <option value="good">Good — back into stock</option>
                    <option value="damaged">Damaged — not back into stock</option>
                  </select>
                </label>
                <label className="field-input">
                  <span>Date</span>
                  <input type="date" value={f.date} max={todayIso()} onChange={(e) => set("date", e.target.value)} />
                </label>
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
                    <option value="disposed">Disposed</option>
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
                {acct && <p className="count">Installing at {acct.accountNo} — {acct.name}. <button className="clear-filters" onClick={() => setAcct(null)}>Change</button></p>}
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
            {action && action !== "install" && action !== "transfer" && (
              <label className="field-input" style={{ marginTop: 10 }}>
                <span>{action === "status" ? "What happened (memo, report no.)" : "Remarks (optional)"}</span>
                <input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} maxLength={300} />
              </label>
            )}

            {err && <div className="form-error">{err}</div>}
            <div className="form-actions">
              {!action && (
                <>
                  {!meter && a.status === "issued" && <button className="primary" onClick={() => setAction("return")}>Return…</button>}
                  {!meter && a.status === "issued" && <button className="clear-filters" onClick={() => setAction("transfer")}>Transfer to someone else…</button>}
                  {meter && a.status === "in-stock" && <button className="primary" onClick={() => setAction("install")}>Install at an account…</button>}
                  {meter && a.status === "installed" && <button className="primary" onClick={() => setAction("pullout")}>Pull out…</button>}
                  {["in-stock", "issued", "damaged", "defective", "lost"].includes(a.status) && a.status !== "installed" && (
                    <button className="danger" onClick={() => { set("status", a.status === "in-stock" || a.status === "issued" ? (meter ? "defective" : "lost") : "disposed"); setAction("status"); }}>
                      {a.status === "in-stock" || a.status === "issued" ? "Lost / damaged / disposed…" : "Dispose…"}
                    </button>
                  )}
                  {a.docId && <button className="clear-filters" onClick={() => openForm("custody", a.docId!)}>Print {a.docType}</button>}
                </>
              )}
              {action === "return" && (
                <button className="primary" disabled={busy} onClick={() => run("return", { condition: f.condition, date: f.date, remarks: f.remarks }, `${label} returned${f.condition === "damaged" ? " damaged" : " to stock"}.`)}>Record the return</button>
              )}
              {action === "transfer" && (
                <button className="primary" disabled={busy || !f.custodian.trim()} onClick={() => run("transfer", f, `${label} transferred to ${f.custodian}.`)}>Transfer and print the new slip</button>
              )}
              {action === "status" && (
                <button className="danger" disabled={busy || !f.remarks.trim()} onClick={() => run("status", { status: f.status, date: f.date, remarks: f.remarks }, `${label} marked ${f.status}.`)}>Save</button>
              )}
              {action === "install" && (
                <button className="primary" disabled={busy || !acct} onClick={() => run("install", { acctId: acct!.id, date: f.date, remarks: f.remarks }, `Meter ${a.serialNo} installed at ${acct!.accountNo}.`)}>Record the installation</button>
              )}
              {action === "pullout" && (
                <button className="primary" disabled={busy} onClick={() => run("pullout", { outcome: f.outcome, date: f.date, remarks: f.remarks }, `Meter ${a.serialNo} pulled out${f.outcome === "reusable" ? " and back in stock" : " as defective"}.`)}>Record the pull-out</button>
              )}
              <button className="clear-filters" onClick={() => (action ? setAction(null) : onClose())}>{action ? "Back" : "Close"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CustodySlips() {
  const { data, isLoading, error } = useQuery<{ rows: CustodyDoc[] }>({
    queryKey: [...INV_KEYS.assets, "custody"],
    queryFn: () => apiGet("/api/inventory/assets/custody"),
  });
  return (
    <>
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && data.rows.length === 0 && <p className="count">No equipment has been issued yet. Tick units under Equipment, then "Issue to a person".</p>}
      {data && data.rows.length > 0 && (
        <table>
          <thead><tr><th>Slip</th><th>Date</th><th>Accountable person</th><th>Office</th><th className="num">Units</th><th className="num">Still held</th></tr></thead>
          <tbody>
            {data.rows.map((d) => (
              <tr key={d.id} className="row-link" onClick={() => openForm("custody", d.id)} title="Open the printable slip">
                <td>{d.type} {d.docNo}</td>
                <td style={{ whiteSpace: "nowrap" }}>{longDate(d.date)}</td>
                <td>{d.custodian}<div className="muted">{d.position}</div></td>
                <td>{d.office}</td>
                <td className="num">{d.units}</td>
                <td className="num">{d.stillHeld}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
