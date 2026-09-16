import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import { PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation } from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import "./print.css";

/**
 * O.R. Accountability Report — an audit of O.R. booklets, not a collection
 * total: which booklets are on issue, how many of each were actually used,
 * which used numbers were skipped or duplicated, and which issued receipts
 * fall outside every booklet on record. See reports.ts for why the receipt
 * -> booklet match is re-derived from each receipt's own serial + number
 * rather than trusting its stored ogid — that independent check is the
 * report's actual purpose.
 */

const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-PH");

type Kpis = {
  bookletsOnIssue: number; liveBooklets: number; receiptsIssued: number; capacityAllocated: number;
  ecPayIssued: number; ecPayPct: number; numbersSkipped: number; strayReceipts: number; duplicates: number;
};
type BookletRow = {
  label: string; serial: string; accountable: string; first: number; last: number; capacity: number;
  issued: number; ecpay: number; lowestUsed: number; highestUsed: number; skipped: number; unissued: number; collected: number;
};
type TallyRow = { label: string; count: number; amount: number; pct: number };
type Tally = { rows: TallyRow[]; total: number; totalCount: number };
type GapRow = { booklet: string; serial: string; from: string; to: string; count: number };
type StrayRow = { serial: string; number: string; date: string | null; channel: string; amount: number };
type DupRow = { booklet: string; serial: string; number: string };
type SetupIssues = {
  overlaps: { booklet: string; serial: string; overlapsWith: string }[]; overlapCount: number;
  badRanges: { booklet: string; serial: string }[]; badRangeCount: number;
};

type Report = {
  office: { municipality: string; municipalHeader: string; officeHeader: string; officeName: string };
  generatedAt: string;
  signatories: SignatorySlot[];
  period: { allDates: boolean; from: string | null; to: string | null; label: string };
  kpis: Kpis;
  booklets: BookletRow[];
  idle: { count: number; numbers: number };
  channelTally: Tally;
  collectorTally: Tally;
  gaps: GapRow[];
  strays: StrayRow[];
  duplicates: DupRow[];
  setupIssues: SetupIssues;
};

function pad7(v: number | string): string {
  return String(v).padStart(7, "0");
}

export default function ORAccountabilityPrint() {
  const [params] = useSearchParams();
  const allDates = params.get("allDates") === "true";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const sig = useSignatories("or-accountability");
  const [paper, setPaper] = useState<PaperKey>("legal");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    if (!allDates && (!from || !to)) return;
    const q = allDates ? "allDates=true" : `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    apiGet<Report>(`/api/reports/or-accountability?${q}&${sig.query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [allDates, from, to, sig.ready, sig.query]);

  if (!allDates && (!from || !to)) {
    return (
      <div className="print-root">
        <div className="form-error">No date range given.</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="print-root">
        <div className="form-error">{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="print-root">
        <p className="count">Building the report…</p>
      </div>
    );
  }

  const { kpis } = data;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls
          paper={paper}
          orientation={orientation}
          scale={scale}
          onPaper={setPaper}
          onOrientation={setOrientation}
          onScale={setScale}
        />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header style={{ textAlign: "center", lineHeight: 1.3 }}>
          <div>Republic of the Philippines</div>
          <div>PROVINCE OF PALAWAN</div>
          <div>{data.office.officeHeader || data.office.municipalHeader}</div>
          <div className="soa-office">{data.office.officeName}</div>
        </header>

        <h1 className="soa-title">O.R. Accountability Report</h1>
        <p className="soa-issued">{data.period.label}</p>

        <div className="soa-analytics">
          <div className="soa-stat">
            <span>Booklets on issue</span>
            <b>{plain.format(kpis.bookletsOnIssue)}</b>
            <em>{plain.format(kpis.liveBooklets)} with receipts used</em>
          </div>
          <div className="soa-stat">
            <span>Receipts issued</span>
            <b>{plain.format(kpis.receiptsIssued)}</b>
            <em>{plain.format(kpis.capacityAllocated)} numbers allocated</em>
          </div>
          <div className="soa-stat">
            <span>Issued through ECPay</span>
            <b>{plain.format(kpis.ecPayIssued)}</b>
            <em>{kpis.ecPayPct.toFixed(1)}% of receipts</em>
          </div>
          <div className="soa-stat">
            <span>Numbers skipped</span>
            <b>{plain.format(kpis.numbersSkipped)}</b>
            <em>within the used range</em>
          </div>
          <div className="soa-stat">
            <span>Receipts with no booklet</span>
            <b>{plain.format(kpis.strayReceipts)}</b>
            <em>no bundle covers the number</em>
          </div>
        </div>

        {data.period.allDates ? (
          <p className="soa-issued" style={{ marginTop: 10 }}>
            Every receipt on record is included because <b>all dates</b> is ticked.
          </p>
        ) : (
          <p className="soa-issued" style={{ marginTop: 10 }}>
            Filtered on the receipt date. {plain.format(kpis.receiptsIssued)} receipt(s) fall in this range —
            a booklet used across several periods will read as partly unissued here.
          </p>
        )}

        {(kpis.numbersSkipped > 0 || kpis.duplicates > 0 || kpis.strayReceipts > 0) && (
          <p className="soa-issued">
            This report flags <b>{kpis.numbersSkipped}</b> skipped number(s), <b>{kpis.duplicates}</b> duplicate(s)
            and <b>{kpis.strayReceipts}</b> receipt(s) that no booklet covers. Each needs an explanation before the
            booklets are closed out.
          </p>
        )}

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Booklet accountability</h2>
        <table className="soa-table soa-table-compact">
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Booklet</th>
              <th style={{ textAlign: "left" }}>Serial</th>
              <th style={{ textAlign: "left" }}>Accountable person</th>
              <th className="soa-amt">Allocated</th>
              <th className="soa-amt">Issued</th>
              <th className="soa-amt">ECPay</th>
              <th className="soa-amt">Lowest used</th>
              <th className="soa-amt">Highest used</th>
              <th className="soa-amt">Skipped</th>
              <th className="soa-amt">Unissued</th>
              <th className="soa-amt">Collected</th>
            </tr>
          </thead>
          <tbody>
            {data.booklets.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: "center" }}>No booklet had a receipt issued in this range.</td></tr>
            ) : (
              data.booklets.map((b, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>{b.label}</td>
                  <td style={{ textAlign: "left" }}>{b.serial}</td>
                  <td style={{ textAlign: "left" }}>{b.accountable || "not assigned"}</td>
                  <td className="soa-amt">{plain.format(b.capacity)}</td>
                  <td className="soa-amt">{plain.format(b.issued)}</td>
                  <td className="soa-amt">{plain.format(b.ecpay)}</td>
                  <td className="soa-amt">{pad7(b.lowestUsed)}</td>
                  <td className="soa-amt">{pad7(b.highestUsed)}</td>
                  <td className="soa-amt">{b.skipped > 0 ? <b>{b.skipped}</b> : "0"}</td>
                  <td className="soa-amt">{plain.format(b.unissued)}</td>
                  <td className="soa-amt">{peso.format(b.collected)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <p className="soa-issued">
          {plain.format(data.idle.count)} further booklet(s) on issue ({plain.format(data.idle.numbers)} numbers)
          had no receipt in this range and are not listed above. Tick "all dates" for the full custody position.
        </p>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Receipts by channel and collector</h2>
        <div style={{ display: "flex", gap: 20 }}>
          <div style={{ flex: 1 }}>
            <TallyTable header="Payment channel" tally={data.channelTally} />
          </div>
          <div style={{ flex: 1 }}>
            <TallyTable header="Collector" tally={data.collectorTally} />
          </div>
        </div>

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Skipped receipt numbers</h2>
        {data.gaps.length === 0 ? (
          <p className="soa-issued">No skipped numbers. Every receipt between the first and last issued is accounted for.</p>
        ) : (
          <table className="soa-table soa-table-compact">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Booklet</th>
                <th style={{ textAlign: "left" }}>Serial</th>
                <th className="soa-amt">Missing from</th>
                <th className="soa-amt">Missing to</th>
                <th className="soa-amt">Count</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps.map((g, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>{g.booklet}</td>
                  <td style={{ textAlign: "left" }}>{g.serial}</td>
                  <td className="soa-amt">{g.from}</td>
                  <td className="soa-amt">{g.to}</td>
                  <td className="soa-amt">{g.count}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="soa-total-row">
                <td colSpan={4} style={{ textAlign: "left" }}>Total skipped</td>
                <td className="soa-amt">{kpis.numbersSkipped}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Receipts with no booklet</h2>
        {data.strays.length === 0 ? (
          <p className="soa-issued">Every receipt issued falls inside a booklet on record.</p>
        ) : (
          <>
            <table className="soa-table soa-table-compact">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Serial</th>
                  <th className="soa-amt">O.R. number</th>
                  <th className="soa-amt">Date</th>
                  <th style={{ textAlign: "left" }}>Channel</th>
                  <th className="soa-amt">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.strays.map((s, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{s.serial}</td>
                    <td className="soa-amt">{s.number}</td>
                    <td className="soa-amt">{s.date ? String(s.date).slice(0, 10) : ""}</td>
                    <td style={{ textAlign: "left" }}>{s.channel}</td>
                    <td className="soa-amt">{peso.format(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="soa-total-row">
                  <td colSpan={4} style={{ textAlign: "left" }}>Receipts needing a booklet</td>
                  <td className="soa-amt">{data.strays.length}</td>
                </tr>
              </tfoot>
            </table>
            <p className="soa-issued">
              Add the covering bundle to the OR groups list and these will fall into place on the next run.
            </p>
          </>
        )}

        <h2 className="soa-issued" style={{ marginTop: 20 }}>Exceptions</h2>
        {data.duplicates.length === 0 ? (
          <p className="soa-issued">No duplicate receipt numbers found.</p>
        ) : (
          <table className="soa-table soa-table-compact">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Booklet</th>
                <th style={{ textAlign: "left" }}>Serial</th>
                <th className="soa-amt">Number</th>
                <th style={{ textAlign: "left" }}>Finding</th>
              </tr>
            </thead>
            <tbody>
              {data.duplicates.map((d, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}>{d.booklet}</td>
                  <td style={{ textAlign: "left" }}>{d.serial}</td>
                  <td className="soa-amt">{d.number}</td>
                  <td style={{ textAlign: "left" }}>Receipt number issued more than once</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(data.setupIssues.overlapCount > 0 || data.setupIssues.badRangeCount > 0) && (
          <>
            <h2 className="soa-issued" style={{ marginTop: 20 }}>Booklet records needing correction</h2>
            <p className="soa-issued">
              <b>{data.setupIssues.overlapCount}</b> booklet(s) overlap another of the same serial and{" "}
              <b>{data.setupIssues.badRangeCount}</b> have an unusable range (Initial past Final). These are bundle
              records, not receipts, and do not affect the amounts above. The first 25 of each are listed for
              correction.
            </p>
            <table className="soa-table soa-table-compact">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Booklet</th>
                  <th style={{ textAlign: "left" }}>Serial</th>
                  <th style={{ textAlign: "left" }}>Finding</th>
                </tr>
              </thead>
              <tbody>
                {data.setupIssues.overlaps.map((o, i) => (
                  <tr key={`o-${i}`}>
                    <td style={{ textAlign: "left" }}>{o.booklet}</td>
                    <td style={{ textAlign: "left" }}>{o.serial}</td>
                    <td style={{ textAlign: "left" }}>
                      Overlaps <b>{o.overlapsWith}</b>. Receipts in the overlap are credited to the first bundle only.
                    </td>
                  </tr>
                ))}
                {data.setupIssues.badRanges.map((b, i) => (
                  <tr key={`b-${i}`}>
                    <td style={{ textAlign: "left" }}>{b.booklet}</td>
                    <td style={{ textAlign: "left" }}>{b.serial}</td>
                    <td style={{ textAlign: "left" }}>Initial is past Final, so the bundle covers nothing and was skipped</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <p className="soa-issued" style={{ marginTop: 20 }}>
          Generated {new Date(data.generatedAt).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
          <SignatoryBlock slots={data.signatories} />
        </div>
      </article>
    </div>
  );
}

function TallyTable({ header, tally }: { header: string; tally: Tally }) {
  if (tally.rows.length === 0) {
    return <p className="soa-issued">No receipts in this range.</p>;
  }
  return (
    <table className="soa-table soa-table-compact">
      <thead>
        <tr>
          <th style={{ textAlign: "left" }}>{header}</th>
          <th className="soa-amt">Receipts</th>
          <th className="soa-amt">Amount</th>
          <th className="soa-amt">Share</th>
        </tr>
      </thead>
      <tbody>
        {tally.rows.map((r, i) => (
          <tr key={i}>
            <td style={{ textAlign: "left" }}>{r.label}</td>
            <td className="soa-amt">{plain.format(r.count)}</td>
            <td className="soa-amt">{peso.format(r.amount)}</td>
            <td className="soa-amt">{r.pct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="soa-total-row">
          <td style={{ textAlign: "left" }}>Total</td>
          <td className="soa-amt">{plain.format(tally.totalCount)}</td>
          <td className="soa-amt">{peso.format(tally.total)}</td>
          <td className="soa-amt">100.0%</td>
        </tr>
      </tfoot>
    </table>
  );
}
