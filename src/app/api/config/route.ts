import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { readContentConfig, type ContentConfig, writeContentConfig } from "@/lib/ar-tv-store";
import { getSupabaseConfigHint, isSupabaseConfigured } from "@/lib/supabase-admin";

const CONFIG_PATH = path.join(process.cwd(), "src/app/data/contentConfig.json");

export const runtime = "nodejs";

// GET: read config
export async function GET() {
  try {
    if (isSupabaseConfigured()) {
      const config = await readContentConfig();
      return NextResponse.json(config);
    }

    const data = await fs.readFile(CONFIG_PATH, "utf8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    console.error("Error reading config:", err);
    if (isSupabaseConfigured()) {
      return NextResponse.json(
        { error: `Failed to load Supabase config. ${getSupabaseConfigHint()}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ clients: {} }, { status: 200 });
  }
}

// POST: update config
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ContentConfig;

    if (isSupabaseConfigured()) {
      await writeContentConfig(body);
      return NextResponse.json({ ok: true });
    }

    await fs.writeFile(CONFIG_PATH, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Error writing config:", err);
    const message = isSupabaseConfigured()
      ? `Failed to write Supabase config. ${getSupabaseConfigHint()}`
      : "Failed to write config";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
