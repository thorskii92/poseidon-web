import { useState } from "react";

/**
 * Administrator credentials for an action that needs authorising.
 *
 * Deliberately hostile to password managers. Chrome ignores
 * autocomplete="off" on password fields and will fill in whoever is saved for
 * this site - which here would silently pre-authorise a clerk with an
 * administrator's stored credentials. What actually works: fields that carry
 * autoComplete="new-password" (browsers read that as "not a login"), names
 * that look nothing like credentials, and starting read-only so there is
 * nothing to fill until someone deliberately clicks in.
 *
 * Each field unlocks itself - a shared flag would leave the second one stuck.
 */
export default function AdminAuth({
  label = "An administrator must authorise this",
  username,
  password,
  onUsername,
  onPassword,
  onSubmit,
  disabled,
}: {
  label?: string;
  username: string;
  password: string;
  onUsername: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
}) {
  const [userLocked, setUserLocked] = useState(true);
  const [passLocked, setPassLocked] = useState(true);

  return (
    <div className="delete-auth">
      <div className="balance-label" style={{ marginBottom: 10 }}>
        {label}
      </div>
      <div className="form-grid">
        <label className="field-input">
          <span>Administrator username</span>
          <input
            name="poseidon-authoriser"
            autoComplete="off"
            readOnly={userLocked}
            disabled={disabled}
            value={username}
            onFocus={() => setUserLocked(false)}
            onChange={(e) => onUsername(e.target.value)}
          />
        </label>
        <label className="field-input">
          <span>Password</span>
          <input
            type="password"
            name="poseidon-authoriser-secret"
            autoComplete="new-password"
            readOnly={passLocked}
            disabled={disabled}
            value={password}
            onFocus={() => setPassLocked(false)}
            onChange={(e) => onPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && username && password) onSubmit?.();
            }}
          />
        </label>
      </div>
    </div>
  );
}
