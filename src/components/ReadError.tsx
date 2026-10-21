"use client";

export function ReadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="my-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <span>{message}</span>
      <button type="button" onClick={onRetry} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-medium hover:bg-rose-100">
        Try again
      </button>
    </div>
  );
}
