"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Orientation = "Landscape" | "Portrait";

type Assignment = {
  id: string;
  video: string;
  orientation?: Orientation;
};

type ContentConfig = {
  clients: Record<string, { markers: Assignment[] }>;
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

const DEFAULT_VIDEO = "/assets/TEST_L.mp4";
const LEGACY_MARKER_IDS = new Set([
  "pattern-hiro",
  "pattern-letterA",
  "pattern-letterB",
  "pattern-letterC",
  "pattern-letterD",
]);

export default function Home() {
  const SCREENS = {
    QMC: {
      "32": { B: 727, H: 422, D: 28, Bezel: 11.5 },
      "43": { B: 970, H: 558, D: 28, Bezel: 11.5 },
      "50": { B: 1124, H: 645, D: 28, Bezel: 11.5 },
      "55": { B: 1238, H: 709, D: 28, Bezel: 11.5 },
      "65": { B: 1457, H: 832, D: 28, Bezel: 11.5 },
      "75": { B: 1682, H: 960, D: 28, Bezel: 13.5 },
      "85": { B: 1904, H: 1085, D: 28, Bezel: 14 },
    },
    OMD: {
      "32": { B: 732, H: 427, D: 46, Bezel: 11.5 },
      "46": { B: 1036, H: 590, D: 139, Bezel: 9.3 },
      "55": { B: 1227, H: 698, D: 139, Bezel: 9.3 },
      "75": { B: 1676, H: 954, D: 125, Bezel: 11.5 },
    },
  } as const;

  const [series, setSeries] = useState<"QMC" | "OMD">("QMC");
  const [orientation, setOrientation] = useState<Orientation>("Landscape");
  const [size, setSize] = useState<string>("43");
  const [mounted, setMounted] = useState(false);
  const [client, setClient] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("selectedClient") || "";
    }
    return "";
  });
  const [config, setConfig] = useState<ContentConfig | null>(null);
  const [markerConfig, setMarkerConfig] = useState<MarkerConfigResponse | null>(null);
  const sceneRef = useRef<
    (HTMLElement & {
      canvas?: HTMLCanvasElement;
      renderer?: { setSize: (width: number, height: number, updateStyle?: boolean) => void };
    }) | null
  >(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const root = document.documentElement;
    const body = document.body;
    const previousRootStyle = root.getAttribute("style");
    const previousBodyStyle = body.getAttribute("style");
    root.setAttribute("data-ar-viewer", "1");
    body.setAttribute("data-ar-viewer", "1");

    const lockDocumentViewport = () => {
      root.style.setProperty("width", "100dvw", "important");
      root.style.setProperty("height", "100dvh", "important");
      root.style.setProperty("overflow", "hidden", "important");
      root.style.setProperty("margin", "0", "important");
      root.style.setProperty("padding", "0", "important");

      body.style.setProperty("width", "100dvw", "important");
      body.style.setProperty("height", "100dvh", "important");
      body.style.setProperty("max-width", "100dvw", "important");
      body.style.setProperty("max-height", "100dvh", "important");
      body.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("margin", "0", "important");
      body.style.setProperty("margin-left", "0px", "important");
      body.style.setProperty("margin-top", "0px", "important");
      body.style.setProperty("padding", "0", "important");
    };

    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    let frameRequest = 0;
    const settleTimers: number[] = [];

    const applyViewportSize = () => {
      lockDocumentViewport();

      const viewportWidth = Math.max(
        1,
        Math.round(window.visualViewport?.width || window.innerWidth)
      );
      const viewportHeight = Math.max(
        1,
        Math.round(window.visualViewport?.height || window.innerHeight)
      );
      const canvas =
        scene.canvas ||
        (scene.querySelector("canvas") as HTMLCanvasElement | null);
      const arElements = document.querySelectorAll<HTMLElement>(
        "#arjs-video, .arjs-video, .arjs-canvas, canvas.a-canvas"
      );

      scene.style.setProperty("position", "fixed", "important");
      scene.style.setProperty("inset", "0", "important");
      scene.style.setProperty("width", `${viewportWidth}px`, "important");
      scene.style.setProperty("height", `${viewportHeight}px`, "important");

      if (canvas) {
        canvas.style.setProperty("position", "fixed", "important");
        canvas.style.setProperty("left", "0", "important");
        canvas.style.setProperty("top", "0", "important");
        canvas.style.setProperty("right", "0", "important");
        canvas.style.setProperty("bottom", "0", "important");
        canvas.style.setProperty("width", `${viewportWidth}px`, "important");
        canvas.style.setProperty("height", `${viewportHeight}px`, "important");
        canvas.style.setProperty("max-width", "none", "important");
        canvas.style.setProperty("max-height", "none", "important");
        canvas.style.setProperty("margin", "0", "important");
      }

      for (const element of arElements) {
        element.style.setProperty("position", "fixed", "important");
        element.style.setProperty("left", "0", "important");
        element.style.setProperty("top", "0", "important");
        element.style.setProperty("right", "0", "important");
        element.style.setProperty("bottom", "0", "important");
        element.style.setProperty("width", `${viewportWidth}px`, "important");
        element.style.setProperty("height", `${viewportHeight}px`, "important");
        element.style.setProperty("max-width", "none", "important");
        element.style.setProperty("max-height", "none", "important");
        element.style.setProperty("margin", "0", "important");

        if (element instanceof HTMLVideoElement) {
          element.style.setProperty("object-fit", "cover", "important");
        }
      }
    };

    const scheduleViewportSize = () => {
      window.cancelAnimationFrame(frameRequest);
      frameRequest = window.requestAnimationFrame(applyViewportSize);
    };

    const onSceneLoaded = () => scheduleViewportSize();

    scene.addEventListener("loaded", onSceneLoaded);
    window.addEventListener("resize", scheduleViewportSize);
    window.addEventListener("orientationchange", scheduleViewportSize);
    window.visualViewport?.addEventListener("resize", scheduleViewportSize);

    scheduleViewportSize();
    settleTimers.push(
      window.setTimeout(scheduleViewportSize, 120),
      window.setTimeout(scheduleViewportSize, 400),
      window.setTimeout(scheduleViewportSize, 1000)
    );

    return () => {
      scene.removeEventListener("loaded", onSceneLoaded);
      window.removeEventListener("resize", scheduleViewportSize);
      window.removeEventListener("orientationchange", scheduleViewportSize);
      window.visualViewport?.removeEventListener("resize", scheduleViewportSize);
      window.cancelAnimationFrame(frameRequest);
      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }
      root.removeAttribute("data-ar-viewer");
      body.removeAttribute("data-ar-viewer");
      if (previousRootStyle === null) {
        root.removeAttribute("style");
      } else {
        root.setAttribute("style", previousRootStyle);
      }
      if (previousBodyStyle === null) {
        body.removeAttribute("style");
      } else {
        body.setAttribute("style", previousBodyStyle);
      }
    };
  }, [mounted]);

  useEffect(() => {
    Promise.all([fetch("/api/config"), fetch("/api/markers")])
      .then(async ([configResponse, markerResponse]) => {
        const configPayload = (await configResponse.json()) as ContentConfig;
        const markerPayload = (await markerResponse.json()) as MarkerConfigResponse;

        setConfig(configPayload);
        setMarkerConfig(markerPayload);
      })
      .catch((err) => console.error("Error loading viewer data:", err))
      .finally(() => setMounted(true));
  }, []);

  const data = SCREENS[series][size as keyof (typeof SCREENS)[typeof series]];
  const width = data.B * 0.01;
  const height = data.H * 0.01;

  const markerMap = useMemo(() => {
    const map = new Map<string, MarkerOption>();
    for (const markerEntry of markerConfig?.markers || []) {
      map.set(markerEntry.id, markerEntry);
    }
    return map;
  }, [markerConfig]);

  const clientList = config?.clients ? Object.keys(config.clients) : [];
  const selectedClient = config?.clients?.[client] || { markers: [] };
  const availableSizes = Object.keys(SCREENS[series]);

  const fallbackAssignment: Assignment = {
    id: "pattern-hiro",
    video: DEFAULT_VIDEO,
    orientation,
  };

  const assignments: Assignment[] = client
    ? selectedClient.markers?.length
      ? selectedClient.markers
      : [fallbackAssignment]
    : [fallbackAssignment];

  const resolvedAssignments = assignments.filter(
    (assignment) =>
      markerMap.has(assignment.id) || LEGACY_MARKER_IDS.has(assignment.id)
  );
  const activeAssignments =
    resolvedAssignments.length > 0 ? resolvedAssignments : [fallbackAssignment];

  const playbackKey = activeAssignments
    .map((assignment) => `${assignment.id}|${assignment.video}`)
    .join("||");

  useEffect(() => {
    const unlock = () => {
      const videos = document.querySelectorAll<HTMLVideoElement>(
        "video[data-ar-video='1']"
      );

      for (const video of videos) {
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.play().catch((err) => {
          console.warn("Video play blocked:", err);
        });
      }

      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };

    window.addEventListener("click", unlock);
    window.addEventListener("touchstart", unlock);

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [playbackKey]);

  const flipDisabled = Boolean(client && assignments.length > 0);

  const handleFlip = () => {
    if (flipDisabled) {
      alert("Assignments are orientation-locked. Update orientation in Dashboard.");
      return;
    }

    setOrientation((current) =>
      current === "Landscape" ? "Portrait" : "Landscape"
    );
  };

  const resolvePatternUrl = (markerId: string) => {
    return markerMap.get(markerId)?.patternUrl || `/markers/${markerId}.patt`;
  };

  const buildVideoId = (markerId: string, index: number) => {
    const safe = markerId.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `videoTexture-${safe}-${index}`;
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Loading AR...
      </div>
    );
  }

  return (
    <main className="fixed inset-0 w-dvw h-dvh overflow-hidden">
      <a-scene
        ref={sceneRef}
        className="ar-scene"
        embedded
        arjs="sourceType: webcam; facingMode: environment; debugUIEnabled: false; patternRatio: 0.5; labelingMode: black_region;"
        vr-mode-ui="enabled: false"
        renderer="logarithmicDepthBuffer: true; antialias: true;"
        style={{ width: "100%", height: "100%" }}
      >
        <a-assets>
          {activeAssignments.map((assignment, index) => {
            const videoId = buildVideoId(assignment.id, index);
            return (
              <video
                key={videoId}
                id={videoId}
                src={assignment.video || DEFAULT_VIDEO}
                preload="auto"
                crossOrigin="anonymous"
                loop
                muted
                playsInline
                data-ar-video="1"
              ></video>
            );
          })}
        </a-assets>

        {activeAssignments.map((assignment, index) => {
          const markerOrientation = assignment.orientation || orientation;
          const screenWidth =
            markerOrientation === "Landscape" ? width : height;
          const screenHeight =
            markerOrientation === "Landscape" ? height : width;
          const videoId = buildVideoId(assignment.id, index);

          return (
            <a-marker
              key={`${assignment.id}-${index}`}
              type="pattern"
              url={resolvePatternUrl(assignment.id)}
              size="0.0108"
              smooth="true"
              smoothCount="10"
              smoothTolerance="0.01"
              smoothThreshold="5"
              data-marker-id={assignment.id}
            >
              <a-entity rotation="-90 0 0" position="0 0 0.05">
                <a-box
                  depth="0.15"
                  width={screenWidth}
                  height={screenHeight}
                  color="black"
                />
                <a-plane
                  position="0 0 0.08"
                  width={screenWidth - 0.05}
                  height={screenHeight - 0.05}
                  material={`src: #${videoId}`}
                />
              </a-entity>
            </a-marker>
          );
        })}

        <a-entity camera></a-entity>
      </a-scene>

      <div className="fixed top-2 left-2 z-50 w-80 max-w-[95vw] md:w-auto md:max-w-[calc(100vw-20rem)] overflow-x-hidden">
        <div className="w-full md:w-auto max-w-full bg-black/70 border border-white/10 backdrop-blur rounded-xl p-2 space-y-1.5 overflow-x-hidden">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <select
              value={series}
              onChange={(e) => setSeries(e.target.value as "QMC" | "OMD")}
              className="h-10 min-w-[78px] shrink-0 bg-gray-800 text-white px-3 rounded-lg border border-gray-600 text-sm font-semibold"
            >
              <option value="QMC">QMC</option>
              <option value="OMD">OMD</option>
            </select>

            <button
              onClick={handleFlip}
              className={`h-10 px-3 shrink-0 rounded-lg text-sm font-semibold ${
                flipDisabled
                  ? "bg-gray-500 cursor-not-allowed text-gray-100"
                  : "bg-gray-700 hover:bg-gray-600 text-white"
              }`}
            >
              Flip
            </button>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableSizes.map((entry) => (
              <button
                key={entry}
                onClick={() => setSize(entry)}
                className={`h-10 min-w-[50px] px-2.5 shrink-0 rounded-lg text-sm font-semibold ${
                  size === entry
                    ? "bg-blue-600 text-white"
                    : "bg-blue-500 hover:bg-blue-400 text-white"
                }`}
              >
                {entry}&quot;
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="fixed left-2 top-[7.5rem] z-50 w-80 max-w-[95vw] md:top-2 md:left-auto md:right-2 md:w-72 bg-black/75 border border-white/10 backdrop-blur p-2.5 rounded-xl text-white space-y-2 overflow-hidden">
        <div>
          <label className="block text-gray-300 text-sm mb-1">Select Client</label>
          <select
            value={client}
            onChange={(e) => {
              const value = e.target.value;
              setClient(value);
              localStorage.setItem("selectedClient", value);
            }}
            className="h-10 w-full bg-gray-800 text-white px-2 rounded-lg border border-gray-600 text-sm"
          >
            <option value="">-- Choose client --</option>
            {clientList.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fixed bottom-2 left-2 right-2 md:left-auto md:right-2 md:w-auto z-50 text-white bg-black/70 border border-white/10 backdrop-blur p-2 rounded-xl text-[11px] sm:text-sm leading-4 sm:leading-5">
        Type: {series} {size}&quot; <br />
        Position: {client ? "Per marker" : orientation} <br />
        Markers loaded: {activeAssignments.length}
      </div>
    </main>
  );
}
