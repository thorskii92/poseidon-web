import { useState } from "react";
import { apiUpload } from "./api";
import { peso, qty } from "./inventoryShared";

/**
 * Import items and their opening balances from Excel (poseidon-api
 * inventoryFiles.ts). Always checked first; only rows that pass are imported.
 */

type Row = {
  row: number; code: string; name: string; unit: string; category: string; kind: string;
  qty: number; cost: number; asOf: string; status: "ok" | "error" | "skip"; message: string;
};
type Summary = {
  total: number; ok: number; errors: number; skipped: number; withOpening: number; openingValue: number;
  newUnits: string[]; newCategories: string[];
};

const KIND: Record<string, string> = { consumable: "Supplies", equipment: "Equipment", meter: "Water meter" };

export default function InventoryImport({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [addLists, setAddLists] = useState(false);
  const [preview, setPreview] = useState<{ rows: Row[]; summary: Summary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function check(f: File | null = file, lists = addLists) {
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await apiUpload("/api/inventory/files/import", f, { dryRun: "1", addLists: lists ? "1" : "0" }));
    } catch (e) {
      setPreview(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importNow() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await apiUpload<{ created: number; summary: Summary }>("/api/inventory/files/import", file, { dryRun: "0", addLists: addLists ? "1" : "0" });
      onDone(`${r.created} item(s) imported${r.summary.withOpening ? `, ${r.summary.withOpening} with an opening balance (₱${peso.format(r.summary.openingValue)})` : ""}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  const missingLists = preview?.rows.some((r) => /isn't on the list/.test(r.message)) ?? false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Import items from Excel</h2>
        <p className="modal-sub">
          One item per row, with what's already on the shelf as its opening balance.{" "}
          <a href="/api/inventory/files/import/template">Download the template</a> — it lists the units and categories you have.
        </p>

        <div className="form-grid">
          <label className="field-input">
            <span>Excel file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                check(f);
              }}
            />
          </label>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input
            type="checkbox"
            checked={addLists}
            onChange={(e) => {
              setAddLists(e.target.checked);
              check(file, e.target.checked);
            }}
          />
          Add units and categories that aren't on the lists yet (instead of stopping at them)
        </label>

        {busy && <p className="count">Checking…</p>}
        {error && <div className="form-error">{error}</div>}

        {s && preview && (
          <>
            <p className="count" style={{ marginTop: 12 }}>
              <strong>{s.ok}</strong> ready to import{s.withOpening ? ` (${s.withOpening} with an opening balance worth ₱${peso.format(s.openingValue)})` : ""}
              {s.errors ? ` · ${s.errors} with problems` : ""}
              {s.skipped ? ` · ${s.skipped} already in the inventory` : ""}
              {(s.newUnits.length || s.newCategories.length) ? ` · will add ${[...s.newUnits, ...s.newCategories].join(", ")} to the lists` : ""}
            </p>
            {missingLists && !addLists && (
              <p className="count">Some units or categories aren't on the lists — tick the box above to add them, or add them under Categories &amp; units.</p>
            )}
            <div style={{ maxHeight: 360, overflow: "auto" }}>
              <table>
                <thead>
                  <tr><th>Row</th><th>Code</th><th>Name</th><th>Unit</th><th>Category</th><th>Kind</th><th className="num">Opening</th><th className="num">Unit cost</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} style={r.status === "ok" ? undefined : { background: r.status === "error" ? "#fdeceb" : "#f5f6f8" }}>
                      <td>{r.row}</td>
                      <td>{r.code || <span className="muted">auto</span>}</td>
                      <td>{r.name}</td>
                      <td>{r.unit}</td>
                      <td>{r.category}</td>
                      <td>{KIND[r.kind] ?? r.kind}</td>
                      <td className="num">{r.qty ? qty(r.qty) : ""}</td>
                      <td className="num">{r.qty ? peso.format(r.cost) : ""}</td>
                      <td>{r.status === "ok" ? "Ready" : r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="form-actions">
          <button className="primary" disabled={busy || !s?.ok} onClick={importNow}>
            Import {s?.ok ?? ""} item(s)
          </button>
          <button className="clear-filters" onClick={onClose}>Cancel</button>
          {s && s.errors > 0 && <span className="count">Rows with problems are left out — fix them in the sheet and import again.</span>}
        </div>
      </div>
    </div>
  );
}
