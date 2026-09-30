import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, scaledSheetStyle, usePrintPageSize, type Orientation } from "./PrintLayoutControls";
import ReportHeader from "./ReportHeader";
import { useReportHeader } from "./reportHeaderData";
import {
  MOVE_LABEL, longDate, peso, qty,
  type CountDetail, type Item, type Movement, type Receipt, type RequestDetail,
} from "./inventoryShared";
import { EVENT_LABEL, type Asset, type AssetEvent } from "./inventoryShared";
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
 *   custody      also ITR/PTR (transfer), RRSP/PRS (return) and IIRUP (disposal)
 *   wmr          Waste Materials Report
 *   property-card  Property Card / Semi-expendable Property Card for one unit
 *   asset-count  RPCPPE / RPCSP (a draft prints as the count sheet)
 *   labels       QR property labels (?ids=1,2,3)
 *
 * These are workflow forms with their own named signature blocks, not
 * reports — like AdjustmentPrint, they get paper/orientation/scale but not
 * the 4-slot signatory picker. Names the system doesn't know (inspection
 * officer, property custodian…) are typed on the toolbar and remembered on
 * this computer.
 */

type Depreciation = { monthly: number; accumulated: number; bookValue: number } | null;
type Unit = Asset & { acquiredDate: string; usefulLife: number | null; depreciation: Depreciation; classification: string };
type Custody = {
  id: number; type: string; docNo: string; date: string; custodian: string; position: string;
  office: string; remarks: string; by: string; fromCustodian: string; mode: string; appraisedValue: number | null; orNumber: string;
  units: (Unit & { stillOnThisSlip: boolean })[];
};
type Wmr = {
  docNo: string; date: string; custodian: string; mode: string; remarks: string;
  items: { code: string; name: string; unit: string; qty: number; unitCost: number; amount: number; remarks: string }[];
};
type UnitCard = Unit & { events: AssetEvent[] };
type AssetCount = {
  id: number; date: string; scope: string; status: string; remarks: string; approvedBy: string;
  units: (Unit & { found: boolean | null; condition: string; countRemarks: string })[];
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
  pr: { title: "Purchase Request", appendix: "Appendix 60" },
  po: { title: "Purchase Order", appendix: "Appendix 61" },
  ptr: { title: "Property Transfer Report", appendix: "Appendix 76" },
  itr: { title: "Inventory Transfer Report", appendix: "" },
  prs: { title: "Property Return Slip", appendix: "" },
  rrsp: { title: "Receipt of Returned Semi-expendable Property", appendix: "" },
  iirup: { title: "Inventory and Inspection Report of Unserviceable Property", appendix: "Appendix 74" },
  wmr: { title: "Waste Materials Report", appendix: "Appendix 65" },
  "property-card": { title: "Property Card", appendix: "Appendix 69" },
  "semi-card": { title: "Semi-expendable Property Card", appendix: "" },
  rpcppe: { title: "Report on the Physical Count of Property, Plant and Equipment", appendix: "Appendix 73" },
  rpcsp: { title: "Report on the Physical Count of Semi-expendable Property", appendix: "" },
};

const ENDPOINT: Record<string, (id: string, q: string) => string> = {
  iar: (id) => `/api/inventory/receipts/${id}`,
  ris: (id) => `/api/inventory/requests/${id}`,
  custody: (id) => `/api/inventory/assets/custody/${id}`,
  rpci: (id) => `/api/inventory/counts/${id}`,
  "stock-card": (id, q) => `/api/inventory/items/${id}/card?${q}`,
  "ledger-card": (id, q) => `/api/inventory/items/${id}/card?${q}`,
  pr: (id) => `/api/inventory/purchasing/prs/${id}`,
  po: (id) => `/api/inventory/purchasing/pos/${id}`,
  wmr: (id) => `/api/inventory/assets/wmr/${id}`,
  "property-card": (id) => `/api/inventory/assets/${id}`,
  "asset-count": (id) => `/api/inventory/assets/counts/${id}`,
  labels: (_id, q) => `/api/inventory/assets?status=all&${q}`,
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
  const [orientation, setOrientation] = useState<Orientation>(["ledger-card", "rpci", "asset-count"].includes(form) ? "landscape" : "portrait");
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

  if (form === "labels") return <Labels units={(data as { rows: Unit[] }).rows} entity={entity} />;

  const kind =
    form === "custody" ? (data as Custody).type.toLowerCase()
    : form === "property-card" ? ((data as UnitCard).classification === "ppe" ? "property-card" : "semi-card")
    : form === "asset-count" ? ((data as AssetCount).scope === "ppe" ? "rpcppe" : "rpcsp")
    : form;
  const custodyType = form === "custody" ? (data as Custody).type : "";
  // The fund cluster saved with the document wins; the toolbar box is for older ones.
  const saved = String((data as { fundCluster?: string }).fundCluster ?? "");
  const fund = saved || fundCluster;
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
        {!saved && toolbarField("Fund Cluster", fundCluster, setFundCluster, 110)}
        {(form === "iar" || form === "wmr" || custodyType === "IIRUP") && toolbarField("Inspection Officer", inspector, setInspector)}
        {["iar", "ris", "custody", "rpci", "stock-card", "ledger-card", "wmr", "property-card", "asset-count"].includes(form) &&
          toolbarField("Supply / Property Custodian", custodianName, setCustodianName)}
        {(form === "rpci" || form === "asset-count") && toolbarField("Inventory Committee", committee, setCommittee)}
        {(["rpci", "pr", "po", "wmr", "asset-count"].includes(form) || ["IIRUP", "PTR", "ITR"].includes(custodyType)) &&
          toolbarField(form === "po" ? "Authorized official" : "Approved by (Head of Agency)", approver, setApprover)}
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet coa-form" style={scaledSheetStyle(box.width, scale)}>
        <div className="coa-appendix">{t.appendix || " "}</div>
        <ReportHeader />
        <h1 className="soa-title">{t.title}</h1>

        {form === "iar" && <Iar r={data as Receipt} entity={entity} fund={fund} inspector={inspector} custodian={custodianName} />}
        {form === "pr" && <Pr p={data as PrData} entity={entity} fund={fund} approver={approver} />}
        {form === "po" && <Po o={data as PoData} entity={entity} fund={fund} approver={approver} />}
        {form === "ris" && <Ris r={data as RequestDetail} entity={entity} fund={fund} custodian={custodianName} />}
        {(custodyType === "ICS" || custodyType === "PAR") && <CustodySlip d={data as Custody} entity={entity} fund={fund} custodian={custodianName} />}
        {(custodyType === "ITR" || custodyType === "PTR") && <TransferReport d={data as Custody} entity={entity} fund={fund} approver={approver} />}
        {(custodyType === "RRSP" || custodyType === "PRS") && <ReturnSlip d={data as Custody} entity={entity} fund={fund} />}
        {custodyType === "IIRUP" && <Iirup d={data as Custody} entity={entity} fund={fund} custodian={custodianName} inspector={inspector} approver={approver} />}
        {form === "wmr" && <WmrForm w={data as Wmr} entity={entity} fund={fund} custodian={custodianName} inspector={inspector} approver={approver} />}
        {form === "property-card" && <PropertyCard u={data as UnitCard} entity={entity} fund={fund} />}
        {form === "asset-count" && <AssetCountReport c={data as AssetCount} entity={entity} fund={fund} custodian={custodianName} committee={committee} approver={approver} />}
        {form === "rpci" && <Rpci c={data as CountDetail} entity={entity} fund={fund} custodian={custodianName} committee={committee} approver={approver} />}
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

/* ---------------- PR / PO ---------------- */

type PrData = {
  prNo: string; date: string; office: string; purpose: string; status: string; requestedBy: string; approvedBy: string;
  items: { itemId: number; code: string; name: string; unit: string; qty: number; estCost: number }[];
};
type PoData = {
  poNo: string; date: string; supplier: string; supplierAddress: string; supplierTin: string; prNo: string; status: string;
  deliveryPlace: string; deliveryTerm: string; paymentTerm: string; total: number; remarks: string;
  items: { itemId: number; code: string; name: string; unit: string; qty: number; unitCost: number }[];
};

function Pr({ p, entity, fund, approver }: { p: PrData; entity: string; fund: string; approver: string }) {
  const total = p.items.reduce((s, l) => s + l.qty * l.estCost, 0);
  return (
    <>
      {["declined", "cancelled"].includes(p.status) && <p className="coa-void">{p.status.toUpperCase()}</p>}
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr><td>Office/Section: <b>{p.office}</b></td><td>PR No.: <b>{p.prNo}</b><br />Responsibility Center Code: </td><td>Date: <b>{longDate(p.date)}</b></td></tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead><tr><th>Stock/Property No.</th><th>Unit</th><th>Item Description</th><th className="n">Quantity</th><th className="n">Unit Cost</th><th className="n">Total Cost</th></tr></thead>
        <tbody>
          {p.items.map((l) => (
            <tr key={l.itemId}><td>{l.code}</td><td>{l.unit}</td><td>{l.name}</td><td className="n">{qty(l.qty)}</td><td className="n">{peso.format(l.estCost)}</td><td className="n">{peso.format(l.qty * l.estCost)}</td></tr>
          ))}
          <tr><td colSpan={5} className="n"><b>Total</b></td><td className="n"><b>{peso.format(total)}</b></td></tr>
        </tbody>
      </table>
      <p>Purpose: <b>{p.purpose}</b></p>
      <div className="coa-sign-row">
        <Sign label="Requested by:" name={p.requestedBy} role="Printed Name / Designation" />
        <Sign label="Approved by:" name={approver || p.approvedBy} role="Printed Name / Designation" />
      </div>
    </>
  );
}

function Po({ o, entity, fund, approver }: { o: PoData; entity: string; fund: string; approver: string }) {
  return (
    <>
      {o.status === "cancelled" && <p className="coa-void">CANCELLED</p>}
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr><td>Supplier: <b>{o.supplier}</b></td><td>P.O. No.: <b>{o.poNo}</b></td></tr>
          <tr><td>Address: <b>{o.supplierAddress}</b></td><td>Date: <b>{longDate(o.date)}</b></td></tr>
          <tr><td>TIN: <b>{o.supplierTin}</b></td><td>Mode of Procurement: </td></tr>
          <tr><td colSpan={2}>Gentlemen: Please furnish this Office the following articles subject to the terms and conditions contained herein:</td></tr>
          <tr><td>Place of Delivery: <b>{o.deliveryPlace}</b></td><td>Delivery Term: <b>{o.deliveryTerm}</b></td></tr>
          <tr><td>Date of Delivery: </td><td>Payment Term: <b>{o.paymentTerm}</b></td></tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead><tr><th>Stock/Property No.</th><th>Unit</th><th>Description</th><th className="n">Quantity</th><th className="n">Unit Cost</th><th className="n">Amount</th></tr></thead>
        <tbody>
          {o.items.map((l) => (
            <tr key={l.itemId}><td>{l.code}</td><td>{l.unit}</td><td>{l.name}</td><td className="n">{qty(l.qty)}</td><td className="n">{peso.format(l.unitCost)}</td><td className="n">{peso.format(l.qty * l.unitCost)}</td></tr>
          ))}
          <tr><td colSpan={5}>(Total Amount in Words)</td><td className="n"><b>{peso.format(o.total)}</b></td></tr>
        </tbody>
      </table>
      {o.prNo && <p>Reference: {o.prNo}</p>}
      <p style={{ fontSize: "9pt" }}>
        In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10) of one percent for every day of delay shall be imposed on the undelivered item/s.
      </p>
      <div className="coa-sign-row">
        <Sign label="Conforme:" name="" role="Signature over Printed Name of Supplier" date="" />
        <Sign label="Very truly yours," name={approver} role="Authorized Official" />
      </div>
    </>
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

/* ---------------- ITR / PTR ---------------- */

function TransferReport({ d, entity, fund, approver }: { d: Custody; entity: string; fund: string; approver: string }) {
  const ptr = d.type === "PTR";
  const total = d.units.reduce((s, u) => s + u.unitCost, 0);
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund], [`${d.type} No.`, d.docNo], ["Date", longDate(d.date)]]} />
      <Head cells={[["From Accountable Officer", d.fromCustodian], ["To Accountable Officer", `${d.custodian}${d.office ? `, ${d.office}` : ""}`]]} />
      <p>Transfer Type: ☐ Donation &nbsp; ☐ Relocate &nbsp; ☒ Reassignment &nbsp; ☐ Others (Specify) ________</p>
      <table className="coa-table">
        <thead>
          <tr>
            <th>Date Acquired</th><th>{ptr ? "Property No." : "Item No."}</th><th>Description</th>
            <th className="n">Amount</th><th>Condition of {ptr ? "PPE" : "Inventory"}</th>
          </tr>
        </thead>
        <tbody>
          {d.units.map((u) => (
            <tr key={u.id}>
              <td>{u.acquiredDate ? longDate(u.acquiredDate) : ""}</td>
              <td>{u.propertyNo}</td>
              <td>{u.itemName}{u.serialNo && ` — S/N ${u.serialNo}`}</td>
              <td className="n">{peso.format(u.unitCost)}</td>
              <td>Serviceable</td>
            </tr>
          ))}
          <tr><td colSpan={3} className="n"><b>Total</b></td><td className="n"><b>{peso.format(total)}</b></td><td /></tr>
        </tbody>
      </table>
      <p>Reason for Transfer: <b>{d.remarks}</b></p>
      <div className="coa-sign-row">
        <Sign label="Approved by:" name={approver} role="Head of Agency/Entity or Authorized Representative" date="" />
        <Sign label="Released/Issued by:" name={d.fromCustodian} role="Accountable Officer" date={longDate(d.date)} />
        <Sign label="Received by:" name={d.custodian} role={d.position || "Accountable Officer"} date="" />
      </div>
    </>
  );
}

/* ---------------- RRSP / PRS ---------------- */

function ReturnSlip({ d, entity, fund }: { d: Custody; entity: string; fund: string }) {
  const total = d.units.reduce((s, u) => s + u.unitCost, 0);
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund], [`${d.type} No.`, d.docNo], ["Date", longDate(d.date)]]} />
      <p>This is to acknowledge receipt of the returned {d.type === "PRS" ? "property" : "semi-expendable property"}:</p>
      <table className="coa-table">
        <thead>
          <tr><th>Item Description</th><th className="n">Quantity</th><th>{d.type === "PRS" ? "Property No." : "Item No."}</th><th>End-user</th><th className="n">Amount</th><th>Remarks</th></tr>
        </thead>
        <tbody>
          {d.units.map((u) => (
            <tr key={u.id}>
              <td>{u.itemName}{u.serialNo && ` — S/N ${u.serialNo}`}</td>
              <td className="n">1</td>
              <td>{u.propertyNo}</td>
              <td>{d.fromCustodian}</td>
              <td className="n">{peso.format(u.unitCost)}</td>
              <td>{d.remarks}</td>
            </tr>
          ))}
          <tr><td colSpan={4} className="n"><b>Total</b></td><td className="n"><b>{peso.format(total)}</b></td><td /></tr>
        </tbody>
      </table>
      <div className="coa-sign-row">
        <Sign label="Returned by:" name={d.fromCustodian} role="End-user" date={longDate(d.date)} />
        <Sign label="Received by:" name={d.custodian} role="Supply and/or Property Custodian" date={longDate(d.date)} />
      </div>
    </>
  );
}

/* ---------------- IIRUP ---------------- */

function Iirup({ d, entity, fund, custodian, inspector, approver }: {
  d: Custody; entity: string; fund: string; custodian: string; inspector: string; approver: string;
}) {
  const sum = (f: (u: Unit) => number) => d.units.reduce((s, u) => s + f(u), 0);
  const dep = (u: Unit) => u.depreciation?.accumulated ?? 0;
  return (
    <>
      <p style={{ textAlign: "center", margin: "0 0 10px" }}>As at {longDate(d.date)}</p>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund], ["IIRUP No.", d.docNo]]} />
      <table className="coa-table">
        <thead>
          <tr><th colSpan={9}>INVENTORY</th><th colSpan={3}>INSPECTION and DISPOSAL</th></tr>
          <tr>
            <th>Date Acquired</th><th>Particulars / Articles</th><th>Property No.</th><th className="n">Qty</th>
            <th className="n">Unit Cost</th><th className="n">Total Cost</th><th className="n">Accumulated Depreciation</th>
            <th className="n">Carrying Amount</th><th>Remarks</th>
            <th>Mode of Disposal</th><th className="n">Appraised Value</th><th>O.R. No.</th>
          </tr>
        </thead>
        <tbody>
          {d.units.map((u, i) => (
            <tr key={u.id}>
              <td>{u.acquiredDate ? longDate(u.acquiredDate) : ""}</td>
              <td>{u.itemName}{u.serialNo && ` — S/N ${u.serialNo}`}</td>
              <td>{u.propertyNo}</td>
              <td className="n">1</td>
              <td className="n">{peso.format(u.unitCost)}</td>
              <td className="n">{peso.format(u.unitCost)}</td>
              <td className="n">{dep(u) ? peso.format(dep(u)) : ""}</td>
              <td className="n">{peso.format(u.unitCost - dep(u))}</td>
              <td>{u.statusLabel}</td>
              {i === 0 && (
                <>
                  <td rowSpan={d.units.length}>{d.mode}</td>
                  <td rowSpan={d.units.length} className="n">{d.appraisedValue != null ? peso.format(d.appraisedValue) : ""}</td>
                  <td rowSpan={d.units.length}>{d.orNumber}</td>
                </>
              )}
            </tr>
          ))}
          <tr>
            <td colSpan={5} className="n"><b>Total</b></td>
            <td className="n"><b>{peso.format(sum((u) => u.unitCost))}</b></td>
            <td className="n"><b>{peso.format(sum(dep))}</b></td>
            <td className="n"><b>{peso.format(sum((u) => u.unitCost - dep(u)))}</b></td>
            <td colSpan={4} />
          </tr>
        </tbody>
      </table>
      {d.remarks && <p>Remarks: {d.remarks}</p>}
      <div className="coa-sign-row">
        <Sign label="Requested by:" name={custodian} role="Supply and/or Property Custodian" />
        <Sign label="Approved by:" name={approver} role="Head of Agency/Entity or Authorized Representative" />
      </div>
      <div className="coa-sign-row">
        <Sign label="I CERTIFY that I have inspected each and every article enumerated in this report, and that the disposal was made as stated:" name={inspector} role="Inspection Officer" />
        <Sign label="I CERTIFY that I have witnessed the disposal of the articles enumerated on this report:" name="" role="Witness" />
      </div>
    </>
  );
}

/* ---------------- WMR ---------------- */

function WmrForm({ w, entity, fund, custodian, inspector, approver }: {
  w: Wmr; entity: string; fund: string; custodian: string; inspector: string; approver: string;
}) {
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund], ["WMR No.", w.docNo], ["Date", longDate(w.date)]]} />
      <p>Place of Storage: ____________________</p>
      <table className="coa-table">
        <thead>
          <tr><th>Item</th><th className="n">Quantity</th><th>Unit</th><th>Description</th><th className="n">Amount</th><th>Record of Sales — O.R. No.</th><th className="n">Amount</th></tr>
        </thead>
        <tbody>
          {w.items.map((l, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td className="n">{qty(l.qty)}</td>
              <td>{l.unit}</td>
              <td>{l.name}{l.remarks && ` — ${l.remarks}`}</td>
              <td className="n">{peso.format(l.amount)}</td>
              <td />
              <td />
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="n"><b>Total</b></td>
            <td className="n"><b>{peso.format(w.items.reduce((s, l) => s + l.amount, 0))}</b></td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
      {(w.mode || w.remarks) && <p>{[w.mode && `To be disposed of by: ${w.mode}`, w.remarks].filter(Boolean).join(" — ")}</p>}
      <div className="coa-sign-row">
        <Sign label="Certified Correct:" name={custodian || w.custodian} role="Supply and/or Property Custodian" />
        <Sign label="Disposal Approved:" name={approver} role="Head of Agency/Entity or Authorized Representative" />
      </div>
      <div className="coa-sign-row">
        <Sign label="Certificate of Inspection — the property enumerated above was disposed of as stated:" name={inspector} role="Inspection Officer" />
        <Sign label="Witness to Disposal:" name="" role="Witness" />
      </div>
    </>
  );
}

/* ---------------- Property Card / Semi-expendable Property Card ---------------- */

const ON_BOOKS_OFF = ["disposed", "lost"];

function PropertyCard({ u, entity, fund }: { u: UnitCard; entity: string; fund: string }) {
  // Running balance: 1 from registration until disposed or lost.
  const balances = u.events.reduce<number[]>((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1] : 0;
    acc.push(e.event === "registered" ? 1 : ON_BOOKS_OFF.includes(e.event) ? 0 : prev);
    return acc;
  }, []);
  return (
    <>
      <Head cells={[["Entity Name", entity], ["Fund Cluster", fund]]} />
      <table className="coa-table">
        <tbody>
          <tr><td>Property, Plant and Equipment: <b>{u.itemName}</b></td><td>Property Number: <b>{u.propertyNo}</b></td></tr>
          <tr><td colSpan={2}>Description: <b>{[u.itemCode, u.serialNo && `S/N ${u.serialNo}`, u.usefulLife && `useful life ${u.usefulLife} yr`].filter(Boolean).join(" · ")}</b></td></tr>
        </tbody>
      </table>
      <table className="coa-table">
        <thead>
          <tr>
            <th rowSpan={2}>Date</th><th rowSpan={2}>Reference / PAR No.</th><th>Receipt</th>
            <th colSpan={2}>Issue / Transfer / Disposal</th><th>Balance</th><th rowSpan={2} className="n">Amount</th><th rowSpan={2}>Remarks</th>
          </tr>
          <tr><th className="n">Qty.</th><th className="n">Qty.</th><th>Office / Officer</th><th className="n">Qty.</th></tr>
        </thead>
        <tbody>
          {u.events.map((e, i) => {
            const receipt = e.event === "registered" ? 1 : 0;
            const out = ["issued", "transferred", "installed", ...ON_BOOKS_OFF].includes(e.event) ? 1 : 0;
            const balance = balances[i];
            return (
              <tr key={e.id}>
                <td>{longDate(e.date)}</td>
                <td>{[e.docType, e.docNo].filter(Boolean).join(" ")}</td>
                <td className="n">{receipt || ""}</td>
                <td className="n">{out || ""}</td>
                <td>{out ? [e.custodian, e.office, e.accountNo && `Acct ${e.accountNo}`].filter(Boolean).join(", ") : ""}</td>
                <td className="n">{balance}</td>
                <td className="n">{balance ? peso.format(u.unitCost) : ""}</td>
                <td>{[EVENT_LABEL[e.event] ?? e.event, e.remarks].filter(Boolean).join(" — ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/* ---------------- RPCPPE / RPCSP ---------------- */

function AssetCountReport({ c, entity, fund, custodian, committee, approver }: {
  c: AssetCount; entity: string; fund: string; custodian: string; committee: string; approver: string;
}) {
  const ppe = c.scope === "ppe";
  return (
    <>
      <p style={{ textAlign: "center", margin: "0 0 4px" }}>{ppe ? "Property, Plant and Equipment" : "Semi-expendable Property"}</p>
      <p style={{ textAlign: "center", margin: "0 0 10px" }}>As at {longDate(c.date)}</p>
      {c.status === "draft" && <p className="coa-void">COUNT SHEET — not yet posted</p>}
      <Head cells={[["Fund Cluster", fund]]} />
      <p>For which <b>{custodian || "________________"}</b>, Supply and/or Property Custodian, {entity} is accountable, having assumed such accountability on ________________.</p>
      <table className="coa-table">
        <thead>
          <tr>
            <th rowSpan={2}>Article</th><th rowSpan={2}>Description</th><th rowSpan={2}>{ppe ? "Property Number" : "Item Number"}</th>
            <th rowSpan={2}>Unit of Measure</th><th rowSpan={2} className="n">Unit Value</th>
            <th className="n">Quantity per Property Card</th><th className="n">Quantity per Physical Count</th>
            <th colSpan={2}>Shortage/Overage</th><th rowSpan={2}>Remarks</th>
          </tr>
          <tr><th className="n">(Quantity)</th><th className="n">(Quantity)</th><th className="n">Quantity</th><th className="n">Value</th></tr>
        </thead>
        <tbody>
          {c.units.map((u) => (
            <tr key={u.id}>
              <td>{u.itemName}</td>
              <td>{[u.serialNo && `S/N ${u.serialNo}`, u.custodian || u.location].filter(Boolean).join(" · ")}</td>
              <td>{u.propertyNo}</td>
              <td>unit</td>
              <td className="n">{peso.format(u.unitCost)}</td>
              <td className="n">1</td>
              <td className="n">{u.found == null ? "" : u.found ? 1 : 0}</td>
              <td className="n">{u.found === false ? 1 : ""}</td>
              <td className="n">{u.found === false ? peso.format(u.unitCost) : ""}</td>
              <td>{[u.condition && (u.condition === "serviceable" ? "Serviceable" : "Unserviceable"), u.countRemarks].filter(Boolean).join(" — ")}</td>
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

/* ---------------- QR labels ---------------- */

/** A QR code drawn as SVG, synchronously — no canvas or effect needed. */
function QrSvg({ value, size = 96 }: { value: string; size?: number }) {
  const m = QRCode.create(value || " ", { errorCorrectionLevel: "M" }).modules;
  const n = m.size;
  let path = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m.get(r, c)) path += `M${c + 2} ${r + 2}h1v1h-1z`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-hidden="true">
      <rect width={n + 4} height={n + 4} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

function Labels({ units, entity }: { units: Unit[]; entity: string }) {
  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <span className="count">{units.length} label(s). Scanning a label gives its property / serial number — type it in Inventory's search.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 86mm)", gap: "4mm", padding: "6mm", background: "#fff", color: "#000" }}>
        {units.map((u) => (
          <div
            key={u.id}
            style={{ display: "flex", gap: "3mm", alignItems: "center", border: "1px solid #000", padding: "2mm", height: "38mm", boxSizing: "border-box", breakInside: "avoid" }}
          >
            <QrSvg value={u.propertyNo || u.serialNo} size={120} />
            <div style={{ fontSize: "9pt", lineHeight: 1.25, minWidth: 0 }}>
              <div style={{ fontSize: "7pt", textTransform: "uppercase" }}>{entity}</div>
              <div style={{ fontWeight: 700, fontSize: "11pt" }}>{u.propertyNo || u.serialNo}</div>
              <div>{u.itemName}</div>
              {u.propertyNo && u.serialNo && <div>S/N {u.serialNo}</div>}
              {u.acquiredDate && <div>Acquired {longDate(u.acquiredDate)}</div>}
              <div style={{ fontSize: "7pt" }}>PROPERTY — DO NOT REMOVE</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
