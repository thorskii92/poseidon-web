import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import {
  ForecastChart, ForecastKpis, ForecastLegend, ForecastTable, GroupTable
} from "./forecastShared";
import { forecastCsv, forecastQuery, type Forecast } from "./forecastData";

/**
 * Demand Forecast — billed water consumption for the coming months, with a
 * likely range and the model's own track record, for the whole service area
 * or one barangay / classification. The model is in poseidon-api/src/forecast.ts.
 */

const HORIZONS = [3, 6, 12];

export default function ForecastPage() {
  const [brgyId, setBrgyId] = useState(0);
  const [classId, setClassId] = useState(0);
  const [horizon, setHorizon] = useState(12);
  const [planned, setPlanned] = useState("");
  const [showBacktest, setShowBacktest] = useState(false);

  const newPerMonth = Math.max(0, Math.round(Number(planned) || 0));
  const qs = forecastQuery({ horizon, brgyId, classId, newPerMonth });
  const { data, isFetching, error } = useQuery<Forecast>({
    queryKey: ["forecast", qs],
    queryFn: () => apiGet(`/api/forecast?${qs}`),
    placeholderData: (prev) => prev,
  });

  function exportCsv() {
    if (!data) return;
    const blob = new Blob(["﻿" + forecastCsv(data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `demand-forecast-${data.scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ready = data?.enough && data.summary;

  return (
    <div className="settings-page">
      <div className="detail-head">
        <div>
          <h1>Demand Forecast</h1>
          <p className="account-no">
            Billed water consumption for the coming months, from {data?.historyFrom ?? "the"} billing history
            {data?.historyTo ? ` to ${data.historyTo}` : ""}. Billed use only — leaks and unbilled water aren't in it.
          </p>
        </div>
      </div>

      <section className="record-section">
        <div className="form-actions" style={{ marginTop: 0, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field-input" style={{ margin: 0 }}>
            <span>Barangay</span>
            <select value={brgyId} onChange={(e) => setBrgyId(Number(e.target.value))}>
              <option value={0}>All barangays</option>
              {(data?.filters.barangays ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="field-input" style={{ margin: 0 }}>
            <span>Classification</span>
            <select value={classId} onChange={(e) => setClassId(Number(e.target.value))}>
              <option value={0}>All classifications</option>
              {(data?.filters.classifications ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field-input" style={{ margin: 0 }}>
            <span>Months ahead</span>
            <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              {HORIZONS.map((h) => <option key={h} value={h}>{h} months</option>)}
            </select>
          </label>
          <label className="field-input" style={{ margin: 0, width: 190 }} title="New connections you expect each month on top of the recent trend — a new subdivision, an expansion">
            <span>Planned new connections / month</span>
            <input type="number" min={0} max={1000} value={planned} placeholder="0" onChange={(e) => setPlanned(e.target.value)} />
          </label>
          <span style={{ flex: 1 }} />
          <button className="clear-filters" disabled={!ready} onClick={exportCsv}>Export CSV</button>
          <button
            className="primary"
            disabled={!ready}
            onClick={() => window.open(`/forecast/print?${qs}`, "_blank")}
          >
            Print
          </button>
        </div>
      </section>

      {error && <div className="form-error">{(error as Error).message}</div>}
      {!data && !error && <p className="count">Building the forecast…</p>}

      {data && !data.enough && (
        <p className="count">
          {data.scopeLabel} has {data.historyMonths} month{data.historyMonths === 1 ? "" : "s"} of bills — a forecast needs at least {data.minHistory ?? 12}.
        </p>
      )}

      {ready && (
        <div style={{ opacity: isFetching ? 0.6 : 1, transition: "opacity .15s" }}>
          <div className="dash-kpis">
            <ForecastKpis data={data} />
          </div>

          {!!data.insights?.length && (
            <section className="record-section">
              <div className="record-head"><h2>What it expects — {data.scopeLabel}</h2></div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
              </ul>
            </section>
          )}

          <section className="record-section">
            <div className="record-head">
              <h2>Billed consumption</h2>
              <label className="count" style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={showBacktest} onChange={(e) => setShowBacktest(e.target.checked)} />
                Show what it forecast a year before
              </label>
            </div>
            <div className="chart">
              <ForecastChart data={data} showBacktest={showBacktest} />
            </div>
            <ForecastLegend showBacktest={showBacktest} />
          </section>

          <section className="record-section">
            <div className="record-head">
              <h2>Month by month</h2>
              <span className="count">Likely range: about 8 in 10 months should land inside it</span>
            </div>
            <ForecastTable rows={data.forecast ?? []} />
          </section>

          {!!data.byBarangay?.length && (
            <section className="record-section">
              <div className="record-head"><h2>By barangay</h2><span className="count">each forecast on its own</span></div>
              <GroupTable title="Barangay" rows={data.byBarangay} horizon={data.horizon} />
            </section>
          )}

          {!!data.byClassification?.length && (
            <section className="record-section">
              <div className="record-head"><h2>By classification</h2><span className="count">each forecast on its own</span></div>
              <GroupTable title="Classification" rows={data.byClassification} horizon={data.horizon} />
            </section>
          )}

          <p className="count" style={{ marginTop: 8 }}>
            How it works: expected accounts (the last 12 months' trend{newPerMonth ? ", plus planned connections" : ""}) × use per
            account (its recent level and trend) × each month's usual seasonal swing
            {data.seasonFrom === "town" ? " (borrowed from the whole service area — this selection has under two years of bills)" : ""}.
            The range comes from re-running the forecast over the last year and measuring how far off it was
            {data.accuracy ? ` (${data.accuracy.tests} checks)` : ""}.
            {data.tariffPriced
              ? " Billings price each month at the tariff in force then (the phased increases in your rate tables), by re-pricing the latest month's bills."
              : " Billings use the last three months' average ₱ per m³."}
            {data.nrw
              ? ` Water to produce adds the ${data.nrw.pct}% non-revenue water logged over ${data.nrw.months.join(", ")}.`
              : " Log production under Non-Revenue Water to also see how much the plants must produce."}{" "}
            Barangay and classification rows are forecast separately, so they won't add up exactly to the total.
          </p>
        </div>
      )}
    </div>
  );
}
