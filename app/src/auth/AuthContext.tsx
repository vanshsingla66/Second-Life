import { useQueryClient } from "@tanstack/react-query";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, clearTokens, getRefreshToken, loadTokens, saveTokens, setSessionLostHandler } from "@/lib/api";
import type { TokenResponse, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const accept = useCallback(async (t: TokenResponse) => {
    await saveTokens(t);
    qc.clear();
    setUser(t.user);
  }, [qc]);

  // Restore the session on app start. The axios interceptor refreshes an expired access token for us.
  useEffect(() => {
    let alive = true;
    setSessionLostHandler(() => { qc.clear(); setUser(null); });
    (async () => {
      try {
        if (await loadTokens()) {
          // The server may be restarting or the phone may still be joining Wi-Fi: retry briefly before giving up.
          for (let attempt = 0; ; attempt++) {
            try {
              const me = await api.me();
              if (alive) setUser(me);
              break;
            } catch (e: any) {
              if (e?.response || attempt >= 4 || !alive) throw e;
              await new Promise((r) => setTimeout(r, 1500));
            }
          }
        }
      } catch (e: any) {
        // Only drop the session when the server rejected it; keep it if we're just offline.
        if (e?.response?.status === 401) await clearTokens();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; setSessionLostHandler(null); };
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    login: async (email, password) => accept(await api.login({ email: email.trim(), password })),
    register: async (name, email, password) => accept(await api.register({ name: name.trim(), email: email.trim(), password })),
    googleLogin: async (idToken) => accept(await api.google(idToken)),
    logout: async () => {
      const rt = getRefreshToken();
      try { if (rt) await api.logout(rt); } catch { /* best effort: we clear locally regardless */ }
      await clearTokens();
      qc.clear();
      setUser(null);
    },
  }), [user, loading, accept, qc]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
