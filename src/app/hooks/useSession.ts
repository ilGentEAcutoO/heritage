/**
 * useSession — singleton session cache via module-level store + subscriber pattern.
 *
 * Calls GET /api/auth/me once on first mount. Subsequent components share the
 * cached result without re-fetching. login() and logout() update the cache and
 * notify all subscribers.
 */

import { useState, useEffect } from 'react';
import { apiClient } from '@app/lib/api';
import type { ApiError } from '@app/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
}

interface SessionState {
  user: SessionUser | null;
  loading: boolean;
  error: ApiError | null;
}

export interface UseSessionResult extends SessionState {
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level singleton store
// ---------------------------------------------------------------------------

type Listener = () => void;

let store: SessionState = { user: null, loading: true, error: null };
let initialized = false;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

function setStore(partial: Partial<SessionState>) {
  store = { ...store, ...partial };
  notify();
}

async function fetchMe(): Promise<void> {
  setStore({ loading: true, error: null });
  try {
    const data = await apiClient.me();
    setStore({ user: data.user as SessionUser, loading: false, error: null });
  } catch (e) {
    const err = e as ApiError;
    // 401 → not logged in; not an error state, just no user
    if (err.status === 401) {
      setStore({ user: null, loading: false, error: null });
    } else {
      setStore({ user: null, loading: false, error: err });
    }
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSession(): UseSessionResult {
  const [, rerender] = useState(0);

  useEffect(() => {
    const listener: Listener = () => rerender((n) => n + 1);
    listeners.add(listener);

    // Bootstrap on first subscriber
    if (!initialized) {
      initialized = true;
      fetchMe();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const refresh = async () => {
    await fetchMe();
  };

  const login = async (email: string, password: string): Promise<void> => {
    const data = await apiClient.login({ email, password });
    setStore({ user: data.user as SessionUser, loading: false, error: null });
  };

  const logout = async (): Promise<void> => {
    await apiClient.logout();
    setStore({ user: null, loading: false, error: null });
  };

  return { ...store, refresh, login, logout };
}
