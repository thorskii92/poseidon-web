import { useState } from "react";

/**
 * Tries the picture at /api/avatar/:userId; falls back to initials-on-a-
 * circle if there isn't one (a 404) or it fails to load. `version` busts the
 * browser's cache after an upload/delete — see AuthContext's avatarVersion.
 */
export default function Avatar({
  userId, name, version, size = "sidebar",
}: { userId: number; name: string; version: number; size?: "sidebar" | "large" }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (failed || !userId) {
    return <div className={`avatar-circle size-${size}`}>{initials || "?"}</div>;
  }

  return (
    <img
      className={`avatar-circle size-${size}`}
      src={`/api/avatar/${userId}?v=${version}`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
