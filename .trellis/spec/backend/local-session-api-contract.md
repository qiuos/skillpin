# P5 Local Session, HTTP, and WebSocket Contract

## 1. Scope / Trigger

This contract applies to the `skillpin` executable and its process-local local-service runtime under `packages/cli/src/{command,session,server,security,browser}/`. Use it whenever adding CLI options, HTTP routes, WebSocket events, browser handoff, or P6–P9 server endpoints.

The Node CLI owns real-path target fixation, session registry/lifecycle, credential issuance, the loopback HTTP/WebSocket transport, and signal handling. Browser-safe request/response/event shapes belong in `packages/core/src/api/` and are re-exported only from `@skillpin/core`. Project filesystem operations must continue to use the P4 `@skillpin/core/project`, `@skillpin/core/platform`, and `@skillpin/core/changes` subpaths.

## 2. Signatures

```ts
parseCliArguments(args, { cwd })
  // -> { kind: "help" | "start" | "version", target, port?, noOpen }

new SessionManager().start({ target, port?, exitGraceMs?, ... })
  // -> Promise<{ session: ManagedSession; reused: boolean }>

session.runProjectOperation(() => projectChangeService.apply(input))
  // -> Promise<Result<ApplyProjectChangesSuccess, CoreError>>

session.close("explicit" | "signal" | "grace-period")
  // -> Promise<void>

GET  /                       // static bootstrap shell + one-time cookie
POST /api/session/bootstrap  // one-time cookie -> LocalApiResponse<BootstrapSessionResponse>
GET  /api/session            // bearer credential -> LocalApiResponse<LocalSessionInfo>
POST /api/session/shutdown   // bearer credential -> graceful session close
GET  /api/session/events     // WebSocket upgrade, authenticated protocol negotiation
```

The browser-safe root contract is versioned by `LOCAL_API_VERSION`. Success payloads use `{ version, data }`; failures use `{ version, error: { code, message, retryable, recoveryAction } }`. WebSocket events use `{ version, type, sessionId, sequence, data }`.

## 3. Contracts

- `skillpin [target]`, `--target <directory>`, `--port <1..65535>`, `--no-open`, `--help`, and `--version` are the public P5 CLI surface. A positional target and `--target` cannot be combined; invalid options return `CLI_ARGUMENT_INVALID` without starting a session.
- The startup target is normalized to a directory realpath before registry lookup. Session identity is a SHA-256-style non-reversible fingerprint, not a path string. A repeated start for the same real directory returns the existing in-process session; separate directories may run concurrently.
- The server listens on `127.0.0.1` only. Explicit ports are never rebound to another address, and an `EADDRINUSE` startup is a stable `CLI_PORT_UNAVAILABLE` failure. Do not introduce `0.0.0.0`, LAN binding, CORS, or remote access.
- Every request first proves a loopback remote address and exact `Host: 127.0.0.1:<session-port>`. Browser-originated API/upgrade traffic must also send the session origin exactly. The HTTP server must not emit permissive CORS headers.
- `GET /` mints a high-entropy, short-lived, HttpOnly bootstrap cookie. `POST /api/session/bootstrap` consumes it once and returns a short-lived in-memory bearer credential. Never persist or log either token, and never put credentials in a URL query.
- Authenticated JSON routes require `Authorization: Bearer <credential>`. Compare candidate tokens with the `tokensEqual()` constant-time helper and reject expired credentials.
- WebSockets additionally require RFC 6455 `Sec-WebSocket-Version: 13`, the `skillpin.v1` subprotocol, and a `skillpin.credential.<credential>` protocol token. Negotiate only `skillpin.v1`; refuse absent/invalid version, protocol, origin, host, or credential before accepting the upgrade.
- WebSocket runtime owns page count, heartbeat ping/pong, and a monotonic session event sequence. The last client disconnect starts the configurable 60-second grace timer; any authenticated reconnect cancels it.
- Explicit close or `SIGINT`/`SIGTERM` first marks the session exiting and stops new work, waits for `runProjectOperation()` tasks (including P4 `ProjectChangeService.apply`) to settle, then closes sockets/server and removes its registry entry. New P6–P9 mutation routes must wrap P4 applies in that method.
- Browser opening is best-effort. `--no-open` skips it; failures leave the local address printed to stdout and do not shut down the service.

## 4. Validation & Error Matrix

| Condition | Required outcome |
|---|---|
| Multiple targets, duplicate option, bad/missing port, unknown CLI option | `CLI_ARGUMENT_INVALID`; no session or listener |
| Target missing, inaccessible, or non-directory | `CLI_TARGET_INVALID`; registry remains unchanged |
| Explicit port already in use | `CLI_PORT_UNAVAILABLE`; close any partially-created runtime/listener |
| Non-loopback remote address or wrong Host | reject before routing; no session payload |
| Missing/wrong Origin on browser route or upgrade | reject with `403`; no CORS response |
| Bootstrap cookie absent, expired, or already consumed | `SESSION_BOOTSTRAP_INVALID`; do not mint a credential |
| Missing/wrong/expired bearer credential | `SESSION_CREDENTIAL_INVALID`; no protected response |
| WebSocket lacks v13, `skillpin.v1`, credential protocol, or valid credential | reject upgrade with `403` |
| Last page disconnects | state `waiting-to-exit`; exit only after grace timeout |
| Reconnect before timeout | return to `running`; cancel pending exit |
| Explicit close / signal while P4 apply runs | wait for tracked operation, then cleanly close |

## 5. Good / Base / Bad Cases

- **Good:** `skillpin --no-open /project` resolves the real directory, starts `127.0.0.1` on a free port, prints its address, and accepts a one-time bootstrap followed by a bearer-authenticated session request.
- **Base:** a symlinked alias of an already-running project resolves to the same real directory and returns the existing session address; it must not create a second server.
- **Base:** a page refresh drops the only WebSocket and reconnects within 60 seconds; state returns from `waiting-to-exit` to `running` without closing the service.
- **Bad:** a website sends an API request with a foreign Origin or host header. Reject before route handling and do not expose response data or CORS headers.
- **Bad:** a client offers a credential as only a WebSocket protocol or downgrades the WebSocket version. Reject it; accepting a credential alone is not sufficient protocol negotiation.
- **Bad:** an explicit-port startup fails after session construction. Close its HTTP/WebSocket runtime before returning the classified startup error, so no heartbeat handle leaks.

## 6. Tests Required

- CLI tests for help/version, default/positional/`--target`, invalid combinations, `--no-open`, port parsing, and port collision.
- Real-loopback integration tests for static bootstrap, one-time cookie exchange, authenticated API routes, absent CORS, wrong Host/Origin, and invalid/expired credentials.
- Raw WebSocket tests asserting v13 + `skillpin.v1` + credential negotiation, heartbeat/client counts, and strictly increasing event sequences. Include missing protocol/version/credential rejection cases.
- Lifecycle tests for realpath session reuse, separate project sessions, 60-second (injectable short) disconnect grace/reconnect cancellation, explicit/signal shutdown, and registry cleanup.
- Graceful close must track a real P4 `ProjectChangeService.apply()` operation through `runProjectOperation()`, not a fabricated promise only.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run format:check`, `npm run pack`, and `npm run verify-package`. The sandbox may reject loopback listeners; run the test suite with approved elevated local networking when needed.

## 7. Wrong vs Correct

**Wrong — trust a credential on any WebSocket upgrade:**

```ts
if (readWebSocketCredential(request.headers) !== undefined) {
  acceptUpgrade(request);
}
```

**Correct — validate transport, origin, protocol version, negotiated protocol, and credential before accepting:**

```ts
if (
  guardLocalRequest(request.headers, socket, guard, true) !== null ||
  request.headers["sec-websocket-version"] !== "13" ||
  !hasWebSocketProtocol(request.headers, "skillpin.v1") ||
  !hasValidWebSocketCredential(request.headers, credentials, now)
) {
  rejectUpgrade(socket, 403);
  return;
}
acceptUpgrade(socket, "skillpin.v1");
```

**Wrong — invoke project mutation directly from an HTTP route:**

```ts
await changeService.apply(request);
```

**Correct — keep session shutdown transactional by tracking it:**

```ts
const result = await session.runProjectOperation(() =>
  session.projectServices.changeService.apply(request),
);
```
