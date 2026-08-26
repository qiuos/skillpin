import { useMemo, useState } from "react";

import type { LocalSourceSummary } from "@skillpin/core";

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  TextInput,
} from "../../components/controls.js";
import { ScanProgress } from "./scan-progress.js";
import { SourceHealth } from "./source-health.js";
import { useSources } from "./source-context.js";

export function SourceListPage({
  disabled,
  onAddSource,
  onEditSource,
}: {
  readonly disabled: boolean;
  readonly onAddSource: () => void;
  readonly onEditSource: (source: LocalSourceSummary) => void;
}) {
  const { error, remove, rescan, sources, update } = useSources();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [removalImpact, setRemovalImpact] = useState<{
    readonly managedLinkCount: number;
    readonly source: LocalSourceSummary;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const source of sources) {
      counts.set(
        source.source.displayName,
        (counts.get(source.source.displayName) ?? 0) + 1,
      );
    }
    return counts;
  }, [sources]);
  const visibleSources = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized === ""
      ? sources
      : sources.filter((source) =>
          `${source.source.displayName} ${source.source.path}`
            .toLocaleLowerCase()
            .includes(normalized),
        );
  }, [query, sources]);

  const runAction = async (sourceId: string, action: () => Promise<void>) => {
    setPending(sourceId);
    setActionError(null);
    try {
      await action();
    } catch (reason: unknown) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Unable to update this source.",
      );
    } finally {
      setPending(null);
    }
  };

  const requestRemoval = async (source: LocalSourceSummary) => {
    await runAction(source.source.id, async () => {
      const result = await remove(source.source.id);
      if (result.kind === "impact") {
        setRemovalImpact({
          managedLinkCount: result.impact.managedLinkCount,
          source,
        });
      }
    });
  };

  const confirmRemoval = async () => {
    if (removalImpact === null) {
      return;
    }
    const source = removalImpact.source;
    await runAction(source.source.id, async () => {
      await remove(source.source.id, true);
      setRemovalImpact(null);
    });
  };

  if (sources.length === 0) {
    return (
      <EmptyState
        action={
          <Button disabled={disabled} onClick={onAddSource} variant="primary">
            Add a source
          </Button>
        }
        body="Add a directory to inspect local skill metadata and scan its available skills."
        title="No source directories yet"
      />
    );
  }

  return (
    <section className="source-list-page">
      <div className="source-list-page__toolbar">
        <TextInput
          label="Search sources"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or path"
          value={query}
        />
        <Button disabled={disabled} onClick={onAddSource} variant="primary">
          Add source
        </Button>
      </div>
      {error === null && actionError === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {actionError ?? error?.message}
        </p>
      )}
      <div className="source-list" role="list">
        {visibleSources.length === 0 ? (
          <p className="muted-copy">No sources match this search.</p>
        ) : (
          visibleSources.map((source) => {
            const isPending = pending === source.source.id;
            const duplicateName =
              (nameCounts.get(source.source.displayName) ?? 0) > 1;
            return (
              <article
                className="source-row"
                key={source.source.id}
                role="listitem"
              >
                <div className="source-row__identity">
                  <div className="source-row__name">
                    <h2>{source.source.displayName}</h2>
                    <SourceHealth source={source} />
                    {duplicateName ? (
                      <Badge tone="warning">Duplicate name</Badge>
                    ) : null}
                  </div>
                  <code title={source.source.path}>{source.source.path}</code>
                  <ScanProgress pending={isPending} source={source} />
                </div>
                <div className="source-row__actions">
                  <Button
                    disabled={disabled || isPending}
                    onClick={() => onEditSource(source)}
                    variant="tertiary"
                  >
                    Edit
                  </Button>
                  <Button
                    disabled={disabled || isPending}
                    onClick={() =>
                      void runAction(source.source.id, async () => {
                        await update(source.source.id, {
                          displayName: source.source.displayName,
                          enabled: !source.source.enabled,
                          path: source.source.path,
                        });
                      })
                    }
                    variant="tertiary"
                  >
                    {source.source.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    disabled={disabled || isPending}
                    onClick={() =>
                      void runAction(source.source.id, async () =>
                        rescan(source.source.id).then(() => undefined),
                      )
                    }
                    variant="secondary"
                  >
                    Rescan
                  </Button>
                  <Button
                    disabled={disabled || isPending}
                    onClick={() => void requestRemoval(source)}
                    variant="danger"
                  >
                    Remove
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
      <Dialog
        description="Removing a source only removes it from SkillPin configuration and this session's scan state. Your source directory, project links, and manifest stay unchanged."
        onClose={() => setRemovalImpact(null)}
        open={removalImpact !== null}
        title="Remove source with project links?"
      >
        <div className="removal-impact">
          <p>
            <strong>{removalImpact?.managedLinkCount ?? 0}</strong> managed
            project link
            {(removalImpact?.managedLinkCount ?? 0) === 1
              ? " still refers"
              : "s still refer"}{" "}
            to this source.
          </p>
          <p>Those links remain in place and may need attention later.</p>
        </div>
        <div className="dialog__actions">
          <Button onClick={() => setRemovalImpact(null)} variant="secondary">
            Cancel
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void confirmRemoval()}
            variant="danger"
          >
            Remove source only
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
