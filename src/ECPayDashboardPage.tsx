import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * ECPay — Extract Payables. Ported from frmECPayDashboard: pick a barangay,
 * month and year, load the bills a consumer there can pay online (any bill
 * with no carried-over balance — LoadECAccounts's own `prevTotal = 0`), then
 * hand the list to the payment channel as an Excel file.
 */

type Barangay = { id: number; name: string };

type Payable = {
  accountNumber: string;
  accountName: string;
  barangay: string;
  amount: number;
  dueDate: string | null;
  billingMonth: string;
};

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 0 stands for "All Barangays" — a real choice, not a missing one, so it
 *  doesn't need its own "Choose…" placeholder the way Month/Year still do. */
const ALL_BARANGAYS = 0;

export default function ECPayDashboardPage() {
  const [barangayId, setBarangayId] = useState<number>(ALL_BARANGAYS);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [loaded, setLoaded] = useState<{ barangayId: number; month: string; year: number } | null>(null);

  const { data: filters } = useQuery<{ barangays: Barangay[] }>({
    queryKey: ["filters"],
    queryFn: () => apiGet("/api/filters"),
  });
  const { data: months } = useQuery<string[]>({
    queryKey: ["ecpay-months"],
    queryFn: () => apiGet("/api/ecpay/months"),
  });
  const { data: years } = useQuery<number[]>({
    queryKey: ["ecpay-years"],
    queryFn: () => apiGet("/api/ecpay/years"),
  });

  const { data, isLoading, error } = useQuery<Payable[]>({
    queryKey: ["ecpay-payables", loaded],
    queryFn: () =>
      apiGet(
        `/api/ecpay/payables?barangayId=${loaded!.barangayId}&month=${encodeURIComponent(loaded!.month)}&year=${loaded!.year}`,
      ),
    enabled: loaded !== null,
  });

  const rows = data ?? [];
  const barangayName =
    loaded?.barangayId === ALL_BARANGAYS
      ? "All Barangays"
      : filters?.barangays.find((b) => b.id === loaded?.barangayId)?.name ?? "";

  function load() {
    if (!month || year === "") return;
    setLoaded({ barangayId, month, year });
  }

  function exportFile() {
    if (!loaded) return;
    const qs = new URLSearchParams({
      barangayId: String(loaded.barangayId),
      month: loaded.month,
      year: String(loaded.year),
      barangayName,
    });
    window.location.href = `/api/ecpay/payables/export?${qs}`;
  }

  return (
    <>
      <p className="count" style={{ marginBottom: 14 }}>
        Bills a barangay's accounts can pay online this period — no
        carried-over balance from an earlier month.
      </p>

      <div className="filter-row">
        <label className="field-input">
          <span>Barangay</span>
          <select
            value={barangayId}
            onChange={(e) => setBarangayId(Number(e.target.value))}
          >
            <option value={ALL_BARANGAYS}>All Barangays</option>
            {(filters?.barangays ?? []).map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">Choose…</option>
            {(months ?? []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>

        <label className="field-input">
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="">Choose…</option>
            {(years ?? []).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <button className="primary" style={{ alignSelf: "flex-end" }} onClick={load}>
          Load
        </button>
        <button
          className="clear-filters"
          style={{ alignSelf: "flex-end" }}
          onClick={exportFile}
          disabled={!loaded || rows.length === 0}
        >
          Export
        </button>
      </div>

      {error && <div className="form-error">{(error as Error).message}</div>}

      <section className="record-section">
        {!loaded ? (
          <p className="count">Choose a month and year, then Load.</p>
        ) : isLoading ? (
          <p className="count">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="count">Nothing payable there for that period.</p>
        ) : (
          <>
            <p className="count">{rows.length} account{rows.length === 1 ? "" : "s"}</p>
            <div className="batch-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account Number</th>
                    <th>Account Name</th>
                    {loaded.barangayId === ALL_BARANGAYS && <th>Barangay</th>}
                    <th className="num">Amount</th>
                    <th>Due Date</th>
                    <th>Billing Month</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountNumber}>
                      <td>{r.accountNumber}</td>
                      <td>{r.accountName}</td>
                      {loaded.barangayId === ALL_BARANGAYS && <td>{r.barangay}</td>}
                      <td className="num">{peso.format(r.amount)}</td>
                      <td>{r.dueDate ?? ""}</td>
                      <td>{r.billingMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
