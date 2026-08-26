import { expect, test, type Page } from "@playwright/test";

type MockSource = {
  failure: null;
  health: "healthy" | "no-skills" | "warnings";
  scan: {
    skillCount: number;
    warnings: { code: string; message: string; path: string }[];
  };
  source: { displayName: string; enabled: boolean; id: string; path: string };
};

function source(
  id: string,
  displayName: string,
  path: string,
  enabled = true,
): MockSource {
  return {
    failure: null,
    health: "healthy",
    scan: { skillCount: 1, warnings: [] },
    source: { displayName, enabled, id, path },
  };
}

async function installProtectedLocalApi(
  page: Page,
  initialSources: MockSource[] = [],
): Promise<void> {
  await page.addInitScript(
    ({ sources: seededSources }: { readonly sources: MockSource[] }) => {
      type BrowserSource = MockSource;
      const sources = [...seededSources] as BrowserSource[];
      let sourceSequence = sources.length;
      const session = {
        clientCount: 1,
        projectDirectory: "/Users/example/project",
        projectFingerprint: "test-project",
        sessionId: "test-session",
        status: "running",
        waitingToExitAt: null,
      };
      const reply = (data: unknown, status = 200) =>
        new Response(JSON.stringify({ data, version: 1 }), {
          headers: { "Content-Type": "application/json" },
          status,
        });
      const missing = () =>
        new Response(
          JSON.stringify({
            error: {
              code: "SOURCE_NOT_FOUND",
              message: "Missing source",
              recoveryAction: "review-state",
              retryable: false,
            },
            version: 1,
          }),
          { headers: { "Content-Type": "application/json" }, status: 422 },
        );

      window.fetch = async (input, init) => {
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input.toString();
        const url = new URL(rawUrl, window.location.href);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? init.body : null;
        const json =
          body === null ? null : (JSON.parse(body) as Record<string, unknown>);

        if (url.pathname === "/api/session/bootstrap" && method === "POST") {
          return reply({
            credential: "test-credential",
            credentialExpiresAt: "2026-08-26T12:00:00.000Z",
            session,
          });
        }
        if (url.pathname === "/api/session" && method === "GET") {
          return reply(session);
        }
        if (url.pathname === "/api/session/shutdown" && method === "POST") {
          return reply({ status: "closed" });
        }
        if (url.pathname === "/api/project" && method === "GET") {
          return reply({
            links: [],
            manifestRevision: 0,
            recoveryDiagnostics: [],
          });
        }
        if (url.pathname === "/api/project/plan" && method === "POST") {
          return reply({
            baseRevision: 0,
            blockers: [],
            changes: [
              {
                candidateId: "catalog-candidate",
                kind: "add",
                linkName: "review",
              },
            ],
          });
        }
        if (url.pathname === "/api/project/apply" && method === "POST") {
          return reply({
            idempotent: false,
            snapshot: {
              links: [
                {
                  linkName: "review",
                  sourceState: "available",
                  state: "managed",
                },
              ],
              manifestRevision: 1,
              recoveryDiagnostics: [],
            },
          });
        }
        if (url.pathname === "/api/catalog" && method === "GET") {
          const source = sources[0]?.source ?? {
            displayName: "Personal",
            enabled: true,
            id: "source-catalog",
            path: "/Users/example/skills",
          };
          const candidate = {
            contentFingerprint: "catalog-fingerprint",
            displayName: "Review skill",
            id: "catalog-candidate",
            linkName: "review",
            parseWarning: null,
            relativePath: "review",
            source,
            summary: "Review a local project.",
          };
          return reply({
            groups: [
              {
                candidates: [candidate],
                conflictKey: "review",
                linkName: "review",
                matchingCandidateIds: [candidate.id],
              },
            ],
            query: url.searchParams.get("query") ?? "",
          });
        }
        if (
          url.pathname === "/api/catalog/candidates/catalog-candidate" &&
          method === "GET"
        ) {
          const source = sources[0]?.source ?? {
            displayName: "Personal",
            enabled: true,
            id: "source-catalog",
            path: "/Users/example/skills",
          };
          return reply({
            contentFingerprint: "catalog-fingerprint",
            displayName: "Review skill",
            id: "catalog-candidate",
            linkName: "review",
            markdownBody: "# Review\n\nSafe local Markdown content.",
            parseWarning: null,
            relativePath: "review",
            skillDirectory: `${source.path}/review`,
            skillFilePath: `${source.path}/review/SKILL.md`,
            source,
            summary: "Review a local project.",
          });
        }
        if (url.pathname === "/api/sources" && method === "GET") {
          return reply({ sources });
        }
        if (url.pathname === "/api/sources/validate" && method === "POST") {
          return reply({ path: String(json?.path ?? "/Users/example/skills") });
        }
        if (url.pathname === "/api/sources" && method === "POST") {
          sourceSequence += 1;
          const added: BrowserSource = {
            failure: null,
            health: "healthy",
            scan: { skillCount: 1, warnings: [] },
            source: {
              displayName: String(json?.displayName ?? "New source"),
              enabled: json?.enabled !== false,
              id: `source-${sourceSequence}`,
              path: String(json?.path ?? "/Users/example/skills"),
            },
          };
          sources.push(added);
          return reply(added, 201);
        }
        if (
          url.pathname === "/api/directories/entrypoints" &&
          method === "GET"
        ) {
          return reply({
            entries: [
              { kind: "home", label: "Home", path: "/Users/example" },
              { kind: "root", label: "Root", path: "/" },
            ],
          });
        }
        if (url.pathname === "/api/directories" && method === "GET") {
          return reply({
            directoryPath: url.searchParams.get("path") ?? "/Users/example",
            entries: [
              {
                name: "技能目录",
                path: "/Users/example/技能目录",
                realPath: "/Users/example/技能目录",
              },
            ],
          });
        }

        const sourceMatch = /^\/api\/sources\/([^/]+)(?:\/scan)?$/.exec(
          url.pathname,
        );
        if (sourceMatch !== null) {
          const sourceId = decodeURIComponent(sourceMatch[1] ?? "");
          const index = sources.findIndex(
            (candidate) => candidate.source.id === sourceId,
          );
          const current = sources[index];
          if (current === undefined) {
            return missing();
          }
          if (method === "PATCH") {
            const updated: BrowserSource = {
              ...current,
              source: {
                displayName: String(
                  json?.displayName ?? current.source.displayName,
                ),
                enabled: json?.enabled !== false,
                id: sourceId,
                path: String(json?.path ?? current.source.path),
              },
            };
            sources[index] = updated;
            return reply(updated);
          }
          if (method === "POST") {
            return reply(current);
          }
          if (method === "DELETE") {
            if (json?.confirmProjectImpact !== true) {
              return reply({
                impact: { managedLinkCount: 1, sourceId },
                kind: "impact",
              });
            }
            sources.splice(index, 1);
            return reply({ kind: "removed", source: current.source });
          }
        }
        return reply({});
      };

      class LocalWebSocket extends EventTarget {
        public constructor() {
          super();
          queueMicrotask(() => this.dispatchEvent(new Event("open")));
        }

        public close() {
          this.dispatchEvent(new Event("close"));
        }

        public send() {}
      }
      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: LocalWebSocket,
        writable: true,
      });
    },
    { sources: initialSources },
  );
}

test("onboards a first source without showing an empty workspace", async ({
  page,
}) => {
  await installProtectedLocalApi(page);
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("SkillPin");
  await expect(
    page.getByRole("navigation", { name: "SkillPin sections" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Set up your first source" }),
  ).toBeVisible();
  await expect(page.getByText(/dashboard/i)).toHaveCount(0);

  const add = page.getByRole("button", { name: "Add your first source" });
  await expect(add).toBeEnabled();
  await add.click();
  await page.getByLabel("Display name").fill("Personal skills");
  await page.getByRole("button", { name: "Browse directories" }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(
    page.getByRole("button", { name: "Use this folder" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this folder" }).click();
  await expect(page.getByLabel("Directory path")).toHaveValue(
    "/Users/example/技能目录",
  );
  await page.getByRole("button", { name: "Add source" }).click();

  await expect(page).toHaveURL(/\/sources$/);
  await expect(
    page.getByRole("navigation", { name: "SkillPin sections" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Personal skills" }),
  ).toBeVisible();
  await expect(page.getByText("1 skill discovered.")).toBeVisible();
});

test("manages existing sources with search, enablement, rescan, and guarded removal", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-existing", "Shared skills", "/Users/example/shared"),
  ]);
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: "sources" })).toBeVisible();
  await page.getByLabel("Search sources").fill("shared");
  await expect(
    page.getByRole("heading", { name: "Shared skills" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Disable" }).click();
  await expect(page.getByRole("button", { name: "Enable" })).toBeVisible();
  await page.getByRole("button", { name: "Rescan" }).click();
  await expect(page.getByText("1 skill discovered.")).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByRole("dialog", { name: "Remove source with project links?" }),
  ).toBeVisible();
  await expect(page.getByText(/managed project link/i)).toBeVisible();
  await page.getByRole("button", { name: "Remove source only" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up your first source" }),
  ).toBeVisible();
});

test("persists theme choice and returns focus after closing session panels", async ({
  page,
}) => {
  await installProtectedLocalApi(page);
  await page.goto("/");

  const details = page.getByRole("button", { name: "Session details" });
  await details.click();
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(details).toBeFocused();

  const end = page.getByRole("button", { name: "End SkillPin" });
  await end.click();
  await expect(
    page.getByRole("dialog", { name: "End SkillPin session" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(end).toBeFocused();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("browses searchable catalog candidates and safely renders an explicit skill detail", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  await expect(
    page.getByRole("heading", { exact: true, name: "Skills" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review skill" }),
  ).toBeVisible();
  await expect(page.getByText("Safe local Markdown content.")).toBeVisible();
  await page.getByLabel("Search skills").fill("local project");
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByText(
      /stage a candidate explicitly before it can change project links/i,
    ),
  ).toBeVisible();
});

test("stages a candidate, reviews the server plan, and confirms apply separately", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  await page.getByRole("button", { name: "Stage for project" }).click();
  await expect(page.getByText("1 staged project change")).toBeVisible();
  await page.getByRole("button", { name: "Review changes" }).click();

  const review = page.getByRole("dialog", { name: "Review project changes" });
  await expect(review).toBeVisible();
  await expect(review.getByText("add: review")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Confirm project changes" }),
  ).toHaveCount(0);
  await review.getByRole("button", { name: "Apply changes" }).click();

  const confirm = page.getByRole("dialog", { name: "Confirm project changes" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/Apply 1 reviewed change/i)).toBeVisible();
  await confirm.getByRole("button", { name: "Apply", exact: true }).click();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("1 staged project change")).toHaveCount(0);
});
