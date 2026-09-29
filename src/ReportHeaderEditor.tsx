import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPut } from "./api";
import { ReportHeaderView } from "./ReportHeader";
import {
  LINE_KEYS, REPORT_HEADER_KEY, useReportHeader,
  type HeaderPayload, type HeaderStyle, type LineKey, type LineStyle, type LogoPlacement,
} from "./reportHeaderData";

/**
 * Settings → Report header: how the letterhead on every printed report
 * looks (ReportHeader.tsx). The words of lines 3–6 come from the Municipal
 * profile, so they're edited there; this panel sets the font, each line's
 * size / colour / bold / italic / capitals, which lines show, the wording
 * of the first two lines, and where the two seals go — with a live preview
 * that updates before anything is saved.
 */

const LINE_LABEL: Record<LineKey, string> = {
  republic: "Republic of the Philippines",
  province: "Province",
  header1: "Header line 1",
  header2: "Header line 2",
  officeName: "Water system name",
  address: "Office address",
};

const PLACEMENTS: { value: LogoPlacement; label: string }[] = [
  { value: "sides", label: "Both sides — municipal left, office right" },
  { value: "left", label: "Both on the left" },
  { value: "right", label: "Both on the right" },
  { value: "above", label: "Above the text, centred" },
  { value: "none", label: "No seals" },
];

/** "\"Times New Roman\", Times, serif" -> "Times New Roman" */
function fontName(f: string) {
  return f.split(",")[0]!.replace(/"/g, "");
}

export default function ReportHeaderEditor({ onClose }: { onClose: () => void }) {
  const { data, error } = useReportHeader();
  if (error) {
    return (
      <section className="record-section settings-panel">
        <div className="form-error">{(error as Error).message}</div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="record-section settings-panel">
        <p className="count">Loading…</p>
      </section>
    );
  }
  // Keyed so a save (new server copy) resets the draft from it.
  return <Editor key={JSON.stringify(data.style)} data={data} onClose={onClose} />;
}

function Editor({ data, onClose }: { data: HeaderPayload; onClose: () => void }) {
  const qc = useQueryClient();
  const [style, setStyle] = useState<HeaderStyle>(data.style);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(style) !== JSON.stringify(data.style);

  function patch(p: Partial<HeaderStyle>) {
    setStyle((s) => ({ ...s, ...p }));
    setSaved(false);
  }

  function patchLine(k: LineKey, p: Partial<LineStyle>) {
    setStyle((s) => ({ ...s, lines: { ...s.lines, [k]: { ...s.lines[k], ...p } } }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = await apiPut<HeaderPayload>("/api/settings/report-header", { style });
      qc.setQueryData(REPORT_HEADER_KEY, next);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="record-section settings-panel">
      <div className="record-head">
        <h2>Report header</h2>
        <button className="clear-filters" onClick={onClose}>Close</button>
      </div>
      <p className="count">
        The letterhead on every printed report. Header lines 1–2, the water system name and the office address
        are worded in the Municipal profile; this sets how they look. Bills and official receipts keep their own
        pre-printed layout.
      </p>

      <div className="rh-preview">
        <div className="rh-preview-label">Preview</div>
        <div className="rh-preview-sheet">
          <ReportHeaderView style={style} text={data.text} />
          <div className="rh-preview-title">SAMPLE REPORT TITLE</div>
        </div>
      </div>

      <div className="profile-grid" style={{ marginTop: 14 }}>
        <label className="field-input">
          <span>Font</span>
          <select value={style.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
            {data.fonts.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>{fontName(f)}</option>
            ))}
          </select>
        </label>
        <label className="field-input">
          <span>Seals</span>
          <select value={style.logoPlacement} onChange={(e) => patch({ logoPlacement: e.target.value as LogoPlacement })}>
            {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="field-input">
          <span>Seal size ({style.logoSizePx}px)</span>
          <input
            type="range" min={24} max={140} step={2}
            value={style.logoSizePx}
            disabled={style.logoPlacement === "none"}
            onChange={(e) => patch({ logoSizePx: Number(e.target.value) })}
          />
        </label>
        <label className="field-input">
          <span>Line spacing ({style.lineSpacing.toFixed(2)})</span>
          <input
            type="range" min={1} max={2} step={0.05}
            value={style.lineSpacing}
            onChange={(e) => patch({ lineSpacing: Number(e.target.value) })}
          />
        </label>
        <label className="field-input">
          <span>First line reads</span>
          <input className="filter-input" value={style.republicText} onChange={(e) => patch({ republicText: e.target.value })} />
        </label>
        <label className="field-input">
          <span>Province line reads</span>
          <input className="filter-input" value={style.provinceText} onChange={(e) => patch({ provinceText: e.target.value })} />
        </label>
      </div>

      <table className="data-table rh-lines">
        <thead>
          <tr>
            <th>Line</th><th>Show</th><th>Size (pt)</th><th>Colour</th><th>Bold</th><th>Italic</th><th>CAPITALS</th>
          </tr>
        </thead>
        <tbody>
          {LINE_KEYS.map((k) => {
            const l = style.lines[k];
            return (
              <tr key={k}>
                <td>{LINE_LABEL[k]}</td>
                <td><input type="checkbox" checked={l.show} onChange={(e) => patchLine(k, { show: e.target.checked })} aria-label={`Show ${LINE_LABEL[k]}`} /></td>
                <td>
                  <input
                    className="filter-input rh-size" type="number" min={6} max={28} step={0.5}
                    value={l.sizePt}
                    onChange={(e) => patchLine(k, { sizePt: Number(e.target.value) })}
                    aria-label={`${LINE_LABEL[k]} size`}
                  />
                </td>
                <td><input type="color" value={l.color} onChange={(e) => patchLine(k, { color: e.target.value })} aria-label={`${LINE_LABEL[k]} colour`} /></td>
                <td><input type="checkbox" checked={l.bold} onChange={(e) => patchLine(k, { bold: e.target.checked })} aria-label={`${LINE_LABEL[k]} bold`} /></td>
                <td><input type="checkbox" checked={l.italic} onChange={(e) => patchLine(k, { italic: e.target.checked })} aria-label={`${LINE_LABEL[k]} italic`} /></td>
                <td><input type="checkbox" checked={l.uppercase} onChange={(e) => patchLine(k, { uppercase: e.target.checked })} aria-label={`${LINE_LABEL[k]} capitals`} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {error && <div className="form-error">{error}</div>}
      {saved && !dirty && <div className="form-notice">Saved — every report uses it from now on.</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy || !dirty} onClick={save}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button className="clear-filters" disabled={busy || !dirty} onClick={() => setStyle(data.style)}>
          Discard
        </button>
        <button className="clear-filters" disabled={busy} onClick={() => { setStyle(data.defaults); setSaved(false); }}>
          Reset to the standard look
        </button>
      </div>
    </section>
  );
}
