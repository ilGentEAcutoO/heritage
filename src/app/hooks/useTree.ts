/**
 * useTree — fetches a tree by slug and adapts the API response to TreeData.
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient, adaptTree, type ApiError } from '@app/lib/api';
import type { TreeData } from '@app/lib/types';

interface UseTreeResult {
  data: TreeData | null;
  loading: boolean;
  error: ApiError | null;
  refetch: () => void;
}

export function useTree(slug: string | undefined): UseTreeResult {
  const [data, setData] = useState<TreeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!slug) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    apiClient
      .getTree(slug)
      .then((raw) => {
        if (!cancelled) {
          setData(adaptTree(raw));
        }
      })
      .catch((e: ApiError) => {
        if (!cancelled) {
          setError(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, tick]);

  return { data, loading, error, refetch };
}
