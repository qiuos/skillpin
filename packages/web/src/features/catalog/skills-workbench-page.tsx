import { useEffect, useMemo, useRef, useState } from "react";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  LocalCatalogCandidate,
  LocalCatalogCandidateDetail,
  LocalCatalogGroup,
  LocalCatalogItem,
  LocalProjectSelectionInput,
  LocalProjectSnapshot,
} from "@skillpin/core";

import { Badge, Button, EmptyState } from "../../components/controls.js";
import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient } from "../session/session-context.js";
import { useSources } from "../sources/source-context.js";
import { useCatalog } from "./catalog-context.js";

type StatusFilter = "all" | "enabled" | "disabled" | "abnormal";
type SkillGroupCatalogItem = Extract<
  LocalCatalogItem,
  { readonly kind: "skill-group" }
>;
type CatalogListRow =
  | { readonly item: LocalCatalogItem; readonly kind: "item" }
  | {
      readonly kind: "group-member";
      readonly parentId: string;
      readonly skill: LocalCatalogGroup;
    };

const statusFilterOptions: readonly {
  readonly label: string;
  readonly value: StatusFilter;
}[] = [
  { label: "全部状态", value: "all" },
  { label: "已启用", value: "enabled" },
  { label: "未启用", value: "disabled" },
  { label: "异常", value: "abnormal" },
];

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

function skillKey(group: LocalCatalogGroup): string {
  return `${group.conflictKey}:${group.candidates
    .map((candidate) => candidate.id)
    .join(",")}`;
}

function itemCandidates(
  item: LocalCatalogItem,
): readonly LocalCatalogCandidate[] {
  return item.kind === "skill"
    ? item.group.candidates
    : item.skills.flatMap((skill) => skill.candidates);
}

function itemSkills(item: LocalCatalogItem): readonly LocalCatalogGroup[] {
  return item.kind === "skill" ? [item.group] : item.skills;
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

function itemIsAbnormal(item: LocalCatalogItem): boolean {
  return itemSkills(item).some(groupIsAbnormal);
}

function enabledSkillCount(
  item: Extract<LocalCatalogItem, { readonly kind: "skill-group" }>,
  project: LocalProjectSnapshot | null,
): number {
  return item.skills.filter((skill) => groupIsEnabled(skill, project)).length;
}

export function SkillsWorkbenchPage() {
  const client = useLocalApiClient();
  const { sources } = useSources();
  const { error, isLoading, items, loadCandidate, search } = useCatalog();
  const [query, setQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] =
    useState<ReadonlySet<string> | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedSkillKey, setSelectedSkillKey] = useState<string | null>(null);
  const [expandedSkillGroupId, setExpandedSkillGroupId] = useState<
    string | null
  >(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<LocalCatalogCandidateDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [project, setProject] = useState<LocalProjectSnapshot | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [changingOperation, setChangingOperation] = useState<string | null>(
    null,
  );
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => void search(query), 160);
    return () => window.clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!filtersOpen) {
      return;
    }
    const closeWhenOutside = (event: PointerEvent) => {
      if (!filtersRef.current?.contains(event.target as Node)) {
        setFiltersOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [filtersOpen]);

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
  const activeFilterCount =
    (statusFilter === "all" ? 0 : 1) + (activeSourceIds === null ? 0 : 1);
  const filterButtonLabel =
    activeFilterCount === 0
      ? "筛选"
      : `筛选，已应用 ${activeFilterCount} 个条件`;
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const skills = itemSkills(item);
      if (activeSourceIds !== null) {
        const matchesSource = itemCandidates(item).some((candidate) =>
          activeSourceIds.has(candidate.source.id),
        );
        if (!matchesSource) return false;
      }
      const enabled = skills.some((skill) => groupIsEnabled(skill, project));
      const abnormal = itemIsAbnormal(item);
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
  }, [activeSourceIds, items, project, statusFilter]);

  const allSkills = useMemo(
    () => filteredItems.flatMap(itemSkills),
    [filteredItems],
  );
  const catalogRows = useMemo<readonly CatalogListRow[]>(
    () =>
      filteredItems.flatMap((item) => {
        const rows: CatalogListRow[] = [{ item, kind: "item" }];
        if (item.kind === "skill-group" && item.id === expandedSkillGroupId) {
          rows.push(
            ...item.skills.map((skill) => ({
              kind: "group-member" as const,
              parentId: item.id,
              skill,
            })),
          );
        }
        return rows;
      }),
    [expandedSkillGroupId, filteredItems],
  );

  const rowVirtualizer = useVirtualizer({
    count: catalogRows.length,
    estimateSize: () => 56,
    getScrollElement: () => listElement,
    overscan: 8,
    useFlushSync: false,
  });

  const selectedGroup = useMemo(
    () =>
      allSkills.find((group) => skillKey(group) === selectedSkillKey) ??
      allSkills[0] ??
      null,
    [allSkills, selectedSkillKey],
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
      selectedSkillKey !== skillKey(selectedGroup)
    ) {
      setSelectedSkillKey(skillKey(selectedGroup));
    }
  }, [selectedGroup, selectedSkillKey]);

  useEffect(() => {
    if (
      expandedSkillGroupId !== null &&
      !filteredItems.some(
        (item) =>
          item.kind === "skill-group" && item.id === expandedSkillGroupId,
      )
    ) {
      setExpandedSkillGroupId(null);
    }
  }, [expandedSkillGroupId, filteredItems]);

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

  const candidateForGroup = (group: LocalCatalogGroup) =>
    group.candidates.find(
      (candidate) => candidate.id === selectedCandidate?.id,
    ) ?? group.candidates[0];

  const applySelections = (
    selections: readonly LocalProjectSelectionInput[],
    operationId: string,
  ) => {
    if (selections.length === 0) return;
    setChangingOperation(operationId);
    setProjectError(null);
    void (async () => {
      try {
        const next = await client.projectPlan(selections);
        if (next.blockers.length > 0) {
          throw new Error(
            next.blockers.map((blocker) => blocker.message).join(" "),
          );
        }
        if (next.changes.length === 0) {
          setProject(await client.project());
          return;
        }
        const result = await client.applyProjectChanges({
          baseRevision: next.baseRevision,
          requestId: crypto.randomUUID(),
          selections,
        });
        setProject(result.snapshot);
      } catch (reason: unknown) {
        setProjectError(projectErrorMessage(reason, "无法应用变更。"));
        void client
          .project()
          .then((snapshot) => setProject(snapshot))
          .catch(() => undefined);
      } finally {
        setChangingOperation(null);
      }
    })();
  };

  const applyDirectChange = (group: LocalCatalogGroup, enabled: boolean) => {
    const candidate = candidateForGroup(group);
    if (!enabled && candidate === undefined) {
      setProjectError("无法启用：没有可用的技能来源。");
      return;
    }
    applySelections(
      [
        {
          candidateId: enabled ? null : candidate!.id,
          linkName: group.linkName,
        },
      ],
      `skill:${skillKey(group)}`,
    );
  };

  const applySkillGroupEnable = (skillGroup: SkillGroupCatalogItem) => {
    const selections = skillGroup.skills.flatMap((skill) => {
      if (groupIsEnabled(skill, project)) return [];
      const candidate = candidateForGroup(skill);
      return candidate === undefined
        ? []
        : [{ candidateId: candidate.id, linkName: skill.linkName }];
    });
    applySelections(selections, `skill-group:${skillGroup.id}:enable`);
  };

  const applySkillGroupRemoval = (skillGroup: SkillGroupCatalogItem) => {
    const selections = skillGroup.skills
      .filter((skill) => groupIsEnabled(skill, project))
      .map((skill) => ({ candidateId: null, linkName: skill.linkName }));
    applySelections(selections, `skill-group:${skillGroup.id}:remove`);
  };

  useEffect(() => {
    const element = listElement;
    if (element === null) return;
    const observer = new ResizeObserver(() => rowVirtualizer.measure());
    observer.observe(element);
    rowVirtualizer.measure();
    return () => observer.disconnect();
  }, [listElement, rowVirtualizer]);

  useEffect(() => {
    rowVirtualizer.measure();
  }, [catalogRows.length, expandedSkillGroupId, rowVirtualizer]);

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

  const selectSkill = (group: LocalCatalogGroup) => {
    setSelectedSkillKey(skillKey(group));
    setSelectedCandidateId(group.candidates[0]?.id ?? null);
  };
  const toggleSkillGroup = (skillGroup: SkillGroupCatalogItem) => {
    setExpandedSkillGroupId((current) =>
      current === skillGroup.id ? null : skillGroup.id,
    );
  };

  if (isLoading && items.length === 0) {
    return <EmptyState body="正在读取会话本地技能目录…" title="正在加载技能" />;
  }
  if (error !== null && items.length === 0) {
    return <EmptyState body={error.message} title="无法加载技能" />;
  }
  if (!isLoading && items.length === 0) {
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
      <div aria-hidden="true" className="skills-workbench__atmosphere">
        <span className="skills-workbench__halo" />
        <span className="skills-workbench__mist skills-workbench__mist--far" />
        <span className="skills-workbench__mist skills-workbench__mist--near" />
        <span className="skills-workbench__fireflies" />
      </div>
      <div className="skills-columns">
        <section aria-label="技能目录" className="skill-catalog ot-window">
          <div className="skill-catalog__head">
            <h2>技能目录</h2>
            <span className="skill-catalog__count">
              {filteredItems.length} 项{isLoading ? " · 更新中…" : ""}
            </span>
          </div>
          <section aria-label="技能源与筛选" className="catalog-tools">
            <input
              aria-label="搜索技能"
              className="catalog-search text-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索技能、描述或内容"
              type="search"
              value={query}
            />
            <div className="catalog-filters" ref={filtersRef}>
              <button
                aria-expanded={filtersOpen}
                aria-haspopup="dialog"
                aria-label={filterButtonLabel}
                className="catalog-filters__trigger"
                onClick={() => setFiltersOpen((open) => !open)}
                type="button"
              >
                <span>筛选</span>
                {activeFilterCount === 0 ? null : (
                  <span aria-hidden="true" className="catalog-filters__count">
                    {activeFilterCount}
                  </span>
                )}
                <span aria-hidden="true" className="catalog-filters__chevron">
                  ▾
                </span>
              </button>
              {filtersOpen ? (
                <div
                  aria-label="技能筛选"
                  className="catalog-filters__popover ot-window"
                  role="dialog"
                >
                  <section aria-labelledby="status-filter-heading">
                    <p
                      className="catalog-filters__heading"
                      id="status-filter-heading"
                    >
                      状态
                    </p>
                    <div
                      aria-label="筛选状态"
                      className="status-filter__options"
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
                          onClick={() => setStatusFilter(option.value)}
                          role="option"
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section aria-labelledby="source-filter-heading">
                    <p
                      className="catalog-filters__heading"
                      id="source-filter-heading"
                    >
                      技能源
                    </p>
                    <div className="catalog-tools__sources">
                      <button
                        aria-pressed={activeSourceIds === null}
                        className={`source-chip${activeSourceIds === null ? " source-chip--active" : ""}`}
                        onClick={selectAllSources}
                        type="button"
                      >
                        全部来源
                      </button>
                      {sources.map((item) => {
                        const checked =
                          activeSourceIds === null ||
                          activeSourceIds.has(item.source.id);
                        return (
                          <button
                            aria-pressed={checked}
                            className={`source-chip${checked ? " source-chip--active" : ""}`}
                            key={item.source.id}
                            onClick={() => toggleSource(item.source.id)}
                            type="button"
                          >
                            {item.source.displayName}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  {activeFilterCount === 0 ? null : (
                    <button
                      className="catalog-filters__clear"
                      onClick={() => {
                        setStatusFilter("all");
                        setSelectedSourceIds(null);
                      }}
                      type="button"
                    >
                      清除筛选
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </section>
          {error === null ? null : (
            <p className="form-message form-message--error" role="alert">
              {error.message}
            </p>
          )}
          {filteredItems.length === 0 ? (
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
                {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                  const row = catalogRows[virtualItem.index]!;
                  const catalogItem = row.kind === "item" ? row.item : null;
                  const skillGroup =
                    catalogItem?.kind === "skill-group" ? catalogItem : null;
                  const skill =
                    row.kind === "group-member"
                      ? row.skill
                      : catalogItem?.kind === "skill"
                        ? catalogItem.group
                        : null;
                  const groupMember = row.kind === "group-member";
                  const active =
                    skill !== null
                      ? skillKey(skill) === selectedSkillKey
                      : (skillGroup?.skills.some(
                          (entry) => skillKey(entry) === selectedSkillKey,
                        ) ?? false);
                  const applying = changingOperation !== null;
                  const enabled =
                    skill === null ? false : groupIsEnabled(skill, project);
                  const enabledCount =
                    skillGroup === null
                      ? 0
                      : enabledSkillCount(skillGroup, project);
                  const allEnabled =
                    skillGroup !== null &&
                    enabledCount === skillGroup.skills.length;
                  const changingSkill =
                    skill !== null &&
                    changingOperation === `skill:${skillKey(skill)}`;
                  const changingGroupEnable =
                    skillGroup !== null &&
                    changingOperation === `skill-group:${skillGroup.id}:enable`;
                  const changingGroupRemoval =
                    skillGroup !== null &&
                    changingOperation === `skill-group:${skillGroup.id}:remove`;
                  const rowKey =
                    row.kind === "item"
                      ? row.item.id
                      : `${row.parentId}:${skillKey(row.skill)}`;
                  return (
                    <div
                      className={`skill-row${active ? " skill-row--active" : ""}${skillGroup === null ? "" : " skill-row--group"}${groupMember ? " skill-row--group-member" : ""}`}
                      data-index={virtualItem.index}
                      key={rowKey}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <span aria-hidden="true" className="skill-row__cursor" />
                      {skill === null ? null : (
                        <button
                          className="skill-row__select"
                          onClick={() => selectSkill(skill)}
                          type="button"
                        >
                          <span className="skill-row__name">
                            ◇{" "}
                            {skill.candidates[0]?.displayName ?? skill.linkName}
                          </span>
                          <span className="skill-row__summary">
                            {skill.candidates[0]?.summary}
                          </span>
                          {groupIsAbnormal(skill) ? (
                            <span
                              aria-label="存在解析备注"
                              className="skill-row__warning"
                              title="解析备注"
                            >
                              ⚠
                            </span>
                          ) : null}
                        </button>
                      )}
                      {skillGroup === null ? null : (
                        <button
                          aria-expanded={expandedSkillGroupId === skillGroup.id}
                          aria-label={`${expandedSkillGroupId === skillGroup.id ? "收起" : "展开"}技能组 ${skillGroup.name}`}
                          className="skill-row__select"
                          onClick={() => toggleSkillGroup(skillGroup)}
                          type="button"
                        >
                          <span className="skill-row__name">
                            {expandedSkillGroupId === skillGroup.id ? "▾" : "▸"}{" "}
                            ▣ {skillGroup.name}
                          </span>
                          <span className="skill-row__summary">
                            技能组 · 包含 {skillGroup.skills.length} 个技能 ·{" "}
                            {enabledCount} / {skillGroup.skills.length} 已启用
                          </span>
                          {itemIsAbnormal(skillGroup) ? (
                            <span
                              aria-label="存在解析备注"
                              className="skill-row__warning"
                              title="解析备注"
                            >
                              ⚠
                            </span>
                          ) : null}
                        </button>
                      )}
                      <div className="skill-row__actions">
                        {skill === null ? null : (
                          <Button
                            className="skill-row__action"
                            disabled={applying}
                            onClick={() => applyDirectChange(skill, enabled)}
                            variant={enabled ? "danger" : "primary"}
                          >
                            {changingSkill
                              ? `${enabled ? "移除" : "启用"}中…`
                              : enabled
                                ? "移除"
                                : "启用"}
                          </Button>
                        )}
                        {skillGroup === null ? null : (
                          <>
                            <Button
                              className="skill-row__action"
                              disabled={applying || allEnabled}
                              onClick={() => applySkillGroupEnable(skillGroup)}
                              variant="primary"
                            >
                              {changingGroupEnable ? "全部启用中…" : "全部启用"}
                            </Button>
                            <Button
                              className="skill-row__action"
                              disabled={applying || enabledCount === 0}
                              onClick={() => applySkillGroupRemoval(skillGroup)}
                              variant="danger"
                            >
                              {changingGroupRemoval ? "移除中…" : "移除"}
                            </Button>
                          </>
                        )}
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
