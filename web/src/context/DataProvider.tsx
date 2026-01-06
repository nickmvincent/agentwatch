/**
 * DataProvider - Unified data loading with caching and deduplication
 *
 * Provides:
 * - Shared cached data across components
 * - Request deduplication for common endpoints
 * - Stale-while-revalidate pattern for instant UI
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
import {
  fetchAnalyticsCombined,
  fetchConfig,
  fetchProjects
} from "../api/client";
import type { ConfigData } from "../api/client";
import type { AnalyticsCombinedResult, Project } from "../api/types";

// Cache TTLs
const TTL = {
  CONFIG: 60000, // 1 minute - settings change rarely
  PROJECTS: 60000, // 1 minute
  ANALYTICS: 30000 // 30 seconds - data changes more often
} as const;

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
   * Get cached data immediately (for stale-while-revalidate).
   * Returns undefined if not cached.
   */
  getCached: <T>(key: string, ttl?: number) => T | undefined;

  /**
   * Check if data is cached and fresh.
   */
  isCached: (key: string, ttl?: number) => boolean;

  /**
   * Invalidate specific cache keys.
   */
  invalidate: (...keys: string[]) => void;

  /**
   * Invalidate all cached data.
   */
  invalidateAll: () => void;

  // ===== Common data accessors =====

  /**
   * Fetch config with caching (60s TTL).
   */
  getConfig: () => Promise<ConfigData>;

  /**
   * Fetch projects with caching (60s TTL).
   */
  getProjects: () => Promise<Project[]>;

  /**
   * Fetch combined analytics with caching (30s TTL).
   */
  getAnalytics: (days?: number) => Promise<AnalyticsCombinedResult>;
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

  const getCached = useCallback(
    <T,>(key: string, ttl?: number): T | undefined => {
      return cacheRef.current.getCached<T>(key, ttl);
    },
    []
  );

  const isCached = useCallback((key: string, ttl?: number): boolean => {
    return cacheRef.current.isCached(key, ttl);
  }, []);

  const invalidate = useCallback((...keys: string[]): void => {
    cacheRef.current.invalidate(...keys);
  }, []);

  const invalidateAll = useCallback((): void => {
    cacheRef.current.invalidateAll();
  }, []);

  // ===== Common data accessors =====

  const getConfig = useCallback((): Promise<ConfigData> => {
    return cacheRef.current.fetch(CACHE_KEYS.CONFIG, fetchConfig, TTL.CONFIG);
  }, []);

  const getProjects = useCallback((): Promise<Project[]> => {
    return cacheRef.current.fetch(
      CACHE_KEYS.PROJECTS,
      fetchProjects,
      TTL.PROJECTS
    );
  }, []);

  const getAnalytics = useCallback(
    (days = 30): Promise<AnalyticsCombinedResult> => {
      const key = `${CACHE_KEYS.ANALYTICS_COMBINED}?days=${days}`;
      return cacheRef.current.fetch(
        key,
        () => fetchAnalyticsCombined(days),
        TTL.ANALYTICS
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      cachedFetch,
      getCached,
      isCached,
      invalidate,
      invalidateAll,
      getConfig,
      getProjects,
      getAnalytics
    }),
    [
      cachedFetch,
      getCached,
      isCached,
      invalidate,
      invalidateAll,
      getConfig,
      getProjects,
      getAnalytics
    ]
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
