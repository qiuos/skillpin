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

type MockApiOptions = {
  readonly markdownBody?: string;
};

type MockApiEvents = {
  readonly applyRequests: number;
  readonly shutdownRequests: number;
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
  options: MockApiOptions = {},
): Promise<void> {
  await page.addInitScript(
    ({
      markdownBody,
      sources: seededSources,
    }: {
      readonly markdownBody: string;
      readonly sources: MockSource[];
    }) => {
      type BrowserSource = MockSource;
      const sources = [...seededSources] as BrowserSource[];
      let sourceSequence = sources.length;
      const events = { applyRequests: 0, shutdownRequests: 0 };
      Object.defineProperty(window, "__skillpinMockApiEvents", {
        configurable: true,
        value: events,
      });
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
          events.shutdownRequests += 1;
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
          events.applyRequests += 1;
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
            markdownBody,
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
    {
      markdownBody:
        options.markdownBody ?? "# Review\n\nSafe local Markdown content.",
      sources: initialSources,
    },
  );
}

async function mockApiEvents(page: Page): Promise<MockApiEvents> {
  return page.evaluate(() => {
    const events = (
      window as typeof window & {
        __skillpinMockApiEvents?: MockApiEvents;
      }
    ).__skillpinMockApiEvents;
    if (events === undefined) {
      throw new Error("Missing mock API event recorder.");
    }
    return events;
  });
}

test("onboards a first source without showing an empty workspace", async ({
  page,
}) => {
  await installProtectedLocalApi(page);
  await page.goto("/");

  await expect(page.getByRole("banner")).toContainText("SkillPin");
  await expect(
    page.getByRole("navigation", { name: "SkillPin 功能分区" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "设置你的第一个技能源" }),
  ).toBeVisible();
  await expect(page.getByText(/dashboard/i)).toHaveCount(0);

  const add = page.getByRole("button", { name: "添加第一个技能源" });
  await expect(add).toBeEnabled();
  await add.click();
  await page.getByLabel("显示名称").fill("Personal skills");
  await page.getByRole("button", { name: "浏览目录" }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(
    page.getByRole("button", { name: "选择此文件夹" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "选择此文件夹" }).click();
  await expect(page.getByLabel("目录路径")).toHaveValue(
    "/Users/example/技能目录",
  );
  await page.getByRole("button", { name: "添加技能源" }).click();

  await expect(page).toHaveURL(/\/sources$/);
  await expect(
    page.getByRole("navigation", { name: "SkillPin 功能分区" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Personal skills" }),
  ).toBeVisible();
  await expect(page.getByText("已发现 1 个技能。")).toBeVisible();
});

test("manages existing sources with search, enablement, rescan, and guarded removal", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-existing", "Shared skills", "/Users/example/shared"),
  ]);
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: "技能源" })).toBeVisible();
  await page.getByLabel("搜索技能源").fill("shared");
  await expect(
    page.getByRole("heading", { name: "Shared skills" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "禁用" }).click();
  await expect(page.getByRole("button", { name: "启用" })).toBeVisible();
  await page.getByRole("button", { name: "重新扫描" }).click();
  await expect(page.getByText("已发现 1 个技能。")).toBeVisible();
  await page.getByRole("button", { name: "移除" }).click();
  await expect(
    page.getByRole("dialog", { name: "移除仍有项目链接的技能源？" }),
  ).toBeVisible();
  await expect(page.getByText(/受管项目链接/)).toBeVisible();
  await page.getByRole("button", { name: "仅移除技能源" }).click();
  await expect(
    page.getByRole("heading", { name: "设置你的第一个技能源" }),
  ).toBeVisible();
});

test("persists theme choice and returns focus after closing session panels", async ({
  page,
}) => {
  await installProtectedLocalApi(page);
  await page.goto("/");

  const details = page.getByRole("button", { name: "会话详情" });
  await details.click();
  await page.getByRole("radio", { name: "浅色模式" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "关闭面板" }).click();
  await expect(details).toBeFocused();

  const end = page.getByRole("button", { name: "结束 SkillPin" });
  await end.click();
  await expect(
    page.getByRole("dialog", { name: "结束 SkillPin 会话" }),
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
    page.getByLabel("技能工作台").getByRole("heading", { name: "技能目录" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review skill" }),
  ).toBeVisible();
  await expect(page.getByText("Safe local Markdown content.")).toBeVisible();
  await page.getByLabel("搜索技能").fill("local project");
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByText(
      /先显式暂存候选，再变更项目链接/,
    ),
  ).toBeVisible();
});

test("does not execute untrusted Markdown from a skill detail", async ({
  page,
}) => {
  await installProtectedLocalApi(
    page,
    [source("source-catalog", "Personal", "/Users/example/skills")],
    {
      markdownBody:
        "# Review\n\n<script>document.documentElement.dataset.pwned = 'yes'</script>\n<iframe src=\"https://attacker.example\"></iframe>\n\nSafe local Markdown content.",
    },
  );
  await page.goto("/skills");

  await expect(page.getByText("Safe local Markdown content.")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(
    page.evaluate(() => document.documentElement.dataset.pwned),
  ).resolves.toBeUndefined();
});

test("confirms ending a session with staged changes without applying them", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  await page.getByRole("button", { name: "暂存到项目" }).click();
  await expect(page.getByText("已暂存 1 项项目变更")).toBeVisible();
  await page.getByRole("button", { name: "结束 SkillPin" }).click();

  const dialog = page.getByRole("dialog", { name: "结束 SkillPin 会话" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "结束 SkillPin" }).click();
  await expect(
    page.getByRole("button", { name: "结束 SkillPin" }),
  ).toBeDisabled();
  await expect
    .poll(() => mockApiEvents(page))
    .toEqual({
      applyRequests: 0,
      shutdownRequests: 1,
    });
});

test("stages a candidate, reviews the server plan, and confirms apply separately", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  await page.getByRole("button", { name: "暂存到项目" }).click();
  await expect(page.getByText("已暂存 1 项项目变更")).toBeVisible();
  await page.getByRole("button", { name: "审查变更" }).click();

  const review = page.getByRole("dialog", { name: "审查项目变更" });
  await expect(review).toBeVisible();
  await expect(review.getByText("add: review")).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "确认项目变更" }),
  ).toHaveCount(0);
  await review.getByRole("button", { name: "应用变更" }).click();

  const confirm = page.getByRole("dialog", { name: "确认项目变更" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/将 1 项已审查变更应用到当前项目/)).toBeVisible();
  await confirm.getByRole("button", { name: "应用", exact: true }).click();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("已暂存 1 项项目变更")).toHaveCount(0);
});
