import { useCallback, useEffect, useState } from "react";

import {
  Badge,
  Button,
  Dialog,
  Drawer,
  EmptyState,
  Tooltip,
} from "../components/controls.js";
import { ThemePicker, useThemePreference } from "./theme.js";
import { useSession } from "../features/session/session-context.js";

const routes = ["/onboarding", "/skills", "/sources"] as const;
type AppRoute = (typeof routes)[number];

function routeFor(pathname: string): AppRoute {
  return routes.includes(pathname as AppRoute)
    ? (pathname as AppRoute)
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

function RouteContent({
  route,
  readOnly,
}: {
  readonly route: AppRoute;
  readonly readOnly: boolean;
}) {
  const action = readOnly ? (
    <Badge tone="warning">Read-only until reconnection</Badge>
  ) : (
    <Badge tone="success">Ready for the next step</Badge>
  );
  if (route === "/onboarding") {
    return (
      <EmptyState
        action={action}
        body="Connect a source directory to begin creating a private catalog of local skills."
        title="Set up your first source"
      />
    );
  }
  if (route === "/sources") {
    return (
      <EmptyState
        action={action}
        body="Sources added in the next step will appear here, along with their scan status and health."
        title="No source directories yet"
      />
    );
  }
  return (
    <EmptyState
      action={action}
      body="After a source is available, SkillPin will surface matching skills here without turning this into a dashboard."
      title="Your skills will appear here"
    />
  );
}

export function App() {
  const [route, navigate] = useRoute();
  const { connection, error, isReadOnly, session, shutdown } = useSession();
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [themePreference, setThemePreference] = useThemePreference();
  const closeEndDialog = useCallback(() => setShowEndDialog(false), []);
  const closeDetails = useCallback(() => setShowDetails(false), []);
  const endSession = useCallback(() => {
    closeEndDialog();
    void shutdown();
  }, [closeEndDialog, shutdown]);
  const status = connectionCopy(connection);
  const projectPath =
    session?.projectDirectory ?? "Connecting to protected local project…";

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
          <Button
            disabled={connection === "exiting"}
            onClick={() => setShowEndDialog(true)}
            variant="tertiary"
          >
            End SkillPin
          </Button>
        </div>
      </header>
      <div className="workspace">
        <nav aria-label="SkillPin sections" className="side-nav">
          <p className="side-nav__label">Workspace</p>
          {routes.map((item) => (
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
        <main id="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">Protected local workspace</p>
              <h1>{route.slice(1)}</h1>
            </div>
            {isReadOnly ? (
              <p className="connection-notice" role="status">
                Changes are disabled while the local session reconnects. Any
                future selections stay in this page.
              </p>
            ) : null}
          </div>
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
          <RouteContent readOnly={isReadOnly} route={route} />
        </main>
      </div>
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
