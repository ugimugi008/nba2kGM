import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App boundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let readableMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          readableMessage = `${parsed.error} (${parsed.operationType ?? 'operation'} on ${parsed.path ?? 'database'})`;
        }
      } catch {
        // Not JSON
      }

      return (
        <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#131A26] border border-white/10 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-2xl font-bold text-white">
              Session Interrupted
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {readableMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Reload Hardwood GM
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
