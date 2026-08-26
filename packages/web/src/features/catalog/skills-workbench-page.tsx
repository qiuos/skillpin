import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  LocalCatalogCandidate,
  LocalCatalogCandidateDetail,
} from "@skillpin/core";

import {
  Badge,
  Button,
  EmptyState,
  TextInput,
} from "../../components/controls.js";
import { useCatalog } from "./catalog-context.js";

function safeHref(href: string | undefined): string | undefined {
  if (href === undefined) return undefined;
  if (
    href.startsWith("/") ||
    href.startsWith("./") ||
    href.startsWith("../") ||
    href.startsWith("#")
  ) {
    return href;
  }
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:"
      ? href
      : undefined;
  } catch {
    return undefined;
  }
}

const markdownComponents: Components = {
  a({ href, children }) {
    const safe = safeHref(href);
    if (safe === undefined) return <>{children}</>;
    const external = /^https?:\/\//u.test(safe);
    return (
      <a
        href={safe}
        {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
      >
        {children}
      </a>
    );
  },
  img() {
    return null;
  },
};

function candidateLabel(candidate: LocalCatalogCandidate): string {
  return `${candidate.source.displayName} · ${candidate.relativePath}`;
}

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export function SkillsWorkbenchPage() {
  const { error, groups, isLoading, loadCandidate, search } = useCatalog();
  const [query, setQuery] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<LocalCatalogCandidateDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    estimateSize: () => 82,
    getScrollElement: () => listRef.current,
    overscan: 8,
    useFlushSync: false,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 160);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  const selectedGroup = useMemo(
    () =>
      groups.find((group) => group.conflictKey === selectedGroupKey) ??
      groups[0] ??
      null,
    [groups, selectedGroupKey],
  );
  const selectedCandidate = useMemo(
    () =>
      selectedGroup?.candidates.find(
        (candidate) => candidate.id === selectedCandidateId,
      ) ??
      selectedGroup?.candidates[0] ??
      null,
    [selectedCandidateId, selectedGroup],
  );

  useEffect(() => {
    if (
      selectedGroup !== null &&
      selectedGroupKey !== selectedGroup.conflictKey
    ) {
      setSelectedGroupKey(selectedGroup.conflictKey);
    }
  }, [selectedGroup, selectedGroupKey]);

  useEffect(() => {
    if (selectedCandidate === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailError(null);
    void loadCandidate(selectedCandidate.id)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setDetailError(
            reason instanceof Error
              ? reason.message
              : "Unable to load this skill.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [loadCandidate, selectedCandidate]);

  const copy = (label: string, value: string) => {
    void copyText(value)
      .then(() => {
        setCopied(label);
        window.setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => setCopied("Copy unavailable"));
  };

  if (isLoading && groups.length === 0) {
    return (
      <EmptyState
        body="Reading the session-local catalog…"
        title="Loading skills"
      />
    );
  }
  if (error !== null && groups.length === 0) {
    return <EmptyState body={error.message} title="Unable to load skills" />;
  }
  if (!isLoading && groups.length === 0) {
    return (
      <EmptyState
        body="Rescan a source or adjust your search to discover local skills."
        title={query === "" ? "No discovered skills" : "No matching skills"}
      />
    );
  }

  return (
    <section aria-label="Skills workbench" className="skills-workbench">
      <div className="skills-workbench__toolbar">
        <div>
          <p className="eyebrow">Session catalog</p>
          <h1>Skills</h1>
        </div>
        <TextInput
          label="Search skills"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, summary, source, or content"
          type="search"
          value={query}
        />
      </div>
      {error === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {error.message}
        </p>
      )}
      <div className="skills-workbench__grid">
        <section
          className="skills-pane skills-pane--list"
          aria-label="Skill groups"
        >
          <div className="skills-pane__heading">
            <span>{groups.length} groups</span>
            <span>{isLoading ? "Updating…" : ""}</span>
          </div>
          <div className="skills-list" ref={listRef}>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((item) => {
                const group = groups[item.index]!;
                const active = group.conflictKey === selectedGroup?.conflictKey;
                return (
                  <button
                    className={`skill-list-row${active ? " skill-list-row--active" : ""}`}
                    key={group.conflictKey}
                    onClick={() => {
                      setSelectedGroupKey(group.conflictKey);
                      setSelectedCandidateId(group.candidates[0]?.id ?? null);
                    }}
                    style={{
                      height: `${item.size}px`,
                      transform: `translateY(${item.start}px)`,
                    }}
                    type="button"
                  >
                    <strong>{group.linkName}</strong>
                    <span>{group.candidates[0]?.summary}</span>
                    <small>
                      {group.candidates.length} candidate
                      {group.candidates.length === 1 ? "" : "s"}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        <section
          className="skills-pane skills-pane--candidates"
          aria-label="Source candidates"
        >
          <div className="skills-pane__heading">
            <span>Candidates</span>
          </div>
          <h2>{selectedGroup?.linkName}</h2>
          <p className="muted-copy">
            Compare local sources. This does not select or change project links.
          </p>
          <div className="candidate-list" role="list">
            {selectedGroup?.candidates.map((candidate) => (
              <button
                className={`candidate-row${candidate.id === selectedCandidate?.id ? " candidate-row--active" : ""}`}
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                role="listitem"
                type="button"
              >
                <strong>{candidate.displayName}</strong>
                <span>{candidateLabel(candidate)}</span>
                {candidate.parseWarning === null ? null : (
                  <Badge tone="warning">Parser note</Badge>
                )}
              </button>
            ))}
          </div>
        </section>
        <section
          className="skills-pane skills-pane--detail"
          aria-live="polite"
          aria-label="Skill detail"
        >
          {detailError !== null ? (
            <EmptyState body={detailError} title="Unable to read skill" />
          ) : detail === null ? (
            <EmptyState
              body="Choose a source candidate to read its Skill.md content."
              title="No skill selected"
            />
          ) : (
            <>
              <div className="skills-pane__heading">
                <span>Read-only detail</span>
                {copied === null ? null : <span role="status">{copied}</span>}
              </div>
              <h2>{detail.displayName}</h2>
              <p className="muted-copy">{detail.summary}</p>
              <div className="path-actions">
                <Button
                  onClick={() => copy("Source path copied", detail.source.path)}
                  variant="tertiary"
                >
                  Copy source path
                </Button>
                <Button
                  onClick={() =>
                    copy("Skill path copied", detail.skillDirectory)
                  }
                  variant="tertiary"
                >
                  Copy skill path
                </Button>
                <Button
                  onClick={() =>
                    copy("SKILL.md path copied", detail.skillFilePath)
                  }
                  variant="tertiary"
                >
                  Copy SKILL.md path
                </Button>
              </div>
              {detail.parseWarning === null ? null : (
                <p className="form-message form-message--error">
                  {detail.parseWarning.message}
                </p>
              )}
              <article className="markdown-detail">
                <ReactMarkdown
                  components={markdownComponents}
                  remarkPlugins={[remarkGfm]}
                >
                  {detail.markdownBody}
                </ReactMarkdown>
              </article>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
