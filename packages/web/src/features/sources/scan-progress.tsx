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
        Scanning source directory…
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
    return (
      <p className="scan-progress">This source has not been scanned yet.</p>
    );
  }
  const warnings = source.scan.warnings.length;
  return (
    <p className="scan-progress">
      {source.scan.skillCount}{" "}
      {source.scan.skillCount === 1 ? "skill" : "skills"}
      {warnings === 0
        ? " discovered."
        : ` discovered with ${warnings} warning${warnings === 1 ? "" : "s"}.`}
    </p>
  );
}
