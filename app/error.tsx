"use client";

export default function Error({
  error,
  reset,
}: {
  error: unknown;
  reset: () => void;
}) {
  console.error(error);
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong.</h1>
      <p style={{ marginBottom: 16 }}>
        The page failed to load. You can try again.
      </p>
      <button
        onClick={reset}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#10b981",
          color: "white",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
