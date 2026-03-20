import {
  getSupabaseAdminClient,
  getSupabaseStorageBucket,
} from "@/lib/supabase-admin";

export type Orientation = "Landscape" | "Portrait";

export type Assignment = {
  id: string;
  video: string;
  orientation?: Orientation;
};

export type ContentConfig = {
  clients: Record<string, { markers: Assignment[] }>;
};

export type Marker = {
  id: string;
  label: string;
  patternUrl: string;
  imageUrl?: string | null;
};

type StoredMarker = {
  id: string;
  label: string;
  patternPath: string;
  imagePath: string | null;
};

const CONTENT_CONFIG_OBJECT = "config/contentConfig.json";
const MARKER_CONFIG_OBJECT = "config/markerConfig.json";
const STORAGE_PATH_REGEX = /^[a-zA-Z0-9/_.\-]+$/;
const GENERIC_BINARY_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

export const LEGACY_MARKERS: Marker[] = [
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

export const sanitizeMarkerId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");

export const toLabel = (id: string) =>
  id
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");

export const getFileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
};

export const buildStorageProxyUrl = (storagePath: string) =>
  `/api/storage?path=${encodeURIComponent(storagePath)}`;

export const isAllowedStoragePath = (storagePath: string) => {
  if (!storagePath || !STORAGE_PATH_REGEX.test(storagePath)) {
    return false;
  }

  if (storagePath.includes("..") || storagePath.startsWith("/")) {
    return false;
  }

  return storagePath.startsWith("assets/") || storagePath.startsWith("markers/") || storagePath.startsWith("config/");
};

const toStatusCode = (err: unknown) => {
  if (!err || typeof err !== "object") {
    return NaN;
  }

  const maybeStatusCode = "statusCode" in err ? Number((err as { statusCode?: unknown }).statusCode) : NaN;
  if (!Number.isNaN(maybeStatusCode)) {
    return maybeStatusCode;
  }

  const maybeStatus = "status" in err ? Number((err as { status?: unknown }).status) : NaN;
  if (!Number.isNaN(maybeStatus)) {
    return maybeStatus;
  }

  return NaN;
};

const isNotFoundError = (err: unknown) => {
  const statusCode = toStatusCode(err);
  if (statusCode === 404) {
    return true;
  }

  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "").toLowerCase()
      : "";

  return message.includes("not found");
};

const mapContentConfig = (raw: unknown): ContentConfig => {
  const clientsRaw =
    raw && typeof raw === "object" && "clients" in raw
      ? (raw as { clients?: unknown }).clients
      : null;

  if (!clientsRaw || typeof clientsRaw !== "object") {
    return { clients: {} };
  }

  const mappedClients: Record<string, { markers: Assignment[] }> = {};

  for (const [clientName, value] of Object.entries(clientsRaw)) {
    if (!clientName || !value || typeof value !== "object") {
      continue;
    }

    const markerEntries = Array.isArray((value as { markers?: unknown }).markers)
      ? ((value as { markers: unknown[] }).markers ?? [])
      : [];

    const markers: Assignment[] = [];

    for (const entry of markerEntries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const id = (entry as { id?: unknown }).id;
      const video = (entry as { video?: unknown }).video;
      const orientation = (entry as { orientation?: unknown }).orientation;

      if (typeof id !== "string" || typeof video !== "string") {
        continue;
      }

      markers.push({
        id,
        video,
        orientation:
          orientation === "Landscape" || orientation === "Portrait"
            ? orientation
            : undefined,
      });
    }

    mappedClients[clientName] = { markers };
  }

  return { clients: mappedClients };
};

const mapStoredMarkers = (raw: unknown): StoredMarker[] => {
  const markerEntries =
    raw && typeof raw === "object" && "markers" in raw
      ? (raw as { markers?: unknown }).markers
      : null;

  if (!Array.isArray(markerEntries)) {
    return [];
  }

  const mapped: StoredMarker[] = [];

  for (const entry of markerEntries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const id = (entry as { id?: unknown }).id;
    const label = (entry as { label?: unknown }).label;
    const patternPath = (entry as { patternPath?: unknown }).patternPath;
    const imagePath = (entry as { imagePath?: unknown }).imagePath;

    if (
      typeof id !== "string" ||
      typeof label !== "string" ||
      typeof patternPath !== "string"
    ) {
      continue;
    }

    mapped.push({
      id,
      label,
      patternPath,
      imagePath: typeof imagePath === "string" ? imagePath : null,
    });
  }

  return mapped;
};

const mergeWithLegacyMarkers = (markers: Marker[]): Marker[] => {
  const map = new Map<string, Marker>();

  for (const marker of LEGACY_MARKERS) {
    map.set(marker.id, marker);
  }

  for (const marker of markers) {
    map.set(marker.id, marker);
  }

  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const readStorageObject = async (storagePath: string) => {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { data, error } = await supabase.storage.from(bucket).download(storagePath);

  if (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  return {
    buffer,
    contentType: resolveContentType(storagePath, data.type),
  };
};

const writeStorageObject = async (
  storagePath: string,
  payload: Buffer,
  contentType: string,
  cacheControl: string
) => {
  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { error } = await supabase.storage.from(bucket).upload(storagePath, payload, {
    contentType,
    upsert: true,
    cacheControl,
  });

  if (error) {
    throw error;
  }
};

const readJsonObject = async (storagePath: string) => {
  const payload = await readStorageObject(storagePath);
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload.buffer.toString("utf8")) as unknown;
  } catch {
    return null;
  }
};

const writeJsonObject = async (storagePath: string, value: unknown) => {
  const payload = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  await writeStorageObject(storagePath, payload, "application/json; charset=utf-8", "0");
};

export const readContentConfig = async (): Promise<ContentConfig> => {
  const raw = await readJsonObject(CONTENT_CONFIG_OBJECT);
  return mapContentConfig(raw);
};

export const writeContentConfig = async (config: ContentConfig) => {
  await writeJsonObject(CONTENT_CONFIG_OBJECT, {
    clients: config.clients || {},
    updatedAt: new Date().toISOString(),
  });
};

const readStoredMarkers = async (): Promise<StoredMarker[]> => {
  const raw = await readJsonObject(MARKER_CONFIG_OBJECT);
  return mapStoredMarkers(raw);
};

const writeStoredMarkers = async (markers: StoredMarker[]) => {
  await writeJsonObject(MARKER_CONFIG_OBJECT, {
    markers,
    updatedAt: new Date().toISOString(),
  });
};

export const readMarkerConfig = async (): Promise<{ markers: Marker[] }> => {
  const stored = await readStoredMarkers();
  const markerList: Marker[] = stored.map((marker) => ({
    id: marker.id,
    label: marker.label,
    patternUrl: buildStorageProxyUrl(marker.patternPath),
    imageUrl: marker.imagePath ? buildStorageProxyUrl(marker.imagePath) : null,
  }));

  return {
    markers: mergeWithLegacyMarkers(markerList),
  };
};

export const upsertMarker = async (marker: StoredMarker) => {
  const markers = await readStoredMarkers();
  const existingIndex = markers.findIndex((entry) => entry.id === marker.id);

  if (existingIndex >= 0) {
    markers[existingIndex] = marker;
  } else {
    markers.push(marker);
  }

  markers.sort((a, b) => a.label.localeCompare(b.label));
  await writeStoredMarkers(markers);
};

export const deleteMarkerById = async (markerId: string): Promise<StoredMarker | null> => {
  const markers = await readStoredMarkers();
  const existing = markers.find((entry) => entry.id === markerId) || null;

  if (!existing) {
    return null;
  }

  await writeStoredMarkers(markers.filter((entry) => entry.id !== markerId));
  return existing;
};

export const removeMarkerFromAssignments = async (markerId: string) => {
  const config = await readContentConfig();
  let changed = false;

  for (const clientName of Object.keys(config.clients || {})) {
    const currentMarkers = config.clients[clientName]?.markers || [];
    const remaining = currentMarkers.filter((assignment) => assignment.id !== markerId);

    if (remaining.length !== currentMarkers.length) {
      config.clients[clientName] = { markers: remaining };
      changed = true;
    }
  }

  if (changed) {
    await writeContentConfig(config);
  }
};

export const uploadStorageObject = async (
  storagePath: string,
  payload: Buffer,
  contentType: string
) => {
  if (!isAllowedStoragePath(storagePath)) {
    throw new Error("Invalid storage path");
  }

  await writeStorageObject(storagePath, payload, contentType, "31536000");
};

export const deleteStorageObject = async (storagePath: string) => {
  if (!isAllowedStoragePath(storagePath)) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const bucket = getSupabaseStorageBucket();
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);

  if (error && !isNotFoundError(error)) {
    throw error;
  }
};

const inferMimeType = (storagePath: string) => {
  const extension = getFileExtension(storagePath);
  switch (extension) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".patt":
      return "text/plain; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
};

export const resolveContentType = (
  storagePath: string,
  declaredType?: string | null
) => {
  const normalized = (declaredType || "").trim().toLowerCase();
  if (normalized && !GENERIC_BINARY_CONTENT_TYPES.has(normalized)) {
    return normalized;
  }

  return inferMimeType(storagePath);
};

export const downloadStorageObject = async (storagePath: string) => {
  if (!isAllowedStoragePath(storagePath)) {
    return null;
  }

  return await readStorageObject(storagePath);
};
