import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { useNavigate } from "react-router-dom";
import type { Filters } from "./AccountFilters";
import { STANDPIPE_FAR_M, formatDistance } from "./standpipeCheck";

type Account = {
  id: number;
  accountNo: string;
  name: string;
  meterNo: string | null;
  cluster: string | null;
  barangay: string | null;
  status: string;
  statusId: number;
  balance: number;
  unpaidCount: number;
  firstPeriod: number | null;
  lastPeriod: number | null;
  standpipe: string | null;
  standpipeDistanceM: number | null;
  meterPinned: boolean;
  standpipePlaced: boolean;
};

type AccountsResponse = {
  total: number;
  page: number;
  pageSize: number;
  accounts: Account[];
};

const peso = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function statusClass(statusId: number) {
  if (statusId === 1) return "connected";
  if (statusId === 2) return "disconnected";
  if (statusId === 3) return "installation";
  return "pending";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function periodLabel(period: number) {
  const year = Math.floor(period / 100);
  const month = period % 100;
  return `${MONTHS[month - 1]} '${String(year).slice(2)}`;
}

function periodLines(first: number | null, last: number | null) {
  if (!first || !last) return [];
  if (first === last) return [periodLabel(first)];
  return [periodLabel(first), periodLabel(last)];
}

export default function AccountList({
  search,
  page,
  filters,
  onPageChange,
}: {
  search: string;
  page: number;
  filters: Filters;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();

  const params = new URLSearchParams({
    search,
    page: String(page),
  });
  if (filters.barangay) params.set("barangay", String(filters.barangay));
  if (filters.cluster) params.set("cluster", String(filters.cluster));
  if (filters.status) params.set("status", String(filters.status));
  if (filters.classification)
    params.set("classification", String(filters.classification));
  if (filters.consumerType)
    params.set("consumerType", String(filters.consumerType));
  if (filters.senior) params.set("senior", filters.senior);
  if (filters.minUnpaid) params.set("minUnpaid", String(filters.minUnpaid));
  if (filters.minAmount) params.set("minAmount", filters.minAmount);
  if (filters.spDist) params.set("spDist", filters.spDist);

  const { data, isLoading, error } = useQuery<AccountsResponse>({
    queryKey: ["accounts", search, page, filters],
    queryFn: () =>
      apiGet<AccountsResponse>(`/api/accounts?${params.toString()}`),
    placeholderData: (previous) => previous,
  });

  if (isLoading) return <p>Loading accounts…</p>;
  if (error) return <p>Couldn't reach the server. Check the API is running.</p>;
  if (!data) return null;

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <p className="count">{data.total.toLocaleString()} accounts</p>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Barangay</th>
            <th>Cluster</th>
            <th>Stand pipe</th>
            <th className="num">Balance</th>
            <th className="num">Unpaid</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.accounts.map((a) => (
            <tr
              key={a.id}
              className="row-link"
              onClick={() => navigate(`/accounts/${a.id}`)}
            >
              <td>
                <span className="cell-name">{a.name.trim()}</span>
                <span className="cell-sub">{a.accountNo}</span>
              </td>
              <td>{a.barangay ?? <span className="muted">-</span>}</td>
              <td>{a.cluster ?? <span className="muted">-</span>}</td>
              <td>
                {a.standpipe ? (
                  <>
                    <span className="cell-name">{a.standpipe}</span>
                    <span className="cell-sub" style={a.standpipeDistanceM != null && a.standpipeDistanceM > STANDPIPE_FAR_M ? { color: "#a82b23", fontWeight: 600 } : undefined}>
                      {a.standpipeDistanceM != null
                        ? `${formatDistance(a.standpipeDistanceM)} from the meter`
                        : !a.meterPinned
                          ? "meter not on the map"
                          : !a.standpipePlaced
                            ? "stand pipe not on the map"
                            : ""}
                    </span>
                  </>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td className="num">
                {a.balance > 0 ? (
                  peso.format(a.balance)
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>
                {a.unpaidCount > 0 ? (
                  <span className="arrears">
                    <span
                      className={
                        a.unpaidCount > 1
                          ? "arrears-count high"
                          : "arrears-count"
                      }
                    >
                      {a.unpaidCount}
                    </span>
                    <span className="arrears-months">
                      {periodLines(a.firstPeriod, a.lastPeriod).map((m) => (
                        <span key={m}>{m}</span>
                      ))}
                    </span>
                  </span>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>
                <span className={`badge ${statusClass(a.statusId)}`}>
                  {a.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager">
        <button onClick={() => onPageChange(1)} disabled={page === 1}>
          First
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1}>
          Previous
        </button>
        <span className="position">
          Page {page} of {lastPage}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= lastPage}
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(lastPage)}
          disabled={page >= lastPage}
        >
          Last
        </button>
      </div>
    </div>
  );
}
