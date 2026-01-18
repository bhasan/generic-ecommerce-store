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
    // eslint-disable-next-line no-console
    console.error('UI Error Boundary', { error, info });
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
