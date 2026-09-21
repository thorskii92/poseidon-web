import { useState } from "react";
import { apiGet } from "./api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "./useDebounce";
import DeleteBillsDialog from "./DeleteBillsDialog";
import EditBillsDialog from "./EditBillsDialog";
import type { DeleteTarget } from "./DeleteBillsDialog";

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

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type Group = {
  barangayId: number;
  barangay: string;
  clusterId: number | null;
  cluster: string | null;
  month: string;
  year: number;
  billCount: number;
  unpaid: number;
  paid: number;
};

type GroupBill = {
  billId: number;
  standpipe: string | null;
  accountNo: string;
  name: string;
  consumption: number;
  wsf: number;
  enviFee: number;
  discount: number;
  totalDue: number;
  status: string;
};

type Options = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
};

export default function BillingPage() {
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [barangay, setBarangay] = useState(0);
  const [cluster, setCluster] = useState(0);
  const [active, setActive] = useState<Group | null>(null);
  const [sort, setSort] = useState("name");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteNotice, setDeleteNotice] = useState("");
  const [editIds, setEditIds] = useState<number[] | null>(null);
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search);

  const { data: options } = useQuery<Options>({
    queryKey: ["filter-options"],
    queryFn: () => apiGet<Options>("/api/filters"),
  });

  const groupParams = new URLSearchParams();
  if (month) groupParams.set("month", month);
  if (year) groupParams.set("year", String(year));
  if (barangay) groupParams.set("barangay", String(barangay));
  if (cluster) groupParams.set("cluster", String(cluster));

  const { data: groups, isLoading } = useQuery<Group[]>({
    queryKey: ["bill-groups", month, year, barangay, cluster],
    queryFn: () => apiGet<Group[]>(`/api/billing/groups?${groupParams}`),
  });

  const billParams = active
    ? new URLSearchParams({
        month: active.month,
        year: String(active.year),
        areaId: String(active.clusterId ?? active.barangayId),
        useCluster: active.clusterId ? "1" : "0",
        sort,
        search: debouncedSearch,
      })
    : null;

  const { data: bills } = useQuery<GroupBill[]>({
    queryKey: ["group-bills", active, sort, debouncedSearch],
    enabled: active !== null,
    queryFn: () =>
      apiGet<GroupBill[]>(`/api/billing/group-bills?${billParams}`),
  });

  const clusters = barangay
    ? (options?.clusters ?? []).filter((c) => c.barangayId === barangay)
    : (options?.clusters ?? []);

  const years = Array.from({ length: 8 }, (_, i) => 2026 - i);

  function openGroup(g: Group) {
    setActive(g);
    setSelected([]);
    setSearch("");
  }

  function toggle(billId: number) {
    setSelected((prev) =>
      prev.includes(billId)
        ? prev.filter((x) => x !== billId)
        : [...prev, billId],
    );
  }

  function printIds(ids: number[]) {
    window.open(
      `/bills/print?ids=${ids.join(",")}&sort=${encodeURIComponent(sort)}`,
      "_blank",
    );
  }

  // "Print all" always means every bill currently loaded for this group
  // (respecting the active search filter, same as what's on screen) --
  // sending the group's own identity instead of enumerating every bill ID
  // avoids a URL that grows without bound for a large cluster. A hand-picked
  // selection stays on printIds above, since that list is naturally small.
  function printGroup() {
    if (!active) return;
    const params = new URLSearchParams({
      month: active.month,
      year: String(active.year),
      areaId: String(active.clusterId ?? active.barangayId),
      useCluster: active.clusterId ? "1" : "0",
      search: debouncedSearch,
      sort,
    });
    window.open(`/bills/print?${params}`, "_blank");
  }

  const allSelected =
    (bills?.length ?? 0) > 0 &&
    bills!.every((b) => selected.includes(b.billId));

  return (
    <>
      <div className="page-head">
        <h1>Billing</h1>
      </div>

      {deleteNotice && (
        <div className="notice">
          <span>{deleteNotice}</span>
          <button className="link-button" onClick={() => setDeleteNotice("")}>
            Dismiss
          </button>
        </div>
      )}

      <div className="filters">
        <label className="filter">
          <span>Month</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>Year</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            <option value={0}>All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>Barangay</span>
          <select
            value={barangay}
            onChange={(e) => {
              setBarangay(Number(e.target.value));
              setCluster(0);
            }}
          >
            <option value={0}>All</option>
            {(options?.barangays ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span>Cluster</span>
          <select
            value={cluster}
            onChange={(e) => setCluster(Number(e.target.value))}
          >
            <option value={0}>All</option>
            {clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="billing-split">
        <section className="record-section groups">
          <div className="record-head">
            <h2>Bill groups</h2>
            <span className="count">{groups?.length ?? 0}</span>
          </div>

          {isLoading ? (
            <p className="count">Loading…</p>
          ) : !groups?.length ? (
            <p className="count">No bill groups match those filters.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Barangay</th>
                  <th>Cluster</th>
                  <th>Period</th>
                  <th className="num">Bills</th>
                  <th className="num">Unpaid</th>
                  <th className="num">Paid</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr
                    key={`${g.barangayId}-${g.clusterId}-${g.month}-${g.year}`}
                    className={
                      active &&
                      active.clusterId === g.clusterId &&
                      active.month === g.month &&
                      active.year === g.year
                        ? "row-link row-selected"
                        : "row-link"
                    }
                    onClick={() => openGroup(g)}
                  >
                    <td>{g.barangay}</td>
                    <td>{g.cluster ?? <span className="muted">-</span>}</td>
                    <td>
                      {g.month} {g.year}
                    </td>
                    <td className="num">{g.billCount}</td>
                    <td className="num">{g.unpaid}</td>
                    <td className="num">{g.paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="record-section">
          {!active ? (
            <p className="count">Select a bill group to see its bills.</p>
          ) : (
            <>
              <div className="record-head">
                <h2>
                  {active.barangay}
                  {active.cluster ? ` · ${active.cluster}` : ""} ·{" "}
                  {active.month} {active.year}
                </h2>
                <div className="head-actions">
                  <button
                    className="print-all"
                    onClick={printGroup}
                    disabled={!bills?.length}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 9V4h10v5" />
                      <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                      <path d="M7 14h10v6H7z" />
                    </svg>
                    Print all {bills?.length ?? 0}
                  </button>
                  <button
                    className="danger small"
                    disabled={!bills?.length}
                    onClick={() =>
                      setDeleteTarget({
                        kind: "group",
                        month: active.month,
                        year: active.year,
                        areaId: active.clusterId ?? active.barangayId,
                        useCluster: active.clusterId != null,
                        label: `${active.barangay}${active.cluster ? ` · ${active.cluster}` : ""} · ${active.month} ${active.year}`,
                      })
                    }
                  >
                    Delete group
                  </button>
                </div>
              </div>

              <div className="group-controls">
                <input
                  className="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, account no, or meter"
                />
                <label className="filter inline">
                  <span>Sort by</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="name">Name</option>
                    <option value="accountNo">Account no</option>
                    <option value="sequence">Sequence</option>
                    <option value="standpipe">Standpipe</option>
                  </select>
                </label>
              </div>

              {selected.length > 0 && (
                <div className="selection-bar">
                  <span>{selected.length} selected</span>
                  <button
                    className="primary small"
                    onClick={() => printIds(selected)}
                  >
                    Print checked
                  </button>
                  <button
                    className="clear-filters"
                    onClick={() => setEditIds(selected)}
                  >
                    Edit checked
                  </button>
                  <button
                    className="danger small"
                    onClick={() =>
                      setDeleteTarget({
                        kind: "bills",
                        billIds: selected,
                        label: `${selected.length} selected ${selected.length === 1 ? "bill" : "bills"}`,
                      })
                    }
                  >
                    Delete checked
                  </button>
                  <button
                    className="link-button"
                    onClick={() => setSelected([])}
                  >
                    Clear
                  </button>
                </div>
              )}

              {!bills?.length ? (
                <p className="count">No bills in this group.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th className="check">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={() =>
                            setSelected(
                              allSelected ? [] : bills.map((b) => b.billId),
                            )
                          }
                        />
                      </th>
                      <th>Standpipe</th>
                      <th>Account no</th>
                      <th>Name</th>
                      <th className="num">Cu.m.</th>
                      <th className="num">WSF</th>
                      <th className="num">E.F.</th>
                      <th className="num">Discount</th>
                      <th className="num">Total due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((b) => (
                      <tr
                        key={b.billId}
                        className={
                          b.consumption < 0
                            ? "row-warning"
                            : selected.includes(b.billId)
                              ? "row-selected"
                              : ""
                        }
                      >
                        <td className="check">
                          <input
                            type="checkbox"
                            checked={selected.includes(b.billId)}
                            onChange={() => toggle(b.billId)}
                          />
                        </td>
                        <td>
                          {b.standpipe ?? <span className="muted">-</span>}
                        </td>
                        <td>{b.accountNo}</td>
                        <td>{b.name}</td>
                        <td className="num">{b.consumption}</td>
                        <td className="num">{peso.format(b.wsf)}</td>
                        <td className="num">{peso.format(b.enviFee)}</td>
                        <td className="num">
                          {b.discount ? (
                            peso.format(b.discount)
                          ) : (
                            <span className="muted">-</span>
                          )}
                        </td>
                        <td className="num">{peso.format(b.totalDue)}</td>
                        <td>
                          <span
                            className={
                              b.status === "PAID"
                                ? "badge connected"
                                : "badge pending"
                            }
                          >
                            {b.status === "PAID" ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      </div>

      {editIds && (
        <EditBillsDialog
          billIds={editIds}
          onClose={() => setEditIds(null)}
          onSaved={(count) => {
            setEditIds(null);
            setSelected([]);
            setDeleteNotice(
              `${count} ${count === 1 ? "bill" : "bills"} updated.`,
            );
            queryClient.invalidateQueries({ queryKey: ["group-bills"] });
            queryClient.invalidateQueries({ queryKey: ["bill-groups"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
          }}
        />
      )}

      {deleteTarget && (
        <DeleteBillsDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(count) => {
            setDeleteTarget(null);
            setSelected([]);
            setDeleteNotice(
              `${count} ${count === 1 ? "bill" : "bills"} deleted.`,
            );
            queryClient.invalidateQueries({ queryKey: ["bill-groups"] });
            queryClient.invalidateQueries({ queryKey: ["group-bills"] });
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
          }}
        />
      )}
    </>
  );
}
