// Error boundaries: a render error in one page shows a recoverable message
// (and is reported) instead of blanking the whole app — the "black /code
// page" class of failure. A stale chunk after a deploy reloads the page once.
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isChunkLoadError, reloadForNewBuild, reportClientError } from '../services/errorReporting';

interface Props {
  children: React.ReactNode;
  /** 'page' fills the content area; 'app' fills the screen. */
  variant?: 'page' | 'app';
  /** Changing this clears the error (e.g. the route), so navigating away recovers. */
  resetKey?: unknown;
}
interface State { error: Error | null; resetKey: unknown }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isChunkLoadError(error) && reloadForNewBuild()) return;
    reportClientError({
      kind: isChunkLoadError(error) ? 'chunk' : 'render',
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: info?.componentStack || '',
    });
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const app = this.props.variant === 'app';
    const chunk = isChunkLoadError(error);
    return (
      <div
        role="alert"
        className={app
          ? 'flex min-h-dvh items-center justify-center bg-background p-6 text-foreground'
          : 'flex flex-1 items-center justify-center p-6'}
      >
        <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto mb-3 size-8 text-warning" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">
            {chunk ? 'Control Point was updated' : 'Something went wrong on this page'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {chunk
              ? 'Reload to get the latest version.'
              : 'The problem has been reported. You can try again, or reload the app — your data is safe.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            {!chunk && !app && (
              <button type="button" onClick={this.retry} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
                Try again
              </button>
            )}
            <button type="button" onClick={() => window.location.reload()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink">
              <RefreshCw className="size-4" aria-hidden="true" /> Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
