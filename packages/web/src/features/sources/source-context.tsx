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
  LocalSourceInput,
  LocalSourceRemoveResult,
  LocalSourceSummary,
} from "@skillpin/core";

import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient, useSession } from "../session/session-context.js";

interface SourceContextValue {
  readonly add: (input: LocalSourceInput) => Promise<LocalSourceSummary>;
  readonly error: LocalApiClientError | null;
  readonly isLoading: boolean;
  readonly refresh: () => Promise<void>;
  readonly remove: (
    sourceId: string,
    confirmProjectImpact?: boolean,
  ) => Promise<LocalSourceRemoveResult>;
  readonly rescan: (sourceId: string) => Promise<LocalSourceSummary>;
  readonly sources: readonly LocalSourceSummary[];
  readonly update: (
    sourceId: string,
    input: LocalSourceInput,
  ) => Promise<LocalSourceSummary>;
}

const SourceContext = createContext<SourceContextValue | null>(null);

function asClientError(reason: unknown): LocalApiClientError {
  return reason instanceof LocalApiClientError
    ? reason
    : new LocalApiClientError({
        code: "LOCAL_API_UNEXPECTED_ERROR",
        message: "无法更新本地技能源。",
        recoveryAction: "retry",
        retryable: true,
      });
}

export function SourceProvider({ children }: PropsWithChildren) {
  const client = useLocalApiClient();
  const { isReadOnly, session } = useSession();
  const [sources, setSources] = useState<readonly LocalSourceSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<LocalApiClientError | null>(null);

  const refresh = useCallback(async () => {
    if (session === null) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await client.sources();
      setSources(response.sources);
      setError(null);
    } catch (reason: unknown) {
      setError(asClientError(reason));
    } finally {
      setIsLoading(false);
    }
  }, [client, session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ensureWritable = useCallback(() => {
    if (isReadOnly) {
      throw new LocalApiClientError({
        code: "SESSION_READ_ONLY",
        message: "更改技能源前请先重新连接安全的本地会话。",
        recoveryAction: "retry",
        retryable: true,
      });
    }
  }, [isReadOnly]);

  const add = useCallback(
    async (input: LocalSourceInput) => {
      ensureWritable();
      try {
        const added = await client.addSource(input);
        setSources((current) => [...current, added]);
        setError(null);
        return added;
      } catch (reason: unknown) {
        const nextError = asClientError(reason);
        setError(nextError);
        throw nextError;
      }
    },
    [client, ensureWritable],
  );

  const update = useCallback(
    async (sourceId: string, input: LocalSourceInput) => {
      ensureWritable();
      try {
        const updated = await client.updateSource(sourceId, input);
        setSources((current) =>
          current.map((source) =>
            source.source.id === sourceId ? updated : source,
          ),
        );
        setError(null);
        return updated;
      } catch (reason: unknown) {
        const nextError = asClientError(reason);
        setError(nextError);
        throw nextError;
      }
    },
    [client, ensureWritable],
  );

  const rescan = useCallback(
    async (sourceId: string) => {
      ensureWritable();
      try {
        const rescanned = await client.rescanSource(sourceId);
        setSources((current) =>
          current.map((source) =>
            source.source.id === sourceId ? rescanned : source,
          ),
        );
        setError(null);
        return rescanned;
      } catch (reason: unknown) {
        const nextError = asClientError(reason);
        setError(nextError);
        throw nextError;
      }
    },
    [client, ensureWritable],
  );

  const remove = useCallback(
    async (sourceId: string, confirmProjectImpact = false) => {
      ensureWritable();
      try {
        const result = await client.removeSource(
          sourceId,
          confirmProjectImpact,
        );
        if (result.kind === "removed") {
          setSources((current) =>
            current.filter((source) => source.source.id !== sourceId),
          );
        }
        setError(null);
        return result;
      } catch (reason: unknown) {
        const nextError = asClientError(reason);
        setError(nextError);
        throw nextError;
      }
    },
    [client, ensureWritable],
  );

  const value = useMemo<SourceContextValue>(
    () => ({
      add,
      error,
      isLoading,
      refresh,
      remove,
      rescan,
      sources,
      update,
    }),
    [add, error, isLoading, refresh, remove, rescan, sources, update],
  );

  return (
    <SourceContext.Provider value={value}>{children}</SourceContext.Provider>
  );
}

export function useSources(): SourceContextValue {
  const value = useContext(SourceContext);
  if (value === null) {
    throw new Error("useSources must be used inside SourceProvider.");
  }
  return value;
}
