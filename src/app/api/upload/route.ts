import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

import { buildStorageProxyUrl, uploadStorageObject } from "@/lib/ar-tv-store";
import { getSupabaseConfigHint, isSupabaseConfigured } from "@/lib/supabase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeName = file.name.replace(/\s+/g, "_").replace(/[^\w\.-]/g, "");
    const fileName = `${Date.now()}_${safeName}`;
    const contentType = file.type || "application/octet-stream";

    if (isSupabaseConfigured()) {
      const storagePath = `assets/${fileName}`;
      await uploadStorageObject(storagePath, buffer, contentType);

      return NextResponse.json({
        success: true,
        url: buildStorageProxyUrl(storagePath),
      });
    }

    const uploadDir = path.join(process.cwd(), "public", "assets");
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      url: `/assets/${fileName}`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    const finalMessage = isSupabaseConfigured()
      ? `${message}. ${getSupabaseConfigHint()}`
      : message;

    console.error("Upload error:", err);
    return NextResponse.json(
      { success: false, error: finalMessage },
      { status: 500 }
    );
  }
}
