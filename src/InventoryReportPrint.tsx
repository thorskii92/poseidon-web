import { useEffect, useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, scaledSheetStyle, usePrintPageSize, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import ReportHeader from "./ReportHeader";
import { KpiTile } from "./MobileReportParts";
import { longDate, peso, qty, todayIso } from "./inventoryShared";
import "./print.css";

/**
 * Inventory reports — /reports/inventory/:report/print?month=YYYY-MM (or
 * ?asOf=YYYY-MM-DD). Data from poseidon-api's inventoryReports.ts. Standard
 * report controls: paper/orientation/scale and the 4-slot signatory picker.
 */

type Base = { title: string; subtitle: string; empty: boolean; signatories?: SignatorySlot[] };

const LANDSCAPE = new Set(["depreciation", "regspi", "purchase-orders", "expiring", "rsmi", "stock-on-hand", "movement-summary", "custody", "meters", "requests", "deliveries"]);

const STATUS: Record<string, string> = {
  "in-stock": "In stock", issued: "Issued", installed: "Installed", defective: "Defective",
  damaged: "Damaged", lost: "Lost", disposed: "Disposed", pending: "Waiting for approval",
  approved: "Approved", released: "Released", declined: "Declined", cancelled: "Cancelled",
};

export default function InventoryReportPrint() {
  const { report = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<Base | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());
  const sig = useSignatories(`inventory-${report}`);
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>(LANDSCAPE.has(report) ? "landscape" : "portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);
  const qs = params.toString();

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Base>(`/api/reports/inventory/${report}?${qs}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [report, qs, sig.ready, sig.query]);

  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        {report === "expiring" && (
          <label className="coa-toolbar-field">
            <span>Within (days)</span>
            <input type="number" min={1} max={730} value={params.get("days") ?? "90"} style={{ width: 80 }} onChange={(e) => setParams({ days: e.target.value })} />
          </label>
        )}
        {report === "depreciation" && (
          <label className="coa-toolbar-field">
            <span>As of</span>
            <input type="date" value={params.get("asOf") ?? todayIso()} onChange={(e) => setParams({ asOf: e.target.value })} />
          </label>
        )}
        {report === "regspi" && (
          <label className="coa-toolbar-field">
            <span>Year</span>
            <input type="number" min={2000} max={2100} value={params.get("year") ?? String(new Date().getFullYear())} style={{ width: 80 }} onChange={(e) => setParams({ year: e.target.value })} />
          </label>
        )}
        {report === "stock-on-hand" && (
          <label className="coa-toolbar-field">
            <span>As of</span>
            <input type="date" value={params.get("asOf") ?? todayIso()} max={todayIso()} onChange={(e) => setParams({ asOf: e.target.value })} />
          </label>
        )}
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />
        <p className="ecpay-kicker">{data.title}</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.subtitle}</h1>

        {data.empty ? <p className="count">Nothing to report for this period.</p> : <Body report={report} d={data} />}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories ?? []} />
        </div>
        <p className="ecpay-generated">
          Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="record-section">
      <div className="record-head"><h2>{title}</h2></div>
      {children}
    </section>
  );
}

const m = (n: number) => peso.format(n);

type Rsmi = Base & {
  lines: { date: string; risNo: string; office: string; code: string; name: string; unit: string; qty: number; unitCost: number; amount: number }[];
  recap: { code: string; name: string; unit: string; qty: number; avgCost: number; amount: number }[];
  total: number;
  slips: number;
};
type PurchaseOrders = Base & {
  pos: { poNo: string; date: string; supplier: string; prNo: string; status: string; total: number; received: number; outstanding: number }[];
  suppliers: { supplier: string; pos: number; total: number; outstanding: number }[];
  total: number; received: number; outstanding: number; cancelled: number;
};
type Expiring = Base & {
  days: number;
  lots: { code: string; name: string; unit: string; location: string; lotNo: string; expiry: string; daysLeft: number; qty: number; value: number }[];
  expired: unknown[];
  expiredValue: number;
  soonValue: number;
  undatedLots: number;
};
type StockOnHand = Base & {
  byLocation?: { location: string; items: number; value: number }[];
  items: { code: string; name: string; unit: string; category: string; qty: number; avgCost: number; value: number }[];
  categories: { category: string; items: number; value: number }[];
  total: number;
  outOfStock: number;
};
type BelowReorder = Base & {
  items: { code: string; name: string; unit: string; onHand: number; reorderLevel: number; usedPerMonth: number; lastReceived: string; suggestedOrder: number; avgCost: number }[];
  estimatedCost: number;
};
type Deliveries = Base & {
  receipts: { iarNo: string; date: string; supplier: string; poNumber: string; drNumber: string; invoiceNo: string; lines: number; total: number; status: string }[];
  suppliers: { supplier: string; deliveries: number; total: number }[];
  total: number;
  voided: number;
};
type MovementSummary = Base & {
  items: { code: string; name: string; unit: string; begQty: number; begValue: number; inQty: number; inValue: number; outQty: number; outValue: number; adjQty: number; adjValue: number; endQty: number; endValue: number }[];
  totals: { begValue: number; inValue: number; outValue: number; adjValue: number; endValue: number };
};
type Custody = Base & {
  people: { custodian: string; office: string; units: number; value: number }[];
  units: { custodian: string; position: string; docType: string; docNo: string; issued: string; name: string; propertyNo: string; serialNo: string; unitCost: number }[];
  total: number;
  byStatus: { status: string; count: number }[];
  parThreshold: number;
};
type Meters = Base & {
  counts: Record<string, number>;
  models: ({ model: string } & Record<string, number | string>)[];
  meters: { serialNo: string; model: string; status: string; since: string; accountNo: string; accountName: string; remarks: string }[];
};
type Requests = Base & {
  requests: { risNo: string; date: string; office: string; purpose: string; requester: string; status: string; cutLines: number; daysToRelease: number | null; value: number }[];
  statuses: Record<string, number>;
  offices: { office: string; requests: number; released: number; value: number }[];
  issuedValue: number;
  avgDaysToApprove: number | null;
  avgDaysToRelease: number | null;
};

type DepreciationReport = Base & {
  units: {
    propertyNo: string; serialNo: string; name: string; category: string; acquired: string; cost: number; usefulLife: number | null;
    status: string; custodian: string; monthly: number; months: number; accumulated: number; bookValue: number; missingLife: boolean;
  }[];
  totals: { cost: number; accumulated: number; bookValue: number; monthly: number };
  missingLife: number;
};
type RegSpi = Base & {
  entries: {
    date: string; event: string; docNo: string; docType: string; propertyNo: string; serialNo: string; name: string;
    usefulLife: number | null; custodian: string; office: string; amount: number; remarks: string;
  }[];
  issuedNow: number; issuedValue: number;
};
const REGSPI_EVENT: Record<string, string> = {
  issued: "Issued", transferred: "Transferred", returned: "Returned", "returned-damaged": "Returned unserviceable", disposed: "Disposed", lost: "Lost",
};

function Body({ report, d: raw }: { report: string; d: Base }) {
  switch (report) {
    case "depreciation": {
      const d = raw as DepreciationReport;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Acquisition cost" value={`₱${m(d.totals.cost)}`} sub={`${d.units.length} unit(s)`} />
            <KpiTile label="Accumulated depreciation" value={`₱${m(d.totals.accumulated)}`} />
            <KpiTile label="Book value" value={`₱${m(d.totals.bookValue)}`} />
            <KpiTile label="Monthly depreciation" value={`₱${m(d.totals.monthly)}`} />
          </div>
          {d.missingLife > 0 && <p className="count">{d.missingLife} unit(s) have no useful life set and are shown at cost — set it in Inventory → Equipment → Edit details.</p>}
          <Section title="Straight-line over the useful life, from the month after acquisition">
            <table>
              <thead>
                <tr>
                  <th>Property No.</th><th>Item</th><th>Category</th><th>Acquired</th><th className="n">Cost</th><th className="n">Life (yr)</th>
                  <th className="n">Monthly</th><th className="n">Months</th><th className="n">Accumulated</th><th className="n">Book value</th><th>Accountable</th>
                </tr>
              </thead>
              <tbody>
                {d.units.map((u, i) => (
                  <tr key={i}>
                    <td>{u.propertyNo}</td><td>{u.name}{u.serialNo && <div className="muted">S/N {u.serialNo}</div>}</td><td>{u.category}</td>
                    <td>{u.acquired ? longDate(u.acquired) : ""}</td><td className="n">{m(u.cost)}</td><td className="n">{u.usefulLife ?? "—"}</td>
                    <td className="n">{u.monthly ? m(u.monthly) : ""}</td><td className="n">{u.months || ""}</td>
                    <td className="n">{u.accumulated ? m(u.accumulated) : ""}</td><td className="n">{m(u.bookValue)}</td>
                    <td>{u.custodian || STATUS[u.status] || u.status}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total</td><td className="n">{m(d.totals.cost)}</td><td /><td className="n">{m(d.totals.monthly)}</td><td />
                  <td className="n">{m(d.totals.accumulated)}</td><td className="n">{m(d.totals.bookValue)}</td><td />
                </tr>
              </tfoot>
            </table>
          </Section>
        </>
      );
    }

    case "regspi": {
      const d = raw as RegSpi;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Entries this year" value={String(d.entries.length)} />
            <KpiTile label="Out with people now" value={String(d.issuedNow)} sub={`worth ₱${m(d.issuedValue)}`} />
          </div>
          <Section title="Semi-expendable property issued, transferred, returned and disposed">
            <table>
              <thead>
                <tr>
                  <th>Date</th><th>Reference</th><th>Item No.</th><th>Description</th><th className="n">Useful life</th>
                  <th>Transaction</th><th>Officer / Office</th><th className="n">Amount</th><th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {d.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{longDate(e.date)}</td><td>{[e.docType, e.docNo].filter(Boolean).join(" ")}</td><td>{e.propertyNo}</td>
                    <td>{e.name}{e.serialNo && <div className="muted">S/N {e.serialNo}</div>}</td><td className="n">{e.usefulLife ?? ""}</td>
                    <td>{REGSPI_EVENT[e.event] ?? e.event}</td><td>{[e.custodian, e.office].filter(Boolean).join(", ")}</td>
                    <td className="n">{m(e.amount)}</td><td>{e.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      );
    }

    case "rsmi": {
      const d = raw as Rsmi;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Total issued" value={`₱${m(d.total)}`} />
            <KpiTile label="RIS released" value={String(d.slips)} />
            <KpiTile label="Items" value={String(d.recap.length)} />
          </div>
          <Section title="Supplies and materials issued">
            <table>
              <thead><tr><th>Date</th><th>RIS No.</th><th>Office</th><th>Stock No.</th><th>Item</th><th>Unit</th><th className="n">Qty. issued</th><th className="n">Unit cost</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {d.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{longDate(l.date)}</td><td>{l.risNo}</td><td>{l.office}</td><td>{l.code}</td><td>{l.name}</td><td>{l.unit}</td>
                    <td className="n">{qty(l.qty)}</td><td className="n">{m(l.unitCost)}</td><td className="n">{m(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={8}>Total</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
          <Section title="Recapitulation">
            <table>
              <thead><tr><th>Stock No.</th><th>Item</th><th>Unit</th><th className="n">Quantity</th><th className="n">Unit cost</th><th className="n">Total cost</th></tr></thead>
              <tbody>
                {d.recap.map((r) => (
                  <tr key={r.code}><td>{r.code}</td><td>{r.name}</td><td>{r.unit}</td><td className="n">{qty(r.qty)}</td><td className="n">{m(r.avgCost)}</td><td className="n">{m(r.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
        </>
      );

    }

    case "purchase-orders": {
      const d = raw as PurchaseOrders;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Ordered" value={`₱${m(d.total)}`} sub={`${d.pos.length - d.cancelled} PO(s)${d.cancelled ? `, ${d.cancelled} cancelled` : ""}`} />
            <KpiTile label="Delivered" value={`₱${m(d.received)}`} />
            <KpiTile label="Still to be delivered" value={`₱${m(d.outstanding)}`} />
          </div>
          <Section title="Purchase orders">
            <table>
              <thead><tr><th>PO No.</th><th>Date</th><th>Supplier</th><th>PR</th><th>Status</th><th className="n">Amount</th><th className="n">Delivered</th><th className="n">Outstanding</th></tr></thead>
              <tbody>
                {d.pos.map((p) => (
                  <tr key={p.poNo} className={p.status === "cancelled" ? "muted" : undefined}>
                    <td>{p.poNo}</td><td>{longDate(p.date)}</td><td>{p.supplier}</td><td>{p.prNo}</td><td>{p.status}</td>
                    <td className="n">{m(p.total)}</td><td className="n">{m(p.received)}</td><td className="n">{m(p.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>Total (excluding cancelled)</td><td className="n">{m(d.total)}</td><td className="n">{m(d.received)}</td><td className="n">{m(d.outstanding)}</td></tr></tfoot>
            </table>
          </Section>
          <Section title="By supplier">
            <table>
              <thead><tr><th>Supplier</th><th className="n">POs</th><th className="n">Amount</th><th className="n">Outstanding</th></tr></thead>
              <tbody>{d.suppliers.map((s) => <tr key={s.supplier}><td>{s.supplier}</td><td className="n">{s.pos}</td><td className="n">{m(s.total)}</td><td className="n">{m(s.outstanding)}</td></tr>)}</tbody>
            </table>
          </Section>
        </>
      );
    }

    case "expiring": {
      const d = raw as Expiring;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Already expired" value={String(d.expired.length)} sub={`lot(s) worth ₱${m(d.expiredValue)}`} />
            <KpiTile label={`Expiring within ${d.days} days`} value={String(d.lots.length - d.expired.length)} sub={`lot(s) worth ₱${m(d.soonValue)}`} />
          </div>
          <Section title="Lots, earliest expiry first">
            <table>
              <thead><tr><th>Expiry</th><th>Days left</th><th>Stock No.</th><th>Item</th><th>Lot</th><th>Storehouse</th><th className="n">Qty</th><th className="n">Value</th></tr></thead>
              <tbody>
                {d.lots.map((l, i) => (
                  <tr key={i} style={l.daysLeft < 0 ? { color: "#b00020", fontWeight: 600 } : undefined}>
                    <td>{longDate(l.expiry)}</td><td>{l.daysLeft < 0 ? `expired ${-l.daysLeft} day(s) ago` : l.daysLeft}</td>
                    <td>{l.code}</td><td>{l.name}</td><td>{l.lotNo || "—"}</td><td>{l.location}</td>
                    <td className="n">{qty(l.qty)} {l.unit}</td><td className="n">{m(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          {d.undatedLots > 0 && <p className="count">{d.undatedLots} lot(s) in stock have no expiry date recorded and aren’t listed.</p>}
        </>
      );
    }

    case "stock-on-hand": {
      const d = raw as StockOnHand;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Total value" value={`₱${m(d.total)}`} />
            <KpiTile label="Items" value={String(d.items.length)} />
            <KpiTile label="Out of stock" value={String(d.outOfStock)} />
          </div>
          {(d.byLocation ?? []).length > 1 && (
            <Section title="By storehouse (today)">
              <table>
                <thead><tr><th>Storehouse</th><th className="n">Items</th><th className="n">Value</th></tr></thead>
                <tbody>{(d.byLocation ?? []).map((l) => <tr key={l.location}><td>{l.location}</td><td className="n">{l.items}</td><td className="n">{m(l.value)}</td></tr>)}</tbody>
              </table>
            </Section>
          )}
          <Section title="By category">
            <table>
              <thead><tr><th>Category</th><th className="n">Items</th><th className="n">Value</th></tr></thead>
              <tbody>{d.categories.map((c) => <tr key={c.category}><td>{c.category}</td><td className="n">{c.items}</td><td className="n">{m(c.value)}</td></tr>)}</tbody>
              <tfoot><tr><td>Total</td><td className="n">{d.items.length}</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
          <Section title="Items">
            <table>
              <thead><tr><th>Category</th><th>Stock No.</th><th>Item</th><th>Unit</th><th className="n">On hand</th><th className="n">Avg. cost</th><th className="n">Value</th></tr></thead>
              <tbody>
                {d.items.map((i) => (
                  <tr key={i.code} className={i.qty <= 0 ? "muted" : undefined}>
                    <td>{i.category}</td><td>{i.code}</td><td>{i.name}</td><td>{i.unit}</td>
                    <td className="n">{qty(i.qty)}</td><td className="n">{m(i.avgCost)}</td><td className="n">{m(i.value)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={6}>Total</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
        </>
      );

    }

    case "below-reorder": {
      const d = raw as BelowReorder;
      return (
        <Section title={`${d.items.length} item(s) at or below their reorder level`}>
          <table>
            <thead><tr><th>Stock No.</th><th>Item</th><th>Unit</th><th className="n">On hand</th><th className="n">Reorder at</th><th className="n">Used / month</th><th>Last received</th><th className="n">Suggested order</th><th className="n">Est. cost</th></tr></thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.code}>
                  <td>{i.code}</td><td>{i.name}</td><td>{i.unit}</td><td className="n">{qty(i.onHand)}</td><td className="n">{qty(i.reorderLevel)}</td>
                  <td className="n">{i.usedPerMonth ? qty(i.usedPerMonth) : "—"}</td><td>{i.lastReceived ? longDate(i.lastReceived) : "—"}</td>
                  <td className="n">{qty(i.suggestedOrder)}</td><td className="n">{m(i.suggestedOrder * i.avgCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={8}>Estimated cost at average prices</td><td className="n">{m(d.estimatedCost)}</td></tr></tfoot>
          </table>
          <p className="count">Suggested order brings each item back to twice its reorder level — a starting point for the purchase request.</p>
        </Section>
      );

    }

    case "deliveries": {
      const d = raw as Deliveries;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Total received" value={`₱${m(d.total)}`} />
            <KpiTile label="Deliveries" value={String(d.receipts.length - d.voided)} sub={d.voided ? `${d.voided} voided` : undefined} />
            <KpiTile label="Suppliers" value={String(d.suppliers.length)} />
          </div>
          <Section title="Deliveries">
            <table>
              <thead><tr><th>IAR No.</th><th>Date</th><th>Supplier</th><th>PO No.</th><th>DR No.</th><th>Invoice No.</th><th className="n">Lines</th><th className="n">Amount</th></tr></thead>
              <tbody>
                {d.receipts.map((r) => (
                  <tr key={r.iarNo} className={r.status === "voided" ? "muted" : undefined}>
                    <td>{r.iarNo}{r.status === "voided" && " (voided)"}</td><td>{longDate(r.date)}</td><td>{r.supplier}</td>
                    <td>{r.poNumber}</td><td>{r.drNumber}</td><td>{r.invoiceNo}</td><td className="n">{r.lines}</td>
                    <td className="n">{r.status === "voided" ? <s>{m(r.total)}</s> : m(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={7}>Total (excluding voided)</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
          <Section title="By supplier">
            <table>
              <thead><tr><th>Supplier</th><th className="n">Deliveries</th><th className="n">Amount</th></tr></thead>
              <tbody>{d.suppliers.map((s) => <tr key={s.supplier}><td>{s.supplier}</td><td className="n">{s.deliveries}</td><td className="n">{m(s.total)}</td></tr>)}</tbody>
            </table>
          </Section>
        </>
      );

    }

    case "movement-summary": {
      const d = raw as MovementSummary;
      return (
        <Section title="Beginning, in, out, adjustments and ending — quantity and value">
          <table>
            <thead>
              <tr>
                <th rowSpan={2}>Item</th><th rowSpan={2}>Unit</th>
                <th colSpan={2}>Beginning</th><th colSpan={2}>Received / returned</th><th colSpan={2}>Issued</th><th colSpan={2}>Adjustments</th><th colSpan={2}>Ending</th>
              </tr>
              <tr>{Array.from({ length: 5 }).flatMap((_, i) => [<th key={`q${i}`} className="n">Qty.</th>, <th key={`v${i}`} className="n">Value</th>])}</tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.code}>
                  <td>{i.name}<div className="muted">{i.code}</div></td><td>{i.unit}</td>
                  <td className="n">{qty(i.begQty)}</td><td className="n">{m(i.begValue)}</td>
                  <td className="n">{i.inQty ? qty(i.inQty) : ""}</td><td className="n">{i.inQty ? m(i.inValue) : ""}</td>
                  <td className="n">{i.outQty ? qty(i.outQty) : ""}</td><td className="n">{i.outQty ? m(i.outValue) : ""}</td>
                  <td className="n">{i.adjQty ? qty(i.adjQty) : ""}</td><td className="n">{i.adjQty ? m(i.adjValue) : ""}</td>
                  <td className="n">{qty(i.endQty)}</td><td className="n">{m(i.endValue)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td /><td className="n">{m(d.totals.begValue)}</td><td /><td className="n">{m(d.totals.inValue)}</td>
                <td /><td className="n">{m(d.totals.outValue)}</td><td /><td className="n">{m(d.totals.adjValue)}</td>
                <td /><td className="n">{m(d.totals.endValue)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>
      );

    }

    case "custody": {
      const d = raw as Custody;
      return (
        <>
          <Section title="Accountable persons">
            <table>
              <thead><tr><th>Accountable person</th><th>Office</th><th className="n">Units</th><th className="n">Value</th></tr></thead>
              <tbody>{d.people.map((p) => <tr key={p.custodian}><td>{p.custodian}</td><td>{p.office}</td><td className="n">{p.units}</td><td className="n">{m(p.value)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={2}>Total</td><td className="n">{d.units.length}</td><td className="n">{m(d.total)}</td></tr></tfoot>
            </table>
          </Section>
          <Section title="Equipment out on ICS / PAR">
            <table>
              <thead><tr><th>Accountable person</th><th>Slip</th><th>Issued</th><th>Item</th><th>Property No.</th><th>Serial No.</th><th className="n">Unit cost</th></tr></thead>
              <tbody>
                {d.units.map((u, i) => (
                  <tr key={i}>
                    <td>{u.custodian}<div className="muted">{u.position}</div></td><td>{u.docType} {u.docNo}</td><td>{u.issued ? longDate(u.issued) : ""}</td>
                    <td>{u.name}</td><td>{u.propertyNo}</td><td>{u.serialNo}</td><td className="n">{m(u.unitCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          <p className="count">
            All registered equipment: {d.byStatus.map((s) => `${STATUS[s.status] ?? s.status} ${s.count}`).join(" · ")}. Units of ₱{d.parThreshold.toLocaleString()} and above are on a PAR, the rest on an ICS.
          </p>
        </>
      );

    }

    case "meters": {
      const d = raw as Meters;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            {["in-stock", "installed", "defective", "disposed"].map((s) => <KpiTile key={s} label={STATUS[s]!} value={String(d.counts[s] ?? 0)} />)}
          </div>
          <Section title="By model">
            <table>
              <thead><tr><th>Model</th>{["in-stock", "installed", "defective", "disposed"].map((s) => <th key={s} className="n">{STATUS[s]}</th>)}</tr></thead>
              <tbody>
                {d.models.map((x) => (
                  <tr key={x.model}><td>{x.model}</td>{["in-stock", "installed", "defective", "disposed"].map((s) => <td key={s} className="n">{x[s] ?? 0}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </Section>
          <Section title="Every meter">
            <table>
              <thead><tr><th>Serial No.</th><th>Model</th><th>Status</th><th>Since</th><th>Account</th><th>Remarks</th></tr></thead>
              <tbody>
                {d.meters.map((x, i) => (
                  <tr key={i}>
                    <td>{x.serialNo}</td><td>{x.model}</td><td>{STATUS[x.status] ?? x.status}</td><td>{x.since ? longDate(x.since) : ""}</td>
                    <td>{x.accountNo}{x.accountName && <div className="muted">{x.accountName}</div>}</td><td>{x.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      );

    }

    case "requests": {
      const d = raw as Requests;
      return (
        <>
          <div className="dash-kpis ecpay-kpis ecpay-kpis-4">
            <KpiTile label="Requests" value={String(d.requests.length)} sub={Object.entries(d.statuses).map(([k, v]) => `${v} ${(STATUS[k] ?? k).toLowerCase()}`).join(" · ")} />
            <KpiTile label="Value issued" value={`₱${m(d.issuedValue)}`} />
            <KpiTile label="Days to approve" value={d.avgDaysToApprove == null ? "—" : String(d.avgDaysToApprove)} sub="average" />
            <KpiTile label="Days to release" value={d.avgDaysToRelease == null ? "—" : String(d.avgDaysToRelease)} sub="average, from filing" />
          </div>
          <Section title="By office">
            <table>
              <thead><tr><th>Office</th><th className="n">Requests</th><th className="n">Released</th><th className="n">Value issued</th></tr></thead>
              <tbody>{d.offices.map((o) => <tr key={o.office}><td>{o.office}</td><td className="n">{o.requests}</td><td className="n">{o.released}</td><td className="n">{m(o.value)}</td></tr>)}</tbody>
            </table>
          </Section>
          <Section title="Every request">
            <table>
              <thead><tr><th>RIS No.</th><th>Date</th><th>Office</th><th>Purpose</th><th>Requested by</th><th>Status</th><th className="n">Lines cut</th><th className="n">Days to release</th><th className="n">Value</th></tr></thead>
              <tbody>
                {d.requests.map((r) => (
                  <tr key={r.risNo}>
                    <td>{r.risNo}</td><td>{longDate(r.date)}</td><td>{r.office}</td><td>{r.purpose}</td><td>{r.requester}</td>
                    <td>{STATUS[r.status] ?? r.status}</td><td className="n">{r.cutLines || ""}</td>
                    <td className="n">{r.daysToRelease ?? ""}</td><td className="n">{r.value ? m(r.value) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      );
    }

    default:
      return <p className="form-error">Unknown report.</p>;
  }
}
