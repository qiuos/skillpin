import { useMemo, useState } from "react";

import type { LocalSourceSummary, LocalSourceWarning } from "@skillpin/core";

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

type SourceWarningPresentation = {
  readonly suggestion: string;
  readonly title: string;
  readonly why: string;
};

function sourceWarningPresentation(
  warning: LocalSourceWarning,
): SourceWarningPresentation {
  if (warning.code === "INVALID_LINK_NAME") {
    return {
      suggestion: "请将该技能目录改为有效的名称后重新扫描。",
      title: "技能目录名称不可用",
      why: "该目录名称不符合项目链接的命名规则，因此不会作为可启用技能处理。",
    };
  }

  switch (warning.reason) {
    case "PERMISSION_DENIED":
      return {
        suggestion: "请授予当前账户读取该目录的权限后重新扫描。",
        title: "无法检查目录",
        why: "当前账户没有读取该目录的权限。",
      };
    case "PATH_NOT_FOUND":
      return {
        suggestion: "请确认目录或其链接目标仍存在后重新扫描。",
        title: "无法检查目录",
        why: "扫描时该目录或其链接目标已不存在。",
      };
    case "SYMLINK_LOOP":
      return {
        suggestion: "请修复形成循环的目录链接后重新扫描。",
        title: "无法检查目录",
        why: "目录链接形成循环，无法继续扫描。",
      };
    default:
      return {
        suggestion: "请检查该目录是否可访问，修复后重新扫描。",
        title: "无法检查目录",
        why: "系统暂时无法访问该目录。",
      };
  }
}

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
  const [warningSource, setWarningSource] = useState<LocalSourceSummary | null>(
    null,
  );

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
        reason instanceof Error ? reason.message : "无法更新该技能源。",
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
            添加技能源
          </Button>
        }
        body="添加目录以检查本地技能元数据，并扫描其中可用的技能。"
        title="还没有技能源目录"
      />
    );
  }

  return (
    <section className="source-list-page ot-window">
      <div className="source-panel__head">
        <h1>技能源</h1>
        <span className="source-panel__count">{sources.length} 个目录</span>
      </div>
      <div className="source-panel">
        <div className="source-list-page__toolbar">
          <TextInput
            label="搜索技能源"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="名称或路径"
            value={query}
          />
          <Button disabled={disabled} onClick={onAddSource} variant="primary">
            添加技能源
          </Button>
        </div>
        {error === null && actionError === null ? null : (
          <p className="form-message form-message--error" role="alert">
            {actionError ?? error?.message}
          </p>
        )}
        <div className="source-table" role="list">
          <div aria-hidden="true" className="source-table__head">
            <span>名称 / 路径 / 状态</span>
            <span>操作</span>
          </div>
          {visibleSources.length === 0 ? (
            <p className="muted-copy">没有匹配此搜索的技能源。</p>
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
                      <SourceHealth
                        onWarningClick={() => setWarningSource(source)}
                        source={source}
                      />
                      {duplicateName ? (
                        <Badge tone="warning">名称重复</Badge>
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
                      编辑
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
                      {source.source.enabled ? "禁用" : "启用"}
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
                      重新扫描
                    </Button>
                    <Button
                      disabled={disabled || isPending}
                      onClick={() => void requestRemoval(source)}
                      variant="danger"
                    >
                      移除
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
      <Dialog
        className="source-warning-dialog"
        description={`本次扫描发现 ${warningSource?.scan?.warnings.length ?? 0} 条告警；已发现的技能仍可正常使用。`}
        onClose={() => setWarningSource(null)}
        open={warningSource !== null}
        title={`${warningSource?.source.displayName ?? "技能源"}的扫描告警`}
      >
        <div className="source-warning-dialog__content">
          <ul>
            {(warningSource?.scan?.warnings ?? []).map((warning) => {
              const presentation = sourceWarningPresentation(warning);
              return (
                <li key={`${warning.code}:${warning.path}:${warning.message}`}>
                  <strong>{presentation.title}</strong>
                  <span>
                    <b>原因：</b>
                    {presentation.why}
                  </span>
                  <code>位置：{warning.path}</code>
                  <span>
                    <b>建议：</b>
                    {presentation.suggestion}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="dialog__actions">
          <Button onClick={() => setWarningSource(null)} variant="primary">
            我知道了
          </Button>
        </div>
      </Dialog>
      <Dialog
        description="移除技能源只会从 SkillPin 配置和当前会话的扫描状态中删除它。源目录、项目链接和清单文件不会改动。"
        onClose={() => setRemovalImpact(null)}
        open={removalImpact !== null}
        title="移除仍有项目链接的技能源？"
      >
        <div className="removal-impact">
          <p>
            仍有 <strong>{removalImpact?.managedLinkCount ?? 0}</strong>{" "}
            个受管项目链接指向此技能源。
          </p>
          <p>这些链接会保留，之后可能需要单独处理。</p>
        </div>
        <div className="dialog__actions">
          <Button onClick={() => setRemovalImpact(null)} variant="secondary">
            取消
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void confirmRemoval()}
            variant="danger"
          >
            仅移除技能源
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
