import { useCallback, useEffect, useState } from "react";

import type { LocalSourceInput, LocalSourceSummary } from "@skillpin/core";

import { Button, Dialog } from "../components/controls.js";
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
): string {
  switch (connection) {
    case "online":
      return "已连接";
    case "connecting":
      return "连接中";
    case "reconnecting":
      return "重新连接中";
    case "exiting":
      return "正在结束会话";
    case "disconnected":
      return "已断开";
    case "error":
      return "连接不可用";
  }
}

function AppShell() {
  const [route, navigate] = useRoute();
  const {
    connection,
    error: sessionError,
    isReadOnly,
    session,
    shutdown,
  } = useSession();
  const {
    add,
    error: sourceError,
    hasLoaded: sourcesLoaded,
    isLoading: sourcesLoading,
    refresh,
    sources,
    update,
  } = useSources();
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<
    LocalSourceSummary | null | undefined
  >(undefined);
  const closeEndDialog = useCallback(() => setShowEndDialog(false), []);
  const closeSourceDialog = useCallback(() => setEditingSource(undefined), []);
  const endSession = useCallback(() => {
    closeEndDialog();
    void shutdown();
  }, [closeEndDialog, shutdown]);
  const statusLabel = connectionCopy(connection);
  const hasSources = sources.length > 0;
  const sourceDialogOpen = editingSource !== undefined;

  useEffect(() => {
    if (
      sourcesLoaded &&
      !sourcesLoading &&
      !hasSources &&
      route !== "/onboarding"
    ) {
      navigate("/onboarding");
    }
  }, [hasSources, navigate, route, sourcesLoaded, sourcesLoading]);

  useEffect(() => {
    if (session === null || !sourcesLoaded || sourcesLoading || !hasSources) {
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
  }, [hasSources, navigate, route, session, sourcesLoaded, sourcesLoading]);

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

  const workSurface = !sourcesLoaded ? null : !hasSources ? (
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
      <div className="app-shell">
        <header className="identity-bar ot-window" role="banner">
          <div className="identity-bar__brand">
            <h1 className="product-name">SkillPin</h1>
            {hasSources ? (
              <nav aria-label="SkillPin 功能分区" className="identity-nav">
                {workspaceRoutes.map((item) => (
                  <button
                    aria-current={route === item ? "page" : undefined}
                    className={
                      route === item
                        ? "identity-nav__item identity-nav__item--active"
                        : "identity-nav__item"
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
          </div>
          <div className="identity-bar__actions">
            <span className="connection">
              <span
                aria-hidden="true"
                className={`status-dot status-dot--${connection}`}
              />
              {statusLabel}
            </span>
            <Button
              disabled={connection === "exiting"}
              onClick={() => setShowEndDialog(true)}
              variant="secondary"
            >
              结束 SkillPin
            </Button>
          </div>
        </header>
        <div
          className={
            hasSources ? "workspace" : "workspace workspace--onboarding"
          }
        >
          <main
            className={
              hasSources && route === "/skills"
                ? "main-content main-content--workbench"
                : hasSources && route === "/sources"
                  ? "main-content main-content--sources"
                  : "main-content"
            }
            id="main-content"
            tabIndex={-1}
          >
            {hasSources && isReadOnly ? (
              <p className="connection-notice" role="status">
                本地会话重新连接中，暂无法修改设置。
              </p>
            ) : null}
            {session?.status === "waiting-to-exit" ? (
              <p className="connection-notice" role="status">
                该本地会话处于 60 秒退出缓冲期。重新连接以保持开启。
              </p>
            ) : null}
            {sessionError === null ? null : (
              <section className="error-notice" role="alert">
                <h2>无法连接至 SkillPin</h2>
                <p>{sessionError.message}</p>
              </section>
            )}
            {sourceError === null ? null : (
              <section className="error-notice" role="alert">
                <h2>无法加载技能源</h2>
                <p>{sourceError.message}</p>
                <Button onClick={() => void refresh()} variant="secondary">
                  重新加载技能源
                </Button>
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
