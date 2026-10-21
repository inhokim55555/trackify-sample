import { NextResponse } from "next/server";
import { getCurrentUserContext } from "@/lib/auth";
import { handleApiError } from "@/lib/api";

export async function POST() {
  try {
    await getCurrentUserContext();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = handleApiError("POST /api/auth/access", error, "Unable to check workspace access");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
