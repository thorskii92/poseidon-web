/**
 * Where every value sits on the pre-printed Official Receipt.
 *
 * The printer puts ink on an accountable form that already carries the lines,
 * the labels and the O.R. number. So the print output is nothing but values at
 * absolute positions on blank paper - exactly what the desktop's Crystal report
 * does. The scanned form is a screen-only backdrop for lining things up, and is
 * suppressed at print time along with the O.R. number and serial, which are
 * pre-printed on the paper itself.
 *
 * Every measurement below is in INCHES from the top-left corner of the sheet.
 *
 * The defaults were measured off Thor's 200 DPI scan of a blank Accountable
 * Form No. 51-C (803 x 1695 px = 4.02in x 8.48in) by detecting the printed
 * rules, so each value sits centred in its own box on the form:
 *
 *   No. box            1.542 – 2.178 in
 *   Date row           2.178 – 2.465
 *   Agency row         2.465 – 2.792
 *   Payor row          2.792 – 3.095
 *   Collection rows    3.515 – 5.255  (eight rows, 0.2175in apart)
 *   TOTAL row          5.255 – 5.530
 *   Amount in words    5.565 – 5.810 and 5.810 – 6.070
 *   Cash/Check/M.O.    6.070 – 6.338 / 6.338 – 6.588 / 6.588 – 6.810
 *   Signature rule     7.440
 *
 * Column rules: form edges at 0.325 and 3.998; Nature | Account Code at 1.915;
 * Account Code | Amount at 2.880.
 *
 * These should be close on paper, but printers differ. Tick "Calibrate" on the
 * receipt, nudge anything that sits off, then press "Copy layout" and paste the
 * result over DEFAULT_OR_LAYOUT here.
 */

export type FieldKey =
  | "date"
  | "agency"
  | "payor"
  | "total"
  | "words1"
  | "words2"
  | "tickCash"
  | "tickCheck"
  | "tickMoneyOrder"
  // Only ever one non-empty set at a time (Check has all three; Money
  // Order has no drawee bank of its own, only a number and a date) —
  // separate keys per row rather than one shared position, since Check
  // and Money Order print on different rows of the same three columns.
  | "draweeBankCheck"
  | "draweeNumberCheck"
  | "draweeDateCheck"
  | "draweeNumberMO"
  | "draweeDateMO"
  | "collector"
  | "orNumber"
  | "orSerial";

export type FieldSpec = {
  /** Inches from the left edge of the sheet. */
  x: number;
  /** Inches from the top edge of the sheet, to the text baseline box top. */
  y: number;
  align: "left" | "center" | "right";
  /** Point size. */
  size: number;
  bold?: boolean;
  /** Screen only - never printed, because the form already carries it. */
  screenOnly?: boolean;
  /** Human name shown in the calibration panel. */
  label: string;
};

/**
 * The paper actually loaded in the printer.
 *
 * "form" makes the page box the size of the receipt itself, which is right when
 * the office feeds loose slips. On any larger sheet the form is laid in the
 * TOP-LEFT corner so it can be lined up against the paper's edge - if the page
 * box is smaller than the sheet, Chrome centres it, which is what pushed the
 * values into the middle of a Letter page.
 */
export type PaperKey = "form" | "letter" | "a4" | "legal";

export const PAPERS: Record<
  PaperKey,
  { label: string; width: number; height: number }
> = {
  form: { label: "Form only (4.02 × 8.48in)", width: 0, height: 0 },
  letter: { label: "Letter (8.5 × 11in)", width: 8.5, height: 11 },
  a4: { label: "A4 (8.27 × 11.69in)", width: 8.27, height: 11.69 },
  legal: { label: "Legal (8.5 × 14in)", width: 8.5, height: 14 },
};

export type OrLayout = {
  sheet: { width: number; height: number };
  /** Which page box to print onto. */
  paper: PaperKey;
  /**
   * Nudges the whole block on the page, in inches. Use this for the printer's
   * unprintable margin, or for however far in the form actually sits - one
   * adjustment instead of moving every field.
   */
  offset: { x: number; y: number };
  /** The eight nature/amount slots, as a block. */
  lines: {
    x: number;
    y: number;
    /** Distance between one line and the next. */
    lineHeight: number;
    /** Right edge the amounts align to. */
    amountRight: number;
    size: number;
  };
  fields: Record<FieldKey, FieldSpec>;
};

export const DEFAULT_OR_LAYOUT: OrLayout = {
  sheet: { width: 4.02, height: 8.48 },
  paper: "form",
  offset: { x: 0, y: 0 },
  lines: { x: 0.39, y: 3.562, lineHeight: 0.2175, amountRight: 3.7, size: 8.5 },
  fields: {
    date: { x: 1.9, y: 2.264, align: "left", size: 8, label: "Date" },
    agency: { x: 0.95, y: 2.563, align: "left", size: 9, label: "Agency" },
    payor: { x: 0.95, y: 2.878, align: "left", size: 9, label: "Payor" },
    total: { x: 3.7, y: 5.327, align: "right", size: 9, label: "Total" },
    words1: {
      x: 1.45,
      y: 5.626,
      align: "left",
      size: 8.5,
      label: "Amount in words (1)",
    },
    words2: {
      x: 0.39,
      y: 5.878,
      align: "left",
      size: 8.5,
      label: "Amount in words (2)",
    },
    tickCash: {
      x: 0.415,
      y: 6.131,
      align: "left",
      size: 10,
      bold: true,
      label: "Tick - Cash",
    },
    tickCheck: {
      x: 0.415,
      y: 6.39,
      align: "left",
      size: 10,
      bold: true,
      label: "Tick - Check",
    },
    tickMoneyOrder: {
      x: 0.415,
      y: 6.626,
      align: "left",
      size: 10,
      bold: true,
      label: "Tick - Money order",
    },
    // Rough starting positions only — the Drawee Bank/Number/Date columns
    // were never measured off the scan the way everything else here was.
    // Same row heights as tickCheck/tickMoneyOrder so each prints level
    // with its own checkbox; nudge these with Calibrate before relying on
    // them.
    draweeBankCheck: {
      x: 1.85, y: 6.39, align: "left", size: 8, label: "Drawee bank (Check row)",
    },
    draweeNumberCheck: {
      x: 2.75, y: 6.39, align: "left", size: 8, label: "Drawee number (Check row)",
    },
    draweeDateCheck: {
      x: 3.55, y: 6.39, align: "left", size: 8, label: "Drawee date (Check row)",
    },
    draweeNumberMO: {
      x: 2.75, y: 6.626, align: "left", size: 8, label: "Drawee number (Money order row)",
    },
    draweeDateMO: {
      x: 3.55, y: 6.626, align: "left", size: 8, label: "Drawee date (Money order row)",
    },
    collector: {
      x: 2.165,
      y: 7.3,
      align: "center",
      size: 9,
      label: "Collecting officer",
    },
    orNumber: {
      x: 2.1,
      y: 1.77,
      align: "left",
      size: 12,
      bold: true,
      screenOnly: true,
      label: "O.R. No. (pre-printed)",
    },
    orSerial: {
      x: 3.3,
      y: 1.77,
      align: "left",
      size: 12,
      bold: true,
      screenOnly: true,
      label: "Serial (pre-printed)",
    },
  },
};

const STORAGE_KEY = "poseidon.orLayout";

/** A calibration saved in this browser wins over the defaults above. */
export function loadOrLayout(): OrLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OR_LAYOUT;
    const saved = JSON.parse(raw) as Partial<OrLayout>;
    return {
      sheet: { ...DEFAULT_OR_LAYOUT.sheet, ...(saved.sheet ?? {}) },
      paper:
        saved.paper && PAPERS[saved.paper]
          ? saved.paper
          : DEFAULT_OR_LAYOUT.paper,
      offset: { ...DEFAULT_OR_LAYOUT.offset, ...(saved.offset ?? {}) },
      lines: { ...DEFAULT_OR_LAYOUT.lines, ...(saved.lines ?? {}) },
      fields: mergeFields(saved.fields),
    };
  } catch {
    return DEFAULT_OR_LAYOUT;
  }
}

function mergeFields(
  saved: Partial<Record<FieldKey, Partial<FieldSpec>>> | undefined,
) {
  const out = {} as Record<FieldKey, FieldSpec>;
  for (const key of Object.keys(DEFAULT_OR_LAYOUT.fields) as FieldKey[]) {
    out[key] = { ...DEFAULT_OR_LAYOUT.fields[key], ...(saved?.[key] ?? {}) };
  }
  return out;
}

export function saveOrLayout(layout: OrLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* private windows throw; the calibration just won't be remembered */
  }
}

export function clearOrLayout() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Round to hundredths of an inch - finer than any printer will honour. */
export function round(n: number) {
  return Math.round(n * 100) / 100;
}
