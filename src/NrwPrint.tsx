import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories } from "./Signatories";
import { BalanceChart, BalanceLegend, BalanceTable, NrwKpis, NrwPctChart } from "./nrwShared";
import { rowsToShow, type Balance } from "./nrwData";
import "./print.css";
import ReportHeader from "./ReportHeader";

/** Non-Revenue Water report, printable — opened from the Water balance tab's Print button. */
export default function NrwPrint() {
  const [params] = useSearchParams();
  const [data, setData] = useState<Balance | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("non-revenue-water");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("landscape");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  const qs = params.toString();
  useEffect(() => {
    if (!sig.ready) return;
    apiGet<Balance>(`/api/nrw/summary?${qs}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [qs, sig.ready, sig.query]);

  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Working out the water balance…</p></div>;

  const system = data.systems.find((s) => s.id === data.zoneId);
  const { shown: rows, hiddenMonths } = rowsToShow(data.rows);

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">Non-Revenue Water Report</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>
          {system ? system.name : "All water systems"} — last {data.months} billing months
        </h1>

        <div className="dash-kpis ecpay-kpis ecpay-kpis-4"><NrwKpis data={data} /></div>

        {data.summary.monthsWithBalance > 0 && (
          <section className="record-section">
            <div className="record-head"><h2>Produced vs billed</h2></div>
            <div className="chart"><BalanceChart data={data} height={200} animate={false} /></div>
            <BalanceLegend />
            <div className="record-head" style={{ marginTop: 12 }}><h2>Non-revenue water, share of production</h2></div>
            <div className="chart"><NrwPctChart data={data} height={160} animate={false} /></div>
          </section>
        )}

        <section className="record-section">
          <div className="record-head"><h2>Water balance by system</h2></div>
          <BalanceTable rows={rows} />
          {hiddenMonths > 0 && <p className="count">{hiddenMonths} earlier month{hiddenMonths === 1 ? "" : "s"} with no production logged not shown.</p>}
        </section>

        <p className="count" style={{ marginTop: 8 }}>
          Produced is counted over each billing month's own reading period. Days without a log are filled at the source's average and
          pump-hour sources are estimates; a month needs {data.minCoveragePct}% of its days logged. Non-revenue = produced − billed;
          losses = non-revenue − authorised unbilled use, valued at that month's billed ₱ per m³.
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories ?? []} />
        </div>

        <p className="ecpay-generated">
          Generated {generatedAt.toLocaleString("en-PH", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
        </p>
      </article>
    </div>
  );
}
