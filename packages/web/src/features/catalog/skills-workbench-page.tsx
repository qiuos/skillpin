import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  LocalCatalogCandidate,
  LocalCatalogCandidateDetail,
  LocalCatalogGroup,
  LocalProjectSelectionInput,
  LocalProjectSnapshot,
} from "@skillpin/core";

import {
  Badge,
  Button,
  EmptyState,
  TextInput,
} from "../../components/controls.js";
import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient } from "../session/session-context.js";
import { useSources } from "../sources/source-context.js";
import { useCatalog } from "./catalog-context.js";

type StatusFilter = "all" | "enabled" | "disabled" | "abnormal";

const statusFilterOptions: readonly {
  readonly label: string;
  readonly value: StatusFilter;
}[] = [
  { label: "全部状态", value: "all" },
  { label: "已启用", value: "enabled" },
  { label: "未启用", value: "disabled" },
  { label: "异常", value: "abnormal" },
];

function statusFilterLabel(value: StatusFilter): string {
  return (
    statusFilterOptions.find((option) => option.value === value)?.label ??
    "全部状态"
  );
}

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

function projectErrorMessage(reason: unknown, fallback: string): string {
  if (!(reason instanceof LocalApiClientError)) {
    return reason instanceof Error ? reason.message : fallback;
  }
  if (reason.recoveryAction === "manual-recovery") {
    return `${reason.message} 再次应用前需要先完成手动恢复检查。`;
  }
  if (reason.recoveryAction === "retry") {
    return `${reason.message} 请查看最新项目状态后再试。`;
  }
  return reason.message;
}

function groupIsEnabled(
  group: LocalCatalogGroup,
  project: LocalProjectSnapshot | null,
): boolean {
  return (
    project?.links.some(
      (link) => link.linkName === group.linkName && link.state === "managed",
    ) ?? false
  );
}

function groupIsAbnormal(group: LocalCatalogGroup): boolean {
  return group.candidates.some(
    (candidate) =>
      candidate.parseWarning !== null || candidate.source.enabled === false,
  );
}

export function SkillsWorkbenchPage() {
  const client = useLocalApiClient();
  const { sources } = useSources();
  const { error, groups, isLoading, loadCandidate, search } = useCatalog();
  const [query, setQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] =
    useState<ReadonlySet<string> | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<LocalCatalogCandidateDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [project, setProject] = useState<LocalProjectSnapshot | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [changingLinkName, setChangingLinkName] = useState<string | null>(null);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 160);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!statusFilterOpen) {
      return;
    }
    const closeWhenOutside = (event: PointerEvent) => {
      if (!statusFilterRef.current?.contains(event.target as Node)) {
        setStatusFilterOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStatusFilterOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [statusFilterOpen]);

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
            reason instanceof Error ? reason.message : "无法检查项目。",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const activeSourceIds = selectedSourceIds;
  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      if (activeSourceIds !== null) {
        const matchesSource = group.candidates.some((candidate) =>
          activeSourceIds.has(candidate.source.id),
        );
        if (!matchesSource) return false;
      }
      const enabled = groupIsEnabled(group, project);
      const abnormal = groupIsAbnormal(group);
      switch (statusFilter) {
        case "enabled":
          return enabled;
        case "disabled":
          return !enabled;
        case "abnormal":
          return abnormal;
        default:
          return true;
      }
    });
  }, [activeSourceIds, groups, project, statusFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredGroups.length,
    estimateSize: () => 252,
    getScrollElement: () => listElement,
    overscan: 8,
    useFlushSync: false,
  });

  const selectedGroup = useMemo(
    () =>
      filteredGroups.find((group) => group.conflictKey === selectedGroupKey) ??
      filteredGroups[0] ??
      null,
    [filteredGroups, selectedGroupKey],
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
            reason instanceof Error ? reason.message : "无法加载该技能。",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [loadCandidate, selectedCandidate]);

  const applyDirectChange = (group: LocalCatalogGroup, enabled: boolean) => {
    const candidate =
      group.conflictKey === selectedGroup?.conflictKey
        ? (selectedCandidate ?? group.candidates[0])
        : group.candidates[0];
    if (!enabled && candidate === undefined) {
      setProjectError("无法启用：没有可用的技能来源。");
      return;
    }

    const selections: readonly LocalProjectSelectionInput[] = [
      {
        candidateId: enabled ? null : candidate!.id,
        linkName: group.linkName,
      },
    ];
    setChangingLinkName(group.linkName);
    setProjectError(null);
    void client
      .projectPlan(selections)
      .then((next) => {
        if (next.blockers.length > 0) {
          throw new Error(
            next.blockers.map((blocker) => blocker.message).join(" "),
          );
        }
        if (next.changes.length === 0) {
          throw new Error("没有需要应用的变更。");
        }
        return client.applyProjectChanges({
          baseRevision: next.baseRevision,
          requestId: crypto.randomUUID(),
          selections,
        });
      })
      .then((result) => setProject(result.snapshot))
      .catch((reason: unknown) => {
        setProjectError(projectErrorMessage(reason, "无法应用变更。"));
        void client
          .project()
          .then((snapshot) => setProject(snapshot))
          .catch(() => undefined);
      })
      .finally(() => setChangingLinkName(null));
  };

  useEffect(() => {
    const element = listElement;
    if (element === null) return;
    const observer = new ResizeObserver(() => rowVirtualizer.measure());
    observer.observe(element);
    rowVirtualizer.measure();
    return () => observer.disconnect();
  }, [listElement, rowVirtualizer]);

  const toggleSource = (sourceId: string) => {
    setSelectedSourceIds((current) => {
      const next = new Set(current ?? sources.map((item) => item.source.id));
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      if (next.size === sources.length) return null;
      return next;
    });
  };

  const selectAllSources = () => setSelectedSourceIds(null);

  const selectGroup = (group: LocalCatalogGroup) => {
    setSelectedGroupKey(group.conflictKey);
    setSelectedCandidateId(group.candidates[0]?.id ?? null);
  };

  if (isLoading && groups.length === 0) {
    return <EmptyState body="正在读取会话本地技能目录…" title="正在加载技能" />;
  }
  if (error !== null && groups.length === 0) {
    return <EmptyState body={error.message} title="无法加载技能" />;
  }
  if (!isLoading && groups.length === 0) {
    return (
      <EmptyState
        body="重新扫描技能源，或调整搜索条件以发现本地技能。"
        title={query === "" ? "尚未发现技能" : "没有匹配的技能"}
      />
    );
  }

  const detailPane = (
    <aside
      aria-live="polite"
      aria-label="技能详情"
      className="skill-detail ot-window"
    >
      {detailError !== null ? (
        <EmptyState body={detailError} title="无法读取技能" />
      ) : detail === null ? (
        <EmptyState
          body="选择一个技能以查看其 Skill.md 内容。"
          title="未选择技能"
        />
      ) : (
        <>
          <header className="skill-detail__head">
            <p className="skill-detail__eyebrow">SKILL</p>
            <h2>{detail.displayName}</h2>
            <p className="muted-copy">{detail.summary}</p>
            <p className="muted-copy">来源 {detail.source.displayName}</p>
          </header>
          {selectedGroup === null ||
          selectedGroup.candidates.length < 2 ? null : (
            <div className="candidate-list" role="list">
              <p className="candidate-list__heading">可用来源</p>
              {selectedGroup.candidates.map((candidate) => (
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
                    <Badge tone="warning">解析备注</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
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
    </aside>
  );

  return (
    <section aria-label="技能工作台" className="skills-workbench">
      <div className="skills-columns">
        <section aria-label="技能目录" className="skill-catalog ot-window">
          <div className="skill-catalog__head">
            <h2>技能目录</h2>
            <span className="skill-catalog__count">
              {filteredGroups.length} 项{isLoading ? " · 更新中…" : ""}
            </span>
          </div>
          <section aria-label="技能源与筛选" className="catalog-tools">
            <TextInput
              label="搜索技能"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="名称、摘要、技能源或内容"
              type="search"
              value={query}
            />
            <div className="status-filter" ref={statusFilterRef}>
              <button
                aria-expanded={statusFilterOpen}
                aria-haspopup="listbox"
                aria-label={`筛选状态：${statusFilterLabel(statusFilter)}`}
                className="status-filter__trigger"
                onClick={() => setStatusFilterOpen((open) => !open)}
                type="button"
              >
                <span className="status-filter__label">状态</span>
                <strong>{statusFilterLabel(statusFilter)}</strong>
                <span aria-hidden="true" className="status-filter__chevron">
                  ▾
                </span>
              </button>
              {statusFilterOpen ? (
                <div
                  aria-label="筛选状态"
                  className="status-filter__menu ot-window"
                  role="listbox"
                >
                  {statusFilterOptions.map((option) => (
                    <button
                      aria-selected={statusFilter === option.value}
                      className={`status-filter__option${
                        statusFilter === option.value
                          ? " status-filter__option--selected"
                          : ""
                      }`}
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value);
                        setStatusFilterOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="catalog-tools__sources">
              <button
                className={`source-chip${activeSourceIds === null ? " source-chip--active" : ""}`}
                onClick={selectAllSources}
                type="button"
              >
                全部来源{" "}
                {groups.reduce(
                  (sum, group) => sum + group.candidates.length,
                  0,
                )}
              </button>
              {sources.map((item) => {
                const checked =
                  activeSourceIds === null ||
                  activeSourceIds.has(item.source.id);
                return (
                  <button
                    className={`source-chip${checked ? " source-chip--active" : ""}`}
                    key={item.source.id}
                    onClick={() => toggleSource(item.source.id)}
                    type="button"
                  >
                    {item.source.displayName}
                    <small> {item.scan?.skillCount ?? 0}</small>
                  </button>
                );
              })}
            </div>
          </section>
          {error === null ? null : (
            <p className="form-message form-message--error" role="alert">
              {error.message}
            </p>
          )}
          {filteredGroups.length === 0 ? (
            <EmptyState
              body="清除筛选条件，或管理技能源后重试。"
              title={query === "" ? "筛选无结果" : "没有匹配的技能"}
            />
          ) : (
            <div className="skills-list" ref={setListElement}>
              <div
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  position: "relative",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((item) => {
                  const group = filteredGroups[item.index]!;
                  const active =
                    group.conflictKey === selectedGroup?.conflictKey;
                  const enabled = groupIsEnabled(group, project);
                  const changing = changingLinkName === group.linkName;
                  const applying = changingLinkName !== null;
                  const actionLabel = enabled ? "移除" : "启用";
                  return (
                    <div
                      className={`skill-row${active ? " skill-row--active" : ""}`}
                      key={group.conflictKey}
                      data-index={item.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <span aria-hidden="true" className="skill-row__cursor" />
                      <button
                        className="skill-row__select"
                        onClick={() => selectGroup(group)}
                        type="button"
                      >
                        <span className="skill-row__name">
                          {group.linkName}
                        </span>
                        <span className="skill-row__summary">
                          {group.candidates[0]?.summary}
                        </span>
                        <span className="skill-row__context">
                          <span>{group.candidates[0]?.source.displayName}</span>
                          {group.candidates.length > 1 ? (
                            <span>候选 {group.candidates.length}</span>
                          ) : null}
                          {groupIsAbnormal(group) ? (
                            <span className="skill-row__warning">解析备注</span>
                          ) : null}
                        </span>
                      </button>
                      <div className="skill-row__actions">
                        <span className="skill-row__meta">
                          {enabled ? "已启用" : "未启用"}
                        </span>
                        <Button
                          className="skill-row__action"
                          disabled={applying}
                          onClick={() => applyDirectChange(group, enabled)}
                          variant={enabled ? "danger" : "primary"}
                        >
                          {changing ? `${actionLabel}中…` : actionLabel}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
        {detailPane}
      </div>
      {projectError === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {projectError}
        </p>
      )}
      {project?.recoveryDiagnostics.length ? (
        <p className="form-message form-message--error" role="alert">
          需要手动恢复检查：共 {project.recoveryDiagnostics.length} 个事务产物。
        </p>
      ) : null}
    </section>
  );
}
