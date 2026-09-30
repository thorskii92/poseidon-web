import { useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { apiGet } from "./api";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import "./print.css";

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function longDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`;
}

/**
 * How many bills go on one sheet. The slip itself never changes shape - it
 * stays half-width and 6.1in tall whatever the setting - so the office cuts
 * every sheet the same way. A lower number just leaves the rest of the sheet
 * blank, which is what you want when printing a single bill for a walk-in.
 *
 * Four fills a 8.5 x 13 long bond exactly (2 across, 2 down).
 */
const PER_PAGE_OPTIONS = [1, 2, 4];
const PER_PAGE_KEY = "poseidon.billsPerPage";

function loadPerPage() {
  try {
    const saved = Number(localStorage.getItem(PER_PAGE_KEY));
    if (PER_PAGE_OPTIONS.includes(saved)) return saved;
  } catch {
    /* private windows and locked-down browsers throw on access */
  }
  return 4;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * The two office seals sit either side of the header, as on the desktop bill.
 * They come from munlist.municipallogo and munlist.waterofficelogo, served by
 * the API - so they follow the database rather than a file dropped on one
 * machine, and every report can use the same two.
 *
 * Which logos appear is decided by which are uploaded: put one in and the bill
 * shows one, put both in and it shows both. A logo that is not on file hides
 * itself but keeps its column, so the header text stays centred.
 */
const LOGO_SRC = {
  municipal: "/api/settings/logo/municipal",
  office: "/api/settings/logo/office",
} as const;

function Seal({ which }: { which: keyof typeof LOGO_SRC }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return (
    <img className="bill-seal" src={LOGO_SRC[which]} alt="" onError={hide} />
  );
}

type Bill = {
  billId: number;
  accountNo: string;
  accountName: string;
  address: string;
  standpipe: string | null;
  meterNo: string | null;
  classification: string;
  accountType: string;
  billingMonth: string;
  readDate: string | null;
  billDate: string | null;
  dueDate: string | null;
  fromDate: string | null;
  toDate: string | null;
  prevRead: number;
  presRead: number;
  consumption: number;
  waterServiceFee: number;
  enviFee: number;
  discount: number;
  applicationFee: number;
  amountDue: number;
  unpaidBill: number;
  /** "AUG 26", or "MAR 26 - AUG 26" when more than one month is behind. */
  unpaidMonths: string | null;
  /** What is left of the application fee, if anything. */
  appFeeBalance: number;
  totalAmountDue: number;
  penalty: number;
  amountAfterDue: number;
  note: string;
  noticeHighlight: boolean;
};

type PrintData = {
  settings: {
    municipality: string | null;
    municipalHeader: string;
    officeHeader: string;
    waterSystemName: string;
    officeAddress: string | null;
    officeContact: string;
    /** From Settings → Report header; empty when that line is hidden. */
    provinceText?: string;
  };
  bills: Bill[];
};

function BillCard({
  bill,
  settings,
}: {
  bill: Bill;
  settings: PrintData["settings"];
}) {
  // Keep this list (tags and attributes both) in sync with NOTE_TAGS /
  // NOTE_ATTR in SettingsPage.tsx's disconnection-notice editor — anything
  // allowed in one but not the other looks right in that editor's preview
  // and then silently vanishes here, on the actual printed bill.
  const noteHtml = DOMPurify.sanitize(bill.note, {
    ALLOWED_TAGS: [
      "b",
      "strong",
      "i",
      "em",
      "u",
      "br",
      "center",
      "h3",
      "p",
      "span",
      "div",
      "font",
    ],
    ALLOWED_ATTR: ["style"],
  });

  return (
    <article className="bill">
      <header className="bill-head">
        <Seal which="municipal" />
        <div className="bill-head-text">
          <div className="bill-republic">Republic of the Philippines</div>
          {settings.provinceText ? (
            <div className="bill-org">{settings.provinceText}</div>
          ) : null}
          <div className="bill-org">{settings.municipalHeader}</div>
          <div className="bill-org">{settings.officeHeader}</div>
          <div className="bill-system">{settings.waterSystemName}</div>
          {settings.officeAddress ? (
            <div className="bill-address">{settings.officeAddress}</div>
          ) : null}
        </div>
        <Seal which="office" />
      </header>

      <table className="bill-meta">
        <colgroup>
          <col className="c-lbl" />
          <col />
          <col className="c-lbl" />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td className="lbl">Bill No.:</td>
            <td className="val">{bill.billId}</td>
            <td className="lbl">Account No.:</td>
            <td className="val center">{bill.accountNo}</td>
          </tr>
          <tr>
            <td className="lbl">Name</td>
            <td className="name" colSpan={3}>
              {bill.accountName}
            </td>
          </tr>
          <tr>
            <td className="lbl">Address:</td>
            <td colSpan={3}>{bill.address}</td>
          </tr>
          <tr>
            <td className="lbl">Standpipe No.</td>
            <td className="val center">{bill.standpipe}</td>
            <td className="lbl">Billing Month</td>
            <td className="val center bold">{bill.billingMonth}</td>
          </tr>
          <tr>
            <td className="lbl">Meter Serial #</td>
            <td className="val center">{bill.meterNo}</td>
            <td className="lbl">Reading Date</td>
            <td className="val center bold">{longDate(bill.readDate)}</td>
          </tr>
          <tr>
            <td className="lbl">Classification</td>
            <td className="val center bold">{bill.classification}</td>
            <td className="lbl">Billing Date</td>
            <td className="val center bold">{longDate(bill.billDate)}</td>
          </tr>
          <tr>
            <td className="lbl">Account Type</td>
            <td className="val center bold acct-type">{bill.accountType}</td>
            <td className="lbl due">DUE DATE</td>
            <td className="val center bold due">{longDate(bill.dueDate)}</td>
          </tr>
          <tr>
            <td className="lbl">Date Covered</td>
            <td className="val center covered">{longDate(bill.fromDate)}</td>
            <td className="center covered">-</td>
            <td className="val center covered">{longDate(bill.toDate)}</td>
          </tr>
        </tbody>
      </table>

      <table className="bill-reading">
        <tbody>
          <tr>
            <td rowSpan={2} className="blank" />
            <td colSpan={2} className="center">
              METER READING
            </td>
            <td className="center">TOTAL MONTHLY</td>
          </tr>
          <tr>
            <td className="center">PREVIOUS</td>
            <td className="center">PRESENT</td>
            <td className="center">CONSUMPTION</td>
          </tr>
          <tr>
            <td>Cubic Meters</td>
            <td className="center">{bill.prevRead}</td>
            <td className="center">{bill.presRead}</td>
            <td className="center">{bill.consumption}</td>
          </tr>
        </tbody>
      </table>

      <table className="bill-amounts">
        <tbody>
          <tr>
            <td className="center">PARTICULARS</td>
            <td className="center">AMOUNT</td>
          </tr>
          <tr>
            <td>WATER SERVICES FEE</td>
            <td className="amt">{peso.format(bill.waterServiceFee)}</td>
          </tr>
          <tr>
            <td>PES</td>
            <td className="amt">{peso.format(bill.enviFee)}</td>
          </tr>
          <tr>
            <td>DISCOUNT</td>
            <td className="amt">
              {bill.discount
                ? `(${peso.format(bill.discount)})`
                : peso.format(0)}
            </td>
          </tr>
          {bill.applicationFee > 0 && (
            <tr>
              <td>APPLICATION FEE</td>
              <td className="amt">{peso.format(bill.applicationFee)}</td>
            </tr>
          )}
          <tr className="spacer">
            <td colSpan={2} />
          </tr>
          <tr className="bold">
            <td>CURRENT MONTH BILL</td>
            <td className="amt">{peso.format(bill.amountDue)}</td>
          </tr>
          <tr>
            <td>
              UNPAID BILL(S)
              {bill.unpaidMonths ? (
                <span className="unpaid-months">({bill.unpaidMonths})</span>
              ) : null}
            </td>
            <td className="amt">{peso.format(bill.unpaidBill)}</td>
          </tr>
          <tr className="bold total-due">
            <td>TOTAL AMOUNT DUE</td>
            <td className="amt">{peso.format(bill.totalAmountDue)}</td>
          </tr>
          <tr>
            <td>PENALTY</td>
            <td className="amt">{peso.format(bill.penalty)}</td>
          </tr>
          <tr className="bold">
            <td>AMOUNT AFTER DUE</td>
            <td className="amt">{peso.format(bill.amountAfterDue)}</td>
          </tr>
        </tbody>
      </table>

      <div className="bill-other">OTHER PARTICULARS:</div>

      {bill.appFeeBalance > 0 && (
        <table className="bill-amounts bill-particulars">
          <tbody>
            <tr>
              <td>APPLICATION FEE BALANCE</td>
              <td className="amt">{peso.format(bill.appFeeBalance)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div
        className={bill.noticeHighlight ? "bill-note highlight" : "bill-note"}
        dangerouslySetInnerHTML={{ __html: noteHtml }}
      />

      <footer className="bill-foot">{settings.officeContact}</footer>
    </article>
  );
}

export default function BillPrint() {
  const [params] = useSearchParams();
  // Forwarded as-is rather than picking out named fields — the API accepts
  // either a hand-picked "ids" list or a whole-group identity (month/year/
  // areaId/useCluster/search), and this view doesn't need to know which.
  const query = params.toString();
  const [perPage, setPerPage] = useState(loadPerPage);

  function changePerPage(value: number) {
    setPerPage(value);
    try {
      localStorage.setItem(PER_PAGE_KEY, String(value));
    } catch {
      /* the setting just won't be remembered next time */
    }
  }

  const { data, isLoading, error } = useQuery<PrintData>({
    queryKey: ["bill-print", query],
    queryFn: () => apiGet<PrintData>(`/api/bills/print?${query}`),
    enabled: query !== "",
  });

  useEffect(() => {
    if (data?.bills.length) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (isLoading) return <p>Preparing bills…</p>;
  if (error) return <p>Could not load the selected bills.</p>;
  if (!data?.bills.length) return <p>No bills selected.</p>;

  const pages = chunk(data.bills, perPage);

  return (
    <div className="print-root">
      <div className="print-toolbar">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>

        <label className="per-page">
          <span>Bills per page</span>
          <select
            value={perPage}
            onChange={(e) => changePerPage(Number(e.target.value))}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <span className="count">
          {data.bills.length} bill(s) · {pages.length} page
          {pages.length === 1 ? "" : "s"}
        </span>

        <span className="count print-hint">
          In the print dialog, tick <b>Background graphics</b> if the shaded
          rows come out white.
        </span>
      </div>

      <div className="bill-sheet">
        {pages.map((page, i) => (
          <div className="bill-page" key={i}>
            <div className="bill-grid">
              {page.map((b) => (
                <BillCard key={b.billId} bill={b} settings={data.settings} />
              ))}
            </div>
            <div className="page-number">
              Page {i + 1} of {pages.length}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
