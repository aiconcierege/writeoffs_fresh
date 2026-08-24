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
    <main className="app-page -mx-4 -mb-10 sm:-mx-6 lg:-mx-8"><section className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow">Something went wrong</p><h1 className="page-title">We couldn’t load this page.</h1>
      <p className="page-description mx-auto">
        The page failed to load. You can try again.
      </p>
      <button
        onClick={reset}
        className="btn btn-primary mt-7"
      >
        Try again
      </button>
    </section></main>
  );
}
