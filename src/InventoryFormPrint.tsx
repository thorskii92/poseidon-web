import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, scaledSheetStyle, usePrintPageSize, type Orientation } from "./PrintLayoutControls";
import ReportHeader from "./ReportHeader";
import { useReportHeader } from "./reportHeaderData";
import {
  MOVE_LABEL, longDate, peso, qty,
  type CountDetail, type Item, type Movement, type Receipt, type RequestDetail,
} from "./inventoryShared";
import type { Asset } from "./inventoryShared";
import "./print.css";

/**
 * The government inventory forms (COA / Government Accounting Manual), one
 * page for all of them — /inventory/print/:form/:id:
 *
 *   iar          Inspection and Acceptance Report
 *   ris          Requisition and Issue Slip
 *   custody      Inventory Custodian Slip (ICS) or Property Acknowledgment Receipt (PAR)
 *   rpci         Report on the Physical Count of Inventories (a draft prints as the count sheet)
 *   stock-card   Stock Card (quantities)
 *   ledger-card  Supplies Ledger Card (quantities and costs)
 *
 * These are workflow forms with their own named signature blocks, not
 * reports — like AdjustmentPrint, they get paper/orientation/scale but not
 * the 4-slot signatory picker. Names the system doesn't know (inspection
 * officer, property custodian…) are typed on the toolbar and remembered on
 * this computer.
 */

type Custody = {
  id: number; type: "ICS" | "PAR"; docNo: string; date: string; custodian: string; position: string;
  office: string; remarks: string; by: string; units: (Asset & { stillOnThisSlip: boolean })[];
};
type Card = { item: Item; forward: { qty: number; value: number; avgCost: number }; rows: Movement[] };

const TITLES: Record<string, { title: string; appendix: string }> = {
  iar: { title: "Inspection and Acceptance Report", appendix: "Appendix 62" },
  ris: { title: "Requisition and Issue Slip", appendix: "Appendix 63" },
  ics: { title: "Inventory Custodian Slip", appendix: "Appendix 59" },
  par: { title: "Property Acknowledgment Receipt", appendix: "Appendix 71" },
  rpci: { title: "Report on the Physical Count of Inventories", appendix: "Appendix 66" },
  "stock-card": { title: "Stock Card", appendix: "Appendix 58" },
  "ledger-card": { title: "Supplies Ledger Card", appendix: "Appendix 57" },
};

const ENDPOINT: Record<string, (id: string, q: string) => string> = {
  iar: (id) => `/api/inventory/receipts/${id}`,
  ris: (id) => `/api/inventory/requests/${id}`,
  custody: (id) => `/api/inventory/assets/custody/${id}`,
  rpci: (id) => `/api/inventory/counts/${id}`,
  "stock-card": (id, q) => `/api/inventory/items/${id}/card?${q}`,
  "ledger-card": (id, q) => `/api/inventory/items/${id}/card?${q}`,
};

/** A toolbar text box remembered per form on this computer. */
function useRemembered(key: string, fallback = "") {
  const storageKey = `invform.${key}`;
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const set = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      /* private window: just not remembered */
    }
  };
  return [value, set] as const;
}

export default function InventoryFormPrint() {
  const { form = "", id = "" } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [paper, setPaper] = useState<PaperKey>("a4");
  const [orientation, setOrientation] = useState<Orientation>(form === "ledger-card" || form === "rpci" ? "landscape" : "portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);
  const header = useReportHeader().data;
  const entity = header?.text.header1 ?? "";

  const [fundCluster, setFundCluster] = useRemembered("fundCluster");
  const [custodianName, setCustodianName] = useRemembered("custodian");
  const [inspector, setInspector] = useRemembered("inspector");
  const [approver, setApprover] = useRemembered("approver");
  const [committee, setCommittee] = useRemembered("committee");

  const qs = params.toString();
  useEffect(() => {
    const url = ENDPOINT[form]?.(id, qs);
    if (!url) return;
    apiGet(url).then(setData).catch((e) => setError((e as Error).message));
  }, [form, id, qs]);

  if (!ENDPOINT[form]) return <div className="print-root"><div className="form-error">Unknown form.</div></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Loading…</p></div>;

  const kind = form === "custody" ? (data as Custody).type.toLowerCase() : form;
  const t = TITLES[kind]!;

  const toolbarField = (label: string, value: string, set: (v: string) => void, width = 180) => (
    <label className="coa-toolbar-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} style={{ width }} />
    </label>
  );

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        {toolbarField("Fund Cluster", fundCluster, setFundCluster, 110)}
        {form === "iar" && toolbarField("Inspection Officer", inspector, setInspector)}
        {["iar", "ris", "custody", "rpci", "stock-card", "ledger-card"].includes(form) && toolbarField("Supply / Property Custodian", custodianName, setCustodianName)}
        {form === "rpci" && toolbarField("Inventory Committee", committee, setCommittee)}
        {form === "rpci" && toolbarField("Approved by (Head of Agency)", approver, setApprover)}
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet coa-form" style={scaledSheetStyle(box.width, scale)}>
        <div className="coa-appendix">{t.appendix}</div>
        <ReportHeader />
        <h1 className="soa-title">{t.title}</h1>

        {form === "iar" && <Iar r={data as Receipt} entity={entity} fund={fundCluster} inspector={inspector} custodian={custodianName} />}
        {form === "ris" && <Ris r={data as RequestDetail} entity={entity} fund={fundCluster} custodian={custodianName} />}
        {form === "custody" && <CustodySlip d={data as Custody} entity={entity} fund={fundCluster} custodian={custodianName} />}
        {form === "rpci" && <Rpci c={data as CountDetail} entity={entity} fund={fundCluster} custodian={custodianName} committee={committee} approver={approver} />}
        {(form === "stock-card" || form === "ledger-card") && (
          <StockCard card={data as Card} ledger={form === "ledger-card"} entity={entity} fund={fundCluster} from={params.get("from") ?? ""} to={params.get("to") ?? ""} />
        )}
      </article>
    </div>
  );
}

function Head({ cells }: { cells: [string, ReactNode][] }) {
  return (
    <div className="coa-head">
      {cells.map(([k, v]) => (
        <div key={k}><span>{k}:</span> <b>{v || " "}</b></div>
      ))}
    </div>
  );
}

function Sign({ label, name, role, date }: { label: string; name?: string; role?: string; date?: string }) {
  return (
    <div className="coa-sign">
      <div className="coa-sign-label">{label}</div>
      <div className="coa-sign-line">{name || " "}</div>
      <div className="coa-sign-role">{role || "Signature over Printed Name"}</div>
      {date !== undefined && <div className="coa-sign-role">Date: {date || "________________"}</div>}
    </div>
  );
}

/* ---------------- IAR ---------------- */

function Iar({ r, entity, fund, inspector, custodian }: { r: Receipt; entity: string; fund: string; inspector: string; custodian: string }) {
  return (
    <>
      {r.status === "voided" && <p className="coa-void">VOIDED — {r.voidReason}</p>}
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr>
            <td>Supplier: <b>{r.supplier}</b></td>
            <td>IAR No.: <b>{r.iarNo}</b></td>
          </tr>
          <tr>
            <td>PO No./Date: <b>{r.poNumber}</b></td>
            <td>Date: <b>{longDate(r.date)}</b></td>
          </tr>
          <tr>
            <td>DR No.: <b>{r.drNumber}</b></td>
            <td>Invoice No.: <b>{r.invoiceNo}</b></td>
          </tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead>
          <tr><th>Stock/Property No.</th><th>Description</th><th>Unit</th><th className="n">Quantity</th><th className="n">Unit Cost</th><th className="n">Amount</th></tr>
        </thead>
        <tbody>
          {(r.items ?? []).map((m) => (
            <tr key={m.id}>
              <td>{m.itemCode}</td><td>{m.itemName}</td><td>{m.unit}</td>
              <td className="n">{qty(m.qty)}</td><td className="n">{peso.format(m.unitCost)}</td><td className="n">{peso.format(m.totalCost)}</td>
            </tr>
          ))}
          <tr><td colSpan={5} className="n"><b>Total</b></td><td className="n"><b>{peso.format(r.totalCost)}</b></td></tr>
        </tbody>
      </table>
      {r.remarks && <p>Remarks: {r.remarks}</p>}
      <div className="coa-sign-row">
        <div className="coa-box">
          <div className="coa-box-title">INSPECTION</div>
          <p>Date Inspected: ________________</p>
          <p>☐ Inspected, verified and found in order as to quantity and specifications</p>
          <Sign label="" name={inspector} role="Inspection Officer / Inspection Committee" />
        </div>
        <div className="coa-box">
          <div className="coa-box-title">ACCEPTANCE</div>
          <p>Date Received: <b>{longDate(r.date)}</b></p>
          <p>☐ Complete &nbsp;&nbsp; ☐ Partial (pls. specify quantity)</p>
          <Sign label="" name={custodian} role="Supply and/or Property Custodian" />
        </div>
      </div>
    </>
  );
}

/* ---------------- RIS ---------------- */

function Ris({ r, entity, fund, custodian }: { r: RequestDetail; entity: string; fund: string; custodian: string }) {
  const released = r.status === "released";
  return (
    <>
      {["declined", "cancelled"].includes(r.status) && <p className="coa-void">{r.status.toUpperCase()}{r.approverNote ? ` — ${r.approverNote}` : ""}</p>}
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr><td>Division: <b>{r.office}</b></td><td>Responsibility Center Code: </td></tr>
          <tr><td>Office: <b>{r.office}</b></td><td>RIS No.: <b>{r.risNo}</b></td></tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead>
          <tr><th colSpan={4}>Requisition</th><th colSpan={2}>Stock Available?</th><th colSpan={2}>Issue</th></tr>
          <tr><th>Stock No.</th><th>Unit</th><th>Description</th><th className="n">Quantity</th><th>Yes</th><th>No</th><th className="n">Quantity</th><th>Remarks</th></tr>
        </thead>
        <tbody>
          {r.items.map((l) => {
            const available = l.onHand >= (l.qtyApproved ?? l.qtyRequested) || (l.qtyIssued ?? 0) > 0;
            return (
              <tr key={l.itemId}>
                <td>{l.code}</td><td>{l.unit}</td><td>{l.name}</td><td className="n">{qty(l.qtyRequested)}</td>
                <td className="c">{available ? "✓" : ""}</td><td className="c">{available ? "" : "✓"}</td>
                <td className="n">{released ? qty(l.qtyIssued ?? 0) : l.qtyApproved != null ? qty(l.qtyApproved) : ""}</td>
                <td>{l.remarks}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>Purpose: <b>{r.purpose}</b></p>
      <table className="coa-table coa-signs">
        <thead><tr><th /><th>Requested by:</th><th>Approved by:</th><th>Issued by:</th><th>Received by:</th></tr></thead>
        <tbody>
          <tr><td>Signature:</td><td /><td /><td /><td /></tr>
          <tr><td>Printed Name:</td><td>{r.requestedBy}</td><td>{r.approvedBy}</td><td>{r.releasedBy || custodian}</td><td>{r.receivedBy}</td></tr>
          <tr><td>Designation:</td><td /><td /><td /><td /></tr>
          <tr>
            <td>Date:</td><td>{longDate(r.date)}</td>
            <td>{r.approvedMs ? new Date(r.approvedMs).toLocaleDateString("en-PH") : ""}</td>
            <td>{r.releaseDate ? longDate(r.releaseDate) : ""}</td><td>{r.releaseDate ? longDate(r.releaseDate) : ""}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/* ---------------- ICS / PAR ---------------- */

function CustodySlip({ d, entity, fund, custodian }: { d: Custody; entity: string; fund: string; custodian: string }) {
  const par = d.type === "PAR";
  const total = d.units.reduce((s, u) => s + u.unitCost, 0);
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund], [`${d.type} No.`, d.docNo]]} />
      <table className="coa-table">
        <thead>
          {par ? (
            <tr><th className="n">Quantity</th><th>Unit</th><th>Description</th><th>Property Number</th><th>Date Acquired</th><th className="n">Amount</th></tr>
          ) : (
            <tr><th className="n">Quantity</th><th>Unit</th><th className="n">Unit Cost</th><th className="n">Total Cost</th><th>Description</th><th>Inventory Item No.</th><th>Estimated Useful Life</th></tr>
          )}
        </thead>
        <tbody>
          {d.units.map((u) =>
            par ? (
              <tr key={u.id}>
                <td className="n">1</td><td>unit</td><td>{u.itemName}{u.serialNo && ` — S/N ${u.serialNo}`}</td>
                <td>{u.propertyNo}</td><td>{longDate(d.date)}</td><td className="n">{peso.format(u.unitCost)}</td>
              </tr>
            ) : (
              <tr key={u.id}>
                <td className="n">1</td><td>unit</td><td className="n">{peso.format(u.unitCost)}</td><td className="n">{peso.format(u.unitCost)}</td>
                <td>{u.itemName}{u.serialNo && ` — S/N ${u.serialNo}`}</td><td>{u.propertyNo}</td><td />
              </tr>
            ),
          )}
          <tr>
            <td colSpan={par ? 5 : 3} className="n"><b>Total</b></td>
            <td className="n"><b>{peso.format(total)}</b></td>
            {!par && <td colSpan={3} />}
          </tr>
        </tbody>
      </table>
      {d.remarks && <p>Remarks: {d.remarks}</p>}
      <div className="coa-sign-row">
        <Sign label={par ? "Received by:" : "Received from:"} name={par ? d.custodian : custodian} role={par ? d.position || "Position/Office" : "Supply and/or Property Custodian"} date={par ? "" : longDate(d.date)} />
        <Sign label={par ? "Issued by:" : "Received by:"} name={par ? custodian : d.custodian} role={par ? "Supply and/or Property Custodian" : d.position || "Position/Office"} date={par ? longDate(d.date) : ""} />
      </div>
    </>
  );
}

/* ---------------- RPCI ---------------- */

function Rpci({ c, entity, fund, custodian, committee, approver }: {
  c: CountDetail; entity: string; fund: string; custodian: string; committee: string; approver: string;
}) {
  const draft = c.status === "draft";
  return (
    <>
      <p style={{ textAlign: "center", margin: "0 0 4px" }}>{c.category || "All inventory items"}</p>
      <p style={{ textAlign: "center", margin: "0 0 10px" }}>As at {longDate(c.date)}</p>
      {draft && <p className="coa-void">COUNT SHEET — not yet posted</p>}
      <Head cells={[["Fund Cluster", fund]]} />
      <p>For which <b>{custodian || "________________"}</b>, Supply and/or Property Custodian, {entity} is accountable, having assumed such accountability on ________________.</p>
      <table className="coa-table">
        <thead>
          <tr>
            <th rowSpan={2}>Article</th><th rowSpan={2}>Description</th><th rowSpan={2}>Stock Number</th><th rowSpan={2}>Unit of Measure</th>
            <th rowSpan={2} className="n">Unit Value</th><th className="n">Balance per Card</th><th className="n">On Hand per Count</th>
            <th colSpan={2}>Shortage/Overage</th><th rowSpan={2}>Remarks</th>
          </tr>
          <tr><th className="n">(Quantity)</th><th className="n">(Quantity)</th><th className="n">Quantity</th><th className="n">Value</th></tr>
        </thead>
        <tbody>
          {c.items.map((l) => (
            <tr key={l.itemId}>
              <td>{l.category}</td><td>{l.name}</td><td>{l.code}</td><td>{l.unit}</td>
              <td className="n">{peso.format(l.avgCost)}</td>
              <td className="n">{qty(l.systemQty)}</td>
              <td className="n">{l.countedQty == null ? "" : qty(l.countedQty)}</td>
              <td className="n">{l.difference ? qty(l.difference) : ""}</td>
              <td className="n">{l.differenceValue ? peso.format(l.differenceValue) : ""}</td>
              <td>{l.remarks}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="coa-sign-row">
        <Sign label="Certified Correct by:" name={committee} role="Inventory Committee Chair and Members" />
        <Sign label="Approved by:" name={approver || c.approvedBy} role="Head of Agency/Entity or Authorized Representative" />
        <Sign label="Verified by:" name="" role="COA Representative" />
      </div>
    </>
  );
}

/* ---------------- Stock Card / Supplies Ledger Card ---------------- */

function StockCard({ card, ledger, entity, fund, from, to }: { card: Card; ledger: boolean; entity: string; fund: string; from: string; to: string }) {
  const i = card.item;
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr><td>Item: <b>{i.name}</b></td><td>Stock No.: <b>{i.code}</b></td></tr>
          <tr><td>Description: <b>{i.description}</b></td><td>Re-order Point: <b>{i.reorderLevel ? qty(i.reorderLevel) : ""}</b></td></tr>
          <tr><td>Unit of Measurement: <b>{i.unit}</b></td><td>Period: <b>{from ? longDate(from) : "Beginning"} – {to ? longDate(to) : "to date"}</b></td></tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead>
          {ledger ? (
            <>
              <tr><th rowSpan={2}>Date</th><th rowSpan={2}>Reference</th><th colSpan={3}>Receipt</th><th colSpan={3}>Issue</th><th colSpan={3}>Balance</th></tr>
              <tr>
                <th className="n">Qty.</th><th className="n">Unit Cost</th><th className="n">Total Cost</th>
                <th className="n">Qty.</th><th className="n">Unit Cost</th><th className="n">Total Cost</th>
                <th className="n">Qty.</th><th className="n">Unit Cost</th><th className="n">Total Cost</th>
              </tr>
            </>
          ) : (
            <>
              <tr><th rowSpan={2}>Date</th><th rowSpan={2}>Reference</th><th>Receipt</th><th colSpan={2}>Issue</th><th>Balance</th></tr>
              <tr><th className="n">Qty.</th><th className="n">Qty.</th><th>Office</th><th className="n">Qty.</th></tr>
            </>
          )}
        </thead>
        <tbody>
          {from && (
            <tr>
              <td>{longDate(from)}</td><td>Balance forward</td>
              {ledger ? (
                <><td colSpan={6} /><td className="n">{qty(card.forward.qty)}</td><td className="n">{peso.format(card.forward.avgCost)}</td><td className="n">{peso.format(card.forward.value)}</td></>
              ) : (
                <><td colSpan={3} /><td className="n">{qty(card.forward.qty)}</td></>
              )}
            </tr>
          )}
          {card.rows.map((m) => {
            const inQ = m.qty > 0 ? m.qty : 0;
            const outQ = m.qty < 0 ? -m.qty : 0;
            const ref = [m.reference, m.kind !== "receive" && m.kind !== "issue" ? MOVE_LABEL[m.kind] : ""].filter(Boolean).join(" — ");
            return (
              <tr key={m.id}>
                <td>{longDate(m.date)}</td>
                <td>{ref}</td>
                {ledger ? (
                  <>
                    <td className="n">{inQ ? qty(inQ) : ""}</td><td className="n">{inQ ? peso.format(m.unitCost) : ""}</td><td className="n">{inQ ? peso.format(m.totalCost) : ""}</td>
                    <td className="n">{outQ ? qty(outQ) : ""}</td><td className="n">{outQ ? peso.format(m.unitCost) : ""}</td><td className="n">{outQ ? peso.format(-m.totalCost) : ""}</td>
                    <td className="n">{qty(m.balanceQty)}</td><td className="n">{peso.format(m.avgCost)}</td><td className="n">{peso.format(m.balanceValue)}</td>
                  </>
                ) : (
                  <>
                    <td className="n">{inQ ? qty(inQ) : ""}</td>
                    <td className="n">{outQ ? qty(outQ) : ""}</td><td>{outQ ? m.party : ""}</td>
                    <td className="n">{qty(m.balanceQty)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
