import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiGet } from "./api";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import { SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot } from "./Signatories";
import { longWhen, type PublicNotice } from "./emergencyData";
import "./print.css";
import ReportHeader from "./ReportHeader";

/**
 * A public notice as a poster — for the barangay hall, the office door, or
 * a photo for the Facebook page. Same words as in the app and on the website.
 */
export default function NoticePrint() {
  const { id } = useParams();
  const [data, setData] = useState<{ notice: PublicNotice; signatories: SignatorySlot[] } | null>(null);
  const [error, setError] = useState("");

  const sig = useSignatories("public-notice");
  const [paper, setPaper] = useState<PaperKey>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!sig.ready) return;
    apiGet<{ notice: PublicNotice; signatories: SignatorySlot[] }>(`/api/emergencies/notices/${id}?${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [id, sig.ready, sig.query]);

  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Loading the notice…</p></div>;
  const n = data.notice;
  const urgent = n.severity === "Critical";

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
        {n.status !== "Published" && <span className="count">This notice is {n.status.toLowerCase()} — not yet public.</span>}
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <ReportHeader />

        <div style={{ textAlign: "center", margin: "18px 0 10px" }}>
          <div style={{ letterSpacing: 3, fontSize: 13, fontWeight: 700, color: urgent ? "#b42318" : "#6b7280" }}>
            {urgent ? "URGENT · " : ""}PUBLIC NOTICE
          </div>
          <h1 style={{ fontSize: 30, margin: "6px 0 4px", color: urgent ? "#b42318" : "var(--navy)", textTransform: "uppercase" }}>{n.title}</h1>
          <div className="count">{n.ref}{n.publishedMs ? ` · ${longWhen(n.publishedMs)}` : ""}</div>
        </div>

        {(n.startsMs || n.endsMs) && (
          <div style={{ border: "2px solid var(--navy)", borderRadius: 8, padding: "10px 14px", margin: "12px auto", maxWidth: 560, textAlign: "center", fontSize: 16 }}>
            {n.startsMs && <div><b>From:</b> {longWhen(n.startsMs)}</div>}
            {n.endsMs && <div><b>Until:</b> {longWhen(n.endsMs)}</div>}
          </div>
        )}

        <div style={{ fontSize: 17, lineHeight: 1.6, whiteSpace: "pre-line", margin: "16px 6px" }}>{n.body}</div>

        <div style={{ margin: "14px 6px", fontSize: 15 }}>
          <b>Affected area:</b> {n.areaText}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 30 }}>
          <SignatoryBlock slots={data.signatories ?? []} />
        </div>
      </article>
    </div>
  );
}
