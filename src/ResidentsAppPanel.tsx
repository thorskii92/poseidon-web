import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "./api";

/**
 * Settings → Residents' app: how much of an account's record the residents'
 * app (and the official website's bill inquiry) shows — poseidon-api
 * residentsAppSettings.ts.
 */

type Settings = { soaMonths: number };

export default function ResidentsAppPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ settings: Settings; min: number; max: number }>({
    queryKey: ["residents-app-settings"],
    queryFn: () => apiGet("/api/settings/residents-app"),
  });
  const [months, setMonths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setMonths(String(data.settings.soaMonths));
  }, [data]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await apiPut("/api/settings/residents-app", { soaMonths: Number(months) });
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["residents-app-settings"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Residents&apos; app</h2>
        <button className="clear-filters" onClick={onClose}>Close</button>
      </div>
      {isLoading ? (
        <p className="count">Loading…</p>
      ) : (
        <>
          <label className="field-input" style={{ maxWidth: 360 }}>
            <span>Months shown on the statement</span>
            <input
              type="number"
              min={data?.min}
              max={data?.max}
              value={months}
              onChange={(e) => {
                setMonths(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <p className="count" style={{ maxWidth: 640 }}>
            The app&apos;s statement lists this many of the newest unpaid bills. Older unpaid bills show as one line —
            &ldquo;3 earlier unpaid bills (January to March 2025): ₱1,158.00&rdquo; — and are still counted in the total due,
            so nothing owed is hidden. Payments and the usage charts go back the same number of months. The official
            website&apos;s bill inquiry follows the same setting.
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <button className="primary" disabled={busy || !months} onClick={save}>{busy ? "Saving…" : saved ? "Saved" : "Save"}</button>
          </div>
        </>
      )}
    </section>
  );
}
