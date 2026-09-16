import { useEffect } from "react";
import { PAPERS, type PaperKey } from "./orLayout";

/**
 * Paper size, orientation and scale — every printed report gets all three
 * (bills and O.R.s are the two exceptions: they print onto a pre-printed
 * accountable form at a fixed size, via orLayout.ts's own calibration
 * system, not this one).
 *
 * This is meant to be the one place a new report's print view reaches for
 * this, rather than each one growing its own paper picker or, worse,
 * shipping with none at all — which is exactly how half of the reports
 * built before this file existed ended up with no paper control whatsoever.
 */

export type Orientation = "portrait" | "landscape";

export const REPORT_PAPERS: PaperKey[] = ["letter", "legal", "a4"];

export const SCALES = [100, 90, 80, 75, 65, 50] as const;

/** PAPERS' own numbers are portrait; swap them for landscape rather than
 *  keeping a second table that could drift out of sync with the first. */
export function pageBoxInches(paper: PaperKey, orientation: Orientation): { width: number; height: number } {
  const { width, height } = PAPERS[paper];
  return orientation === "landscape" ? { width: height, height: width } : { width, height };
}

/** Injects a real `@page` rule sized to the chosen paper + orientation —
 *  `@page` can't read CSS custom properties, and the on-screen sheet's own
 *  width has to match it or the preview lies about how much room the
 *  printed page actually has. Returns the (already-swapped) box size so the
 *  caller can size its own sheet element to match. */
export function usePrintPageSize(
  paper: PaperKey,
  orientation: Orientation,
  marginIn = 0.25,
): { width: number; height: number } {
  const box = pageBoxInches(paper, orientation);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${box.width}in ${box.height}in; margin: ${marginIn}in; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [box.width, box.height, marginIn]);

  return box;
}

/** Scale is a pure visual shrink on top of the page size, same technique
 *  the desktop's own HTML reports already used — it doesn't change the
 *  sheet's reserved layout space, just how large its content renders
 *  within it, so a scaled-down report sits with room to spare rather than
 *  being re-flowed. */
export function scaledSheetStyle(widthIn: number, scale: number): React.CSSProperties {
  return {
    width: `${widthIn}in`,
    transform: scale !== 100 ? `scale(${scale / 100})` : undefined,
    transformOrigin: "top center",
  };
}

export function PrintLayoutControls({
  paper, orientation, scale, onPaper, onOrientation, onScale, papers = REPORT_PAPERS,
}: {
  paper: PaperKey;
  orientation: Orientation;
  scale: number;
  onPaper: (p: PaperKey) => void;
  onOrientation: (o: Orientation) => void;
  onScale: (s: number) => void;
  papers?: PaperKey[];
}) {
  return (
    <>
      <label className="toolbar-check">
        Paper
        <select value={paper} onChange={(e) => onPaper(e.target.value as PaperKey)}>
          {papers.map((k) => (
            <option key={k} value={k}>{PAPERS[k].label}</option>
          ))}
        </select>
      </label>
      <label className="toolbar-check">
        Orientation
        <select value={orientation} onChange={(e) => onOrientation(e.target.value as Orientation)}>
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label className="toolbar-check">
        Scale
        <select value={scale} onChange={(e) => onScale(Number(e.target.value))}>
          {SCALES.map((s) => (
            <option key={s} value={s}>{s}%</option>
          ))}
        </select>
      </label>
    </>
  );
}
