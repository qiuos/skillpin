import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import type {
  LocalCatalogCandidateDetail,
  LocalCatalogGroup,
} from "@skillpin/core";

import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient, useSession } from "../session/session-context.js";
import { useSources } from "../sources/source-context.js";

interface CatalogContextValue {
  readonly error: LocalApiClientError | null;
  readonly groups: readonly LocalCatalogGroup[];
  readonly isLoading: boolean;
  readonly loadCandidate: (
    candidateId: string,
  ) => Promise<LocalCatalogCandidateDetail>;
  readonly search: (query: string) => Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

function asClientError(reason: unknown): LocalApiClientError {
  return reason instanceof LocalApiClientError
    ? reason
    : new LocalApiClientError({
        code: "LOCAL_API_UNEXPECTED_ERROR",
        message: "无法加载本地技能目录。",
        recoveryAction: "retry",
        retryable: true,
      });
}

export function CatalogProvider({ children }: PropsWithChildren) {
  const client = useLocalApiClient();
  const { session } = useSession();
  const { sources } = useSources();
  const [groups, setGroups] = useState<readonly LocalCatalogGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LocalApiClientError | null>(null);

  const search = useCallback(
    async (query: string) => {
      if (session === null) return;
      setIsLoading(true);
      try {
        const response = await client.catalog(query);
        setGroups(response.groups);
        setError(null);
      } catch (reason: unknown) {
        setError(asClientError(reason));
      } finally {
        setIsLoading(false);
      }
    },
    [client, session],
  );

  useEffect(() => {
    void search("");
  }, [search, sources]);

  const loadCandidate = useCallback(
    async (candidateId: string) => {
      try {
        const detail = await client.catalogCandidate(candidateId);
        setError(null);
        return detail;
      } catch (reason: unknown) {
        const nextError = asClientError(reason);
        setError(nextError);
        throw nextError;
      }
    },
    [client],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({ error, groups, isLoading, loadCandidate, search }),
    [error, groups, isLoading, loadCandidate, search],
  );
  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (value === null) {
    throw new Error("useCatalog must be used inside CatalogProvider.");
  }
  return value;
}
