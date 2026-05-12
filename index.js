import { Component, StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import App from "./bishopton-empire-react.jsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return createElement(
        "div",
        {
          style: {
            padding: 24,
            fontFamily: "system-ui,sans-serif",
            background: "#1a0a0a",
            color: "#f88",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
          },
        },
        createElement("h1", { style: { fontSize: 18, margin: "0 0 12px" } }, "Application error"),
        createElement("p", { style: { margin: 0 } }, String(err)),
        createElement("pre", { style: { fontSize: 12, color: "#ccc", marginTop: 16 } }, err?.stack ?? "")
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error('Missing element #root in index.html');
}

createRoot(rootEl).render(
  createElement(StrictMode, null,
    createElement(ErrorBoundary, null, createElement(App))
  )
);
