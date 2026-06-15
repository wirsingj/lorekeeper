import { normalizeOllamaModelId } from "./provider-settings.js";

export const OLLAMA_CONTEXT_CONTRACT_VERSION = "lorekeeper-turn-json-v1";

export function ollamaContextCacheKey(settings = {}) {
  return [
    OLLAMA_CONTEXT_CONTRACT_VERSION,
    `mode=${settings.fastMode ? "fast" : "normal"}`,
    "format=json",
  ].join(";");
}

export function findOllamaContextForCampaign(campaign, settings = {}) {
  const campaignId = String(campaign?.id ?? "").trim();
  const modelId = normalizeOllamaModelId(settings.selectedModel);
  const cacheKey = ollamaContextCacheKey(settings);
  if (!campaignId || !modelId) {
    return null;
  }

  const match = (campaign?.providerMemory?.ollamaContexts ?? [])
    .find((entry) =>
      entry?.campaignId === campaignId &&
      normalizeOllamaModelId(entry.modelId) === modelId &&
      entry.cacheKey === cacheKey &&
      Array.isArray(entry.context) &&
      entry.context.length
    );
  return match?.context ?? null;
}

export function updateCampaignOllamaContext(campaign, { settings = {}, context, tokenCounts = {} } = {}) {
  const campaignId = String(campaign?.id ?? "").trim();
  const modelId = String(settings.selectedModel ?? "").trim();
  const normalizedModelId = normalizeOllamaModelId(modelId);
  const cacheKey = ollamaContextCacheKey(settings);
  const cleanContext = Array.isArray(context)
    ? context.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0)
    : [];

  if (!campaignId || !normalizedModelId || !cleanContext.length) {
    return campaign;
  }

  const existing = (campaign.providerMemory?.ollamaContexts ?? []).filter((entry) =>
    !(
      entry?.campaignId === campaignId &&
      normalizeOllamaModelId(entry.modelId) === normalizedModelId &&
      entry.cacheKey === cacheKey
    )
  );
  const nextEntry = {
    campaignId,
    modelId,
    cacheKey,
    contractVersion: OLLAMA_CONTEXT_CONTRACT_VERSION,
    context: cleanContext,
    tokenCount: cleanContext.length,
    promptEvalCount: Number.isFinite(Number(tokenCounts.prompt)) ? Number(tokenCounts.prompt) : null,
    completionEvalCount: Number.isFinite(Number(tokenCounts.completion)) ? Number(tokenCounts.completion) : null,
    updatedAt: new Date().toISOString(),
  };

  return {
    ...campaign,
    providerMemory: {
      ...(campaign.providerMemory ?? {}),
      ollamaContexts: [...existing, nextEntry].slice(-8),
    },
  };
}
