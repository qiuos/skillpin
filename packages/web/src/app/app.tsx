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
import { useSession } from "../features/session/session-context.js";
import {
  SourceProvider,
  useSources,
} from "../features/sources/source-context.js";
import { SourceDialog } from "../features/sources/source-dialog.js";
import { SourceListPage } from "../features/sources/source-list-page.js";
import { ThemePicker, useThemePreference } from "./theme.js";

const workspaceRoutes = ["/skills", "/sources"] as const;
type AppRoute = "/onboarding" | (typeof workspaceRoutes)[number];

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
  const navigate = (nextRoute: AppRoute) => {
    window.history.pushState(null, "", nextRoute);
    setRoute(nextRoute);
  };
  return [route, navigate];
}

function connectionCopy(
  connection: ReturnType<typeof useSession>["connection"],
): { label: string; tone: "accent" | "neutral" | "success" | "warning" } {
  switch (connection) {
    case "online":
      return { label: "Connected", tone: "success" };
    case "connecting":
      return { label: "Connecting", tone: "accent" };
    case "reconnecting":
      return { label: "Reconnecting", tone: "warning" };
    case "exiting":
      return { label: "Ending session", tone: "warning" };
    case "disconnected":
      return { label: "Disconnected", tone: "neutral" };
    case "error":
      return { label: "Connection unavailable", tone: "warning" };
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
  const projectPath =
    session?.projectDirectory ?? "Connecting to protected local project…";
  const hasSources = sources.length > 0;
  const sourceDialogOpen = editingSource !== undefined;

  useEffect(() => {
    if (!sourcesLoading && !hasSources && route !== "/onboarding") {
      navigate("/onboarding");
    }
  }, [hasSources, navigate, route, sourcesLoading]);

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
        Skip to content
      </a>
      <header className="app-header">
        <div className="app-header__brand">
          <span aria-hidden="true" className="brand-mark">
            S
          </span>
          <span>SkillPin</span>
        </div>
        <div className="project-identity">
          <span className="project-identity__name">Local project</span>
          <code title={projectPath}>{projectPath}</code>
        </div>
        <div className="app-header__actions">
          <Tooltip content="Current protected local-session connection">
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
          {!hasSources ? (
            <Button onClick={() => setShowDetails(true)} variant="tertiary">
              Session details
            </Button>
          ) : null}
          <Button
            disabled={connection === "exiting"}
            onClick={() => setShowEndDialog(true)}
            variant="tertiary"
          >
            End SkillPin
          </Button>
        </div>
      </header>
      <div
        className={hasSources ? "workspace" : "workspace workspace--onboarding"}
      >
        {hasSources ? (
          <nav aria-label="SkillPin sections" className="side-nav">
            <p className="side-nav__label">Workspace</p>
            {workspaceRoutes.map((item) => (
              <button
                aria-current={route === item ? "page" : undefined}
                className={
                  route === item
                    ? "side-nav__item side-nav__item--active"
                    : "side-nav__item"
                }
                key={item}
                onClick={() => navigate(item)}
                type="button"
              >
                {item.slice(1)}
              </button>
            ))}
            <Button
              className="side-nav__details"
              onClick={() => setShowDetails(true)}
              variant="tertiary"
            >
              Session details
            </Button>
          </nav>
        ) : null}
        <main id="main-content" tabIndex={-1}>
          {hasSources ? (
            <div className="page-heading">
              <div>
                <p className="eyebrow">Protected local workspace</p>
                <h1>{route.slice(1)}</h1>
              </div>
              {isReadOnly ? (
                <p className="connection-notice" role="status">
                  Changes are disabled while the local session reconnects.
                </p>
              ) : null}
            </div>
          ) : null}
          {session?.status === "waiting-to-exit" ? (
            <p className="connection-notice" role="status">
              This local session is in its 60-second exit grace period.
              Reconnect to keep it open.
            </p>
          ) : null}
          {error === null ? null : (
            <section className="error-notice" role="alert">
              <h2>Could not connect to SkillPin</h2>
              <p>{error.message}</p>
            </section>
          )}
          {sourcesLoading && session !== null ? (
            <p className="source-loading" role="status">
              Loading configured sources…
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
        description="Ending closes this protected local session. You can open SkillPin again from your project directory."
        onClose={closeEndDialog}
        open={showEndDialog}
        title="End SkillPin session"
      >
        <div className="dialog__actions">
          <Button onClick={closeEndDialog} variant="secondary">
            Keep session open
          </Button>
          <Button onClick={endSession} variant="danger">
            End SkillPin
          </Button>
        </div>
      </Dialog>
      <Drawer
        description="Only session metadata is shown here. Credentials are never displayed or stored in the browser."
        onClose={closeDetails}
        open={showDetails}
        title="Local session"
      >
        <ThemePicker
          preference={themePreference}
          setPreference={setThemePreference}
        />
        <dl className="session-details">
          <dt>Project directory</dt>
          <dd>
            <code>{projectPath}</code>
          </dd>
          <dt>Session status</dt>
          <dd>{session?.status ?? "Waiting for session"}</dd>
          <dt>Connected pages</dt>
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
