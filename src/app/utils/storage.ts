type ClientMarkerAssignment = {
  id: string;
  video: string;
  orientation?: "Landscape" | "Portrait";
};

type ClientConfig = {
  markers: ClientMarkerAssignment[];
};

type AppConfig = {
  clients: Record<string, ClientConfig>;
};

export const loadConfig = () => {
  const raw = localStorage.getItem("ar-tv-config");
  return raw ? (JSON.parse(raw) as AppConfig) : { clients: {} };
};

export const saveConfig = (config: AppConfig) => {
  localStorage.setItem("ar-tv-config", JSON.stringify(config));
};
