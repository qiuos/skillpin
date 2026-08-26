import { Badge } from "../../components/controls.js";
import type { LocalSourceSummary } from "@skillpin/core";

const healthCopy = {
  disabled: { label: "Disabled", tone: "neutral" },
  failed: { label: "Scan failed", tone: "warning" },
  healthy: { label: "Ready", tone: "success" },
  "no-skills": { label: "No skills found", tone: "warning" },
  unscanned: { label: "Not scanned", tone: "neutral" },
  warnings: { label: "Ready with warnings", tone: "warning" },
} as const;

export function SourceHealth({
  source,
}: {
  readonly source: LocalSourceSummary;
}) {
  const copy = healthCopy[source.health];
  return <Badge tone={copy.tone}>{copy.label}</Badge>;
}
