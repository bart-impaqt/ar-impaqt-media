import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), "src/app/data/contentConfig.json");

// GET: read config
export async function GET() {
  try {
    const data = await fs.readFile(CONFIG_PATH, "utf8");
    return NextResponse.json(JSON.parse(data));
  } catch (err: unknown) {
    console.error("Error reading config:", err);
    return NextResponse.json({ clients: {} }, { status: 200 });
  }
}

// POST: update config
export async function POST(req: Request) {
  try {
    const body = await req.json();
    await fs.writeFile(CONFIG_PATH, JSON.stringify(body, null, 2), "utf8");
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("Error writing config:", err);
    return NextResponse.json(
      { error: "Failed to write config" },
      { status: 500 }
    );
  }
}
