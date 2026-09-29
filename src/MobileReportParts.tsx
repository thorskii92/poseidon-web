import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * The frame the three Mobile App reports share — the same masthead, toolbar
 * (print, signatories, paper/orientation/scale) and footer every report in
 * this app has, so each report file only lays out its own content.
 */

export type Office = {
  municipality: string; municipalHeader: string; officeHeader: string;
  officeName: string; officeAddress: string;
};

export type BaseReport = {
  month: string;
  monthLabel: string;
  office: Office;
  signatories?: SignatorySlot[];
  empty: boolean;
};

export type Grouped = { key: string; count: number };

export function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

export function Insights({ lines, title = "What this month shows" }: { lines?: string[]; title?: string }) {
  if (!lines?.length) return null;
  return (
    <section className="record-section">
      <div className="record-head"><h2>{title}</h2></div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {lines.map((line, i) => <li key={i} style={{ marginBottom: 4 }}>{line}</li>)}
      </ul>
    </section>
  );
}

export function CountTable({ rows, label, unit }: { rows: Grouped[]; label: string; unit: string }) {
  if (!rows.length) return <p className="count">No data for this grouping.</p>;
  return (
    <table>
      <thead><tr><th>{label}</th><th className="n">{unit}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}><td>{r.key}</td><td className="n">{r.count}</td></tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td>Total</td><td className="n">{rows.reduce((s, r) => s + r.count, 0)}</td></tr>
      </tfoot>
    </table>
  );
}

/**
 * Fetches `${endpoint}?month=…&<signatories>` and renders the masthead,
 * toolbar and signatures around whatever `children` lays out.
 */
export function MobileReportFrame<T extends BaseReport>({
  reportKey, endpoint, kicker, emptyText, defaultOrientation = "portrait", children, emptyChildren,
}: {
  /** Signatory memory key — one per report. */
  reportKey: string;
  endpoint: string;
  kicker: string;
  emptyText: (monthLabel: string) => string;
  defaultOrientation?: Orientation;
  children: (data: T) => ReactNode;
  /** Shown even when the month itself is empty (e.g. an open-items list). */
  emptyChildren?: (data: T) => ReactNode;
}) {
  const [params] = useSearchParams();
  const month = params.get("month") ?? "";
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories(reportKey);
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>(defaultOrientation);
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!month || !sig.ready) return;
    apiGet<T>(`${endpoint}?month=${month}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [endpoint, month, sig.ready, sig.query]);

  if (!month) return <div className="print-root"><div className="form-error">No month given.</div></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <p className="ecpay-kicker">{kicker}</p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.monthLabel}</h1>

        {data.empty ? (
          <>
            <p className="count">{emptyText(data.monthLabel)}</p>
            {emptyChildren?.(data)}
          </>
        ) : (
          children(data)
        )}

        {(!data.empty || emptyChildren) && (
          <>
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
