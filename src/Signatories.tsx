import { useEffect, useState } from "react";
import { apiGet } from "./api";

/**
 * The signatory block every printed report shares.
 *
 * Four slots, typed PREP, PREP, CHECK, APPR. Each is set to a person, to a
 * blank ruled line, or to nothing:
 *
 *   a person     name and title print above the rule
 *   Blank line   the rule prints empty — whoever signs writes their own name
 *   None         the slot is dropped and the rest spread to fill the width
 *
 * Labels belong to the report, not to this component: a statement's third
 * slot is "Checked by", a transaction history's is "Certified correct by",
 * and a disconnection list's is "Recommending approval". Pass whatever the
 * sheet says. Only the four types are fixed.
 *
 * Choices are remembered per report in localStorage, because these pages open
 * in a new tab and re-picking four names for every statement at a counter is
 * the kind of friction that gets a feature abandoned. They stay visible in the
 * toolbar, so a remembered choice is never a hidden one.
 */

export type SignatoryMode = "none" | "blank" | "named";

export type SignatorySlot = {
  slot: number;
  mode: SignatoryMode;
  name: string;
  title: string;
};

export type SignatoryOption = {
  id: number;
  name: string;
  title: string;
  type: string;
};

/** Which signatory type fills each slot. Slot 2 is the second preparer. */
export const SLOT_TYPES = ["PREP", "PREP", "CHECK", "APPR"] as const;

/**
 * What a report calls its slots if it does not say.
 *
 * Both PREP slots are "Prepared by" on the printed sheet: a report is often
 * prepared by two people — two offices, or a clerk and the officer who owns
 * the figures — and they sign the same line, not one labelled as a lesser
 * version of the other.
 */
export const DEFAULT_SIGNATORY_LABELS = [
  "Prepared by",
  "Prepared by",
  "Checked by",
  "Approved by",
];

/**
 * Two dropdowns reading "Prepared by" would be impossible to tell apart in a
 * toolbar, so a repeated label is numbered there — and only there. The sheet
 * prints the label as the report wrote it.
 */
function pickerLabel(labels: string[], i: number) {
  const label = labels[i] ?? DEFAULT_SIGNATORY_LABELS[i];
  const same = labels.filter((l) => l === label).length;
  if (same < 2) return label;
  const ordinal = labels.slice(0, i + 1).filter((l) => l === label).length;
  return `${label} (${ordinal})`;
}

const STORE_PREFIX = "poseidon.signatories.";

function loadSaved(reportKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + reportKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 4) {
      return parsed.map((v) => String(v));
    }
  } catch {
    /* private windows and cleared site data both land here */
  }
  return null;
}

function save(reportKey: string, values: string[]) {
  try {
    localStorage.setItem(STORE_PREFIX + reportKey, JSON.stringify(values));
  } catch {
    /* the choice just won't be remembered next time */
  }
}

/**
 * First of each type, as the desktop did — except the second preparer, which
 * starts at None so a report looks like the three-signatory sheet the office
 * already knows until someone deliberately adds a fourth.
 */
function defaults(people: SignatoryOption[]): string[] {
  const first = (type: string) => people.find((p) => p.type === type);
  return [
    String(first("PREP")?.id ?? "blank"),
    "none",
    String(first("CHECK")?.id ?? "blank"),
    String(first("APPR")?.id ?? "blank"),
  ];
}

export function useSignatories(reportKey: string) {
  const [people, setPeople] = useState<SignatoryOption[]>([]);
  const [values, setValues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiGet<{ signatories: SignatoryOption[] }>("/api/settings/signatories")
      .then((r) => {
        if (cancelled) return;
        setPeople(r.signatories);
        setValues(loadSaved(reportKey) ?? defaults(r.signatories));
      })
      .catch(() => {
        // Blank rules are a perfectly good sheet; a signatory list that will
        // not load should not stop a clerk printing.
        if (!cancelled) setValues(["blank", "none", "blank", "blank"]);
      });
    return () => {
      cancelled = true;
    };
  }, [reportKey]);

  function setValue(index: number, value: string) {
    setValues((prev) => {
      const next = [...prev];
      next[index] = value;
      save(reportKey, next);
      return next;
    });
  }

  /**
   * The query string the report appends. Empty until the list has loaded, so
   * the report can hold its first fetch rather than firing one with no
   * signatories and overwriting it a moment later — which is exactly how the
   * first version printed blank rules under names the clerk had chosen.
   */
  const ready = values.length === 4;
  const query = ready
    ? values.map((v, i) => `sig${i + 1}=${encodeURIComponent(v)}`).join("&")
    : "";

  return { people, values, setValue, query, ready };
}

/** The four dropdowns, for a print page's toolbar. */
export function SignatoryPickers({
  labels = DEFAULT_SIGNATORY_LABELS,
  people,
  values,
  onChange,
}: {
  labels?: string[];
  people: SignatoryOption[];
  values: string[];
  onChange: (index: number, value: string) => void;
}) {
  if (values.length !== 4) return null;

  return (
    <>
      {SLOT_TYPES.map((type, i) => (
        <label className="field-input" key={i}>
          <span>{pickerLabel(labels, i)}</span>
          <select value={values[i]} onChange={(e) => onChange(i, e.target.value)}>
            <option value="none">— None —</option>
            <option value="blank">Blank line</option>
            {people
              .filter((p) => p.type === type)
              .map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      ))}
    </>
  );
}

/** The printed block. Slots set to None are dropped entirely. */
export function SignatoryBlock({
  labels = DEFAULT_SIGNATORY_LABELS,
  slots,
}: {
  labels?: string[];
  slots: SignatorySlot[];
}) {
  const shown = (slots ?? [])
    .map((s, i) => ({ ...s, label: labels[i] ?? DEFAULT_SIGNATORY_LABELS[i] }))
    .filter((s) => s.mode !== "none");

  if (!shown.length) return null;

  return (
    <div className={`sign-block sign-block-${shown.length}`}>
      {shown.map((s) => (
        <div className="sign-cell" key={s.slot}>
          <span className="sign-label">{s.label}:</span>
          <span className="sign-name">
            {s.mode === "named" && s.name ? s.name : " "}
          </span>
          <span className="sign-title">
            {s.mode === "named" && s.title ? s.title : " "}
          </span>
        </div>
      ))}
    </div>
  );
}
