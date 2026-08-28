import type { LocalSourceSummary } from "@skillpin/core";

import { Badge } from "../../components/controls.js";

const healthCopy = {
  disabled: { label: "已禁用", tone: "neutral" },
  failed: { label: "扫描失败", tone: "warning" },
  healthy: { label: "就绪", tone: "success" },
  "no-skills": { label: "未发现技能", tone: "warning" },
  unscanned: { label: "未扫描", tone: "neutral" },
  warnings: { label: "存在警告", tone: "warning" },
} as const;

export function SourceHealth({
  onWarningClick,
  source,
}: {
  readonly onWarningClick?: () => void;
  readonly source: LocalSourceSummary;
}) {
  const copy = healthCopy[source.health];
  if (source.health === "warnings" && onWarningClick !== undefined) {
    return (
      <button
        aria-haspopup="dialog"
        className={`badge badge--${copy.tone} source-health__warning`}
        onClick={onWarningClick}
        type="button"
      >
        {copy.label}
      </button>
    );
  }
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}
