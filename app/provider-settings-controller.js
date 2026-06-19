import { normalizeOllamaModelId, recommendedOllamaModels } from "../src/ai/provider-settings.js";

export function resolveProviderSettings(campaignSettings = {}, savedSettings = {}) {
  const preferredProvider = campaignSettings.preferredProvider === "chatgpt"
    ? "bridge"
    : campaignSettings.preferredProvider || savedSettings.preferredProvider || "ollama";
  return {
    preferredProvider,
    selectedModel: campaignSettings.selectedModel || savedSettings.selectedModel || "llama3.1:8b",
    generationTimeoutMs: Number(campaignSettings.generationTimeoutMs || savedSettings.generationTimeoutMs) || 120000,
    outputLimit: Math.max(1800, Number(campaignSettings.outputLimit || savedSettings.outputLimit) || 1800),
    fastMode: campaignSettings.fastMode ?? savedSettings.fastMode ?? false,
    ollamaBaseUrl: campaignSettings.ollamaBaseUrl || savedSettings.ollamaBaseUrl || "http://127.0.0.1:11434",
  };
}

export function campaignCreationProviderSettings(settings = {}, { selectedControlModel = "", installedModels = [] } = {}) {
  if (settings.preferredProvider !== "ollama") {
    return settings;
  }

  if (isOllamaModelInstalled(settings.selectedModel, installedModels)) {
    return settings;
  }

  const fallbackModel = [selectedControlModel, ...installedModels]
    .filter(Boolean)
    .find((model) => isOllamaModelInstalled(model, installedModels));

  return {
    ...settings,
    selectedModel: fallbackModel || settings.selectedModel,
  };
}

export function installedOllamaModelIds(ollama = {}) {
  return (ollama?.models ?? []).map((model) => model.name || model.model).filter(Boolean);
}

export function buildModelOptionsProjection({ selectedModel = "", ollama = {} } = {}) {
  const installed = installedOllamaModelIds(ollama);
  const recommended = (ollama?.recommendedModels ?? []).map((model) => model.id);
  const options = dedupeModelOptions([selectedModel, ...installed, ...recommended].filter(Boolean), selectedModel);
  return options.map((model) => ({
    value: model,
    label: formatModelOptionLabel(model, isOllamaModelInstalled(model, installed)),
    selected: normalizeOllamaModelId(model) === normalizeOllamaModelId(selectedModel),
  }));
}

export function selectedModelSummaryProjection({ selectedModel = "", ollama = {} } = {}) {
  const installedModels = installedOllamaModelIds(ollama);
  const installed = isOllamaModelInstalled(selectedModel, installedModels);
  const descriptor = recommendedModelDescriptor(selectedModel);
  const chips = [
    descriptor?.recommended ? "Recommended" : null,
    descriptor?.spec ? `${descriptor.spec} Spec` : null,
    descriptor?.speed ? `Speed: ${descriptor.speed}` : null,
    descriptor?.quality ? `Quality: ${descriptor.quality}` : null,
    installed ? "Installed" : "Not Downloaded",
  ].filter(Boolean);

  return {
    chips,
    installed,
    pullHidden: installed,
    pullDisabled: ollama.state === "ollama_not_installed" || ollama.state === "ollama_not_running",
    pullLabel: "Download",
    pullTitle: `Download ${selectedModel} with Ollama`,
  };
}

export function providerStatusLabel(ollama = {}) {
  if (ollama.state === "ready") {
    return `Ollama ready: ${modelDisplayName(ollama.selectedModel)}`;
  }
  if (ollama.state === "selected_model_missing") {
    return `Ollama running; ${modelDisplayName(ollama.selectedModel)} is not downloaded`;
  }
  if (ollama.state === "ollama_not_running") {
    return "Ollama installed but not running";
  }
  if (ollama.state === "ollama_not_installed") {
    return "Ollama is not installed";
  }
  return ollama.runtimeMessage || "Ollama status unknown";
}

export function providerSetupHint(ollama = {}, selectedModel = "") {
  if (ollama.state === "ollama_not_installed") {
    return "Install Ollama from ollama.com, then reopen DM Voice and refresh.";
  }
  if (ollama.state === "ollama_not_running") {
    return "Start Ollama, then refresh DM Voice.";
  }
  return `${modelDisplayName(selectedModel)} is missing. Use Download to pull it locally.`;
}

export function modelDisplayName(modelId = "") {
  return recommendedModelDescriptor(modelId)?.label ?? modelId;
}

export function recommendedModelDescriptor(modelId = "") {
  const canonicalId = normalizeOllamaModelId(modelId);
  const model = recommendedOllamaModels.find((candidate) => normalizeOllamaModelId(candidate.id) === canonicalId);
  if (!model) {
    return {
      label: modelId,
      spec: "Custom",
      speed: null,
      quality: null,
      recommended: false,
    };
  }

  return {
    ...model,
    spec: model.spec ?? inferModelSpec(model.id),
    recommended: Boolean(model.recommended),
  };
}

export function isOllamaModelInstalled(modelId = "", installedModels = []) {
  const canonicalId = normalizeOllamaModelId(modelId);
  return installedModels.some((installed) => normalizeOllamaModelId(installed) === canonicalId);
}

export function dedupeModelOptions(modelIds = [], selectedModel = "") {
  const byCanonicalId = new Map();
  const selectedCanonicalId = normalizeOllamaModelId(selectedModel);
  for (const modelId of modelIds) {
    const canonicalId = normalizeOllamaModelId(modelId);
    if (!canonicalId) {
      continue;
    }

    const current = byCanonicalId.get(canonicalId);
    const candidateIsSelected = canonicalId === selectedCanonicalId;
    const currentIsSelected = normalizeOllamaModelId(current) === selectedCanonicalId;
    if (!current || (candidateIsSelected && !currentIsSelected)) {
      byCanonicalId.set(canonicalId, modelId);
    }
  }

  return [...byCanonicalId.values()];
}

function formatModelOptionLabel(modelId, isInstalled) {
  const descriptor = recommendedModelDescriptor(modelId);
  const label = descriptor?.label ?? modelId;
  const badges = [
    isInstalled ? "installed" : "download needed",
    descriptor?.recommended ? "recommended" : null,
    descriptor?.spec ? `${descriptor.spec} spec` : null,
  ].filter(Boolean);
  return `${label} - ${badges.join(" / ")}`;
}

function inferModelSpec(modelId) {
  if (/14b|27b|70b/i.test(modelId)) {
    return "High";
  }
  if (/nemo|12b/i.test(modelId)) {
    return "Medium";
  }
  return "Low";
}
