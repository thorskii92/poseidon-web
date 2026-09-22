import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { PasswordTab } from "./ProfileEditorModal";
import { apiGet } from "./api";

/**
 * Blocks the whole app behind a required password change — set by an admin
 * password reset (userlist.mustchangepassword). App.tsx renders this
 * instead of the normal routes whenever it's true; it clears the moment
 * PasswordTab's own PUT /api/me/password succeeds, same endpoint the
 * ordinary profile editor uses.
 */
export default function ForcedPasswordChangeScreen() {
  const { user, signOut, patchUser } = useAuth();

  const [isSatellite, setIsSatellite] = useState(false);
  useEffect(() => {
    apiGet<{ isSatellite: boolean }>("/api/deployment")
      .then((d) => setIsSatellite(d.isSatellite))
      .catch(() => {});
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">{isSatellite ? "OSCARS" : "POSEIDON"}</div>
        <p className="login-sub">
          {user?.fullName ? `Welcome, ${user.fullName}.` : "Welcome."} You're on a
          temporary password — set a new one to continue.
        </p>

        <PasswordTab onChanged={() => patchUser({ mustChangePassword: false })} />

        <button className="link-button" style={{ marginTop: 14 }} onClick={signOut}>
          Sign out instead
        </button>
      </div>
    </div>
  );
}
