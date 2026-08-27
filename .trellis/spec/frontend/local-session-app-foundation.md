# Local Session Application Foundation

## 1. Scope / Trigger

Apply this contract when adding browser features that run inside the protected `skillpin` local session. It covers the P6 Web shell in `packages/web/src/{api,app,components,features/session}/`: API bootstrap, authenticated requests and WebSocket events, connection/read-only state, and the accessible application chrome shared by P7–P9.

Web code may import browser-safe types only from `@skillpin/core`. It must never import CLI source, persist a session credential, write it to logs, or put it in a URL.

## 2. Signatures

```ts
new LocalApiClient({ fetchImpl? })
  .bootstrap(): Promise<BootstrapSessionResponse>
  .session(): Promise<LocalSessionInfo>
  .shutdown(): Promise<void>
  .webSocketProtocols(): string[]

localEventFromMessage(message: unknown): LocalSessionEvent | null

useSession(): {
  connection: "connecting" | "online" | "reconnecting" | "error" | "exiting" | "disconnected";
  error: LocalApiClientError | null;
  isReadOnly: boolean;
  session: LocalSessionInfo | null;
  shutdown(): Promise<void>;
}
```

## 3. Contracts

- Bootstrap uses `POST /api/session/bootstrap` with `credentials: "same-origin"`, then keeps `BootstrapSessionResponse.credential` only in the `LocalApiClient` instance's private in-memory field.
- Later JSON requests use `Authorization: Bearer <credential>`. WebSocket construction uses exactly `"skillpin.v1"` and `"skillpin.credential.<credential>"` subprotocols for `/api/session/events`; the credential is never part of the WebSocket URL.
- Decode both HTTP responses and WebSocket messages against `LOCAL_API_VERSION`. Unknown/malformed events are ignored; malformed responses become the stable `LOCAL_API_INVALID_RESPONSE` client error.
- Keep bootstrap promise ownership module-local so React StrictMode cannot consume P5's one-time bootstrap cookie twice.
- If WebSocket transport is unavailable, retain feature-local selections and set `isReadOnly` rather than clearing UI state. Retry with capped exponential backoff (currently 500ms to 10s). Render an explicit waiting-to-exit/grace-period state when `LocalSessionInfo.status` requires it.
- Theme preference may use localStorage under `skillpin.theme`; it stores only `"system" | "light" | "dark"`. When set to `system`, subscribe to `matchMedia("(prefers-color-scheme: dark)")` changes. Resolved theme is applied as `document.documentElement.dataset.theme` (`light` | `dark`) so CSS tokens in `styles.css` switch. Visual tokens follow the Octopath HD-2D workbench language: dusk canvas, parchment/gold windows, and a top identity bar without sidebar or KPI chrome (see frontend quality-guidelines Styling); no session data belongs in localStorage.

## 4. Validation & Error Matrix

| Condition | Client behavior | User-facing behavior |
| --- | --- | --- |
| API envelope is malformed or version mismatches | Throw `LOCAL_API_INVALID_RESPONSE` | Connection error panel; no raw payload shown |
| Server returns a versioned `error` envelope | Convert it to `LocalApiClientError` | Show the stable server message and recovery state |
| `fetch` cannot reach loopback service | Throw `LOCAL_API_UNREACHABLE` | Reconnect/read-only status, not a credential error |
| Bootstrap credential absent when an authenticated action begins | Throw `SESSION_CREDENTIAL_MISSING` | Ask user to open a valid local session |
| WebSocket closes unexpectedly | Schedule capped reconnect | Preserve UI-local selections and disable future writes |
| Session is closing or shutdown requested | Close socket and set `exiting` | Disable end button and present final session state |

## 5. Good / Base / Bad Cases

**Good — typed request and private credential:**

```ts
await client.bootstrap();
await client.session(); // LocalApiClient adds Authorization internally.
new WebSocket(eventsUrl, client.webSocketProtocols());
```

**Base — page shell before P7 data exists:** route to `/onboarding`, `/sources`, or `/skills` and use an accessible `EmptyState`; do not manufacture a dashboard.

**Bad — exposed credential or untyped fetch:**

```ts
localStorage.setItem("credential", bootstrap.credential);
fetch(`/api/session?credential=${bootstrap.credential}`);
```

This leaks a bearer credential into persistent browser state or a URL. Keep it in the API client and use the P5 transport contract instead.

## 6. Tests Required

- `packages/web/src/api/local-api.test.ts` must assert a bootstrap envelope, authorization header on an authenticated request, subprotocol formatting, invalid event rejection, and structured API failure conversion.
- Theme tests must assert fixed preferences override system state and `system` follows it.
- Playwright must assert the protected application shell, accessible `/onboarding`, `/sources`, and `/skills` navigation, and absence of a dashboard default.
- P5 integration tests remain the evidence that loopback routing, cookie bootstrap, credential validation, and WebSocket protocol enforcement work end-to-end.

## 7. Wrong vs Correct

```ts
// Wrong: feature components each issue their own untyped request.
const data = await fetch("/api/session").then((response) => response.json());

// Correct: features read the typed, shared session boundary.
const { isReadOnly, session } = useSession();
```

The correct form keeps credentials, response validation, reconnect policy, and read-only behavior in one audited boundary rather than duplicating security-sensitive logic across features.
