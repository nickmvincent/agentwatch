/**
 * React context for providing the backend adapter to UI components.
 */

import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { AdapterContextValue, BackendAdapter } from "./types";

const AdapterContext = createContext<AdapterContextValue | null>(null);

export interface AdapterProviderProps {
  adapter: BackendAdapter;
  children: ReactNode;
}

/**
 * Provider component that makes the backend adapter available to all child components.
 */
export function AdapterProvider({ adapter, children }: AdapterProviderProps) {
  const value = useMemo<AdapterContextValue>(
    () => ({
      adapter,
      hasPersistentSettings: !!adapter.loadSettings,
      hasHuggingFaceUpload: !!adapter.uploadToHuggingFace,
      hasGistCreation: !!adapter.createGist,
      hasOAuth: !!adapter.getHFOAuthConfig,
      hasHistory: !!adapter.getHistory
    }),
    [adapter]
  );

  return (
    <AdapterContext.Provider value={value}>{children}</AdapterContext.Provider>
  );
}

/**
 * Hook to access the backend adapter from any component.
 * @throws Error if used outside of AdapterProvider
 */
export function useAdapter(): AdapterContextValue {
  const context = useContext(AdapterContext);
  if (!context) {
    throw new Error("useAdapter must be used within an AdapterProvider");
  }
  return context;
}

/**
 * Hook to access just the adapter instance.
 */
export function useBackend(): BackendAdapter {
  return useAdapter().adapter;
}
