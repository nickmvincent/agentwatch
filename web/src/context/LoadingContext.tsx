import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

interface LoadingContextValue {
  loadingTabs: string[];
  setLoading: (tab: string, loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextValue>({
  loadingTabs: [],
  setLoading: () => {}
});

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [loadingSet, setLoadingSet] = useState<Set<string>>(new Set());

  const setLoading = useCallback((tab: string, loading: boolean) => {
    setLoadingSet((prev) => {
      const next = new Set(prev);
      if (loading) {
        next.add(tab);
      } else {
        next.delete(tab);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      loadingTabs: [...loadingSet],
      setLoading
    }),
    [loadingSet, setLoading]
  );

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
}

export function useLoading() {
  return useContext(LoadingContext);
}
