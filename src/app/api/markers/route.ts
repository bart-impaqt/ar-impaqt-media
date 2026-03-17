import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

type Marker = {
  id: string;
  label: string;
  patternUrl: string;
  imageUrl?: string | null;
};

type MarkerConfig = {
  markers: Marker[];
};

type Assignment = {
  id: string;
  video: string;
  orientation?: "Landscape" | "Portrait";
};

type ContentConfig = {
  clients: Record<string, { markers: Assignment[] }>;
};

const MARKER_CONFIG_PATH = path.join(
  process.cwd(),
  "src/app/data/markerConfig.json"
);
const CONTENT_CONFIG_PATH = path.join(
  process.cwd(),
  "src/app/data/contentConfig.json"
);
const MARKERS_DIR = path.join(process.cwd(), "public", "markers");
const PATTERN_DATA_URL_PREFIX = "data:text/plain;base64,";

const LEGACY_MARKERS: Marker[] = [
  {
    id: "pattern-letterA",
    label: "Letter A",
    patternUrl: "/markers/pattern-letterA.patt",
    imageUrl: null,
  },
  {
    id: "pattern-letterB",
    label: "Letter B",
    patternUrl: "/markers/pattern-letterB.patt",
    imageUrl: null,
  },
  {
    id: "pattern-letterC",
    label: "Letter C",
    patternUrl: "/markers/pattern-letterC.patt",
    imageUrl: null,
  },
  {
    id: "pattern-letterD",
    label: "Letter D",
    patternUrl: "/markers/pattern-letterD.patt",
    imageUrl: null,
  },
  {
    id: "pattern-hiro",
    label: "Hiro",
    patternUrl: "/markers/pattern-hiro.patt",
    imageUrl: null,
  },
];

const sanitizeMarkerId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

const toLabel = (id: string) =>
  id
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");

const getFileExtension = (fileName: string) => path.extname(fileName).toLowerCase();

const isPngUpload = (file: File) =>
  file.type === "image/png" || getFileExtension(file.name) === ".png";

const isPattUpload = (file: File) => getFileExtension(file.name) === ".patt";

const decodePatternDataUrl = (dataUrl: string): Buffer | null => {
  if (!dataUrl.startsWith(PATTERN_DATA_URL_PREFIX)) {
    return null;
  }

  try {
    const encoded = dataUrl.slice(PATTERN_DATA_URL_PREFIX.length);
    const buffer = Buffer.from(encoded, "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

const migrateDataUrlPatterns = async (config: MarkerConfig): Promise<MarkerConfig> => {
  let changed = false;
  const markers: Marker[] = [];

  for (const marker of config.markers || []) {
    const patternBuffer = decodePatternDataUrl(marker.patternUrl);

    if (!patternBuffer) {
      markers.push(marker);
      continue;
    }

    await fs.mkdir(MARKERS_DIR, { recursive: true });
    const patternPath = path.join(MARKERS_DIR, `${marker.id}.patt`);
    await fs.writeFile(patternPath, patternBuffer);

    markers.push({
      ...marker,
      patternUrl: `/markers/${marker.id}.patt`,
    });
    changed = true;
  }

  if (!changed) {
    return config;
  }

  return { markers };
};

const mergeWithLegacyMarkers = (config: MarkerConfig): MarkerConfig => {
  const map = new Map<string, Marker>();
  for (const marker of LEGACY_MARKERS) {
    map.set(marker.id, marker);
  }
  for (const marker of config.markers || []) {
    map.set(marker.id, marker);
  }

  return {
    markers: Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  };
};

const readMarkerConfig = async (): Promise<MarkerConfig> => {
  try {
    const raw = await fs.readFile(MARKER_CONFIG_PATH, "utf8");
    const merged = mergeWithLegacyMarkers(JSON.parse(raw) as MarkerConfig);
    const migrated = await migrateDataUrlPatterns(merged);

    if (migrated !== merged) {
      await writeMarkerConfig(migrated);
    }

    return migrated;
  } catch {
    const fallback = mergeWithLegacyMarkers({ markers: [] });
    await fs.mkdir(path.dirname(MARKER_CONFIG_PATH), { recursive: true });
    await fs.writeFile(
      MARKER_CONFIG_PATH,
      JSON.stringify(fallback, null, 2),
      "utf8"
    );
    return fallback;
  }
};

const writeMarkerConfig = async (config: MarkerConfig) => {
  await fs.writeFile(
    MARKER_CONFIG_PATH,
    JSON.stringify({ markers: config.markers }, null, 2),
    "utf8"
  );
};

const removeMarkerFromAssignments = async (markerId: string) => {
  let parsed: ContentConfig;
  try {
    const raw = await fs.readFile(CONTENT_CONFIG_PATH, "utf8");
    parsed = JSON.parse(raw) as ContentConfig;
  } catch {
    return;
  }

  const clients = parsed.clients || {};
  for (const clientName of Object.keys(clients)) {
    const current = clients[clientName]?.markers || [];
    const next = current.filter((assignment) => assignment.id !== markerId);
    clients[clientName] = { markers: next };
  }

  await fs.writeFile(CONTENT_CONFIG_PATH, JSON.stringify(parsed, null, 2), "utf8");
};

export async function GET() {
  try {
    const config = await readMarkerConfig();
    return NextResponse.json(config);
  } catch (err) {
    console.error("Error reading marker config:", err);
    return NextResponse.json({ markers: LEGACY_MARKERS });
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const rawId = String(formData.get("id") || "");
    const rawLabel = String(formData.get("label") || "");
    const patternDataUrl = String(formData.get("patternDataUrl") || "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing marker file" }, { status: 400 });
    }

    const fileIsPng = isPngUpload(file);
    const fileIsPatt = isPattUpload(file);

    if (!fileIsPng && !fileIsPatt) {
      return NextResponse.json(
        { error: "Only .png or .patt marker files are supported" },
        { status: 400 }
      );
    }

    const decodedPngPattern = fileIsPng
      ? decodePatternDataUrl(patternDataUrl)
      : null;

    if (fileIsPng && !decodedPngPattern) {
      return NextResponse.json(
        { error: "Missing generated marker pattern data for PNG upload" },
        { status: 400 }
      );
    }

    const baseId = rawId || path.parse(file.name).name;
    const markerId = sanitizeMarkerId(baseId);
    if (!markerId) {
      return NextResponse.json({ error: "Invalid marker id" }, { status: 400 });
    }

    const label = rawLabel.trim() || toLabel(markerId);
    await fs.mkdir(MARKERS_DIR, { recursive: true });

    const patternUrl = `/markers/${markerId}.patt`;
    const patternPath = path.join(MARKERS_DIR, `${markerId}.patt`);
    let imageUrl: string | null = null;

    if (fileIsPng) {
      const imageBuffer = Buffer.from(await file.arrayBuffer());
      const imagePath = path.join(MARKERS_DIR, `${markerId}.png`);
      await fs.writeFile(imagePath, imageBuffer);
      await fs.writeFile(patternPath, decodedPngPattern as Buffer);
      imageUrl = `/markers/${markerId}.png`;
    } else {
      const patternBuffer = Buffer.from(await file.arrayBuffer());
      if (patternBuffer.length === 0) {
        return NextResponse.json(
          { error: "Uploaded .patt file is empty" },
          { status: 400 }
        );
      }

      await fs.writeFile(patternPath, patternBuffer);
      const imagePath = path.join(MARKERS_DIR, `${markerId}.png`);
      await fs.unlink(imagePath).catch(() => undefined);
    }

    const config = await readMarkerConfig();
    const nextMarker: Marker = {
      id: markerId,
      label,
      patternUrl,
      imageUrl,
    };

    const existingIndex = config.markers.findIndex((m) => m.id === markerId);
    if (existingIndex >= 0) {
      config.markers[existingIndex] = nextMarker;
    } else {
      config.markers.push(nextMarker);
    }

    config.markers.sort((a, b) => a.label.localeCompare(b.label));
    await writeMarkerConfig(config);

    return NextResponse.json({ ok: true, marker: nextMarker });
  } catch (err) {
    console.error("Error creating marker:", err);
    return NextResponse.json({ error: "Failed to create marker" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const markerId = sanitizeMarkerId(searchParams.get("id") || "");

    if (!markerId) {
      return NextResponse.json({ error: "Missing marker id" }, { status: 400 });
    }

    const config = await readMarkerConfig();
    const marker = config.markers.find((m) => m.id === markerId);
    if (!marker) {
      return NextResponse.json({ error: "Marker not found" }, { status: 404 });
    }

    config.markers = config.markers.filter((m) => m.id !== markerId);
    await writeMarkerConfig(config);

    const imagePath = path.join(MARKERS_DIR, `${markerId}.png`);
    const patternPath = path.join(MARKERS_DIR, `${markerId}.patt`);
    await fs.unlink(imagePath).catch(() => undefined);
    await fs.unlink(patternPath).catch(() => undefined);
    await removeMarkerFromAssignments(markerId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error deleting marker:", err);
    return NextResponse.json({ error: "Failed to delete marker" }, { status: 500 });
  }
}
