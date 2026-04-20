/**
 * useSession — fetches /api/auth/me once on mount.
 * Returns user state + login/logout helpers.
 */

import { useState, useEffect } from 'react';
import { apiClient, type SessionUser, type ApiError } from '@app/lib/api';

interface UseSessionResult {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useSession(): UseSessionResult {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .me()
      .then((res) => {
        setUser(res?.user ?? null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string) => {
    await apiClient.requestMagicLink(email);
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
  };

  return { user, loading, login, logout };
}
