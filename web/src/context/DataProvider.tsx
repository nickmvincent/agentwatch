/**
 * DataProvider - Unified data loading with caching and deduplication
 *
 * Provides:
 * - Shared cached data across components
 * - Request deduplication for common endpoints
 * - Automatic cache invalidation
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode
} from "react";
import { requestCache } from "../lib/request-cache";
import { fetchConfig } from "../api/client";
import type { ConfigData } from "../api/client";

interface DataContextValue {
  /**
   * Fetch with caching and deduplication.
   */
  cachedFetch: <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ) => Promise<T>;

  /**
   * Invalidate specific cache keys.
   */
  invalidate: (...keys: string[]) => void;

  /**
   * Invalidate all cached data.
   */
  invalidateAll: () => void;

  /**
   * Fetch config with caching (commonly needed across components).
   */
  getConfig: () => Promise<ConfigData>;
}

const DataContext = createContext<DataContextValue | null>(null);

interface DataProviderProps {
  children: ReactNode;
}

// Cache keys for common endpoints
export const CACHE_KEYS = {
  CONFIG: "/api/config",
  PROJECTS: "/api/projects",
  CONVERSATIONS: "/api/conversations",
  ANALYTICS_COMBINED: "/api/analytics/combined"
} as const;

export function DataProvider({ children }: DataProviderProps) {
  // Keep a stable reference to avoid re-renders
  const cacheRef = useRef(requestCache);

  const cachedFetch = useCallback(
    <T,>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> => {
      return cacheRef.current.fetch(key, fetcher, ttl);
    },
    []
  );

  const invalidate = useCallback((...keys: string[]): void => {
    cacheRef.current.invalidate(...keys);
  }, []);

  const invalidateAll = useCallback((): void => {
    cacheRef.current.invalidateAll();
  }, []);

  // Commonly used: config with 60s cache
  const getConfig = useCallback((): Promise<ConfigData> => {
    return cacheRef.current.fetch(CACHE_KEYS.CONFIG, fetchConfig, 60000);
  }, []);

  const value = useMemo(
    () => ({
      cachedFetch,
      invalidate,
      invalidateAll,
      getConfig
    }),
    [cachedFetch, invalidate, invalidateAll, getConfig]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/**
 * Hook to access DataProvider context.
 */
export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}

/**
 * Hook to access DataProvider context, or null if not available.
 * Useful for components that may be rendered outside the provider.
 */
export function useDataOptional(): DataContextValue | null {
  return useContext(DataContext);
}
