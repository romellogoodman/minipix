import { Component } from "react";

class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-screen">
        <h1 className="error-screen__title">Something went wrong</h1>
        <p className="error-screen__text">An unexpected error occurred while rendering.</p>
        <button type="button" className="btn btn--primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
        {import.meta.env.DEV && <pre className="error-screen__detail">{error.toString()}</pre>}
      </div>
    );
  }
}

export default ErrorBoundary;
