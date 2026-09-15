import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * ECPay — Payment Processing. Ported from frmECPayPayment: import the
 * payment channel's own raw-log export, match each row to a bill, and save
 * it as a real O.R. through the same pipeline the counter uses.
 *
 * The desktop kept the parsed spreadsheet in memory for the rest of the
 * session (Excel Interop held the workbook open). A browser tab doesn't have
 * that — the chosen file stays in this page's own state and gets re-sent
 * whenever a different worksheet is picked, rather than the server trying
 * to remember an upload between requests.
 */

type Row = {
  branchId: number;
  branchName: string;
  transactDate: string | null;
  transactTime: string;
  referenceNumber: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  reportDate: string | null;
  billId: number | null;
  acctId: number | null;
  status: "PAID" | "UNPAID" | "NOT FOUND";
  existingOrNumber: string;
  existingOrSerial: string;
};

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const YEARS = Array.from({ length: new Date().getFullYear() - 2016 }, (_, i) => 2017 + i);

export default function ECPayPaymentPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]!);
  const [year, setYear] = useState(new Date().getFullYear());
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [inputs, setInputs] = useState<Record<string, { orNumber: string; orSerial: string }>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const { data: serialData } = useQuery<{ serials: string[] }>({
    queryKey: ["receipt-serials"],
    queryFn: () => apiGet("/api/receipts/serials"),
  });

  function keyOf(r: Row) {
    return r.referenceNumber;
  }

  async function runImport(withSheet?: string) {
    if (!file) {
      setError("Choose a file first");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("month", month);
      form.append("year", String(year));
      if (withSheet) form.append("sheet", withSheet);

      const res = await fetch("/api/ecpay/import", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not read that file");

      setSheets(body.sheets ?? []);
      setSheet(body.sheet ?? "");
      setRows(body.rows ?? []);
      const nextInputs: Record<string, { orNumber: string; orSerial: string }> = {};
      for (const r of body.rows ?? []) {
        nextInputs[r.referenceNumber] = {
          orNumber: r.existingOrNumber ?? "",
          orSerial: r.existingOrSerial ?? (serialData?.serials[0] ?? ""),
        };
      }
      setInputs(nextInputs);
      setNotice(`${(body.rows ?? []).length} row(s) read from "${body.sheet}".`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function setInput(key: string, patch: Partial<{ orNumber: string; orSerial: string }>) {
    setInputs((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } as any }));
  }

  function openReceipt(orNumber: string, orSerial: string) {
    window.open(
      `/collection/receipt?number=${encodeURIComponent(orNumber)}&serial=${encodeURIComponent(orSerial)}`,
      "_blank",
    );
  }

  async function save(r: Row) {
    const key = keyOf(r);
    const input = inputs[key] ?? { orNumber: "", orSerial: "" };
    if (!input.orNumber.trim() || !input.orSerial.trim()) {
      setError("Enter an O.R. number and serial for that row first");
      return;
    }
    setBusyKey(key);
    setError("");
    try {
      const res = await fetch("/api/ecpay/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceNumber: r.referenceNumber,
          orNumber: input.orNumber.trim(),
          orSerial: input.orSerial.trim(),
          branchId: r.branchId,
          branchName: r.branchName,
          transactDate: r.transactDate,
          transactTime: r.transactTime,
          accountNumber: r.accountNumber,
          amount: r.amount,
          reportDate: r.reportDate,
          month,
          year,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not save that transaction");

      setRows((prev) =>
        prev.map((row) =>
          keyOf(row) === key
            ? { ...row, status: "PAID", existingOrNumber: body.orNumber, existingOrSerial: body.orSerial }
            : row,
        ),
      );
      setNotice(`${r.accountName} saved as O.R. ${body.orNumber}.`);
      openReceipt(body.orNumber, body.orSerial);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <p className="count" style={{ marginBottom: 14 }}>
        Import the payment channel's raw-log export, match each row to a
        bill, and save it as a real O.R.
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Raw-log file</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSheets([]);
              setRows([]);
            }}
          />
        </label>

        <label className="field-input">
          <span>Bill month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        <label className="field-input">
          <span>Bill year</span>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        {sheets.length > 1 && (
          <label className="field-input">
            <span>Worksheet</span>
            <select value={sheet} onChange={(e) => { setSheet(e.target.value); runImport(e.target.value); }}>
              {sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}

        <button className="primary" style={{ alignSelf: "flex-end" }} disabled={importing} onClick={() => runImport(sheet || undefined)}>
          {importing ? "Reading…" : "Import"}
        </button>
      </div>

      {notice && <div className="form-notice">{notice}</div>}
      {error && <div className="form-error">{error}</div>}

      {rows.length > 0 && (
        <section className="record-section">
          <p className="count">{rows.length} row{rows.length === 1 ? "" : "s"}</p>
          <div className="batch-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Date</th>
                  <th>Reference No.</th>
                  <th>Account No.</th>
                  <th>Name</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>O.R. Number</th>
                  <th>Serial</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = keyOf(r);
                  const input = inputs[key] ?? { orNumber: "", orSerial: "" };
                  const locked = r.status !== "UNPAID";
                  return (
                    <tr key={key}>
                      <td>{r.branchName}<div className="setting-note">{r.branchId}</div></td>
                      <td>{r.transactDate}<div className="setting-note">{r.transactTime}</div></td>
                      <td>{r.referenceNumber}</td>
                      <td>{r.accountNumber}</td>
                      <td>{r.accountName}</td>
                      <td className="num">{peso.format(r.amount)}</td>
                      <td>
                        <span
                          className={
                            r.status === "PAID"
                              ? "badge setting-badge role-appr"
                              : r.status === "NOT FOUND"
                              ? "badge setting-badge role-check"
                              : "badge setting-badge role-none"
                          }
                        >
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <input
                          className="filter-input"
                          style={{ width: 110 }}
                          value={input.orNumber}
                          disabled={locked}
                          onChange={(e) => setInput(key, { orNumber: e.target.value.replace(/\D/g, "") })}
                        />
                      </td>
                      <td>
                        <select
                          value={input.orSerial}
                          disabled={locked}
                          onChange={(e) => setInput(key, { orSerial: e.target.value })}
                        >
                          <option value="">…</option>
                          {(serialData?.serials ?? []).map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="num">
                        {r.status === "PAID" ? (
                          <button
                            className="link-button"
                            onClick={() => openReceipt(r.existingOrNumber, r.existingOrSerial)}
                          >
                            Print
                          </button>
                        ) : r.status === "NOT FOUND" ? (
                          <span className="muted">No bill</span>
                        ) : (
                          <button
                            className="primary small"
                            disabled={busyKey === key}
                            onClick={() => save(r)}
                          >
                            {busyKey === key ? "Saving…" : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
