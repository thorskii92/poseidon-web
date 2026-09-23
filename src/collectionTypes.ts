/** Shared shapes for the Collection screen and its payment dialog. */

export const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type PayableKind =
  | "bill"
  | "application"
  | "installment"
  | "reconnection"
  | "meter-transfer"
  | "owner-transfer"
  | "meter-replacement"
  | "hydrant"
  | "other-fee"
  | "bulk";

export type Payable = {
  key: string;
  kind: PayableKind;
  nature: string;
  accountNo: string;
  billPeriod: string | null;
  amount: number;
  editable: boolean;
  min: number;
  max: number;
  /** Set when the row exists but must not be paid. */
  blocked: string | null;
  billId: number | null;
  feeId: number | null;
  detail: { label: string; value: string }[];
  /** Extra fields posted with the item — bulk water's rate, units and range. */
  payload?: Record<string, unknown>;
  /** Set (to the satellite's name, or a generic fallback) when a Neon
   *  relay signal says a satellite may already be collecting against this
   *  payable in the field, before its real upload has reached here. Main
   *  only — never set on a satellite itself. See poseidon-api's
   *  neonRelay.ts / fieldpaymentsignals. */
  fieldWarning?: string | null;
};

export type CollectionAccount = {
  id: number;
  accountNo: string;
  name: string;
  status: string | null;
  statusId: number;
  isSenior: string | null;
  seniorId: string | null;
  consumerType: string | null;
  barangay: string | null;
  cluster: string | null;
  streetAddress: string | null;
  meterNo: string | null;
  standpipe: string | null;
  remark: string;
};

export type PayablesResponse = {
  account: CollectionAccount;
  /** Everything owed — bills, the status fee and any installment balance. */
  balance: number;
  /** Unpaid water bills only. This is what the desktop's BAL showed. */
  billsBalance: number;
  items: Payable[];
};

export type OrSettings = {
  orNumber: string;
  orSerial: string;
  serials: string[];
  collector: string;
};

export type OtherFee = {
  id: number;
  name: string;
  amount: number;
  editable: boolean;
};

export type PaymentResult = {
  orNumber: string;
  orSerial: string;
  total: number;
  tendered: number;
  change: number;
  particulars: { nature: string; amount: string }[];
  collector: string;
};


export type BulkRate = {
  id: number;
  type: string;
  forDelivery: boolean;
  rate: number;
  minCubic: number;
};

export type BulkRange = { id: number; range: string; rate: number };

export type BulkOptions = {
  enabled: boolean;
  rates: BulkRate[];
  deliveryRanges: BulkRange[];
};
