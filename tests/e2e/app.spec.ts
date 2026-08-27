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
  readonly catalogLinkName?: string;
  readonly catalogSummary?: string;
  readonly markdownBody?: string;
  readonly projectLinkManaged?: boolean;
  readonly sourceListAvailable?: boolean;
};

type MockApiControls = {
  sourceListAvailable: boolean;
};

type MockApiEvents = {
  readonly applyRequests: number;
  readonly planRequests: number;
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
      catalogLinkName,
      catalogSummary,
      markdownBody,
      projectLinkManaged,
      sourceListAvailable,
      sources: seededSources,
    }: {
      readonly catalogLinkName: string;
      readonly catalogSummary: string;
      readonly markdownBody: string;
      readonly projectLinkManaged: boolean;
      readonly sourceListAvailable: boolean;
      readonly sources: MockSource[];
    }) => {
      type BrowserSource = MockSource;
      const sources = [...seededSources] as BrowserSource[];
      const projectLinks = projectLinkManaged
        ? [
            {
              linkName: "review",
              sourceState: "available",
              state: "managed",
            },
          ]
        : [];
      let sourceSequence = sources.length;
      const events = { applyRequests: 0, planRequests: 0, shutdownRequests: 0 };
      const controls = { sourceListAvailable };
      Object.defineProperty(window, "__skillpinMockApiEvents", {
        configurable: true,
        value: events,
      });
      Object.defineProperty(window, "__skillpinMockApiControls", {
        configurable: true,
        value: controls,
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
            links: projectLinks,
            manifestRevision: 0,
            recoveryDiagnostics: [],
          });
        }
        if (url.pathname === "/api/project/plan" && method === "POST") {
          events.planRequests += 1;
          const selection = Array.isArray(json?.selections)
            ? json.selections.find(
                (item): item is Record<string, unknown> =>
                  item !== null && typeof item === "object",
              )
            : undefined;
          const candidateId =
            typeof selection?.candidateId === "string"
              ? selection.candidateId
              : null;
          const kind =
            candidateId === null
              ? "remove"
              : projectLinkManaged
                ? "replace"
                : "add";
          return reply({
            baseRevision: 0,
            blockers: [],
            changes: [
              {
                candidateId,
                kind,
                linkName: "review",
              },
            ],
          });
        }
        if (url.pathname === "/api/project/apply" && method === "POST") {
          events.applyRequests += 1;
          const removing =
            Array.isArray(json?.selections) &&
            json.selections.some(
              (item) =>
                item !== null &&
                typeof item === "object" &&
                "candidateId" in item &&
                item.candidateId === null,
            );
          return reply({
            idempotent: false,
            snapshot: {
              links: removing
                ? []
                : [
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
            linkName: catalogLinkName,
            parseWarning: null,
            relativePath: "review",
            source,
            summary: catalogSummary,
          };
          return reply({
            groups: [
              {
                candidates: [candidate],
                conflictKey: catalogLinkName,
                linkName: catalogLinkName,
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
            linkName: catalogLinkName,
            markdownBody,
            parseWarning: null,
            relativePath: "review",
            skillDirectory: `${source.path}/review`,
            skillFilePath: `${source.path}/review/SKILL.md`,
            source,
            summary: catalogSummary,
          });
        }
        if (url.pathname === "/api/sources" && method === "GET") {
          if (!controls.sourceListAvailable) {
            return new Response(
              JSON.stringify({
                error: {
                  code: "SOURCE_LIST_UNAVAILABLE",
                  message: "Source list is temporarily unavailable",
                  recoveryAction: "retry",
                  retryable: true,
                },
                version: 1,
              }),
              {
                headers: { "Content-Type": "application/json" },
                status: 503,
              },
            );
          }
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
      catalogLinkName: options.catalogLinkName ?? "review",
      catalogSummary: options.catalogSummary ?? "Review a local project.",
      markdownBody:
        options.markdownBody ?? "# Review\n\nSafe local Markdown content.",
      projectLinkManaged: options.projectLinkManaged ?? false,
      sourceListAvailable: options.sourceListAvailable ?? true,
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

async function setSourceListAvailable(
  page: Page,
  sourceListAvailable: boolean,
): Promise<void> {
  await page.evaluate((available) => {
    const controls = (
      window as typeof window & {
        __skillpinMockApiControls?: MockApiControls;
      }
    ).__skillpinMockApiControls;
    if (controls === undefined) {
      throw new Error("Missing mock API controls.");
    }
    controls.sourceListAvailable = available;
  }, sourceListAvailable);
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

test("does not mistake an unavailable source list for first-time setup and recovers", async ({
  page,
}) => {
  await installProtectedLocalApi(
    page,
    [source("source-existing", "Shared skills", "/Users/example/shared")],
    { sourceListAvailable: false },
  );
  await page.goto("/skills");

  await expect(page).toHaveURL(/\/skills$/);
  await expect(
    page.getByRole("heading", { name: "无法加载技能源" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "设置你的第一个技能源" }),
  ).toHaveCount(0);

  await setSourceListAvailable(page, true);
  await page.getByRole("button", { name: "重新加载技能源" }).click();

  await expect(
    page.getByRole("navigation", { name: "SkillPin 功能分区" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "技能源" }).click();
  await expect(page).toHaveURL(/\/sources$/);
  await expect(page.getByRole("heading", { name: "技能源" })).toBeVisible();
});

test("manages existing sources with search, enablement, rescan, and guarded removal", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-existing", "Shared skills", "/Users/example/shared"),
  ]);
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: "技能源" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "技能源" })).toHaveCSS(
    "font-size",
    "28px",
  );
  await expect(page.getByRole("heading", { name: "Shared skills" })).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(page.getByLabel("搜索技能源")).toHaveCSS("font-size", "24px");
  await expect(page.getByLabel("搜索技能源")).toHaveCSS("min-height", "56px");
  await expect(page.getByRole("button", { name: "禁用" })).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(page.getByRole("button", { name: "禁用" })).toHaveCSS(
    "min-height",
    "56px",
  );
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

test("does not expose appearance controls and returns focus after closing session dialogs", async ({
  page,
}) => {
  await installProtectedLocalApi(page);
  await page.goto("/");

  await expect(page.getByRole("button", { name: "外观" })).toHaveCount(0);

  const end = page.getByRole("button", { name: "结束 SkillPin" });
  await end.click();
  await expect(
    page.getByRole("dialog", { name: "结束 SkillPin 会话" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(end).toBeFocused();
});

test("browses searchable catalog candidates and safely renders an explicit skill detail", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/");

  await expect(
    page
      .getByRole("navigation", { name: "SkillPin 功能分区" })
      .getByRole("button", {
        exact: true,
        name: "技能",
      }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByLabel("技能工作台").getByRole("heading", { name: "技能目录" }),
  ).toBeVisible();
  await expect(page.getByLabel("技能源与筛选")).toBeVisible();
  await expect(page.getByLabel("技能目录")).toBeVisible();
  await expect(page.getByLabel("技能详情")).toBeVisible();
  await expect(page.getByLabel("本地会话：已连接")).toBeVisible();
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Review skill" }),
  ).toBeVisible();
  await expect(page.getByText("Safe local Markdown content.")).toBeVisible();
  await page.getByLabel("搜索技能").fill("local project");
  await expect(page.getByRole("button", { name: /review/i })).toBeVisible();
  await expect(
    page.getByText("在列表中点击启用或移除，立即应用变更。"),
  ).toHaveCount(0);
  await expect(page.locator(".skill-row__context")).toContainText("Personal");
  await expect(page.locator(".identity-bar__end-session")).toHaveCSS(
    "font-size",
    "24px",
  );

  const catalogBox = await page.getByLabel("技能目录").boundingBox();
  const detailBox = await page.getByLabel("技能详情").boundingBox();
  expect(catalogBox?.height).toBeGreaterThan(400);
  expect(detailBox?.height).toBeGreaterThan(400);
  expect(catalogBox?.width).toBeGreaterThan(detailBox?.width ?? Infinity);
});

test("uses the approved skills-workbench typography and safely wraps wide rows", async ({
  page,
}) => {
  await installProtectedLocalApi(
    page,
    [source("source-catalog", "Personal", "/Users/example/skills")],
    {
      catalogLinkName:
        "a-long-skill-name-that-must-wrap-without-overlapping-its-action",
      catalogSummary:
        "A deliberately long skill summary verifies that the larger workbench typography wraps inside the catalog row instead of being hidden behind the action control.",
    },
  );
  await page.goto("/skills");

  await expect(
    page.getByRole("button", { name: "文字调试（临时）" }),
  ).toHaveCount(0);
  await expect(page.locator(".skill-row__name")).toHaveCSS("font-size", "28px");
  await expect(page.locator(".skill-row__summary")).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(page.getByRole("heading", { name: "Review skill" })).toHaveCSS(
    "font-size",
    "28px",
  );
  await expect(
    page.getByRole("button", { name: "技能", exact: true }),
  ).toHaveCSS("font-size", "24px");
  await expect(
    page.getByRole("button", { name: "技能", exact: true }),
  ).toHaveCSS("min-height", "52px");
  await expect(page.locator(".markdown-detail")).toHaveCSS("font-size", "24px");
  await expect(page.locator(".skill-row__action")).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(page.locator(".skill-row__action")).toHaveCSS(
    "min-height",
    "56px",
  );
  await expect(page.getByLabel("搜索技能")).toHaveCSS("font-size", "24px");

  const selectBox = await page.locator(".skill-row__select").boundingBox();
  const actionBox = await page.locator(".skill-row__action").boundingBox();
  expect(selectBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect((selectBox?.x ?? 0) + (selectBox?.width ?? 0)).toBeLessThanOrEqual(
    (actionBox?.x ?? 0) + 1,
  );
});

test("uses the styled status filter menu with keyboard and outside-click behavior", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  const filter = page.getByRole("button", {
    name: "筛选状态：全部状态",
  });
  await filter.focus();
  await filter.press("Enter");
  const menu = page.getByRole("listbox", { name: "筛选状态" });
  await expect(menu).toBeVisible();
  await page.getByRole("option", { name: "未启用" }).press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "筛选状态：未启用" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "筛选状态：未启用" }).click();
  await expect(menu).toBeVisible();
  await page.getByLabel("搜索技能").click();
  await expect(menu).toHaveCount(0);
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

test("ends a session without pending batch changes", async ({ page }) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

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
      planRequests: 0,
      shutdownRequests: 1,
    });
});

test("enables a skill directly without batch selection or confirmation", async ({
  page,
}) => {
  await installProtectedLocalApi(page, [
    source("source-catalog", "Personal", "/Users/example/skills"),
  ]);
  await page.goto("/skills");

  const catalog = page.getByLabel("技能目录");
  await catalog.getByRole("button", { name: "启用", exact: true }).click();

  await expect
    .poll(() => mockApiEvents(page))
    .toEqual({
      applyRequests: 1,
      planRequests: 1,
      shutdownRequests: 0,
    });
  await expect(catalog.getByText("已启用")).toBeVisible();
  await expect(
    catalog.getByRole("button", { name: "移除", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("项目变更操作")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /确认/ })).toHaveCount(0);
});

test("removes an enabled skill directly without confirmation", async ({
  page,
}) => {
  await installProtectedLocalApi(
    page,
    [source("source-catalog", "Personal", "/Users/example/skills")],
    { projectLinkManaged: true },
  );
  await page.goto("/skills");

  const catalog = page.getByLabel("技能目录");
  await expect(catalog.getByText("已启用")).toBeVisible();
  await catalog.getByRole("button", { name: "移除", exact: true }).click();

  await expect
    .poll(() => mockApiEvents(page))
    .toEqual({
      applyRequests: 1,
      planRequests: 1,
      shutdownRequests: 0,
    });
  await expect(catalog.getByText("未启用")).toBeVisible();
  await expect(
    catalog.getByRole("button", { name: "启用", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("项目变更操作")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /确认/ })).toHaveCount(0);
});
