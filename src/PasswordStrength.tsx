import { PASSWORD_RULES, passwordStrength } from "./passwordPolicy";

/**
 * The strength meter and rules checklist shown under every "new password"
 * box — changing your own password, the forced change after a reset, and
 * an administrator setting one in User Management.
 */
export default function PasswordStrength({ password, username }: { password: string; username?: string }) {
  const s = passwordStrength(password, username);
  return (
    <div className="pw-strength" aria-live="polite">
      <div className="pw-meter">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= s.score ? `pw-bar on s${s.score}` : "pw-bar"} />
        ))}
        {password && <span className={`pw-label s${s.score}`}>{s.label}</span>}
      </div>
      <ul className="pw-rules">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          return (
            <li key={r.id} className={ok ? "ok" : ""}>
              <span aria-hidden="true">{ok ? "✓" : "○"}</span> {r.label}
            </li>
          );
        })}
      </ul>
      {s.warning && <div className="pw-warning">{s.warning}</div>}
    </div>
  );
}
