import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  LocalCatalogCandidate,
  LocalCatalogCandidateDetail,
  LocalProjectPlanResponse,
  LocalProjectSelectionInput,
  LocalProjectSnapshot,
} from "@skillpin/core";

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  TextInput,
} from "../../components/controls.js";
import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient } from "../session/session-context.js";
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

function projectErrorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof LocalApiClientError)) {
    return reason instanceof Error ? reason.message : fallback;
  }
  if (reason.recoveryAction === "manual-recovery") {
    return `${reason.message} Manual recovery review is required before another apply.`;
  }
  if (reason.recoveryAction === "retry") {
    return `${reason.message} Review the latest project state, then try again.`;
  }
  return reason.message;
}

export function SkillsWorkbenchPage() {
  const client = useLocalApiClient();
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
  const [project, setProject] = useState<LocalProjectSnapshot | null>(null);
  const [staged, setStaged] = useState<Record<string, string | null>>({});
  const [plan, setPlan] = useState<LocalProjectPlanResponse | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    void client
      .project()
      .then((snapshot) => {
        if (!cancelled) {
          setProject(snapshot);
          setProjectError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setProjectError(
            reason instanceof Error
              ? reason.message
              : "Unable to inspect project.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

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

  const selections = (): readonly LocalProjectSelectionInput[] =>
    Object.entries(staged).map(([linkName, candidateId]) => ({
      candidateId,
      linkName,
    }));

  const stageCandidate = (candidate: LocalCatalogCandidate) => {
    setStaged((current) => ({
      ...current,
      [candidate.linkName]: candidate.id,
    }));
    setPlan(null);
  };

  const stageRemoval = (linkName: string) => {
    setStaged((current) => ({ ...current, [linkName]: null }));
    setPlan(null);
  };

  const unstage = (linkName: string) => {
    setStaged((current) => {
      const remaining = { ...current };
      delete remaining[linkName];
      return remaining;
    });
    setPlan(null);
  };

  const reviewChanges = () => {
    setProjectError(null);
    void client
      .projectPlan(selections())
      .then((next) => {
        setPlan(next);
        setReviewOpen(true);
      })
      .catch((reason: unknown) =>
        setProjectError(projectErrorMessage(reason, "Unable to plan changes.")),
      );
  };

  const applyChanges = () => {
    if (plan === null) return;
    setApplying(true);
    setProjectError(null);
    void client
      .applyProjectChanges({
        baseRevision: plan.baseRevision,
        requestId: crypto.randomUUID(),
        selections: selections(),
      })
      .then((result) => {
        setProject(result.snapshot);
        setStaged({});
        setPlan(null);
        setConfirmOpen(false);
        setReviewOpen(false);
      })
      .catch((reason: unknown) => {
        setProjectError(
          projectErrorMessage(reason, "Unable to apply changes."),
        );
        void client
          .project()
          .then((snapshot) => setProject(snapshot))
          .catch(() => undefined);
      })
      .finally(() => setApplying(false));
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
            Compare local sources. Stage a candidate explicitly before it can
            change project links.
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
                {staged[candidate.linkName] === candidate.id ? (
                  <Badge tone="success">Staged</Badge>
                ) : null}
              </button>
            ))}
          </div>
          {selectedCandidate === null ? null : (
            <div className="candidate-actions">
              <Button
                onClick={() =>
                  staged[selectedCandidate.linkName] === selectedCandidate.id
                    ? unstage(selectedCandidate.linkName)
                    : stageCandidate(selectedCandidate)
                }
                variant="secondary"
              >
                {staged[selectedCandidate.linkName] === selectedCandidate.id
                  ? "Unstage project change"
                  : "Stage for project"}
              </Button>
            </div>
          )}
          {project?.links.some((link) => link.state === "managed") ? (
            <div className="project-links">
              <p className="skills-pane__heading">Current project links</p>
              {project.links
                .filter((link) => link.state === "managed")
                .map((link) => (
                  <div className="project-link-row" key={link.linkName}>
                    <span>{link.linkName}</span>
                    {Object.hasOwn(staged, link.linkName) ? (
                      <Button
                        onClick={() => unstage(link.linkName)}
                        variant="tertiary"
                      >
                        Unstage
                      </Button>
                    ) : (
                      <Button
                        onClick={() => stageRemoval(link.linkName)}
                        variant="tertiary"
                      >
                        Stage removal
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          ) : null}
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
      {projectError === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {projectError}
        </p>
      )}
      {project?.recoveryDiagnostics.length ? (
        <p className="form-message form-message--error" role="alert">
          Manual recovery review is required for{" "}
          {project.recoveryDiagnostics.length} transaction artifact(s).
        </p>
      ) : null}
      {Object.keys(staged).length === 0 ? null : (
        <div className="change-bar" role="status">
          <span>
            {Object.keys(staged).length} staged project change
            {Object.keys(staged).length === 1 ? "" : "s"}
          </span>
          <Button onClick={reviewChanges}>Review changes</Button>
        </div>
      )}
      <Dialog
        description="Review the server-computed project plan before any filesystem change occurs."
        onClose={() => setReviewOpen(false)}
        open={reviewOpen}
        title="Review project changes"
      >
        <div className="project-review">
          {plan?.blockers.length ? (
            <p className="form-message form-message--error">
              {plan.blockers.map((blocker) => blocker.message).join(" ")}
            </p>
          ) : (
            <p>
              {plan?.changes.length ?? 0} change(s) will be applied to this
              project.
            </p>
          )}
          <ul>
            {plan?.changes.map((change) => (
              <li key={change.linkName}>
                {change.kind}: {change.linkName}
              </li>
            ))}
          </ul>
          <div className="dialog__actions">
            <Button onClick={() => setReviewOpen(false)} variant="secondary">
              Keep editing
            </Button>
            <Button
              disabled={plan === null || plan.blockers.length > 0}
              onClick={() => setConfirmOpen(true)}
            >
              Apply changes
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        description={`Apply ${plan?.changes.length ?? 0} reviewed change(s) to the active project. This uses SkillPin's transactional link workflow.`}
        onClose={() => setConfirmOpen(false)}
        open={confirmOpen}
        title="Confirm project changes"
      >
        <div className="dialog__actions">
          <Button
            disabled={applying}
            onClick={() => setConfirmOpen(false)}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={applying} onClick={applyChanges}>
            {applying ? "Applying…" : "Apply"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
