import { useEffect, useState, type SyntheticEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import type { PaperKey } from "./orLayout";
import {
  PrintLayoutControls, usePrintPageSize, scaledSheetStyle, type Orientation,
} from "./PrintLayoutControls";
import {
  SignatoryBlock, SignatoryPickers, useSignatories, type SignatorySlot,
} from "./Signatories";
import "./print.css";

/**
 * Field Collection Report — the one report kept on a satellite's own
 * Reports page (see ReportsPage.tsx). Auto-scoped to one date's worth of
 * this satellite's own local collection (tblor.collectionorigin =
 * 'Satellite'), no O.R.-range typing — reads local data only, works fully
 * offline. Each line shows its own upload status so a collector can see
 * at a glance what's still waiting to reach main.
 */

const LOGO_SRC = {
  municipal: "/api/settings/logo/municipal",
  office: "/api/settings/logo/office",
} as const;

function Seal({ which }: { which: keyof typeof LOGO_SRC }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return <img className="bill-seal" src={LOGO_SRC[which]} alt="" onError={hide} />;
}

type NatureRow = { nature: string; count: number; amount: number };
type PaymentRow = {
  pid: number; orNumber: string; orSerial: string; acctNo: string; acctName: string;
  nature: string; amount: number; paymentType: string; uploadStatus: string;
};

type Report = {
  date: string;
  dateLabel: string;
  office: {
    municipality: string; municipalHeader: string; officeHeader: string;
    officeName: string; officeAddress: string;
  };
  satelliteName: string | null;
  signatories?: SignatorySlot[];
  empty: boolean;
  kpis?: { total: number; orCount: number; paymentCount: number };
  byNature?: NatureRow[];
  uploadCounts?: { pending: number; uploaded: number; conflict: number; error: number };
  rows?: PaymentRow[];
};

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      {sub && <div className="dash-kpi-sub">{sub}</div>}
    </div>
  );
}

const UPLOAD_LABEL: Record<string, string> = {
  pending: "Not uploaded",
  uploaded: "Uploaded",
  conflict: "Conflict",
  error: "Error",
};

export default function FieldCollectionPrint() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") ?? "";
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [generatedAt] = useState(() => new Date());

  const sig = useSignatories("field-collection");
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [scale, setScale] = useState(100);
  const box = usePrintPageSize(paper, orientation);

  useEffect(() => {
    if (!date) {
      setParams({ date: new Date().toISOString().slice(0, 10) }, { replace: true });
    }
  }, [date, setParams]);

  useEffect(() => {
    if (!date || !sig.ready) return;
    apiGet<Report>(`/api/reports/field-collection?date=${date}&${sig.query}`)
      .then((d) => { setData(d); setError(""); })
      .catch((e) => setError((e as Error).message));
  }, [date, sig.ready, sig.query]);

  if (!date) return <div className="print-root"><p className="count">Loading…</p></div>;
  if (error) return <div className="print-root"><div className="form-error">{error}</div></div>;
  if (!data) return <div className="print-root"><p className="count">Building the report…</p></div>;

  return (
    <div className="print-root">
      <div className="print-toolbar no-print">
        <button className="primary" onClick={() => window.print()}>Print</button>
        <label className="field-input" style={{ maxWidth: 180 }}>
          <span>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setParams({ date: e.target.value })}
          />
        </label>
        <SignatoryPickers people={sig.people} values={sig.values} onChange={sig.setValue} />
        <PrintLayoutControls paper={paper} orientation={orientation} scale={scale} onPaper={setPaper} onOrientation={setOrientation} onScale={setScale} />
      </div>

      <article className="soa-sheet" style={scaledSheetStyle(box.width, scale)}>
        <header className="ecpay-head">
          <Seal which="municipal" />
          <div>
            <div>Republic of the Philippines</div>
            <div>PROVINCE OF PALAWAN</div>
            <div>{data.office.officeHeader || data.office.municipalHeader}</div>
            <div className="soa-office">{data.office.officeName}</div>
            {data.office.officeAddress && <div className="soa-address">{data.office.officeAddress}</div>}
          </div>
          <Seal which="office" />
        </header>

        <p className="ecpay-kicker">
          Field Collection Report{data.satelliteName ? ` — ${data.satelliteName}` : ""}
        </p>
        <h1 className="soa-title" style={{ margin: "0 0 8px" }}>{data.dateLabel}</h1>

        {data.empty || !data.kpis ? (
          <p className="count">No payments were collected on {data.dateLabel}.</p>
        ) : (
          <>
            <div className="dash-kpis ecpay-kpis">
              <KpiTile label="Total collected" value={peso.format(data.kpis.total)} />
              <KpiTile label="O.R.s issued" value={data.kpis.orCount.toLocaleString()} />
              <KpiTile label="Payments" value={data.kpis.paymentCount.toLocaleString()} />
              <KpiTile label="Not yet uploaded" value={(data.uploadCounts?.pending ?? 0).toLocaleString()} />
              <KpiTile
                label="Conflicts / errors"
                value={((data.uploadCounts?.conflict ?? 0) + (data.uploadCounts?.error ?? 0)).toLocaleString()}
              />
            </div>

            <section className="record-section">
              <div className="record-head"><h2>By nature</h2></div>
              <table>
                <thead><tr><th>Nature</th><th className="n">Payments</th><th className="n">Amount</th></tr></thead>
                <tbody>
                  {(data.byNature ?? []).map((r) => (
                    <tr key={r.nature}>
                      <td>{r.nature}</td>
                      <td className="n">{r.count}</td>
                      <td className="n">{peso.format(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="record-section">
              <div className="record-head"><h2>Every payment</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>O.R.</th><th>Account</th><th>Nature</th>
                    <th className="n">Amount</th><th>Type</th><th>Upload</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rows ?? []).map((r) => (
                    <tr key={r.pid}>
                      <td>{r.orNumber}/{r.orSerial}</td>
                      <td>{r.acctNo} — {r.acctName}</td>
                      <td>{r.nature}</td>
                      <td className="n">{peso.format(r.amount)}</td>
                      <td>{r.paymentType}</td>
                      <td>{UPLOAD_LABEL[r.uploadStatus] ?? r.uploadStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

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
