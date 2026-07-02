import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const BASE = import.meta.env.BASE_URL;

/** Catches render crashes anywhere below it — e.g. a puzzle or saved-progress
 *  shape we didn't anticipate — so the page shows a way out instead of going
 *  fully blank. Navigating away uses a real page load rather than SPA
 *  routing, since that's the only thing guaranteed to clear the crashed
 *  render tree. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app">
          <p className="error">Something went wrong loading this page.</p>
          <div className="modal-actions" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => (window.location.href = BASE)}>
              Go home
            </button>
            <button className="btn btn-accent" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
