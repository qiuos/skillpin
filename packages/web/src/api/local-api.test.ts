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
