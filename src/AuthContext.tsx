import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SIGNED_OUT_EVENT } from "./api";

type User = {
  id: number;
  username: string;
  fullName: string;
  position: string;
  role: string | null;
  roleId: number | null;
  typeId: number | null;
  /** Page and capability keys this user's role grants — see permissions.ts
   *  on the API side. Empty until a role has been given any at all. */
  permissions: string[];
  /** Set by an admin password reset — the app blocks on ForcedPasswordChange
   *  until this clears, which /api/me/password does on any successful change. */
  mustChangePassword: boolean;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
  /** Merge a local change (profile edit, password change clearing the
   *  forced-change flag) without a round trip back to /api/auth/me. */
  patchUser: (patch: Partial<User>) => void;
  /** /api/avatar/:id is a stable URL, so the browser would keep showing a
   *  stale cached image after an upload/delete without a cache-busting
   *  query param — bump this and rebuild the <img> src with it. */
  avatarVersion: number;
  bumpAvatarVersion: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setUser(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Any API call that comes back 401 raises this, so an expired session
  // drops straight to the login screen from wherever the user was.
  useEffect(() => {
    function handleSignedOut() {
      setUser(null);
      queryClient.clear();
    }

    window.addEventListener(SIGNED_OUT_EVENT, handleSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, handleSignedOut);
  }, [queryClient]);

  // Deliberately a plain fetch: a 401 here means "wrong password", not
  // "session expired", so it must not go through the signed-out handling.
  async function signIn(username: string, password: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    // An empty body means the API is not answering — say that, rather than
    // letting JSON.parse surface as "Unexpected end of JSON input".
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        body?.error ?? `Could not sign in (server returned ${response.status})`,
      );
    }
    if (!body) {
      throw new Error(
        "No response from the server. Check that the API is running on port 3001.",
      );
    }
    setUser(body);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    // Don't leave one user's accounts in the cache for the next sign-in.
    queryClient.clear();
  }

  function can(permission: string) {
    return user?.permissions?.includes(permission) ?? false;
  }

  function patchUser(patch: Partial<User>) {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function bumpAvatarVersion() {
    setAvatarVersion((v) => v + 1);
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signOut, can, patchUser, avatarVersion, bumpAvatarVersion }}
    >
      {children}
    </AuthContext.Provider>
  );
}
