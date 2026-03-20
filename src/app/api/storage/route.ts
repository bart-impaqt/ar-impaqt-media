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

type DownloadPayload = Awaited<ReturnType<typeof downloadStorageObject>>;

const CACHE_CONTROL_HEADER = "public, max-age=3600";

const parseByteRange = (headerValue: string, totalLength: number) => {
  if (!headerValue.startsWith("bytes=")) {
    return null;
  }

  const [firstRange] = headerValue.slice("bytes=".length).split(",");
  if (!firstRange) {
    return null;
  }

  const [startTextRaw, endTextRaw] = firstRange.trim().split("-");
  const startText = (startTextRaw || "").trim();
  const endText = (endTextRaw || "").trim();

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    const start = Math.max(totalLength - suffixLength, 0);
    const end = totalLength - 1;
    return { start, end };
  }

  const start = Number(startText);
  if (!Number.isInteger(start) || start < 0 || start >= totalLength) {
    return "unsatisfiable";
  }

  const parsedEnd = endText ? Number(endText) : totalLength - 1;
  if (!Number.isInteger(parsedEnd)) {
    return null;
  }

  const end = Math.min(parsedEnd, totalLength - 1);
  if (end < start) {
    return "unsatisfiable";
  }

  return { start, end };
};

const toStoragePath = (req: Request) => {
  const { searchParams } = new URL(req.url);
  return (searchParams.get("path") || "").trim();
};

const loadStoragePayload = async (req: Request) => {
  if (!isSupabaseConfigured()) {
    return {
      error: NextResponse.json(
        { error: `Supabase not configured. ${getSupabaseConfigHint()}` },
        { status: 500 }
      ),
      payload: null,
      storagePath: "",
    };
  }

  const storagePath = toStoragePath(req);
  if (!isAllowedStoragePath(storagePath)) {
    return {
      error: NextResponse.json({ error: "Invalid path" }, { status: 400 }),
      payload: null,
      storagePath,
    };
  }

  const payload = await downloadStorageObject(storagePath);
  if (!payload) {
    return {
      error: NextResponse.json({ error: "File not found" }, { status: 404 }),
      payload: null,
      storagePath,
    };
  }

  return { error: null, payload, storagePath };
};

const buildStorageResponse = (
  req: Request,
  payload: NonNullable<DownloadPayload>,
  includeBody: boolean
) => {
  const totalLength = payload.buffer.length;
  const baseHeaders: Record<string, string> = {
    "Content-Type": payload.contentType,
    "Cache-Control": CACHE_CONTROL_HEADER,
    "Accept-Ranges": "bytes",
    "Content-Length": String(totalLength),
  };

  const rangeHeader = req.headers.get("range");
  const shouldApplyRange =
    Boolean(rangeHeader) && payload.contentType.startsWith("video/") && totalLength > 0;

  if (!shouldApplyRange) {
    return new NextResponse(
      includeBody ? new Uint8Array(payload.buffer) : null,
      {
        status: 200,
        headers: baseHeaders,
      }
    );
  }

  const range = parseByteRange(String(rangeHeader), totalLength);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes */${totalLength}`,
      },
    });
  }

  if (!range) {
    return new NextResponse(
      includeBody ? new Uint8Array(payload.buffer) : null,
      {
        status: 200,
        headers: baseHeaders,
      }
    );
  }

  const chunk = payload.buffer.subarray(range.start, range.end + 1);
  return new NextResponse(includeBody ? new Uint8Array(chunk) : null, {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${range.start}-${range.end}/${totalLength}`,
    },
  });
};

export async function GET(req: Request) {
  try {
    const { error, payload } = await loadStoragePayload(req);
    if (error) {
      return error;
    }

    return buildStorageResponse(req, payload, true);
  } catch (err) {
    console.error("Error serving Supabase storage file:", err);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}

export async function HEAD(req: Request) {
  try {
    const { error, payload } = await loadStoragePayload(req);
    if (error) {
      return error;
    }

    return buildStorageResponse(req, payload, false);
  } catch (err) {
    console.error("Error serving Supabase storage file:", err);
    return NextResponse.json({ error: "Failed to load file" }, { status: 500 });
  }
}
