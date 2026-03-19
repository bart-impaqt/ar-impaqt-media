import { NextResponse } from "next/server";

import {
  downloadStorageObject,
  isAllowedStoragePath,
} from "@/lib/ar-tv-store";
import {
  getSupabaseConfigHint,
  isSupabaseConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: `Supabase not configured. ${getSupabaseConfigHint()}` },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const storagePath = (searchParams.get("path") || "").trim();

    if (!isAllowedStoragePath(storagePath)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const payload = await downloadStorageObject(storagePath);
    if (!payload) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(payload.buffer), {
      status: 200,
      headers: {
        "Content-Type": payload.contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Error serving Supabase storage file:", err);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
