export const providerModes = Object.freeze({
  BRIDGE: "bridge",
  OLLAMA: "ollama",
});

export const recommendedOllamaModels = Object.freeze([
  {
    id: "llama3.1:8b",
    label: "Llama 3.1 8B",
    spec: "Low",
    speed: "fast",
    quality: "good",
    recommended: true,
    notes: "Good first local model for interactive campaign play on consumer hardware.",
  },
  {
    id: "mistral-nemo",
    label: "Mistral Nemo",
    spec: "Medium",
    speed: "medium",
    quality: "strong",
    recommended: false,
    notes: "Often a nice storytelling balance when the machine has enough memory.",
  },
  {
    id: "qwen3:14b",
    label: "Qwen3 14B",
    spec: "High",
    speed: "slower",
    quality: "strong",
    recommended: false,
    notes: "Heavier local option to evaluate for instruction following and context handling.",
  },
]);

export function createDefaultProviderRuntimeSettings(overrides = {}) {
  return {
    preferredProvider: normalizeProviderMode(overrides.preferredProvider ?? overrides.providerMode ?? "bridge"),
    selectedModel: overrides.selectedModel ?? "llama3.1:8b",
    generationTimeoutMs: normalizePositiveInteger(overrides.generationTimeoutMs, 120000),
    outputLimit: normalizePositiveInteger(overrides.outputLimit, 1800),
    fastMode: Boolean(overrides.fastMode ?? false),
    ollamaBaseUrl: normalizeBaseUrl(overrides.ollamaBaseUrl ?? "http://127.0.0.1:11434"),
  };
}

export function normalizeProviderRuntimeSettings(settings = {}) {
  return createDefaultProviderRuntimeSettings(settings);
}

export function mergeProviderRuntimeSettings(existing = {}, patch = {}) {
  return normalizeProviderRuntimeSettings({
    ...existing,
    ...patch,
  });
}

export function normalizeProviderMode(value) {
  if (value === "ollama") {
    return providerModes.OLLAMA;
  }

  if (value === "chatgpt" || value === "chatgpt-tab" || value === "browser" || value === "manual") {
    return providerModes.BRIDGE;
  }

  return Object.values(providerModes).includes(value) ? value : providerModes.BRIDGE;
}

export function normalizeOllamaModelId(value) {
  return String(value ?? "").trim().replace(/:latest$/i, "");
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  const fallback = "http://127.0.0.1:11434";
  try {
    const url = new URL(String(value || fallback));
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !isLocalOrPrivateHost(url.hostname)) {
      return fallback;
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function isLocalOrPrivateHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(normalized)) {
    return true;
  }
  const match172 = normalized.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
}
