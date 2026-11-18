import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Last line of defence: a rendering error shows a calm message with a way out, never a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Rendering error:', error, info.componentStack);
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="page-container">
        <div className="mx-auto max-w-md py-24 text-center">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="mt-4 text-4xl sm:text-5xl">We couldn&apos;t show this page</h1>
          <p className="mt-4 text-[15px] text-stone">Please try again. If it keeps happening, let us know.</p>
          <div className="mt-8 flex justify-center gap-3">
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/" className="btn-secondary">
              Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
