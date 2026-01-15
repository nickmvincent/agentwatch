import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  deleteConversationMetadata as apiDeleteConversationMetadata,
  updateConversationMetadata as apiUpdateConversationMetadata,
  fetchAllConversationMetadata,
  fetchConversations,
  fetchEnrichments,
  setSessionAnnotation
} from "../api/client";
import { useData } from "./DataProvider";
import type {
  Conversation,
  ConversationMetadata,
  ConversationStats,
  EnrichmentListItem,
  FeedbackType
} from "../api/types";

export interface ConversationFilter {
  taskType?: string;
  qualityRange?: string;
  matchType?: string;
  feedback?: string;
}

interface ConversationContextValue {
  // State
  conversations: Conversation[];
  conversationStats: ConversationStats | null;
  conversationNames: Record<string, ConversationMetadata>;
  enrichments: Map<string, EnrichmentListItem>;
  loading: boolean;
  error: string | null;
  transcriptDays: number;

  // Actions
  refreshConversations: () => Promise<void>;
  updateConversationName: (id: string, name: string | null) => Promise<void>;
  setAnnotation: (
    id: string,
    feedback: FeedbackType,
    notes?: string
  ) => Promise<void>;

  // Lookup helpers
  getConversationById: (id: string) => Conversation | undefined;
  getLinkedConversation: (
    cwd: string,
    startTime?: number
  ) => Conversation | undefined;
  getConversationName: (id: string) => string | undefined;
  getEnrichment: (id: string) => EnrichmentListItem | undefined;

  // Navigation (for cross-tab linking)
  selectedConversationId: string | null;
  setSelectedConversationId: (id: string | null) => void;

  // Return navigation (for back button from detail views)
  returnTo: { tab: string } | null;
  setReturnTo: (returnTo: { tab: string } | null) => void;

  // Filter state (for analytics click-through)
  filter: ConversationFilter | null;
  setFilter: (filter: ConversationFilter | null) => void;
}

const ConversationContext = createContext<ConversationContextValue | null>(
  null
);

export function useConversations() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error(
      "useConversations must be used within a ConversationProvider"
    );
  }
  return context;
}

// Optional hook that returns null instead of throwing if outside provider
export function useConversationsOptional() {
  return useContext(ConversationContext);
}

interface ConversationProviderProps {
  children: ReactNode;
}

export function ConversationProvider({ children }: ConversationProviderProps) {
  const { getConfig } = useData();

  // Core state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationStats, setConversationStats] =
    useState<ConversationStats | null>(null);
  const [conversationNames, setConversationNames] = useState<
    Record<string, ConversationMetadata>
  >({});
  const [enrichmentsList, setEnrichmentsList] = useState<EnrichmentListItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptDays, setTranscriptDays] = useState(30);

  // Navigation state
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  // Return navigation (for back button from detail views)
  const [returnTo, setReturnTo] = useState<{ tab: string } | null>(null);

  // Filter state (for analytics click-through)
  const [filter, setFilter] = useState<ConversationFilter | null>(null);

  // Convert enrichments list to Map for O(1) lookup
  const enrichments = useMemo(() => {
    const map = new Map<string, EnrichmentListItem>();
    for (const e of enrichmentsList) {
      // Index by all possible IDs
      if (e.session_ref.correlationId) {
        map.set(e.session_ref.correlationId, e);
      }
      if (e.session_ref.hookSessionId) {
        map.set(e.session_ref.hookSessionId, e);
      }
      if (e.session_ref.transcriptId) {
        map.set(e.session_ref.transcriptId, e);
      }
    }
    return map;
  }, [enrichmentsList]);

  // Load initial data
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        setError(null);

        // Load config first to get transcript_days (cached via DataProvider)
        let days = 30;
        try {
          const config = await getConfig();
          days = config.conversations?.transcript_days ?? 30;
        } catch (configError) {
          console.warn(
            "Failed to load config, using default transcript days:",
            configError
          );
        }
        setTranscriptDays(days);

        // Load data in parallel
        const [conversationsResult, namesResult, enrichmentsResult] =
          await Promise.all([
            fetchConversations({ limit: 300, days }),
            fetchAllConversationMetadata(),
            fetchEnrichments()
          ]);

        setConversations(conversationsResult.sessions);
        setConversationStats(conversationsResult.stats);
        setConversationNames(namesResult);
        setEnrichmentsList(enrichmentsResult.sessions);
      } catch (e) {
        console.error("Failed to load conversations:", e);
        setError(
          e instanceof Error ? e.message : "Failed to load conversations"
        );
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [getConfig]);

  // Refresh conversations
  const refreshConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use cached config (refreshes within TTL)
      let days = 30;
      try {
        const config = await getConfig();
        days = config.conversations?.transcript_days ?? 30;
      } catch (configError) {
        console.warn(
          "Failed to load config, using default transcript days:",
          configError
        );
      }
      setTranscriptDays(days);

      const [conversationsResult, namesResult, enrichmentsResult] =
        await Promise.all([
          fetchConversations({ limit: 300, days }),
          fetchAllConversationMetadata(),
          fetchEnrichments()
        ]);

      setConversations(conversationsResult.sessions);
      setConversationStats(conversationsResult.stats);
      setConversationNames(namesResult);
      setEnrichmentsList(enrichmentsResult.sessions);
    } catch (e) {
      console.error("Failed to refresh conversations:", e);
      setError(e instanceof Error ? e.message : "Failed to refresh");
    } finally {
      setLoading(false);
    }
  }, [getConfig]);

  // Update conversation name
  const updateConversationName = useCallback(
    async (id: string, name: string | null) => {
      try {
        if (name === null || name.trim() === "") {
          await apiDeleteConversationMetadata(id);
          setConversationNames((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        } else {
          const result = await apiUpdateConversationMetadata(id, {
            customName: name.trim()
          });
          setConversationNames((prev) => ({
            ...prev,
            [id]: result
          }));
        }
      } catch (e) {
        console.error("Failed to update conversation name:", e);
        throw e;
      }
    },
    []
  );

  // Set annotation (feedback)
  const setAnnotation = useCallback(
    async (id: string, feedback: FeedbackType, notes?: string) => {
      try {
        await setSessionAnnotation(id, feedback, { notes });
        // Refresh enrichments to get updated annotation
        const enrichmentsResult = await fetchEnrichments();
        setEnrichmentsList(enrichmentsResult.sessions);
      } catch (e) {
        console.error("Failed to set annotation:", e);
        throw e;
      }
    },
    []
  );

  // Lookup helpers
  const getConversationById = useCallback(
    (id: string) => {
      return conversations.find((c) => c.correlation_id === id);
    },
    [conversations]
  );

  const getLinkedConversation = useCallback(
    (cwd: string, startTime?: number) => {
      // Find conversation by cwd match
      // If startTime provided, find the one closest to that time
      const matches = conversations.filter((c) => c.cwd === cwd);
      if (matches.length === 0) return undefined;
      if (matches.length === 1) return matches[0];

      if (startTime) {
        // Find the one with closest start time
        let closest = matches[0];
        let closestDiff = Math.abs(closest.start_time - startTime);
        for (const m of matches) {
          const diff = Math.abs(m.start_time - startTime);
          if (diff < closestDiff) {
            closest = m;
            closestDiff = diff;
          }
        }
        return closest;
      }

      // Return most recent
      return matches.sort((a, b) => b.start_time - a.start_time)[0];
    },
    [conversations]
  );

  const getConversationName = useCallback(
    (id: string) => {
      return conversationNames[id]?.customName;
    },
    [conversationNames]
  );

  const getEnrichment = useCallback(
    (id: string) => {
      return enrichments.get(id);
    },
    [enrichments]
  );

  const value: ConversationContextValue = {
    // State
    conversations,
    conversationStats,
    conversationNames,
    enrichments,
    loading,
    error,
    transcriptDays,

    // Actions
    refreshConversations,
    updateConversationName,
    setAnnotation,

    // Lookup helpers
    getConversationById,
    getLinkedConversation,
    getConversationName,
    getEnrichment,

    // Navigation
    selectedConversationId,
    setSelectedConversationId,

    // Return navigation
    returnTo,
    setReturnTo,

    // Filter
    filter,
    setFilter
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
}
