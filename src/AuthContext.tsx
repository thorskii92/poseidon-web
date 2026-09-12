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
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
