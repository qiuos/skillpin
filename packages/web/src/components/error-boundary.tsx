import { Component, type PropsWithChildren, type ReactNode } from "react";

interface ErrorBoundaryState {
  readonly failed: boolean;
}

export class ErrorBoundary extends Component<
  PropsWithChildren,
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = { failed: false };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  public override componentDidCatch(): void {
    // Do not report client state or local session credentials from the browser.
  }

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <h1>SkillPin needs to restart</h1>
          <p>Refresh this local page to reconnect to SkillPin.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
