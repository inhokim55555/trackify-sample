import { NextRequest, NextResponse } from "next/server";
import { AppError, badRequest } from "@/lib/errors";
import { safeErrorLogDetails, safeErrorMessage } from "@/lib/safe-output";

const DEFAULT_MAX_JSON_BYTES = 1_000_000;

export type SortDirection = "asc" | "desc";

export async function readJsonObject(
  req: NextRequest,
  options: { maxBytes?: number } = {}
): Promise<Record<string, unknown>> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw badRequest("Request body is too large");
  }

  let size=0;const chunks:Uint8Array[]=[];const reader=req.body?.getReader();if(reader){try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw badRequest('Request body is too large');}chunks.push(value);}}finally{reader.releaseLock();}}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}let body:unknown={};try{body=JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{}

  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

export function parseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function parseClampedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseSort<T>(
  searchParams: URLSearchParams,
  sortable: Record<string, (row: T) => number>,
  fallback: string
): {
  sortKey: string;
  direction: SortDirection;
  multiplier: 1 | -1;
  sorter: (row: T) => number;
} {
  const rawSortKey = searchParams.get("sort") ?? fallback;
  const sortKey = sortable[rawSortKey] ? rawSortKey : fallback;
  const direction: SortDirection =
    searchParams.get("dir") === "asc" ? "asc" : "desc";
  return {
    sortKey,
    direction,
    multiplier: direction === "asc" ? 1 : -1,
    sorter: sortable[sortKey] ?? sortable[fallback],
  };
}

export function handleApiError(
  context: string,
  err: unknown,
  fallbackMessage: string
) {
  console.error(context, safeErrorLogDetails(err));
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (process.env.NODE_ENV !== "production" && err instanceof Error && err.message) {
    return NextResponse.json(
      { error: `${fallbackMessage}: ${safeErrorMessage(err)}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}
