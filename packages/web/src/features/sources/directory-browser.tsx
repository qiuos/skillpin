import { useCallback, useEffect, useState } from "react";

import type {
  LocalDirectoryBrowserEntrypoint,
  LocalDirectoryListing,
} from "@skillpin/core";

import { Button } from "../../components/controls.js";
import { LocalApiClientError } from "../../api/local-api.js";
import { useLocalApiClient } from "../session/session-context.js";

function messageFor(reason: unknown): string {
  return reason instanceof LocalApiClientError
    ? reason.message
    : "无法浏览本地目录。";
}

export function DirectoryBrowser({
  disabled,
  onChoose,
  selectedPath,
}: {
  readonly disabled: boolean;
  readonly onChoose: (path: string) => void;
  readonly selectedPath: string;
}) {
  const client = useLocalApiClient();
  const [entrypoints, setEntrypoints] = useState<
    readonly LocalDirectoryBrowserEntrypoint[]
  >([]);
  const [listing, setListing] = useState<LocalDirectoryListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openDirectory = useCallback(
    async (path: string) => {
      if (path.trim() === "") {
        return;
      }
      setLoading(true);
      try {
        const nextListing = await client.directories(path);
        setListing(nextListing);
        setError(null);
      } catch (reason: unknown) {
        setError(messageFor(reason));
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    void client
      .directoryEntrypoints()
      .then((entries) => setEntrypoints(entries))
      .catch((reason: unknown) => setError(messageFor(reason)));
  }, [client]);

  return (
    <section aria-label="目录浏览器" className="directory-browser">
      <div className="directory-browser__header">
        <div>
          <h3>浏览目录</h3>
          <p>仅显示目录名称和路径，此处绝不会读取文件内容。</p>
        </div>
        <Button
          disabled={disabled || selectedPath.trim() === "" || loading}
          onClick={() => void openDirectory(selectedPath)}
          variant="tertiary"
        >
          打开粘贴路径
        </Button>
      </div>
      <div className="directory-browser__entrypoints">
        {entrypoints.map((entry) => (
          <Button
            disabled={disabled || loading}
            key={`${entry.label}-${entry.path}`}
            onClick={() => void openDirectory(entry.path)}
            title={entry.path}
            variant="secondary"
          >
            {entry.label}
          </Button>
        ))}
      </div>
      {error === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {error}
        </p>
      )}
      {listing === null ? null : (
        <div className="directory-browser__listing">
          <div className="directory-browser__path">
            <code>{listing.directoryPath}</code>
          </div>
          <div className="directory-browser__entries">
            {listing.entries.length === 0 ? (
              <p className="muted-copy">没有可用的子目录。</p>
            ) : (
              listing.entries.map((entry) => (
                <div className="directory-entry" key={entry.realPath}>
                  <button
                    className="directory-entry__open"
                    disabled={disabled || loading}
                    onClick={() => void openDirectory(entry.path)}
                    type="button"
                  >
                    {entry.name}
                  </button>
                  <Button
                    disabled={disabled}
                    onClick={() => onChoose(entry.realPath)}
                    variant="tertiary"
                  >
                    选择此文件夹
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
