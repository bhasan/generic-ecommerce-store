import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Route metadata is included here because many frontend failures are only
    // reproducible on a specific page/query-string combination.
    console.error('UI Error Boundary', {
      error,
      info,
      path: window.location.pathname,
      search: window.location.search,
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { hasError } = this.state;
    const { children } = this.props;

    if (hasError) {
      return (
        <div className="container main-content" style={{ padding: '2rem' }}>
          <h2>Something went wrong</h2>
          <p>Try refreshing the page. If the problem persists, please try again later.</p>
          <button type="button" className="btn btn-primary" onClick={this.handleReload}>
            Refresh
          </button>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
