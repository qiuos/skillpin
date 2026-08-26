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
    return `${reason.message} 再次应用前需要先完成手动恢复检查。`;
  }
  if (reason.recoveryAction === "retry") {
    return `${reason.message} 请查看最新项目状态后再试。`;
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
    estimateSize: () => 96,
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
              : "无法检查项目。",
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
              : "无法加载该技能。",
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
      .catch(() => setCopied("无法复制"));
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
        setProjectError(projectErrorMessage(reason, "无法生成变更计划。")),
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
          projectErrorMessage(reason, "无法应用变更。"),
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
        body="正在读取会话本地技能目录…"
        title="正在加载技能"
      />
    );
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

  return (
    <section aria-label="技能工作台" className="skills-workbench">
      <div className="skills-workbench__toolbar">
        <div>
          <p className="eyebrow">会话技能目录</p>
          <h1>技能目录</h1>
        </div>
        <TextInput
          label="搜索技能"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="名称、摘要、技能源或内容"
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
          aria-label="技能分组"
        >
          <div className="skills-pane__heading">
            <span>{groups.length} 个分组</span>
            <span>{isLoading ? "更新中…" : ""}</span>
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
                      {group.candidates.length} 个候选
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
        <section
          className="skills-pane skills-pane--candidates"
          aria-label="源候选"
        >
          <div className="skills-pane__heading">
            <span>候选来源</span>
          </div>
          <h2>{selectedGroup?.linkName}</h2>
          <p className="muted-copy">
            比较本地技能源。先显式暂存候选，再变更项目链接。
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
                  <Badge tone="warning">解析备注</Badge>
                )}
                {staged[candidate.linkName] === candidate.id ? (
                  <Badge tone="success">已暂存</Badge>
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
                  ? "取消暂存"
                  : "暂存到项目"}
              </Button>
            </div>
          )}
          {project?.links.some((link) => link.state === "managed") ? (
            <div className="project-links">
              <p className="skills-pane__heading">当前项目链接</p>
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
                        取消暂存
                      </Button>
                    ) : (
                      <Button
                        onClick={() => stageRemoval(link.linkName)}
                        variant="tertiary"
                      >
                        暂存移除
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
          aria-label="技能详情"
        >
          {detailError !== null ? (
            <EmptyState body={detailError} title="无法读取技能" />
          ) : detail === null ? (
            <EmptyState
              body="选择一个源候选以查看其 Skill.md 内容。"
              title="未选择技能"
            />
          ) : (
            <>
              <div className="skills-pane__heading">
                <span>只读详情</span>
                {copied === null ? null : <span role="status">{copied}</span>}
              </div>
              <h2>{detail.displayName}</h2>
              <p className="muted-copy">{detail.summary}</p>
              <div className="path-actions">
                <Button
                  onClick={() => copy("已复制源路径", detail.source.path)}
                  variant="tertiary"
                >
                  复制源路径
                </Button>
                <Button
                  onClick={() =>
                    copy("已复制技能路径", detail.skillDirectory)
                  }
                  variant="tertiary"
                >
                  复制技能路径
                </Button>
                <Button
                  onClick={() =>
                    copy("已复制 SKILL.md 路径", detail.skillFilePath)
                  }
                  variant="tertiary"
                >
                  复制 SKILL.md 路径
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
          需要手动恢复检查：共{" "}
          {project.recoveryDiagnostics.length} 个事务产物。
        </p>
      ) : null}
      {Object.keys(staged).length === 0 ? null : (
        <div className="change-bar" role="status">
          <span>
            已暂存 {Object.keys(staged).length} 项项目变更
          </span>
          <Button onClick={reviewChanges}>审查变更</Button>
        </div>
      )}
      <Dialog
        description="在对文件系统做任何改动前，先审查服务端计算的项目计划。"
        onClose={() => setReviewOpen(false)}
        open={reviewOpen}
        title="审查项目变更"
      >
        <div className="project-review">
          {plan?.blockers.length ? (
            <p className="form-message form-message--error">
              {plan.blockers.map((blocker) => blocker.message).join(" ")}
            </p>
          ) : (
            <p>
              将对本项目应用 {plan?.changes.length ?? 0} 项变更。
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
              继续编辑
            </Button>
            <Button
              disabled={plan === null || plan.blockers.length > 0}
              onClick={() => setConfirmOpen(true)}
            >
              应用变更
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        description={`将 ${plan?.changes.length ?? 0} 项已审查变更应用到当前项目。此过程使用 SkillPin 的事务链接流程。`}
        onClose={() => setConfirmOpen(false)}
        open={confirmOpen}
        title="确认项目变更"
      >
        <div className="dialog__actions">
          <Button
            disabled={applying}
            onClick={() => setConfirmOpen(false)}
            variant="secondary"
          >
            取消
          </Button>
          <Button disabled={applying} onClick={applyChanges}>
            {applying ? "应用中…" : "应用"}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
