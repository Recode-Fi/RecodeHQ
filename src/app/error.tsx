"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-24 text-center">
      <h1 className="text-lg font-semibold">Something failed</h1>
      <p className="mt-2 text-[12.5px] text-muted">
        A data surface crashed while rendering. No fabricated values were shown.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-[4px] btn-accent px-4 py-2 text-[12.5px] font-semibold text-green"
      >
        Retry
      </button>
    </div>
  );
}
