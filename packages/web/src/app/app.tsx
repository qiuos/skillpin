import { useCallback, useEffect, useState } from "react";

import type { LocalSourceInput, LocalSourceSummary } from "@skillpin/core";

import {
  Badge,
  Button,
  Dialog,
  Drawer,
  Tooltip,
} from "../components/controls.js";
import { SkillsWorkbenchPage } from "../features/catalog/skills-workbench-page.js";
import { CatalogProvider } from "../features/catalog/catalog-context.js";
import { OnboardingPage } from "../features/onboarding/onboarding-page.js";
import {
  consumeReturnRoute,
  useSession,
} from "../features/session/session-context.js";
import {
  SourceProvider,
  useSources,
} from "../features/sources/source-context.js";
import { SourceDialog } from "../features/sources/source-dialog.js";
import { SourceListPage } from "../features/sources/source-list-page.js";
import { ThemePicker, useThemePreference } from "./theme.js";

const workspaceRoutes = ["/skills", "/sources"] as const;
type AppRoute = "/onboarding" | (typeof workspaceRoutes)[number];

const routeTitleMap: Record<AppRoute, string> = {
  "/onboarding": "配置引导",
  "/skills": "技能",
  "/sources": "技能源",
};

function routeFor(pathname: string): AppRoute {
  return pathname === "/skills" || pathname === "/sources"
    ? pathname
    : "/onboarding";
}

function useRoute(): readonly [AppRoute, (route: AppRoute) => void] {
  const [route, setRoute] = useState(() => routeFor(window.location.pathname));
  useEffect(() => {
    const updateRoute = () => setRoute(routeFor(window.location.pathname));
    window.addEventListener("popstate", updateRoute);
    return () => window.removeEventListener("popstate", updateRoute);
  }, []);
  const navigate = useCallback((nextRoute: AppRoute) => {
    window.history.pushState(null, "", nextRoute);
    setRoute(nextRoute);
  }, []);
  return [route, navigate];
}

function connectionCopy(
  connection: ReturnType<typeof useSession>["connection"],
): { label: string; tone: "accent" | "neutral" | "success" | "warning" } {
  switch (connection) {
    case "online":
      return { label: "已连接", tone: "success" };
    case "connecting":
      return { label: "连接中", tone: "accent" };
    case "reconnecting":
      return { label: "重新连接中", tone: "warning" };
    case "exiting":
      return { label: "正在结束会话", tone: "warning" };
    case "disconnected":
      return { label: "已断开", tone: "neutral" };
    case "error":
      return { label: "连接不可用", tone: "warning" };
  }
}

function AppShell() {
  const [route, navigate] = useRoute();
  const { connection, error, isReadOnly, session, shutdown } = useSession();
  const { add, isLoading: sourcesLoading, sources, update } = useSources();
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [editingSource, setEditingSource] = useState<
    LocalSourceSummary | null | undefined
  >(undefined);
  const [themePreference, setThemePreference] = useThemePreference();
  const closeEndDialog = useCallback(() => setShowEndDialog(false), []);
  const closeDetails = useCallback(() => setShowDetails(false), []);
  const closeSourceDialog = useCallback(() => setEditingSource(undefined), []);
  const endSession = useCallback(() => {
    closeEndDialog();
    void shutdown();
  }, [closeEndDialog, shutdown]);
  const status = connectionCopy(connection);
  const projectPath = session?.projectDirectory ?? "正在连接安全的本地项目…";
  const hasSources = sources.length > 0;
  const sourceDialogOpen = editingSource !== undefined;

  useEffect(() => {
    if (!sourcesLoading && !hasSources && route !== "/onboarding") {
      navigate("/onboarding");
    }
  }, [hasSources, navigate, route, sourcesLoading]);

  useEffect(() => {
    if (session === null || sourcesLoading || !hasSources) {
      return;
    }
    const returned = consumeReturnRoute();
    if (returned === null || returned === route) {
      return;
    }
    if (
      returned === "/skills" ||
      returned === "/sources" ||
      returned === "/onboarding"
    ) {
      navigate(returned);
    }
  }, [hasSources, navigate, route, session, sourcesLoading]);

  const saveSource = useCallback(
    async (input: LocalSourceInput) => {
      const saved =
        editingSource === null
          ? await add(input)
          : await update(editingSource?.source.id ?? "", input);
      if (editingSource === null) {
        navigate("/sources");
      }
      return saved;
    },
    [add, editingSource, navigate, update],
  );

  const workSurface = !hasSources ? (
    <OnboardingPage
      disabled={isReadOnly}
      onAddSource={() => setEditingSource(null)}
    />
  ) : route === "/sources" ? (
    <SourceListPage
      disabled={isReadOnly}
      onAddSource={() => setEditingSource(null)}
      onEditSource={setEditingSource}
    />
  ) : (
    <SkillsWorkbenchPage />
  );

  return (
    <div className="application">
      <a className="skip-link" href="#main-content">
        跳至主要内容
      </a>
      <header className="app-header">
        <div className="app-header__brand">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span>SkillPin</span>
        </div>
        {hasSources ? (
          <nav aria-label="SkillPin 功能分区" className="top-nav">
            {workspaceRoutes.map((item) => (
              <button
                aria-current={route === item ? "page" : undefined}
                className={
                  route === item
                    ? "top-nav__item top-nav__item--active"
                    : "top-nav__item"
                }
                key={item}
                onClick={() => navigate(item)}
                type="button"
              >
                {routeTitleMap[item]}
              </button>
            ))}
          </nav>
        ) : null}
        <div className="project-identity">
          <span className="project-identity__name">本地项目</span>
          <code title={projectPath}>{projectPath}</code>
        </div>
        <div className="app-header__actions">
          <Tooltip content="当前安全的本地会话连接状态">
            <span>
              <Badge tone={status.tone}>
                <span
                  aria-hidden="true"
                  className={`status-dot status-dot--${connection}`}
                />
                {status.label}
              </Badge>
            </span>
          </Tooltip>
          <Button onClick={() => setShowDetails(true)} variant="tertiary">
            会话详情
          </Button>
          <Button
            disabled={connection === "exiting"}
            onClick={() => setShowEndDialog(true)}
            variant="tertiary"
          >
            结束 SkillPin
          </Button>
        </div>
      </header>
      <div
        className={hasSources ? "workspace" : "workspace workspace--onboarding"}
      >
        <main
          className={
            hasSources && route === "/skills"
              ? "main-content main-content--workbench"
              : "main-content"
          }
          id="main-content"
          tabIndex={-1}
        >
          {hasSources && route !== "/skills" ? (
            <div className="page-heading">
              <div>
                <p className="eyebrow">安全的本地工作区</p>
                <h1>{routeTitleMap[route]}</h1>
              </div>
              {isReadOnly ? (
                <p className="connection-notice" role="status">
                  本地会话重新连接中，暂无法修改设置。
                </p>
              ) : null}
            </div>
          ) : null}
          {hasSources && route === "/skills" && isReadOnly ? (
            <p className="connection-notice" role="status">
              本地会话重新连接中，暂无法修改设置。
            </p>
          ) : null}
          {session?.status === "waiting-to-exit" ? (
            <p className="connection-notice" role="status">
              该本地会话处于 60 秒退出缓冲期。重新连接以保持开启。
            </p>
          ) : null}
          {error === null ? null : (
            <section className="error-notice" role="alert">
              <h2>无法连接至 SkillPin</h2>
              <p>{error.message}</p>
            </section>
          )}
          {sourcesLoading && session !== null ? (
            <p className="source-loading" role="status">
              正在加载已配置的技能源…
            </p>
          ) : (
            workSurface
          )}
        </main>
      </div>
      <SourceDialog
        disabled={isReadOnly}
        onClose={closeSourceDialog}
        onSave={saveSource}
        open={sourceDialogOpen}
        source={editingSource ?? null}
      />
      <Dialog
        description="结束会话将关闭当前安全的本地进程。你可以随时在项目目录中重新打开 SkillPin。"
        onClose={closeEndDialog}
        open={showEndDialog}
        title="结束 SkillPin 会话"
      >
        <div className="dialog__actions">
          <Button onClick={closeEndDialog} variant="secondary">
            保持会话开启
          </Button>
          <Button onClick={endSession} variant="danger">
            结束 SkillPin
          </Button>
        </div>
      </Dialog>
      <Drawer
        description="此处仅展示会话元数据。凭据绝不会在浏览器中显示或存储。"
        onClose={closeDetails}
        open={showDetails}
        title="本地会话"
      >
        <ThemePicker
          preference={themePreference}
          setPreference={setThemePreference}
        />
        <dl className="session-details">
          <dt>项目目录</dt>
          <dd>
            <code>{projectPath}</code>
          </dd>
          <dt>会话状态</dt>
          <dd>{session?.status ?? "等待会话建立"}</dd>
          <dt>已连接页面</dt>
          <dd>{session?.clientCount ?? 0}</dd>
        </dl>
      </Drawer>
    </div>
  );
}

export function App() {
  return (
    <SourceProvider>
      <CatalogProvider>
        <AppShell />
      </CatalogProvider>
    </SourceProvider>
  );
}
