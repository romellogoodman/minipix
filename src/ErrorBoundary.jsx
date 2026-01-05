import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "20px",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          <h1 style={{ marginBottom: "16px", color: "#1b1b1b" }}>
            Something went wrong
          </h1>
          <p style={{ marginBottom: "24px", color: "#666", textAlign: "center" }}>
            An unexpected error occurred while rendering.
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: "#b0afed",
              color: "#1b1b1b",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "500",
            }}
          >
            Try again
          </button>
          {import.meta.env.DEV && this.state.error && (
            <pre
              style={{
                marginTop: "24px",
                padding: "16px",
                backgroundColor: "#f5f5f5",
                borderRadius: "8px",
                maxWidth: "100%",
                overflow: "auto",
                fontSize: "12px",
                color: "#cc4722",
              }}
            >
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
