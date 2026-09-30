/** Types and formatting shared by the Inventory page's tabs (API: poseidon-api/src/inventory.ts). */

export type ItemKind = "consumable" | "equipment" | "meter";

export type Item = {
  id: number;
  code: string;
  name: string;
  description: string;
  unit: string;
  category: string;
  kind: ItemKind;
  location: string;
  reorderLevel: number;
  qtyOnHand: number;
  totalValue: number;
  avgCost: number;
  active: boolean;
  belowReorder: boolean;
};

export type ItemsResponse = { rows: Item[]; categories: string[]; units: string[] };

export type Movement = {
  id: number;
  itemId: number;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  date: string;
  atMs: number;
  kind: "opening" | "receive" | "issue" | "return" | "adjust" | "void";
  qty: number;
  unitCost: number;
  totalCost: number;
  balanceQty: number;
  balanceValue: number;
  avgCost: number;
  refKind: string | null;
  refId: number | null;
  reference: string;
  party: string;
  remarks: string;
  by: string;
};

export type Summary = {
  items: number;
  value: number;
  belowReorder: number;
  outOfStock: number;
  lowItems: Item[];
  recent: Movement[];
};

export type Receipt = {
  id: number;
  iarNo: string;
  date: string;
  supplier: string;
  poNumber: string;
  drNumber: string;
  invoiceNo: string;
  remarks: string;
  totalCost: number;
  status: "posted" | "voided";
  voidReason: string;
  lines?: number;
  by: string;
  items?: Movement[];
};

export type CountSummary = {
  id: number;
  date: string;
  category: string;
  remarks: string;
  status: "draft" | "posted";
  lines: number;
  counted: number;
  differences: number;
  by: string;
  approvedBy: string;
};

export type CountLine = {
  itemId: number;
  code: string;
  name: string;
  unit: string;
  category: string;
  systemQty: number;
  countedQty: number | null;
  difference: number | null;
  avgCost: number;
  differenceValue: number | null;
  nowOnHand: number;
  remarks: string;
};

export type CountDetail = CountSummary & { items: CountLine[] };

export const KIND_LABEL: Record<ItemKind, string> = {
  consumable: "Supplies & materials",
  equipment: "Equipment & tools",
  meter: "Water meters",
};

export const MOVE_LABEL: Record<Movement["kind"], string> = {
  opening: "Opening balance",
  receive: "Received",
  issue: "Issued",
  return: "Returned",
  adjust: "Count adjustment",
  void: "Voided delivery",
};

export const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyFormat = new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 });
export const qty = (n: number) => qtyFormat.format(n);

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function longDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export type Rights = { inventory: boolean; request: boolean; approve: boolean };

export type RequestStatus = "pending" | "approved" | "released" | "declined" | "cancelled";

export type SupplyRequest = {
  id: number;
  risNo: string;
  date: string;
  office: string;
  purpose: string;
  requestedById: number | null;
  requestedBy: string;
  status: RequestStatus;
  approvedBy: string;
  approvedMs: number | null;
  approverNote: string;
  releasedBy: string;
  releasedMs: number | null;
  releaseDate: string;
  receivedBy: string;
  createdMs: number;
  lines?: number;
  value?: number;
};

export type RequestLine = {
  itemId: number;
  code: string;
  name: string;
  unit: string;
  qtyRequested: number;
  qtyApproved: number | null;
  qtyIssued: number | null;
  unitCost: number | null;
  onHand: number;
  avgCost: number;
  remarks: string;
};

export type RequestDetail = SupplyRequest & { items: RequestLine[]; rights: Rights };

export const REQUEST_STATUS: Record<RequestStatus, { label: string; badge: string }> = {
  pending: { label: "Waiting for approval", badge: "act-blue" },
  approved: { label: "Approved — to release", badge: "act-green" },
  released: { label: "Released", badge: "act-gray" },
  declined: { label: "Declined", badge: "act-red" },
  cancelled: { label: "Cancelled", badge: "act-gray" },
};

export type Asset = {
  id: number;
  itemId: number;
  itemCode: string;
  itemName: string;
  kind: "equipment" | "meter";
  propertyNo: string;
  serialNo: string;
  unitCost: number;
  status: string;
  statusLabel: string;
  custodian: string;
  office: string;
  docId: number | null;
  docNo: string;
  docType: string;
  acctId: number | null;
  accountNo: string;
  accountName: string;
  accountMeterNo: string;
  statusDate: string;
  remarks: string;
};

export type AssetEvent = {
  id: number; date: string; event: string; custodian: string; office: string;
  docNo: string; accountNo: string; remarks: string; by: string;
};

export type UnregisteredItem = {
  id: number; code: string; name: string; kind: "equipment" | "meter"; unit: string;
  onHand: number; registered: number; unregistered: number;
};

export type CustodyDoc = {
  id: number; type: "ICS" | "PAR"; docNo: string; date: string; custodian: string; position: string;
  office: string; remarks: string; units: number; stillHeld: number; by: string;
};

export const EVENT_LABEL: Record<string, string> = {
  registered: "Registered", issued: "Issued", transferred: "Transferred", returned: "Returned",
  "returned-damaged": "Returned damaged", installed: "Installed", "pulled-out": "Pulled out (reusable)",
  "pulled-out-defective": "Pulled out (defective)", lost: "Lost", damaged: "Damaged", defective: "Defective", disposed: "Disposed",
};

export type ListEntry ={ id: number; name: string; description: string; active: boolean; items: number };
export type Lists = { categories: ListEntry[]; units: ListEntry[] };

export const INV_KEYS = {
  lists: ["inv-lists"],
  summary: ["inv-summary"],
  items: ["inv-items"],
  receipts: ["inv-receipts"],
  counts: ["inv-counts"],
  requests: ["inv-requests"],
  assets: ["inv-assets"],
};

/** Opens a printable COA form in a new tab. */
export function openForm(form: "iar" | "ris" | "custody" | "rpci" | "stock-card" | "ledger-card", id: number, query = "") {
  window.open(`/inventory/print/${form}/${id}${query ? `?${query}` : ""}`, "_blank");
}
