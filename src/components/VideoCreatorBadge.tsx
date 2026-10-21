export function formatCreatorHandle(handle?: string | null) {
  const trimmed = String(handle ?? "").trim();
  if (!trimmed) return "Creator unknown";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

export function VideoCreatorBadge({
  handle,
  size = "sm",
  className = "",
}: {
  handle?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const displayHandle = formatCreatorHandle(handle);
  const sizeClass =
    size === "lg"
      ? "h-full min-h-[180px] px-4 py-5"
      : size === "md"
        ? "h-16 w-36 px-3 py-2"
        : "h-10 w-28 px-2.5 py-1.5";

  return (
    <div
      className={`flex flex-col justify-center rounded-md border border-slate-200 bg-slate-50 ${sizeClass} ${className}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Creator
      </span>
      <span
        className={`truncate font-semibold text-slate-800 ${
          size === "lg" ? "text-lg" : "text-xs"
        }`}
        title={displayHandle}
      >
        {displayHandle}
      </span>
    </div>
  );
}
