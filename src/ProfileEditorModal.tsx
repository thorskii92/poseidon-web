import { useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import Avatar from "./Avatar";
import AvatarCropper from "./AvatarCropper";
import { ApiError } from "./api";

/**
 * Opened by clicking your own name in the sidebar — editing your profile,
 * picture and password all live here rather than under Settings or User
 * Management, since both of those are permission-gated and this has to be
 * reachable by every signed-in account regardless of role (it's backed by
 * /api/me, not /api/users — see me.ts on the API side for why that's a
 * separate router).
 */

type Tab = "profile" | "password";

export default function ProfileEditorModal({ onClose }: { onClose: () => void }) {
  const { user, patchUser, avatarVersion, bumpAvatarVersion } = useAuth();
  const [tab, setTab] = useState<Tab>("profile");

  if (!user) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Your profile</h2>

        <div className="stage-tabs" style={{ marginBottom: 16 }}>
          <button className={tab === "profile" ? "stage-tab current" : "stage-tab"} onClick={() => setTab("profile")}>
            Profile
          </button>
          <button className={tab === "password" ? "stage-tab current" : "stage-tab"} onClick={() => setTab("password")}>
            Password
          </button>
        </div>

        {tab === "profile" ? (
          <ProfileTab
            userId={user.id}
            fullName={user.fullName}
            position={user.position}
            avatarVersion={avatarVersion}
            onSaved={(patch) => patchUser(patch)}
            onAvatarChanged={bumpAvatarVersion}
          />
        ) : (
          <PasswordTab onChanged={() => patchUser({ mustChangePassword: false })} />
        )}

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button className="clear-filters" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({
  userId, fullName: initialFullName, position: initialPosition, avatarVersion, onSaved, onAvatarChanged,
}: {
  userId: number;
  fullName: string;
  position: string;
  avatarVersion: number;
  onSaved: (patch: { fullName: string; position: string }) => void;
  onAvatarChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(initialFullName);
  const [position, setPosition] = useState(initialPosition);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, position }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save");
      onSaved({ fullName, position });
      setNotice("Saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickFile() {
    fileRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  }

  async function uploadCropped(blob: Blob) {
    setAvatarBusy(true);
    setError("");
    try {
      const r = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not save your picture");
      onAvatarChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAvatarBusy(false);
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setError("");
    try {
      const r = await fetch("/api/me/avatar", { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not remove your picture");
      onAvatarChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <Avatar userId={userId} name={fullName} version={avatarVersion} size="large" />
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button className="clear-filters" onClick={pickFile} disabled={avatarBusy}>
            {avatarBusy ? "Working…" : "Change picture"}
          </button>
          <button className="link-button" onClick={removeAvatar} disabled={avatarBusy}>
            Remove
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={onFileChosen}
        />
      </div>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>

      <label className="field-input">
        <span>Position</span>
        <input value={position} onChange={(e) => setPosition(e.target.value)} />
      </label>

      {notice && <div className="form-notice" style={{ marginTop: 12 }}>{notice}</div>}
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy || !fullName.trim()} onClick={save}>
          {busy ? "Saving…" : "Save profile"}
        </button>
      </div>

      {cropSrc && (
        <AvatarCropper
          imageSrc={cropSrc}
          onCancel={() => { URL.revokeObjectURL(cropSrc); setCropSrc(null); }}
          onSave={uploadCropped}
        />
      )}
    </>
  );
}

export function PasswordTab({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const mismatch = again.length > 0 && next !== again;
  const tooShort = next.length > 0 && next.length < 8;

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, password: next }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Could not change your password");
      setCurrent("");
      setNext("");
      setAgain("");
      setNotice("Password changed.");
      onChanged();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>Current password</span>
        <input
          type="password"
          value={current}
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>

      <label className="field-input" style={{ marginBottom: 12 }}>
        <span>New password</span>
        <input
          type="password"
          value={next}
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
        />
      </label>

      <label className="field-input">
        <span>New password again</span>
        <input
          type="password"
          value={again}
          autoComplete="new-password"
          onChange={(e) => setAgain(e.target.value)}
        />
      </label>

      {tooShort && <div className="form-error" style={{ marginTop: 12 }}>At least 8 characters.</div>}
      {mismatch && <div className="form-error" style={{ marginTop: 12 }}>The two do not match.</div>}
      {notice && <div className="form-notice" style={{ marginTop: 12 }}>{notice}</div>}
      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}

      <div className="form-actions" style={{ marginTop: 14 }}>
        <button
          className="primary"
          disabled={busy || !current || next.length < 8 || next !== again}
          onClick={save}
        >
          {busy ? "Saving…" : "Change password"}
        </button>
      </div>
    </>
  );
}
