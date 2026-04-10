"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#fafafa",
          }}
        >
          <div style={{ maxWidth: "480px", textAlign: "center" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 12px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#666", fontSize: "14px", margin: "0 0 24px" }}>
              A critical error occurred. Please refresh the page.
            </p>
            {error.digest && (
              <p style={{ color: "#999", fontSize: "12px", fontFamily: "monospace", margin: "0 0 16px" }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                background: "#004ac6",
                color: "white",
                border: "none",
                borderRadius: "8px",
                padding: "10px 20px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
