import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export type Filters = {
  barangay: number;
  cluster: number;
  status: number;
  classification: number;
  consumerType: number;
  senior: string;
  minUnpaid: number;
  minAmount: string;
};

export const EMPTY_FILTERS: Filters = {
  barangay: 0,
  cluster: 0,
  status: 0,
  classification: 0,
  consumerType: 0,
  senior: "",
  minUnpaid: 0,
  minAmount: "",
};

type Options = {
  barangays: { id: number; name: string }[];
  clusters: { id: number; barangayId: number; name: string }[];
  statuses: { id: number; name: string }[];
  classifications: { id: number; name: string }[];
  consumerTypes: { id: number; name: string }[];
};

export default function AccountFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const { data } = useQuery<Options>({
    queryKey: ["filter-options"],
    queryFn: () => apiGet<Options>("/api/filters"),
  });

  if (!data) return null;

  const clusters = filters.barangay
    ? data.clusters.filter((c) => c.barangayId === filters.barangay)
    : data.clusters;

  const active =
    filters.barangay ||
    filters.cluster ||
    filters.status ||
    filters.classification ||
    filters.consumerType ||
    filters.senior !== "" ||
    filters.minUnpaid ||
    filters.minAmount !== "";

  function set(key: keyof Filters, value: number | string) {
    const next = { ...filters, [key]: value };
    if (key === "barangay") next.cluster = 0;
    onChange(next);
  }

  return (
    <div className="filters">
      <label className="filter">
        <span>Barangay</span>
        <select
          value={filters.barangay}
          onChange={(e) => set("barangay", Number(e.target.value))}
        >
          <option value={0}>All</option>
          {data.barangays.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Cluster</span>
        <select
          value={filters.cluster}
          onChange={(e) => set("cluster", Number(e.target.value))}
        >
          <option value={0}>All</option>
          {clusters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Status</span>
        <select
          value={filters.status}
          onChange={(e) => set("status", Number(e.target.value))}
        >
          <option value={0}>All</option>
          {data.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Classification</span>
        <select
          value={filters.classification}
          onChange={(e) => set("classification", Number(e.target.value))}
        >
          <option value={0}>All</option>
          {data.classifications.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Account type</span>
        <select
          value={filters.consumerType}
          onChange={(e) => set("consumerType", Number(e.target.value))}
        >
          <option value={0}>All</option>
          {data.consumerTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>SC/PWD</span>
        <select
          value={filters.senior}
          onChange={(e) => set("senior", e.target.value)}
        >
          <option value="">All</option>
          <option value="YES">Yes</option>
          <option value="NO">No</option>
        </select>
      </label>

      <label className="filter">
        <span>Unpaid months</span>
        <select
          value={filters.minUnpaid}
          onChange={(e) => set("minUnpaid", Number(e.target.value))}
        >
          <option value={0}>Any</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}+
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Min balance</span>
        <input
          className="filter-input"
          type="number"
          min="0"
          step="1"
          value={filters.minAmount}
          onChange={(e) => set("minAmount", e.target.value)}
          placeholder="Any"
        />
      </label>

      {active ? (
        <button
          className="clear-filters"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
