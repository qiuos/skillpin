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
    : "Unable to browse local directories.";
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
    <section aria-label="Directory browser" className="directory-browser">
      <div className="directory-browser__header">
        <div>
          <h3>Browse directories</h3>
          <p>
            Only directory names and paths are shown. File contents are never
            read here.
          </p>
        </div>
        <Button
          disabled={disabled || selectedPath.trim() === "" || loading}
          onClick={() => void openDirectory(selectedPath)}
          variant="tertiary"
        >
          Open pasted path
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
              <p className="muted-copy">No child directories are available.</p>
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
                    Use this folder
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
