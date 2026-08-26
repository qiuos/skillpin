import { Badge } from "../../components/controls.js";
import type { LocalSourceSummary } from "@skillpin/core";

const healthCopy = {
  disabled: { label: "已禁用", tone: "neutral" },
  failed: { label: "扫描失败", tone: "warning" },
  healthy: { label: "就绪", tone: "success" },
  "no-skills": { label: "未发现技能", tone: "warning" },
  unscanned: { label: "未扫描", tone: "neutral" },
  warnings: { label: "存在警告", tone: "warning" },
} as const;

export function SourceHealth({
  source,
}: {
  readonly source: LocalSourceSummary;
}) {
  const copy = healthCopy[source.health];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}
