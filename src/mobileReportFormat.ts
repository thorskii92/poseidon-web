/** Formatting shared by the three Mobile App report print views. Kept out
 *  of MobileReportParts.tsx so that file only exports components (fast
 *  refresh needs that). */

/** "Sep 22, 2026 3:14 PM" for an epoch-ms timestamp. */
export function dateTimeMs(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-PH", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Hours under two days, days beyond that. */
export function hours(v: number | null): string {
  if (v === null) return "—";
  return v < 48 ? `${v} hr` : `${(v / 24).toFixed(1)} days`;
}

export const peso = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
