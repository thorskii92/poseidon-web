/**
 * How far an account's meter pin is from the stand pipe it's tagged with on
 * the GIS map. Past this, the stand pipe number or the pin is probably wrong.
 * Same default as the GIS Map's "Far from their stand pipe" list.
 */
export const STANDPIPE_FAR_M = 100;

export const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** The Accounts filter's choices (sent as ?spDist=). */
export const STANDPIPE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Any" },
  { value: "50", label: "More than 50 m away" },
  { value: "100", label: "More than 100 m away" },
  { value: "200", label: "More than 200 m away" },
  { value: "500", label: "More than 500 m away" },
  { value: "1000", label: "More than 1 km away" },
  { value: "unplaced", label: "Stand pipe not on the map" },
  { value: "nopin", label: "Meter not on the map" },
  { value: "none", label: "No stand pipe tagged" },
];
