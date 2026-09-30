import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "./api";
import { INV_KEYS, type ListEntry, type Lists, type StoreLocation } from "./inventoryShared";

/**
 * The two lists the item form picks from. Renaming one renames it on every
 * item; deactivating hides it from the dropdowns but leaves old items alone;
 * deleting is only allowed while nothing uses it.
 */
export default function InventoryLists({ onChanged }: { onChanged: (message: string) => void }) {
  const { data, isLoading, error } = useQuery<Lists>({ queryKey: INV_KEYS.lists, queryFn: () => apiGet("/api/inventory/lists") });
  return (
    <>
      {isLoading && <p className="count">Loading…</p>}
      {error && <p className="form-error">{(error as Error).message}</p>}
      {data && (
        <div className="it-grid" style={{ alignItems: "start" }}>
          <ListPanel
            type="categories"
            title="Categories"
            hint="How items are grouped — e.g. Pipes & fittings, Office supplies."
            placeholder="e.g. Pipes & fittings"
            max={80}
            rows={data.categories ?? []}
            onChanged={onChanged}
          />
          <ListPanel
            type="units"
            title="Units"
            hint="How items are counted — e.g. pc, m, gal. Keep them short; they print on every form."
            placeholder="e.g. pc"
            max={30}
            rows={data.units ?? []}
            onChanged={onChanged}
          />
          <StorehousePanel rows={data.locations ?? []} onChanged={onChanged} />
        </div>
      )}
    </>
  );
}

function ListPanel({
  type, title, hint, placeholder, max, rows, onChanged,
}: {
  type: "categories" | "units";
  title: string;
  hint: string;
  placeholder: string;
  max: number;
  rows: ListEntry[];
  onChanged: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editing, setEditing] = useState<ListEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noun = type === "units" ? "unit" : "category";

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      onChanged(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      await apiPost(`/api/inventory/lists/${type}`, { name, description: desc });
      const n = name.trim();
      setName("");
      setDesc("");
      return `${n} added to ${title.toLowerCase()}.`;
    });

  const save = (e: ListEntry, patch: Partial<ListEntry>) =>
    run(async () => {
      const next = { ...e, ...patch };
      const r = await apiPut<{ renamed: number }>(`/api/inventory/lists/${type}/${e.id}`, next);
      setEditing(null);
      if (r.renamed) return `Renamed to ${next.name} — ${r.renamed} item(s) updated.`;
      if (patch.active === false) return `${e.name} deactivated — it no longer appears in the dropdowns.`;
      if (patch.active === true) return `${e.name} is active again.`;
      return `${next.name} saved.`;
    });

  const remove = (e: ListEntry) => {
    if (!window.confirm(`Delete the ${noun} "${e.name}"?`)) return;
    run(async () => {
      await apiDelete(`/api/inventory/lists/${type}/${e.id}`);
      return `${e.name} deleted.`;
    });
  };

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>{title}</h2>
        <span className="count">{rows.filter((r) => r.active).length} active</span>
      </div>
      <p className="count">{hint}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px" }}>
        <input className="table-input" style={{ flex: "1 1 140px" }} value={name} maxLength={max} placeholder={placeholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
        <input className="table-input" style={{ flex: "2 1 180px" }} value={desc} maxLength={200} placeholder="Description (optional)" onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && add()} />
        <button className="primary small" disabled={busy || !name.trim()} onClick={add}>Add</button>
      </div>
      {error && <div className="form-error">{error}</div>}

      <table>
        <thead>
          <tr><th>Name</th><th>Description</th><th className="num">Items</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editing?.id === r.id ? (
              <tr key={r.id}>
                <td><input className="table-input" style={{ width: "100%" }} value={editing.name} maxLength={max} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></td>
                <td><input className="table-input" style={{ width: "100%" }} value={editing.description} maxLength={200} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></td>
                <td className="num">{r.items}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="primary small" disabled={busy || !editing.name.trim()} onClick={() => save(r, { name: editing.name.trim(), description: editing.description })}>Save</button>{" "}
                  <button className="clear-filters" onClick={() => setEditing(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                <td>{r.name}{!r.active && <span className="muted"> · inactive</span>}</td>
                <td className="muted">{r.description}</td>
                <td className="num">{r.items}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="clear-filters" disabled={busy} onClick={() => setEditing(r)}>Edit</button>{" "}
                  <button className="clear-filters" disabled={busy} onClick={() => save(r, { active: !r.active })}>
                    {r.active ? "Deactivate" : "Activate"}
                  </button>{" "}
                  {r.items === 0 && (
                    <button className="clear-filters" disabled={busy} onClick={() => remove(r)}>Delete</button>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Storehouses: where stock is kept. Each item's stock is split between them;
 * the default one is used whenever none is picked.
 */
function StorehousePanel({ rows, onChanged }: { rows: StoreLocation[]; onChanged: (message: string) => void }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [editing, setEditing] = useState<StoreLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setError("");
    try {
      onChanged(await fn());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = (l: StoreLocation, patch: Partial<StoreLocation>, message: string) =>
    run(async () => {
      await apiPut(`/api/inventory/locations/${l.id}`, { ...l, ...patch });
      setEditing(null);
      return message;
    });

  return (
    <section className="record-section">
      <div className="record-head">
        <h2>Storehouses</h2>
        <span className="count">{rows.filter((r) => r.active).length} active</span>
      </div>
      <p className="count">Where stock is kept. With more than one, deliveries, releases and counts ask which.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px" }}>
        <input className="table-input" style={{ flex: "1 1 140px" }} value={name} maxLength={100} placeholder="e.g. Field office" onChange={(e) => setName(e.target.value)} />
        <input className="table-input" style={{ flex: "2 1 180px" }} value={desc} maxLength={200} placeholder="Description (optional)" onChange={(e) => setDesc(e.target.value)} />
        <button
          className="primary small"
          disabled={busy || !name.trim()}
          onClick={() => run(async () => {
            await apiPost("/api/inventory/locations", { name, description: desc });
            const n = name.trim();
            setName("");
            setDesc("");
            return `${n} added to the storehouses.`;
          })}
        >
          Add
        </button>
      </div>
      {error && <div className="form-error">{error}</div>}

      <table>
        <thead><tr><th>Name</th><th>Description</th><th className="num">Items</th><th /></tr></thead>
        <tbody>
          {rows.map((r) =>
            editing?.id === r.id ? (
              <tr key={r.id}>
                <td><input className="table-input" style={{ width: "100%" }} value={editing.name} maxLength={100} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></td>
                <td><input className="table-input" style={{ width: "100%" }} value={editing.description} maxLength={200} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></td>
                <td className="num">{r.items}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="primary small" disabled={busy || !editing.name.trim()} onClick={() => save(r, { name: editing.name.trim(), description: editing.description }, `${editing.name.trim()} saved.`)}>Save</button>{" "}
                  <button className="clear-filters" onClick={() => setEditing(null)}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                <td>
                  {r.name}
                  {r.isDefault && <span className="badge setting-badge act-blue" style={{ marginLeft: 6 }}>Default</span>}
                  {!r.active && <span className="muted"> · inactive</span>}
                </td>
                <td className="muted">{r.description}</td>
                <td className="num">{r.items}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="clear-filters" disabled={busy} onClick={() => setEditing(r)}>Edit</button>{" "}
                  {r.active && !r.isDefault && (
                    <button className="clear-filters" disabled={busy} onClick={() => save(r, { isDefault: true }, `${r.name} is now the default storehouse.`)}>Make default</button>
                  )}{" "}
                  {!r.isDefault && (
                    <button className="clear-filters" disabled={busy} onClick={() => save(r, { active: !r.active }, r.active ? `${r.name} deactivated.` : `${r.name} is active again.`)}>
                      {r.active ? "Deactivate" : "Activate"}
                    </button>
                  )}{" "}
                  {!r.isDefault && r.items === 0 && (
                    <button
                      className="clear-filters"
                      disabled={busy}
                      onClick={() => window.confirm(`Delete the storehouse "${r.name}"?`) && run(async () => { await apiDelete(`/api/inventory/locations/${r.id}`); return `${r.name} deleted.`; })}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </section>
  );
}
