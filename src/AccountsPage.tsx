import StatStrip from "./StatStrip";
import AccountList from "./AccountList";
import AccountFilters, { EMPTY_FILTERS } from "./AccountFilters";
import type { Filters } from "./AccountFilters";
import { useDebounce } from "./useDebounce";
import { useViewState } from "./useViewState";
import { Link } from "react-router-dom";

export default function AccountsPage() {
  // Remembered until sign-out or the browser closes (see useViewState).
  const [search, setSearch] = useViewState("accounts.search", "");
  const [page, setPage] = useViewState("accounts.page", 1);
  const [filters, setFilters] = useViewState<Filters>("accounts.filters", EMPTY_FILTERS);
  const debouncedSearch = useDebounce(search);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleFilterChange(next: Filters) {
    setFilters(next);
    setPage(1);
  }

  return (
    <>
      <div className="page-head">
        <h1>Accounts</h1>
        <div className="head-actions">
          <input
            className="search"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search name, meter, or account no"
          />
          <Link to="/accounts/new" className="primary">
            New application
          </Link>
        </div>
      </div>
      <AccountFilters filters={filters} onChange={handleFilterChange} />
      <AccountList
        search={debouncedSearch}
        page={page}
        filters={filters}
        onPageChange={setPage}
      />
      <StatStrip />
    </>
  );
}
