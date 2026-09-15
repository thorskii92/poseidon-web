import { useEffect, useState } from "react";
import { apiGet } from "./api";

/**
 * The signatory block every printed report shares.
 *
 * The standard sheet has four slots, typed PREP, PREP, CHECK, APPR — but a
 * report that only ever needs one or two (a job order's Prepared by /
 * Approved by, a daily collection report's Prepared by) passes its own,
 * shorter `slotTypes` instead of carrying three unused ones. Whatever the
 * list, each slot is set to a person, to a blank ruled line, or to nothing:
 *
 *   a person     name and title print above the rule
 *   Blank line   the rule prints empty — whoever signs writes their own name
 *   None         the slot is dropped and the rest spread to fill the width
 *
 * Labels belong to the report, not to this component: a statement's third
 * slot is "Checked by", a transaction history's is "Certified correct by",
 * and a disconnection list's is "Recommending approval". Pass whatever the
 * sheet says. Only the slot types (PREP/CHECK/APPR) are fixed.
 *
 * Choices are remembered per report in localStorage, because these pages open
 * in a new tab and re-picking names for every statement at a counter is
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

function loadSaved(reportKey: string, expectedLength: number): string[] | null {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + reportKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === expectedLength) {
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
 * First of each type, as the desktop did — except a type's second slot
 * (the second preparer, on the standard sheet), which starts at None so a
 * report looks like the shorter sheet the office already knows until
 * someone deliberately adds another of the same type.
 */
function defaults(people: SignatoryOption[], slotTypes: readonly string[]): string[] {
  const seen = new Set<string>();
  return slotTypes.map((type) => {
    const first = !seen.has(type);
    seen.add(type);
    if (!first) return "none";
    const person = people.find((p) => p.type === type);
    return String(person?.id ?? "blank");
  });
}

export function useSignatories(reportKey: string, slotTypes: readonly string[] = SLOT_TYPES) {
  const [people, setPeople] = useState<SignatoryOption[]>([]);
  const [values, setValues] = useState<string[]>([]);
  const key = slotTypes.join(",");

  useEffect(() => {
    let cancelled = false;
    apiGet<{ signatories: SignatoryOption[] }>("/api/settings/signatories")
      .then((r) => {
        if (cancelled) return;
        setPeople(r.signatories);
        setValues(loadSaved(reportKey, slotTypes.length) ?? defaults(r.signatories, slotTypes));
      })
      .catch(() => {
        // Blank rules are a perfectly good sheet; a signatory list that will
        // not load should not stop a clerk printing.
        if (!cancelled) setValues(slotTypes.map(() => "blank"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slotTypes is a
    // literal array the caller passes fresh each render; `key` is its stable
    // identity for this effect.
  }, [reportKey, key]);

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
  const ready = values.length === slotTypes.length;
  const query = ready
    ? values.map((v, i) => `sig${i + 1}=${encodeURIComponent(v)}`).join("&")
    : "";

  return { people, values, setValue, query, ready };
}

/** The dropdowns, for a print page's toolbar — one per slotTypes entry. */
export function SignatoryPickers({
  labels = DEFAULT_SIGNATORY_LABELS,
  slotTypes = SLOT_TYPES,
  people,
  values,
  onChange,
}: {
  labels?: string[];
  slotTypes?: readonly string[];
  people: SignatoryOption[];
  values: string[];
  onChange: (index: number, value: string) => void;
}) {
  if (values.length !== slotTypes.length) return null;

  return (
    <>
      {slotTypes.map((type, i) => (
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
