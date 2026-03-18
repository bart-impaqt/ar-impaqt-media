"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Orientation = "Landscape" | "Portrait";

type UploadedVideo = {
  url: string;
  orientation: Orientation;
};

type Assignment = {
  id: string;
  video: string;
  orientation?: Orientation;
};

type ClientRecord = {
  markers: Assignment[];
};

type ContentConfig = {
  clients: Record<string, ClientRecord>;
};

type MarkerOption = {
  id: string;
  label: string;
  patternUrl: string;
  imageUrl?: string | null;
};

type MarkerConfigResponse = {
  markers: MarkerOption[];
};

type EditingAssignment = {
  sourceClient: string;
  sourceMarkerId: string;
};

type PreparedMarkerUpload = {
  markerFile: File;
  markerDataUrl: string;
  patternSourceDataUrl: string;
};

const DEFAULT_CONFIG: ContentConfig = { clients: {} };

const safeCloneConfig = (config: ContentConfig): ContentConfig =>
  JSON.parse(JSON.stringify(config)) as ContentConfig;

const getFileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
};

const isPngMarkerFile = (file: File) =>
  file.type === "image/png" || getFileExtension(file.name) === ".png";

const isPattMarkerFile = (file: File) =>
  getFileExtension(file.name) === ".patt";

const PATTERN_RESOLUTION = 16;
const PATTERN_ROTATIONS = [0, -Math.PI / 2, -Math.PI, -(3 * Math.PI) / 2];

const formatPatternValue = (value: number) => value.toString().padStart(3, " ");

export default function Dashboard() {
  const [config, setConfig] = useState<ContentConfig>(DEFAULT_CONFIG);
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [client, setClient] = useState("");
  const [marker, setMarker] = useState("");
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<UploadedVideo | null>(null);
  const [manualOrientation, setManualOrientation] =
    useState<Orientation>("Landscape");
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAssignment, setEditingAssignment] =
    useState<EditingAssignment | null>(null);

  const [markerFile, setMarkerFile] = useState<File | null>(null);
  const [markerIdInput, setMarkerIdInput] = useState("");
  const [markerLabelInput, setMarkerLabelInput] = useState("");
  const [markerBusy, setMarkerBusy] = useState(false);
  const [downloadingMarkerId, setDownloadingMarkerId] = useState<string | null>(
    null
  );

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.removeAttribute("data-ar-viewer");
    body.removeAttribute("data-ar-viewer");

    const resetProps = [
      "width",
      "height",
      "max-width",
      "max-height",
      "overflow",
      "position",
      "inset",
      "margin",
      "padding",
      "margin-left",
      "margin-top",
    ];

    for (const prop of resetProps) {
      root.style.removeProperty(prop);
      body.style.removeProperty(prop);
    }
  }, []);

  const selectedMarker = useMemo(
    () => markers.find((candidate) => candidate.id === marker) ?? null,
    [markers, marker]
  );

  const mergeVideos = useCallback((incoming: UploadedVideo[]) => {
    setVideos((previous) => {
      const merged = [...previous];
      for (const video of incoming) {
        const existing = merged.find((entry) => entry.url === video.url);
        if (!existing) {
          merged.push(video);
        }
      }
      return merged;
    });
  }, []);

  const hydrateVideosFromConfig = useCallback((nextConfig: ContentConfig) => {
    const discovered: UploadedVideo[] = [];
    for (const clientName of Object.keys(nextConfig.clients || {})) {
      for (const markerAssignment of nextConfig.clients[clientName].markers || []) {
        if (!markerAssignment.video) {
          continue;
        }

        discovered.push({
          url: markerAssignment.video,
          orientation: markerAssignment.orientation || "Landscape",
        });
      }
    }

    mergeVideos(discovered);
  }, [mergeVideos]);

  const loadConfig = useCallback(async () => {
    const response = await fetch("/api/config");
    const data = (await response.json()) as ContentConfig;
    const nextConfig = data?.clients ? data : DEFAULT_CONFIG;
    setConfig(nextConfig);
    hydrateVideosFromConfig(nextConfig);
  }, [hydrateVideosFromConfig]);

  const loadMarkers = useCallback(async () => {
    const response = await fetch("/api/markers");
    const data = (await response.json()) as MarkerConfigResponse;
    const nextMarkers = data.markers || [];
    setMarkers(nextMarkers);

    if (nextMarkers.length > 0) {
      setMarker((current) => {
        if (current && nextMarkers.some((entry) => entry.id === current)) {
          return current;
        }
        return nextMarkers[0].id;
      });
    }
  }, []);

  useEffect(() => {
    Promise.all([loadConfig(), loadMarkers()])
      .catch((err) => {
        console.error("Failed to load dashboard data:", err);
      })
      .finally(() => setLoading(false));
  }, [loadConfig, loadMarkers]);

  const saveConfig = async (nextConfig: ContentConfig) => {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextConfig),
    });

    if (!response.ok) {
      throw new Error("Failed to save config file");
    }
  };

  const ensureVideoInLibrary = (video: UploadedVideo) => {
    mergeVideos([video]);
    setSelectedVideo(video);
  };

  const handleUploadVideos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) {
      return;
    }

    const uploaded: UploadedVideo[] = [];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!data.success) {
        continue;
      }

      const orientation = await new Promise<Orientation>((resolve) => {
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);

        video.onloadedmetadata = () => {
          resolve(video.videoWidth >= video.videoHeight ? "Landscape" : "Portrait");
        };

        video.onerror = () => resolve("Landscape");
      });

      uploaded.push({ url: data.url, orientation });
    }

    mergeVideos(uploaded);
  };

  const handleSaveAssignment = async () => {
    const normalizedClient = client.trim();

    if (!normalizedClient || !marker || !selectedVideo) {
      alert("Please select client, marker and video");
      return;
    }

    setIsSaving(true);

    try {
      const updated = safeCloneConfig(config);

      if (editingAssignment) {
        const sourceMarkers =
          updated.clients[editingAssignment.sourceClient]?.markers || [];

        updated.clients[editingAssignment.sourceClient] = {
          markers: sourceMarkers.filter(
            (entry) => entry.id !== editingAssignment.sourceMarkerId
          ),
        };

        if (
          updated.clients[editingAssignment.sourceClient].markers.length === 0
        ) {
          delete updated.clients[editingAssignment.sourceClient];
        }
      }

      if (!updated.clients[normalizedClient]) {
        updated.clients[normalizedClient] = { markers: [] };
      }

      const targetMarkers = updated.clients[normalizedClient].markers || [];
      updated.clients[normalizedClient].markers = [
        ...targetMarkers.filter((entry) => entry.id !== marker),
        {
          id: marker,
          video: selectedVideo.url,
          orientation: selectedVideo.orientation || manualOrientation,
        },
      ];

      await saveConfig(updated);
      setConfig(updated);
      setClient(normalizedClient);
      setEditingAssignment(null);
      alert("Assignment saved");
    } catch (err) {
      console.error(err);
      alert("Failed to save assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const startEditAssignment = (clientName: string, assignment: Assignment) => {
    const fallbackVideo: UploadedVideo = {
      url: assignment.video,
      orientation: assignment.orientation || "Landscape",
    };

    setEditingAssignment({
      sourceClient: clientName,
      sourceMarkerId: assignment.id,
    });
    setClient(clientName);
    setMarker(assignment.id);
    setManualOrientation(assignment.orientation || "Landscape");

    const existingVideo = videos.find((video) => video.url === assignment.video);
    ensureVideoInLibrary(existingVideo || fallbackVideo);

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditing = () => {
    setEditingAssignment(null);
  };

  const handleDeleteAssignment = async (clientName: string, markerId: string) => {
    const confirmed = window.confirm(
      `Delete assignment '${markerId}' for '${clientName}'?`
    );
    if (!confirmed) {
      return;
    }

    setIsSaving(true);

    try {
      const updated = safeCloneConfig(config);
      const remaining =
        updated.clients[clientName]?.markers.filter(
          (entry) => entry.id !== markerId
        ) || [];

      if (remaining.length === 0) {
        delete updated.clients[clientName];
      } else {
        updated.clients[clientName] = { markers: remaining };
      }

      await saveConfig(updated);
      setConfig(updated);

      if (
        editingAssignment?.sourceClient === clientName &&
        editingAssignment.sourceMarkerId === markerId
      ) {
        setEditingAssignment(null);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete assignment");
    } finally {
      setIsSaving(false);
    }
  };

  const toDataUrl = async (file: File): Promise<string> => {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read marker file"));
      reader.readAsDataURL(file);
    });
  };

  const loadImage = async (dataUrl: string): Promise<HTMLImageElement> => {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode marker image"));
      image.src = dataUrl;
    });
  };

  const createStandardMarker = async (file: File): Promise<PreparedMarkerUpload> => {
    const sourceDataUrl = await toDataUrl(file);
    const image = await loadImage(sourceDataUrl);

    const size = 512;
    const border = Math.round(size * 0.25);
    const innerSize = size - border * 2;
    const artworkPadding = Math.round(size * 0.03);
    const patternSourceSize = size;

    const patternSourceCanvas = document.createElement("canvas");
    patternSourceCanvas.width = patternSourceSize;
    patternSourceCanvas.height = patternSourceSize;
    const patternSourceContext = patternSourceCanvas.getContext("2d");
    if (!patternSourceContext) {
      throw new Error("Failed to create pattern source canvas");
    }

    // Pattern data must be generated from inner artwork only (no black border).
    patternSourceContext.fillStyle = "#ffffff";
    patternSourceContext.fillRect(0, 0, patternSourceSize, patternSourceSize);

    const artworkSize = patternSourceSize - artworkPadding * 2;
    const innerScale = Math.min(artworkSize / image.width, artworkSize / image.height);
    const innerDrawWidth = Math.max(1, Math.round(image.width * innerScale));
    const innerDrawHeight = Math.max(1, Math.round(image.height * innerScale));
    const innerDrawX = Math.round((patternSourceSize - innerDrawWidth) / 2);
    const innerDrawY = Math.round((patternSourceSize - innerDrawHeight) / 2);
    patternSourceContext.drawImage(
      image,
      innerDrawX,
      innerDrawY,
      innerDrawWidth,
      innerDrawHeight
    );

    const patternSourceDataUrl = patternSourceCanvas.toDataURL("image/png");

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create marker canvas");
    }

    // Pattern markers need a high-contrast black frame for ARToolKit detection.
    context.fillStyle = "#000000";
    context.fillRect(0, 0, size, size);
    context.fillStyle = "#ffffff";
    context.fillRect(border, border, innerSize, innerSize);

    context.drawImage(patternSourceCanvas, border, border, innerSize, innerSize);

    const markerDataUrl = canvas.toDataURL("image/png");
    const markerBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to export marker image"));
          return;
        }
        resolve(blob);
      }, "image/png");
    });

    const markerFile = new File([markerBlob], file.name, { type: "image/png" });
    return { markerFile, markerDataUrl, patternSourceDataUrl };
  };

  const encodePatternFromMarkerDataUrl = async (markerDataUrl: string): Promise<string> => {
    const image = await loadImage(markerDataUrl);

    const canvas = document.createElement("canvas");
    canvas.width = PATTERN_RESOLUTION;
    canvas.height = PATTERN_RESOLUTION;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to initialize marker trace canvas");
    }

    const patternLines: string[] = [];

    for (const rotation of PATTERN_ROTATIONS) {
      context.save();
      context.clearRect(0, 0, PATTERN_RESOLUTION, PATTERN_RESOLUTION);
      context.translate(PATTERN_RESOLUTION / 2, PATTERN_RESOLUTION / 2);
      context.rotate(rotation);
      context.drawImage(
        image,
        -PATTERN_RESOLUTION / 2,
        -PATTERN_RESOLUTION / 2,
        PATTERN_RESOLUTION,
        PATTERN_RESOLUTION
      );
      context.restore();

      const imageData = context.getImageData(
        0,
        0,
        PATTERN_RESOLUTION,
        PATTERN_RESOLUTION
      );

      for (let channelOffset = 2; channelOffset >= 0; channelOffset -= 1) {
        for (let y = 0; y < PATTERN_RESOLUTION; y += 1) {
          const line: string[] = [];
          for (let x = 0; x < PATTERN_RESOLUTION; x += 1) {
            const offset = (y * PATTERN_RESOLUTION + x) * 4 + channelOffset;
            line.push(formatPatternValue(imageData.data[offset] || 0));
          }
          patternLines.push(line.join(" "));
        }
      }
    }

    return `${patternLines.join("\n")}\n`;
  };

  const generatePatternDataUrl = async (markerDataUrl: string): Promise<string> => {
    const patternFileString = await encodePatternFromMarkerDataUrl(markerDataUrl);
    return `data:text/plain;base64,${window.btoa(patternFileString)}`;
  };

  const handleUploadMarker = async () => {
    if (!markerFile) {
      alert("Please choose a .png or .patt marker file");
      return;
    }

    setMarkerBusy(true);

    try {
      const formData = new FormData();

      if (isPngMarkerFile(markerFile)) {
        const prepared = await createStandardMarker(markerFile);
        const patternDataUrl = await generatePatternDataUrl(
          prepared.patternSourceDataUrl
        );
        formData.append("file", prepared.markerFile);
        formData.append("patternDataUrl", patternDataUrl);
      } else if (isPattMarkerFile(markerFile)) {
        formData.append("file", markerFile);
      } else {
        throw new Error("Only .png or .patt marker files are supported");
      }

      formData.append("id", markerIdInput);
      formData.append("label", markerLabelInput);

      const response = await fetch("/api/markers", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to upload marker");
      }

      await loadMarkers();
      if (payload.marker?.id) {
        setMarker(payload.marker.id);
      }

      setMarkerFile(null);
      setMarkerIdInput("");
      setMarkerLabelInput("");
      alert("Marker uploaded");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload marker";
      console.error(err);
      alert(message);
    } finally {
      setMarkerBusy(false);
    }
  };

  const handleDeleteMarker = async (markerId: string) => {
    const confirmed = window.confirm(
      `Delete marker '${markerId}'? Assignments using it will also be removed.`
    );

    if (!confirmed) {
      return;
    }

    setMarkerBusy(true);

    try {
      const response = await fetch(
        `/api/markers?id=${encodeURIComponent(markerId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete marker");
      }

      await Promise.all([loadMarkers(), loadConfig()]);

      if (
        editingAssignment &&
        editingAssignment.sourceMarkerId === markerId
      ) {
        setEditingAssignment(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete marker";
      console.error(err);
      alert(message);
    } finally {
      setMarkerBusy(false);
    }
  };

  const handleDownloadPrintableMarker = async (markerEntry: MarkerOption) => {
    if (!markerEntry.imageUrl) {
      alert("No printable PNG is available for this marker");
      return;
    }

    setDownloadingMarkerId(markerEntry.id);

    try {
      const response = await fetch(markerEntry.imageUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch marker PNG");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${markerEntry.id}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error(err);
      alert("Failed to download marker PNG");
    } finally {
      setDownloadingMarkerId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        Loading dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 space-y-6">
      <h1 className="text-2xl font-bold">AR TV Dashboard</h1>

      <div className="bg-gray-900 p-4 rounded-lg space-y-4 border border-gray-800">
        <h2 className="text-lg font-semibold">Marker Library</h2>

        <div className="grid md:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-sm text-gray-400 mb-1">Marker file (.png or .patt)</span>
            <input
              type="file"
              accept=".png,.patt,image/png,text/plain"
              onChange={(e) => setMarkerFile(e.target.files?.[0] || null)}
              className="w-full bg-gray-900 p-2 rounded border border-gray-700"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-gray-400 mb-1">Marker id (optional)</span>
            <input
              type="text"
              value={markerIdInput}
              onChange={(e) => setMarkerIdInput(e.target.value)}
              placeholder="e.g. spring-campaign"
              className="w-full bg-gray-900 p-2 rounded border border-gray-700"
            />
          </label>

          <label className="block">
            <span className="block text-sm text-gray-400 mb-1">Label (optional)</span>
            <input
              type="text"
              value={markerLabelInput}
              onChange={(e) => setMarkerLabelInput(e.target.value)}
              placeholder="e.g. Spring Campaign"
              className="w-full bg-gray-900 p-2 rounded border border-gray-700"
            />
          </label>
        </div>

        <button
          onClick={handleUploadMarker}
          disabled={markerBusy}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded"
        >
          {markerBusy ? "Uploading..." : "Upload Marker"}
        </button>
        <p className="text-xs text-gray-400">
          PNG files are auto-converted into AR-ready markers with a black border.
          PATT files are used directly as marker patterns.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {markers.map((entry) => (
            <div
              key={entry.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2"
            >
              <div className="text-sm font-semibold text-blue-300">{entry.label}</div>
              <div className="text-xs text-gray-400">{entry.id}</div>

              {entry.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.imageUrl}
                  alt={entry.label}
                  className="w-full h-24 object-contain bg-gray-900 rounded"
                />
              ) : (
                <div className="w-full h-24 bg-gray-900 rounded flex items-center justify-center text-xs text-gray-500">
                  No PNG preview
                </div>
              )}

              <button
                onClick={() => handleDownloadPrintableMarker(entry)}
                disabled={markerBusy || !entry.imageUrl || downloadingMarkerId === entry.id}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-1.5 rounded text-sm"
              >
                {downloadingMarkerId === entry.id
                  ? "Preparing Download..."
                  : "Download Printable PNG"}
              </button>

              <button
                onClick={() => handleDeleteMarker(entry.id)}
                disabled={markerBusy}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-1.5 rounded text-sm"
              >
                Delete Marker
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block w-full border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 transition">
          <span className="text-gray-400">Click to upload videos</span>
          <input
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleUploadVideos}
          />
        </label>

        {videos.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            {videos.map((video, index) => (
              <div
                key={`${video.url}-${index}`}
                className={`rounded-lg overflow-hidden border-2 ${
                  selectedVideo?.url === video.url
                    ? "border-blue-500"
                    : "border-gray-700"
                } cursor-pointer`}
                onClick={() => setSelectedVideo(video)}
              >
                <video src={video.url} className="w-full h-32 object-cover" muted />
                <div className="p-2 text-xs bg-gray-800 flex justify-between">
                  <span>{video.url.split("/").pop()}</span>
                  <span
                    className={`${
                      video.orientation === "Portrait"
                        ? "text-pink-400"
                        : "text-green-400"
                    } font-semibold`}
                  >
                    {video.orientation}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg space-y-3">
        <h2 className="text-lg font-semibold">
          {editingAssignment ? "Update Assignment" : "Create Assignment"}
        </h2>

        {editingAssignment && (
          <div className="text-sm text-yellow-300 bg-yellow-900/20 border border-yellow-700 rounded p-2">
            Editing {editingAssignment.sourceClient} / {editingAssignment.sourceMarkerId}
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-400 mb-1">Client name</label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="e.g. DemoClient"
            className="w-full bg-gray-900 p-2 rounded border border-gray-600"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Marker</label>
          <select
            value={marker}
            onChange={(e) => setMarker(e.target.value)}
            className="w-full bg-gray-900 p-2 rounded border border-gray-600"
          >
            {markers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} ({entry.id})
              </option>
            ))}
          </select>
          {selectedMarker?.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedMarker.imageUrl}
              alt={selectedMarker.label}
              className="mt-2 h-20 object-contain bg-gray-900 border border-gray-700 rounded"
            />
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Video Orientation (auto or manual)
          </label>
          <select
            value={selectedVideo?.orientation || manualOrientation}
            onChange={(e) =>
              setManualOrientation(e.target.value as "Landscape" | "Portrait")
            }
            className="w-full bg-gray-900 p-2 rounded border border-gray-600"
          >
            <option value="Landscape">Landscape</option>
            <option value="Portrait">Portrait</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Selected Video</label>
          {selectedVideo ? (
            <video
              src={selectedVideo.url}
              className="w-full rounded-lg"
              muted
              autoPlay
              loop
            />
          ) : (
            <p className="text-gray-500 text-sm">No video selected</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSaveAssignment}
            disabled={isSaving}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed py-2 rounded text-white"
          >
            {isSaving
              ? "Saving..."
              : editingAssignment
              ? "Update Assignment"
              : "Save Assignment"}
          </button>

          {editingAssignment && (
            <button
              onClick={cancelEditing}
              className="px-4 bg-gray-700 hover:bg-gray-600 py-2 rounded"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="bg-gray-900 p-4 rounded-lg mt-6">
        <h2 className="font-semibold mb-3 text-lg">Current Assignments</h2>

        {Object.keys(config.clients || {}).length === 0 ? (
          <p className="text-gray-500 text-sm">No client assignments yet.</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(config.clients).map(([clientName, data]) => (
              <div
                key={clientName}
                className="bg-gray-800 p-3 rounded-lg border border-gray-700"
              >
                <h3 className="font-bold text-blue-400 mb-2">{clientName}</h3>

                {data.markers.length === 0 ? (
                  <p className="text-gray-500 text-xs italic">No markers assigned</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.markers.map((entry) => (
                      <div
                        key={`${clientName}-${entry.id}`}
                        className="bg-gray-900 rounded-lg overflow-hidden border border-gray-700"
                      >
                        <div className="p-2 text-sm font-semibold text-gray-300 border-b border-gray-800">
                          {entry.id}
                        </div>
                        <video
                          src={entry.video}
                          className="w-full h-32 object-cover"
                          muted
                          loop
                          autoPlay
                        />
                        <div className="p-2 text-xs text-gray-400">
                          Orientation:{" "}
                          <span
                            className={`font-medium ${
                              entry.orientation === "Portrait"
                                ? "text-pink-400"
                                : "text-green-400"
                            }`}
                          >
                            {entry.orientation || "Landscape"}
                          </span>
                        </div>
                        <div className="p-2 grid grid-cols-2 gap-2 border-t border-gray-800">
                          <button
                            onClick={() => startEditAssignment(clientName, entry)}
                            className="bg-blue-600 hover:bg-blue-700 py-1.5 rounded text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteAssignment(clientName, entry.id)}
                            className="bg-red-600 hover:bg-red-700 py-1.5 rounded text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
