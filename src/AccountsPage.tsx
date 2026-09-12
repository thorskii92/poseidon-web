import { useState } from "react";
import StatStrip from "./StatStrip";
import AccountList from "./AccountList";
import AccountFilters, { EMPTY_FILTERS } from "./AccountFilters";
import type { Filters } from "./AccountFilters";
import { useDebounce } from "./useDebounce";
import { Link } from "react-router-dom";

export default function AccountsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
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
