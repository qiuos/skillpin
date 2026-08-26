import type { LocalSourceSummary } from "@skillpin/core";

export function ScanProgress({
  pending = false,
  source,
}: {
  readonly pending?: boolean;
  readonly source: LocalSourceSummary | null;
}) {
  if (pending) {
    return (
      <p className="scan-progress" role="status">
        正在扫描技能源目录…
      </p>
    );
  }
  if (source === null) {
    return null;
  }
  if (source.failure !== null) {
    return (
      <p className="scan-progress scan-progress--error">
        {source.failure.message}
      </p>
    );
  }
  if (source.scan === null) {
    return <p className="scan-progress">该技能源尚未扫描。</p>;
  }
  const warnings = source.scan.warnings.length;
  return (
    <p className="scan-progress">
      已发现 {source.scan.skillCount} 个技能
      {warnings === 0 ? "。" : `，包含 ${warnings} 个警告。`}
    </p>
  );
}
