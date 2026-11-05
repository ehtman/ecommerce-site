import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { authService } from "@/services/auth.service";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const result = await authService.getProfile();
      setUser(result.user ?? null);
      return result.user ?? null;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    authService.getProfile()
      .then((result) => { if (active) setUser(result.user ?? null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const login = async (payload) => {
    const result = await authService.login(payload);
    setUser(result.user ?? null);
    return result;
  };

  const register = async (payload) => {
    const result = await authService.register(payload);
    setUser(result.user ?? null);
    return result;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(() => ({
    user, loading, login, register, logout, refreshUser, setUser,
  }), [user, loading, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
