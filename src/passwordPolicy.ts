/**
 * The password rules, checked as you type. The server enforces the same
 * ones (poseidon-api's passwordSecurity.ts) — keep the two in step.
 */

export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "A capital letter (A–Z)", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A small letter (a–z)", test: (p: string) => /[a-z]/.test(p) },
  { id: "number", label: "A number (0–9)", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "A special character (e.g. ! @ # $ %)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

const GIVEAWAYS = ["password", "poseidon", "123456", "qwerty", "admin", "welcome", "letmein"];

/** Letter swaps undone ("P@ssw0rd" -> "password"), so they don't hide a giveaway word. */
function unleet(s: string): string {
  return s.toLowerCase().replace(/[@4]/g, "a").replace(/0/g, "o").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/[$5]/g, "s").replace(/7/g, "t");
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; meetsRules: boolean; warning: string };

/**
 * Whether it meets the rules (what the server requires), plus a strength
 * score for the meter: longer, more varied and less predictable is better.
 */
export function passwordStrength(password: string, username = ""): Strength {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  const lower = password.toLowerCase();
  let warning = "";
  if (username.length >= 3 && lower.includes(username.toLowerCase())) warning = "Don't use your username in it.";
  const plain = unleet(password);
  const word = GIVEAWAYS.find((w) => lower.includes(w) || plain.includes(w));
  if (word) warning = `"${word}" is one of the first things an attacker tries.`;
  const meetsRules = passed === PASSWORD_RULES.length && !warning;

  let points = passed; // 0–5
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (/(.)\1\1/.test(password)) points--; // aaa, 111
  if (/(?:abc|bcd|cde|123|234|345|456|789)/i.test(password)) points--;
  if (warning) points = Math.min(points, 2);

  const score = (!password ? 0 : points <= 2 ? 1 : points <= 4 ? 2 : points === 5 ? 3 : 4) as Strength["score"];
  const label = ["", "Weak", "Fair", "Good", "Strong"][score]!;
  return { score, label, meetsRules, warning };
}
