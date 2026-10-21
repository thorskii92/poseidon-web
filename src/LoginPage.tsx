import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiGet } from "./api";
import { IconDroplet, IconReceipt } from "./ReportIcons";
import { IconRefresh } from "./NavIcons";
import LoginTide from "./LoginTide";

/**
 * The left panel's copy and the animated wave/bubble backdrop are the same
 * for both deployments — only the words change (via isSatellite), the
 * colors reskin for free through the --navy/--blue/--blue-soft/--tint
 * tokens OSCARS already overrides in index.css.
 */
const COPY = {
  main: {
    headline: "Water Billing, Simplified",
    body:
      "Metered water billing and collection system for the Water Utility Agencies - Accounts, Billing, Collection and Field operations in one system.",
    features: [
      { Icon: IconDroplet, label: "Metered billing & consumption tracking" },
      { Icon: IconReceipt, label: "Over-the-counter and online collection" },
      { Icon: IconRefresh, label: "Synced with field satellite units in real time" },
    ],
  },
  satellite: {
    headline: "Collection, Untethered",
    body:
      "OSCARS keeps collection running out in the field — fully offline, syncing back to POSEIDON the moment you're connected.",
    features: [
      { Icon: IconDroplet, label: "Offline-first bill lookup & collection" },
      { Icon: IconReceipt, label: "Official receipts printed on the spot" },
      { Icon: IconRefresh, label: "Uploads and reconciles with main automatically" },
    ],
  },
};

/** Fixed, not randomized on every render — an animation that resets its own
 *  timing on each re-render (e.g. a keystroke) would visibly jump. */
const BUBBLES = [
  { size: 14, left: 8, duration: 13, delay: 0 },
  { size: 22, left: 20, duration: 17, delay: 2 },
  { size: 10, left: 34, duration: 11, delay: 5 },
  { size: 18, left: 48, duration: 15, delay: 1 },
  { size: 12, left: 62, duration: 12, delay: 6 },
  { size: 26, left: 74, duration: 19, delay: 3 },
  { size: 16, left: 88, duration: 14, delay: 4 },
];

/** A logo that isn't uploaded yet (404) simply disappears, same rule the
 *  bill and report headers follow. */
function LoginLogo({ which }: { which: "municipal" | "office" }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <img
      className="login-logo"
      src={`/api/public/logo/${which}`}
      alt=""
      onError={() => setHidden(true)}
    />
  );
}

function IconUser({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6" />
    </svg>
  );
}

function IconLock({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

/** Two duplicated tiles, 1440 wide each, laid side by side inside a 200%-
 *  wide element — CSS then slides it by -50% (of its own width, i.e. one
 *  tile) and loops, which is seamless because the second tile is pixel-
 *  identical to the first. */
function Waves() {
  return (
    <div className="login-waves" aria-hidden="true">
      <svg className="login-wave login-wave-back" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,90 Q90,50 180,90 T360,90 T540,90 T720,90 L720,200 L0,200 Z
             M720,90 Q810,50 900,90 T1080,90 T1260,90 T1440,90 L1440,200 L720,200 Z"
          style={{ fill: "var(--tint)" }}
        />
      </svg>
      <svg className="login-wave login-wave-front" viewBox="0 0 1440 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M0,120 Q60,90 120,120 T240,120 T360,120 T480,120 T600,120 T720,120 L720,200 L0,200 Z
             M720,120 Q780,90 840,120 T960,120 T1080,120 T1200,120 T1320,120 T1440,120 L1440,200 L720,200 Z"
          style={{ fill: "var(--blue-soft)" }}
        />
      </svg>
    </div>
  );
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const shellRef = useRef<HTMLDivElement>(null);

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

  const brand = isSatellite ? "OSCARS" : "POSEIDON";
  const copy = isSatellite ? COPY.satellite : COPY.main;

  return (
    <div className={isSatellite ? "login-screen login-screen-satellite" : "login-screen"}>
      {/* Same deep-blue/cyan as vivito.tech's tide; OSCARS gets its green/gold. */}
      <LoginTide
        deep={isSatellite ? "#1f5a45" : "#123a8a"}
        crest={isSatellite ? "#e8c766" : "#7fe3ff"}
        frameRef={shellRef}
      />
      <div className="login-shell" ref={shellRef}>
        <div className="login-visual">
          <Waves />
          <div className="login-bubbles" aria-hidden="true">
            {BUBBLES.map((b, i) => (
              <span
                key={i}
                className="login-bubble"
                style={{
                  width: b.size,
                  height: b.size,
                  left: `${b.left}%`,
                  animationDuration: `${b.duration}s`,
                  animationDelay: `${b.delay}s`,
                }}
              />
            ))}
          </div>
          <div className="login-visual-content">
            <div className="login-logos">
              <LoginLogo which="municipal" />
              <LoginLogo which="office" />
            </div>
            <div className="login-visual-brand">{brand}</div>
            <h1>{copy.headline}</h1>
            <p>{copy.body}</p>
            <ul className="login-features">
              {copy.features.map(({ Icon, label }) => (
                <li key={label}>
                  <Icon size={16} />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="login-card">
          <div className="login-brand">{brand}</div>
          <p className="login-sub">Sign in to continue</p>

          <label className="field-input">
            <span>Username</span>
            <div className="login-input-wrap">
              <IconUser />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoFocus
              />
            </div>
          </label>

          <label className="field-input">
            <span>Password</span>
            <div className="login-input-wrap">
              <IconLock />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </div>
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
    </div>
  );
}
