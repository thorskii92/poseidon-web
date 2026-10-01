import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories } from "./Signatories";
import {
  ForecastChart, ForecastKpis, ForecastLegend, ForecastTable, GroupTable,
} from "./forecastShared";
import type { Forecast } from "./forecastData";
import "./print.css";
import ReportHeader from "./ReportHeader";

/** Demand Forecast, printable — the same figures as the page, opened from its Print button. */
export default function ForecastPrint() {
  const [params] = useSearchParams();
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("demand-forecast");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  const qs = params.toString();
  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Forecast>(`/api/forecast?${qs}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [qs, sig.ready, sig.query]);

  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the forecast…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">Demand Forecast</p>
        <h1 className="soa-title" style={{ margin: "0 0 4px" }}>
          {data.scopeLabel} — next {data.horizon} months
        </h1>
        <p className="count" style={{ marginTop: 0 }}>
          Billed water consumption, from bills {data.historyFrom ?? ""} to {data.historyTo ?? ""}
          {data.newPerMonth ? `, with ${data.newPerMonth} planned new connections a month` : ""}.
        </p>

        {!data.enough || !data.summary ? (
          <p className="count">
            Not enough billing history to forecast this ({data.historyMonths} months; at least {data.minHistory ?? 12} needed).
          </p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <ForecastKpis data={data} />
            </div>

            {!!data.insights?.length && (
              <section className="record-section">
                <div className="record-head"><h2>What it expects</h2></div>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {data.insights.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
                </ul>
              </section>
            )}

            <section className="record-section">
              <div className="record-head"><h2>Billed consumption</h2></div>
              <div className="chart">
                <ForecastChart data={data} height={220} animate={false} />
              </div>
              <ForecastLegend showBacktest={false} />
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Month by month</h2></div>
              <ForecastTable rows={data.forecast ?? []} />
            </section>

            {!!data.byBarangay?.length && (
              <section className="record-section">
                <div className="record-head"><h2>By barangay</h2></div>
                <GroupTable title="Barangay" rows={data.byBarangay} horizon={data.horizon} />
              </section>
            )}

            {!!data.byClassification?.length && (
              <section className="record-section">
                <div className="record-head"><h2>By classification</h2></div>
                <GroupTable title="Classification" rows={data.byClassification} horizon={data.horizon} />
              </section>
            )}

            <p className="count" style={{ marginTop: 8 }}>
              Forecast = expected accounts × use per account × the month's usual seasonal swing. The likely range
              (~80%) is from re-running the forecast over the last year
              {data.accuracy?.oneMonthPct != null ? `; one month ahead it missed by ${data.accuracy.oneMonthPct.toFixed(1)}% on average` : ""}.
              {data.tariffPriced
                ? " Billings at the tariff in force each month."
                : ` Billings at the last three months' average of ₱${(data.pricePerM3 ?? 0).toFixed(2)} per m³.`}
              {data.nrw ? ` Water to produce adds ${data.nrw.pct}% non-revenue water.` : ""} Billed use only.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <SignatoryBlock slots={data.signatories ?? []} />
            </div>

            <p className="ecpay-generated">
              Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </>
        )}
      </article>
    </div>
  );
}
