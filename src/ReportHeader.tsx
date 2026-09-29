import type { CSSProperties, SyntheticEvent } from "react";
import {
  useReportHeader, type HeaderStyle, type HeaderText, type LineKey, type LineStyle,
} from "./reportHeaderData";

/**
 * The letterhead at the top of every printed report — one component, so
 * every report reads the same, in the same order:
 *
 *   Republic of the Philippines
 *   PROVINCE OF PALAWAN
 *   Header line 1 · Header line 2         (Settings → Municipal profile)
 *   Water system name · Office address    (Settings → Municipal profile)
 *
 * How it looks — fonts, sizes, colours, which lines show, where the two
 * seals go — is set in Settings → Report header (ReportHeaderEditor.tsx).
 * Pre-printed forms (the bill, the O.R., the Report of Collections and
 * Deposit) keep their own fixed layouts and don't use this.
 */

// Public logo route: a report prints for users without the Settings
// permission too, and the /api/settings logo route is behind it.
const LOGO_SRC = { municipal: "/api/public/logo/municipal", office: "/api/public/logo/office" } as const;

function Seal({ which, size }: { which: keyof typeof LOGO_SRC; size: number }) {
  function hide(e: SyntheticEvent<HTMLImageElement>) {
    e.currentTarget.style.visibility = "hidden";
  }
  return (
    <img
      src={LOGO_SRC[which]}
      alt=""
      onError={hide}
      style={{ width: size, height: size, objectFit: "contain", flex: "none" }}
    />
  );
}

function lineCss(l: LineStyle): CSSProperties {
  return {
    fontSize: `${l.sizePt}pt`,
    color: l.color,
    fontWeight: l.bold ? 700 : 400,
    fontStyle: l.italic ? "italic" : "normal",
    textTransform: l.uppercase ? "uppercase" : "none",
  };
}

/** The letterhead drawn from a given style and text — the editor's live
 *  preview uses this directly, before anything is saved. */
export function ReportHeaderView({ style, text }: { style: HeaderStyle; text: HeaderText }) {
  const words: Record<LineKey, string> = {
    republic: style.republicText,
    province: style.provinceText,
    header1: text.header1,
    header2: text.header2,
    officeName: text.officeName,
    address: text.address,
  };
  const order: LineKey[] = ["republic", "province", "header1", "header2", "officeName", "address"];
  const lines = order.filter((k) => style.lines[k].show && words[k]?.trim());
  const size = style.logoSizePx;
  const p = style.logoPlacement;

  const block = (
    <div style={{ textAlign: "center", lineHeight: style.lineSpacing, minWidth: 0 }}>
      {lines.map((k) => (
        <div key={k} style={lineCss(style.lines[k])}>{words[k]}</div>
      ))}
    </div>
  );

  return (
    <header
      className="report-header"
      style={{
        fontFamily: style.fontFamily,
        display: "flex",
        flexDirection: p === "above" ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: p === "above" ? 6 : 16,
        paddingBottom: 6,
        color: "#000",
      }}
    >
      {p === "above" && (
        <div style={{ display: "flex", gap: 12 }}>
          <Seal which="municipal" size={size} />
          <Seal which="office" size={size} />
        </div>
      )}
      {p === "sides" && <Seal which="municipal" size={size} />}
      {p === "left" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Seal which="municipal" size={size} />
          <Seal which="office" size={size} />
        </div>
      )}
      {block}
      {p === "sides" && <Seal which="office" size={size} />}
      {p === "right" && (
        <div style={{ display: "flex", gap: 8 }}>
          <Seal which="municipal" size={size} />
          <Seal which="office" size={size} />
        </div>
      )}
    </header>
  );
}

/** Drop-in letterhead for a report page. */
export default function ReportHeader() {
  const { data } = useReportHeader();
  // Holds the space while it loads, so the report doesn't jump.
  if (!data) return <header className="report-header" style={{ minHeight: 80 }} />;
  return <ReportHeaderView style={data.style} text={data.text} />;
}
