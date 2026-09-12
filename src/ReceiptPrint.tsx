import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import { peso } from "./collectionTypes";
import {
  DEFAULT_OR_LAYOUT,
  PAPERS,
  clearOrLayout,
  loadOrLayout,
  round,
  saveOrLayout,
} from "./orLayout";
import type { FieldKey, OrLayout, PaperKey } from "./orLayout";
import "./receipt.css";

type Receipt = {
  orNumber: string;
  orSerial: string;
  date: string | null;
  accountNo: string;
  accountName: string;
  address: string | null;
  total: number;
  tendered: number;
  change: number;
  paymentType: string;
  amountInWords: string;
  amountInWords1?: string;
  amountInWords2?: string;
  collector: string;
  issuedBy: string | null;
  remark: string | null;
  seniorId: string | null;
  agency: string | null;
  lines: { nature: string; amount: string }[];
};

/**
 * The scanned blank form, from poseidon-web/public/. Tried in order, so it does
 * not matter whether the scanner saved a PNG or a JPEG; if none is there the
 * image hides itself and the sheet stays blank.
 */
const FORM_SCANS = ["/or-form.png", "/or-form.jpg", "/or-form.jpeg"];

function shortDate(value: string | null) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

export default function ReceiptPrint() {
  const [params] = useSearchParams();
  const number = params.get("number") ?? "";
  const serial = params.get("serial") ?? "";

  const [layout, setLayout] = useState<OrLayout>(loadOrLayout);
  const [calibrating, setCalibrating] = useState(false);
  const [selected, setSelected] = useState<FieldKey | "lines" | null>(null);
  const [backdrop, setBackdrop] = useState(true);
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<Receipt>({
    queryKey: ["receipt", number, serial],
    enabled: number !== "",
    queryFn: () =>
      apiGet<Receipt>(
        `/api/collection/receipt?number=${encodeURIComponent(number)}&serial=${encodeURIComponent(serial)}`,
      ),
  });

  /* The page box must match the paper actually loaded. A page box smaller than
     the sheet gets centred by Chrome, which is what threw the values into the
     middle of a Letter page. It has to be a real @page rule, so it is injected
     - @page cannot read custom properties. */
  const paper = PAPERS[layout.paper];
  const pageWidth = layout.paper === "form" ? layout.sheet.width : paper.width;
  const pageHeight =
    layout.paper === "form" ? layout.sheet.height : paper.height;

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `@page { size: ${pageWidth}in ${pageHeight}in; margin: 0; }`;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [pageWidth, pageHeight]);

  // Auto-print only when not calibrating - nobody wants a print dialog while
  // they are dragging fields around.
  useEffect(() => {
    if (data && !calibrating) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [data, calibrating]);

  useEffect(() => {
    if (!calibrating || !selected) return;
    function onKey(e: KeyboardEvent) {
      const step = e.shiftKey ? 0.05 : 0.01;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      nudge(dx, dy);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function update(next: OrLayout) {
    setLayout(next);
    saveOrLayout(next);
  }

  function nudge(dx: number, dy: number) {
    if (!selected) return;
    if (selected === "lines") {
      update({
        ...layout,
        lines: {
          ...layout.lines,
          x: round(layout.lines.x + dx),
          y: round(layout.lines.y + dy),
          amountRight: round(layout.lines.amountRight + dx),
        },
      });
      return;
    }
    const f = layout.fields[selected];
    update({
      ...layout,
      fields: {
        ...layout.fields,
        [selected]: { ...f, x: round(f.x + dx), y: round(f.y + dy) },
      },
    });
  }

  /** Inches per CSS pixel, measured from the sheet so page zoom cannot lie. */
  function inchesPerPixel() {
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1 / 96;
    return layout.sheet.width / rect.width;
  }

  function startDrag(key: FieldKey | "lines", e: React.PointerEvent) {
    if (!calibrating) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(key);

    const scale = inchesPerPixel();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin =
      key === "lines"
        ? {
            x: layout.lines.x,
            y: layout.lines.y,
            right: layout.lines.amountRight,
          }
        : { x: layout.fields[key].x, y: layout.fields[key].y, right: 0 };

    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) * scale;
      const dy = (ev.clientY - startY) * scale;
      setLayout((prev) => {
        if (key === "lines") {
          return {
            ...prev,
            lines: {
              ...prev.lines,
              x: round(origin.x + dx),
              y: round(origin.y + dy),
              amountRight: round(origin.right + dx),
            },
          };
        }
        return {
          ...prev,
          fields: {
            ...prev.fields,
            [key]: {
              ...prev.fields[key],
              x: round(origin.x + dx),
              y: round(origin.y + dy),
            },
          },
        };
      });
    }

    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLayout((prev) => {
        saveOrLayout(prev);
        return prev;
      });
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  if (isLoading) return <p>Loading the receipt…</p>;
  if (error) return <p>Could not load that receipt.</p>;
  if (!data) return <p>No receipt selected.</p>;

  const [w1, w2] = splitStoredWords(data);

  const value: Record<FieldKey, string> = {
    date: shortDate(data.date),
    agency: data.agency ?? "",
    payor: data.accountName,
    total: peso.format(data.total),
    words1: w1,
    words2: w2,
    tickCash: data.paymentType === "Cash" ? "✔" : "",
    tickCheck: data.paymentType === "Check" ? "✔" : "",
    tickMoneyOrder: data.paymentType === "Money Order" ? "✔" : "",
    collector: data.collector ?? "",
    orNumber: data.orNumber,
    orSerial: data.orSerial ?? "",
  };

  const keys = Object.keys(layout.fields) as FieldKey[];

  return (
    <div className={calibrating ? "receipt-root calibrating" : "receipt-root"}>
      <div className="print-toolbar or-toolbar">
        <button className="primary" onClick={() => window.print()}>
          Print
        </button>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={calibrating}
            onChange={(e) => setCalibrating(e.target.checked)}
          />
          Calibrate
        </label>
        <label className="toolbar-check">
          <input
            type="checkbox"
            checked={backdrop}
            onChange={(e) => setBackdrop(e.target.checked)}
          />
          Show form scan
        </label>
        <label className="toolbar-check">
          Paper
          <select
            value={layout.paper}
            onChange={(e) =>
              update({ ...layout, paper: e.target.value as PaperKey })
            }
          >
            {(Object.keys(PAPERS) as PaperKey[]).map((k) => (
              <option key={k} value={k}>
                {PAPERS[k].label}
              </option>
            ))}
          </select>
        </label>
        <span className="count">
          O.R. {data.orNumber}
          {data.orSerial ? ` (${data.orSerial})` : ""} · the number, the serial
          and the scan are never printed
        </span>
      </div>

      {calibrating && (
        <CalibratePanel
          layout={layout}
          selected={selected}
          onChange={update}
          onReset={() => {
            clearOrLayout();
            setLayout(DEFAULT_OR_LAYOUT);
          }}
        />
      )}

      <div
        ref={sheetRef}
        className="or-sheet"
        style={
          {
            width: `${layout.sheet.width}in`,
            height: `${layout.sheet.height}in`,
            // Read by the print rule, which pins the form to the top-left of
            // the page box and then applies these as the offset.
            "--or-offset-x": `${layout.offset.x}in`,
            "--or-offset-y": `${layout.offset.y}in`,
          } as React.CSSProperties
        }
        onPointerDown={() => setSelected(null)}
      >
        {backdrop && (
          <img
            className="or-backdrop"
            src={FORM_SCANS[0]}
            data-attempt="0"
            alt=""
            onError={(e) => {
              const img = e.currentTarget;
              const next = Number(img.dataset.attempt ?? 0) + 1;
              if (FORM_SCANS[next]) {
                img.dataset.attempt = String(next);
                img.src = FORM_SCANS[next];
              } else {
                img.style.display = "none";
              }
            }}
          />
        )}

        {/* The eight nature/amount slots, positioned and moved as one block. */}
        <div
          className={
            selected === "lines"
              ? "or-lines or-target selected"
              : "or-lines or-target"
          }
          style={{
            left: `${layout.lines.x}in`,
            top: `${layout.lines.y}in`,
            width: `${layout.lines.amountRight - layout.lines.x}in`,
            fontSize: `${layout.lines.size}pt`,
          }}
          onPointerDown={(e) => startDrag("lines", e)}
        >
          {data.lines.slice(0, 8).map((l, i) => (
            <div
              className="or-line"
              key={`${l.nature}-${i}`}
              style={{ height: `${layout.lines.lineHeight}in` }}
            >
              <span className="or-nature">{l.nature}</span>
              <span className="or-amount">{l.amount}</span>
            </div>
          ))}
        </div>

        {keys.map((key) => {
          const f = layout.fields[key];
          const text = value[key];
          if (!text && !calibrating) return null;
          const classes = [
            "or-field",
            "or-target",
            f.screenOnly ? "or-screen-only" : "",
            selected === key ? "selected" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={key}
              className={classes}
              data-label={f.label}
              style={{
                // The box shrinks to its text, so "centre" has to mean
                // "centred on x" - textAlign alone would do nothing here.
                left: f.align === "right" ? undefined : `${f.x}in`,
                right:
                  f.align === "right"
                    ? `${layout.sheet.width - f.x}in`
                    : undefined,
                transform:
                  f.align === "center" ? "translateX(-50%)" : undefined,
                top: `${f.y}in`,
                fontSize: `${f.size}pt`,
                fontWeight: f.bold ? 700 : 400,
              }}
              onPointerDown={(e) => startDrag(key, e)}
            >
              {text || (calibrating ? f.label : "")}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * tblor keeps the amount in words as two columns because the form has two
 * ruled lines for it. Older rows may only have the joined string.
 */
function splitStoredWords(r: Receipt): [string, string] {
  if (r.amountInWords1 !== undefined || r.amountInWords2 !== undefined) {
    return [r.amountInWords1 ?? "", r.amountInWords2 ?? ""];
  }
  const words = (r.amountInWords ?? "").trim().split(/\s+/);
  if (words.length <= 5) return [r.amountInWords ?? "", ""];
  return [words.slice(0, 4).join(" "), words.slice(4).join(" ")];
}

function CalibratePanel({
  layout,
  selected,
  onChange,
  onReset,
}: {
  layout: OrLayout;
  selected: FieldKey | "lines" | null;
  onChange: (next: OrLayout) => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const text = JSON.stringify(layout, null, 2);
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setCopied(false),
    );
  }

  function num(
    label: string,
    v: number,
    set: (n: number) => void,
    step = 0.01,
  ) {
    return (
      <label className="field-input narrow" key={label}>
        <span>{label}</span>
        <input
          type="number"
          step={step}
          value={v}
          onChange={(e) => set(Number(e.target.value))}
        />
      </label>
    );
  }

  return (
    <div className="calibrate-panel">
      <p className="count">
        Drag a value onto the scan, or select it and use the arrow keys - 0.01in
        a press, 0.05in with Shift. Everything is remembered in this browser.
      </p>

      <div className="calibrate-row">
        {num("Sheet width (in)", layout.sheet.width, (n) =>
          onChange({ ...layout, sheet: { ...layout.sheet, width: n } }),
        )}
        {num("Sheet height (in)", layout.sheet.height, (n) =>
          onChange({ ...layout, sheet: { ...layout.sheet, height: n } }),
        )}
        {num("Offset X (in)", layout.offset.x, (n) =>
          onChange({ ...layout, offset: { ...layout.offset, x: n } }),
        )}
        {num("Offset Y (in)", layout.offset.y, (n) =>
          onChange({ ...layout, offset: { ...layout.offset, y: n } }),
        )}
        {num("Line spacing (in)", layout.lines.lineHeight, (n) =>
          onChange({ ...layout, lines: { ...layout.lines, lineHeight: n } }),
        )}
        {num("Amount right edge (in)", layout.lines.amountRight, (n) =>
          onChange({ ...layout, lines: { ...layout.lines, amountRight: n } }),
        )}
        {num(
          "Line text size (pt)",
          layout.lines.size,
          (n) => onChange({ ...layout, lines: { ...layout.lines, size: n } }),
          0.5,
        )}
      </div>

      {selected && selected !== "lines" && (
        <div className="calibrate-row">
          <span className="calibrate-name">
            {layout.fields[selected].label}
          </span>
          {num("x (in)", layout.fields[selected].x, (n) =>
            onChange({
              ...layout,
              fields: {
                ...layout.fields,
                [selected]: { ...layout.fields[selected], x: n },
              },
            }),
          )}
          {num("y (in)", layout.fields[selected].y, (n) =>
            onChange({
              ...layout,
              fields: {
                ...layout.fields,
                [selected]: { ...layout.fields[selected], y: n },
              },
            }),
          )}
          {num(
            "size (pt)",
            layout.fields[selected].size,
            (n) =>
              onChange({
                ...layout,
                fields: {
                  ...layout.fields,
                  [selected]: { ...layout.fields[selected], size: n },
                },
              }),
            0.5,
          )}
        </div>
      )}

      <div className="form-actions">
        <button className="primary" onClick={copy}>
          {copied ? "Copied" : "Copy layout"}
        </button>
        <button className="clear-filters" onClick={onReset}>
          Reset to defaults
        </button>
        <span className="count">
          Paste the copied JSON over DEFAULT_OR_LAYOUT in orLayout.ts to make it
          the default for every machine.
        </span>
      </div>
    </div>
  );
}
