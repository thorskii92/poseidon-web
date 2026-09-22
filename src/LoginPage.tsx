import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiGet } from "./api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();

  // No session exists yet on the login screen, so this can't use
  // AuthContext or /api/sync/status (both need one) — a tiny unauthenticated
  // endpoint (see server.ts) is the only thing available pre-login.
  const [isSatellite, setIsSatellite] = useState(false);
  useEffect(() => {
    apiGet<{ isSatellite: boolean }>("/api/deployment")
      .then((d) => setIsSatellite(d.isSatellite))
      .catch(() => {});
  }, []);

  async function submit() {
    if (!username || !password) return;
    setBusy(true);
    setError("");
    try {
      await signIn(username, password);
    } catch (err) {
      setError((err as Error).message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">{isSatellite ? "OSCARS" : "POSEIDON"}</div>
        <p className="login-sub">Water billing and collection</p>

        <label className="field-input">
          <span>Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </label>

        <label className="field-input">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <button
          className="primary login-button"
          onClick={submit}
          disabled={busy || !username || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
