import StatStrip from "./StatStrip";
import AccountList from "./AccountList";
import AccountFilters, { EMPTY_FILTERS } from "./AccountFilters";
import type { Filters } from "./AccountFilters";
import { useDebounce } from "./useDebounce";
import { useViewState } from "./useViewState";
import { Link } from "react-router-dom";
import { useState } from "react";
import BulkDeleteAccountsDialog from "./BulkDeleteAccountsDialog";

export default function AccountsPage() {
  // Remembered until sign-out or the browser closes (see useViewState).
  const [search, setSearch] = useViewState("accounts.search", "");
  const [page, setPage] = useViewState("accounts.page", 1);
  const [filters, setFilters] = useViewState<Filters>("accounts.filters", EMPTY_FILTERS);
  const debouncedSearch = useDebounce(search);
  const [cleanup, setCleanup] = useState(false);

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
          <button
            className="clear-filters"
            title="Disconnected accounts with no bills, payments or any other history — delete several at once (admin)"
            onClick={() => setCleanup(true)}
          >
            Delete unused accounts
          </button>
          <Link
            to="/accounts/new?existing=1"
            className="clear-filters"
            title="An account that has had water for years but was never encoded — added Connected, no fee, admin-authorised"
          >
            Add existing account
          </Link>
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
      {cleanup && <BulkDeleteAccountsDialog onClose={() => setCleanup(false)} />}
    </>
  );
}
