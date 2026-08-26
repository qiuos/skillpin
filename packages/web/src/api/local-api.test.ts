import { describe, expect, it, vi } from "vitest";

import {
  LocalApiClient,
  LocalApiClientError,
  localEventFromMessage,
} from "./local-api.js";

const session = {
  clientCount: 1,
  projectDirectory: "/tmp/project",
  projectFingerprint: "fingerprint",
  sessionId: "session",
  status: "running" as const,
  waitingToExitAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

describe("LocalApiClient", () => {
  it("bootstraps in memory and uses its credential only for authenticated requests", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            credential: "secret-token",
            credentialExpiresAt: "2026-08-26T00:00:00.000Z",
            session,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ version: 1, data: session }));
    const client = new LocalApiClient({ fetchImpl });

    await expect(client.bootstrap()).resolves.toMatchObject({ session });
    await expect(client.session()).resolves.toEqual(session);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/session/bootstrap");
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toEqual(expect.any(Headers));
    expect(
      (fetchImpl.mock.calls[1]?.[1]?.headers as Headers).get("Authorization"),
    ).toBe("Bearer secret-token");
    expect(client.webSocketProtocols()).toEqual([
      "skillpin.v1",
      "skillpin.credential.secret-token",
    ]);
  });

  it("uses authenticated, versioned source and directory operations", async () => {
    const source = {
      failure: null,
      health: "healthy" as const,
      scan: { skillCount: 1, warnings: [] },
      source: {
        displayName: "Personal",
        enabled: true,
        id: "source / id",
        path: "/tmp/source",
      },
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            credential: "secret-token",
            credentialExpiresAt: "2026-08-26T00:00:00.000Z",
            session,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: 1, data: { sources: [source] } }),
      )
      .mockResolvedValueOnce(jsonResponse({ version: 1, data: source }))
      .mockResolvedValueOnce(jsonResponse({ version: 1, data: source }))
      .mockResolvedValueOnce(jsonResponse({ version: 1, data: source }))
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            impact: { managedLinkCount: 1, sourceId: source.source.id },
            kind: "impact",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ version: 1, data: { path: source.source.path } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: { entries: [{ kind: "root", label: "Root", path: "/" }] },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            directoryPath: source.source.path,
            entries: [
              {
                name: "child",
                path: "/tmp/source/child",
                realPath: "/tmp/source/child",
              },
            ],
          },
        }),
      );
    const client = new LocalApiClient({ fetchImpl });

    await client.bootstrap();
    await expect(client.sources()).resolves.toEqual({ sources: [source] });
    await expect(
      client.addSource({
        displayName: source.source.displayName,
        enabled: true,
        path: source.source.path,
      }),
    ).resolves.toEqual(source);
    await expect(
      client.updateSource(source.source.id, {
        displayName: source.source.displayName,
        enabled: true,
        path: source.source.path,
      }),
    ).resolves.toEqual(source);
    await expect(client.rescanSource(source.source.id)).resolves.toEqual(
      source,
    );
    await expect(client.removeSource(source.source.id)).resolves.toMatchObject({
      kind: "impact",
    });
    await expect(
      client.validateSourcePath(source.source.path),
    ).resolves.toEqual({
      path: source.source.path,
    });
    await expect(client.directoryEntrypoints()).resolves.toEqual([
      { kind: "root", label: "Root", path: "/" },
    ]);
    await expect(client.directories(source.source.path)).resolves.toMatchObject(
      {
        directoryPath: source.source.path,
      },
    );

    expect(fetchImpl.mock.calls.slice(1).map(([path]) => path)).toEqual([
      "/api/sources",
      "/api/sources",
      "/api/sources/source%20%2F%20id",
      "/api/sources/source%20%2F%20id/scan",
      "/api/sources/source%20%2F%20id",
      "/api/sources/validate",
      "/api/directories/entrypoints",
      "/api/directories?path=%2Ftmp%2Fsource",
    ]);
    for (const [, request] of fetchImpl.mock.calls.slice(1)) {
      expect((request?.headers as Headers).get("Authorization")).toBe(
        "Bearer secret-token",
      );
    }
  });

  it("rejects malformed source payloads", async () => {
    const client = new LocalApiClient({
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            version: 1,
            data: {
              credential: "secret-token",
              credentialExpiresAt: "2026-08-26T00:00:00.000Z",
              session,
            },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            version: 1,
            data: {
              sources: [
                {
                  failure: null,
                  health: "healthy",
                  scan: { skillCount: "one", warnings: [] },
                  source: {
                    displayName: "Invalid",
                    enabled: true,
                    id: "source",
                    path: "/tmp/source",
                  },
                },
              ],
            },
          }),
        ),
    });

    await client.bootstrap();
    await expect(client.sources()).rejects.toMatchObject({
      code: "LOCAL_API_INVALID_RESPONSE",
    });
  });

  it("normalizes API failures without including the credential in the error", async () => {
    const client = new LocalApiClient({
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            version: 1,
            error: {
              code: "SESSION_CREDENTIAL_INVALID",
              message: "Credential no longer works",
              recoveryAction: "open-session",
              retryable: false,
            },
          },
          401,
        ),
      ),
    });

    await expect(client.bootstrap()).rejects.toEqual(
      expect.objectContaining({ code: "SESSION_CREDENTIAL_INVALID" }),
    );
    await expect(client.bootstrap()).rejects.not.toThrow("secret-token");
  });

  it("accepts only versioned session events", () => {
    expect(
      localEventFromMessage(
        JSON.stringify({
          version: 1,
          type: "session.running",
          sessionId: "session",
          sequence: 2,
          data: {},
        }),
      ),
    ).toMatchObject({ type: "session.running" });
    expect(
      localEventFromMessage(
        JSON.stringify({
          version: 2,
          type: "session.running",
          sessionId: "session",
          sequence: 2,
          data: {},
        }),
      ),
    ).toBeNull();
    expect(localEventFromMessage("not-json")).toBeNull();
  });

  it("exposes structured client failures", () => {
    const error = new LocalApiClientError({
      code: "LOCAL_API_UNREACHABLE",
      message: "Unavailable",
      recoveryAction: "retry",
      retryable: true,
    });
    expect(error).toMatchObject({
      code: "LOCAL_API_UNREACHABLE",
      retryable: true,
    });
  });
});

describe("P8 catalog operations", () => {
  it("uses authenticated, versioned catalog listing and explicit candidate detail paths", async () => {
    const candidate = {
      contentFingerprint: "fingerprint",
      displayName: "Review skill",
      id: "candidate / id",
      linkName: "review",
      parseWarning: null,
      relativePath: "review",
      source: {
        displayName: "Personal",
        enabled: true,
        id: "source",
        path: "/tmp/source",
      },
      summary: "Review local changes.",
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            credential: "secret-token",
            credentialExpiresAt: "2026-08-26T00:00:00.000Z",
            session,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            groups: [
              {
                candidates: [candidate],
                conflictKey: "review",
                linkName: "review",
                matchingCandidateIds: [candidate.id],
              },
            ],
            query: "local review",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          version: 1,
          data: {
            ...candidate,
            markdownBody: "# Review",
            skillDirectory: "/tmp/source/review",
            skillFilePath: "/tmp/source/review/SKILL.md",
          },
        }),
      );
    const client = new LocalApiClient({ fetchImpl });

    await client.bootstrap();
    await expect(client.catalog("local review")).resolves.toMatchObject({
      groups: [expect.objectContaining({ linkName: "review" })],
    });
    await expect(client.catalogCandidate(candidate.id)).resolves.toMatchObject({
      markdownBody: "# Review",
    });
    expect(fetchImpl.mock.calls.slice(1).map(([path]) => path)).toEqual([
      "/api/catalog?query=local%20review",
      "/api/catalog/candidates/candidate%20%2F%20id",
    ]);
    for (const [, request] of fetchImpl.mock.calls.slice(1)) {
      expect((request?.headers as Headers).get("Authorization")).toBe(
        "Bearer secret-token",
      );
    }
  });
});
