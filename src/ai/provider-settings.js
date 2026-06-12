export const providerModes = Object.freeze({
  BRIDGE: "bridge",
  OLLAMA: "ollama",
});

export const recommendedOllamaModels = Object.freeze([
  {
    id: "llama3.1:8b",
    label: "Llama 3.1 8B",
    speed: "fast",
    quality: "good",
    notes: "Good first local model for interactive campaign play on consumer hardware.",
  },
  {
    id: "mistral-nemo",
    label: "Mistral Nemo",
    speed: "medium",
    quality: "strong",
    notes: "Often a nice storytelling balance when the machine has enough memory.",
  },
  {
    id: "qwen3:14b",
    label: "Qwen3 14B",
    speed: "slower",
    quality: "strong",
    notes: "Heavier local option to evaluate for instruction following and context handling.",
  },
]);

export function createDefaultProviderRuntimeSettings(overrides = {}) {
  return {
    preferredProvider: normalizeProviderMode(overrides.preferredProvider ?? overrides.providerMode ?? "bridge"),
    selectedModel: overrides.selectedModel ?? "llama3.1:8b",
    generationTimeoutMs: normalizePositiveInteger(overrides.generationTimeoutMs, 120000),
    outputLimit: normalizePositiveInteger(overrides.outputLimit, 900),
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

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:11434").replace(/\/+$/, "");
}
