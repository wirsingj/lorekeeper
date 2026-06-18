import {
  buildTurnRequestEnvelope,
  buildTurnJsonPrompt,
  parseTurnJsonResponse,
  renderTurnResponseForImport,
} from "../model-contract/turn-json-contract.js";
import { OllamaProvider } from "./ollama-provider.js";
import { findOllamaContextForCampaign } from "./ollama-context-cache.js";
import {
  mergeProviderRuntimeSettings,
  normalizeOllamaModelId,
  normalizeProviderRuntimeSettings,
  providerModes,
} from "./provider-settings.js";

// Server-side provider bridge.
// The renderer asks for a table turn; this module builds the model contract,
// calls Ollama, repairs common malformed responses once, and returns a validated
// importable turn. It must not become campaign authority.
export function getCampaignProviderSettings(campaign) {
  return normalizeProviderRuntimeSettings(campaign.providerSettings ?? {});
}

export function updateCampaignProviderSettings(campaign, patch = {}) {
  return {
    ...campaign,
    providerSettings: {
      ...(campaign.providerSettings ?? {}),
      ...mergeProviderRuntimeSettings(campaign.providerSettings ?? {}, patch),
    },
  };
}

export function createProviderForSettings(settings = {}) {
  const normalized = normalizeProviderRuntimeSettings(settings);
  if (normalized.preferredProvider === providerModes.OLLAMA) {
    return new OllamaProvider({ baseUrl: normalized.ollamaBaseUrl });
  }

  return null;
}

export async function getProviderStatusForCampaign(campaign) {
  const settings = getCampaignProviderSettings(campaign);
  const ollama = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl });
  const ollamaStatus = await ollama.getStatus({ selectedModel: settings.selectedModel });

  return {
    activeProvider: settings.preferredProvider,
    settings,
    providers: {
      bridge: {
        providerId: "bridge",
        label: "Browser Bridge",
        state: "external_bridge",
        message: "Bridge status is detected in the renderer through the Firefox extension.",
      },
      ollama: ollamaStatus,
    },
  };
}

export async function generateTurnWithProvider({
  campaign,
  contextPack,
  playerTurn,
  parsedMessage,
  providerSettings,
  signal,
  onToken,
  onEvent,
} = {}) {
  const settings = normalizeProviderRuntimeSettings(providerSettings ?? campaign.providerSettings);
  if (settings.preferredProvider !== providerModes.OLLAMA) {
    throw new Error("Server generation currently supports the Ollama provider. Bridge generation stays in the renderer extension adapter.");
  }

  const request = buildTurnRequestEnvelope({
    campaign,
    contextPack,
    playerTurn: playerTurn || "No in-world action supplied this turn.",
    parsedMessage,
    options: {
      mode: settings.fastMode ? "fast" : undefined,
      fastMode: settings.fastMode,
      playerInputs: parsedMessage?.playerInputs ?? [],
    },
  });
  // Build the request first, then build the prompt with the same request id so
  // stale or mismatched provider responses can be rejected during import.
  const prompt = buildTurnJsonPrompt({
    campaign,
    contextPack,
    playerTurn,
    parsedMessage,
    options: {
      requestId: request.requestId,
      mode: request.generation.mode,
      responseMode: request.generation.responseMode,
      playerInputs: parsedMessage?.playerInputs ?? [],
    },
  });

  const provider = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl });
  const generationConfig = buildOllamaTurnGenerationConfig(settings);
  const generationOptions = generationConfig.options;
  const modelPrompt = generationConfig.promptPrefix ? `${generationConfig.promptPrefix}${prompt}` : prompt;
  const cachedOllamaContext = findOllamaContextForCampaign(campaign, settings);
  onEvent?.({
    type: "provider_request_built",
    requestId: request.requestId,
    providerId: providerModes.OLLAMA,
    model: settings.selectedModel,
    fastMode: settings.fastMode,
    promptChars: modelPrompt.length,
    promptPreview: modelPrompt.slice(0, 2400),
    contextSections: contextPack?.sections?.map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title,
      entries: section.entries?.length ?? 0,
    })) ?? [],
    ollamaContextUsed: Boolean(cachedOllamaContext?.length),
    generationOptions,
  });
  let result = await provider.generateTurn({
    prompt: modelPrompt,
    model: settings.selectedModel,
    signal,
    onToken,
    onEvent,
    options: {
      ...generationOptions,
      context: cachedOllamaContext,
    },
  });
  const primaryResult = result;
  onEvent?.({
    type: "provider_response_received",
    requestId: request.requestId,
    providerId: result.providerId,
    model: result.model,
    durationMs: result.durationMs,
    contextSize: result.contextSize,
    tokenCounts: result.tokenCounts,
    textChars: result.text?.length ?? 0,
    textPreview: String(result.text || "").slice(0, 2400),
  });

  let parsed = parseTurnJsonResponse(result.text, {
    requestId: request.requestId,
    choicePolicy: request.generation.choicePolicy,
    request,
    repairRequestIdMismatch: true,
  });
  let repairAttempt = null;
  if (parsed.error && shouldAutoRepairTurnResponse(parsed.validationErrors)) {
    repairAttempt = {
      originalError: parsed.error,
      originalText: result.text,
    };
    onEvent?.({
      type: "provider_repair_started",
      requestId: request.requestId,
      providerId: result.providerId,
      model: result.model,
      validationErrors: parsed.validationErrors,
    });
    const repairPrompt = buildTurnResponseRepairPrompt({
      request,
      originalPrompt: modelPrompt,
      invalidResponse: result.text,
      validationErrors: parsed.validationErrors,
    });
    result = await provider.generateTurn({
      prompt: generationConfig.promptPrefix ? `${generationConfig.promptPrefix}${repairPrompt}` : repairPrompt,
      model: settings.selectedModel,
      signal,
      onToken,
      onEvent,
      options: {
        ...generationOptions,
        outputLimit: Math.max(generationOptions.outputLimit ?? 1800, 900),
        temperature: 0.2,
      },
    });
    onEvent?.({
      type: "provider_repair_response_received",
      requestId: request.requestId,
      providerId: result.providerId,
      model: result.model,
      durationMs: result.durationMs,
      textChars: result.text?.length ?? 0,
      textPreview: String(result.text || "").slice(0, 2400),
    });
    parsed = parseTurnJsonResponse(result.text, {
      requestId: request.requestId,
      choicePolicy: request.generation.choicePolicy,
      request,
      repairRequestIdMismatch: true,
    });
    repairAttempt.repaired = !parsed.error;
    repairAttempt.finalError = parsed.error;
  }
  onEvent?.({
    type: parsed.error ? "provider_response_rejected" : "provider_response_accepted",
    requestId: request.requestId,
    providerId: result.providerId,
    model: result.model,
    parseError: parsed.error,
    validationErrors: parsed.error ? parsed.validationErrors : [],
    validationWarnings: parsed.error ? [] : parsed.validationErrors,
    recovery: parsed.recovery,
    repairAttempt: repairAttempt
      ? {
          repaired: repairAttempt.repaired,
          originalError: repairAttempt.originalError,
          finalError: repairAttempt.finalError,
        }
      : null,
  });
  return {
    ...result,
    text: renderTurnResponseForImport(parsed.response),
    structured: parsed.response,
    requestId: request.requestId,
    ollamaContext: !parsed.error && !repairAttempt ? primaryResult.ollamaContext : null,
    ollamaContextUsed: Boolean(cachedOllamaContext?.length),
    parseError: parsed.error,
    validationErrors: parsed.error ? parsed.validationErrors : [],
    validationWarnings: parsed.error ? [] : parsed.validationErrors,
    recovery: parsed.recovery,
    repairAttempt,
    rawText: result.text,
  };
}

export function buildOllamaTurnGenerationConfig(settings = {}) {
  const normalized = normalizeProviderRuntimeSettings(settings);
  const usePlainJsonPrompt = shouldUsePlainJsonPromptForOllamaModel(normalized.selectedModel);
  return {
    promptPrefix: usePlainJsonPrompt ? "/no_think\n" : "",
    options: {
      outputLimit: normalized.fastMode ? Math.min(normalized.outputLimit, 550) : normalized.outputLimit,
      temperature: normalized.fastMode ? 0.45 : 0.72,
      format: usePlainJsonPrompt ? undefined : "json",
    },
  };
}

function shouldUsePlainJsonPromptForOllamaModel(modelId) {
  const normalized = normalizeOllamaModelId(modelId).toLowerCase();
  return normalized === "qwen3" || normalized.startsWith("qwen3:");
}

function shouldAutoRepairTurnResponse(validationErrors = []) {
  return validationErrors.some((error) =>
    /resolved combat must include|response\.requestId mismatch|table must contain|choices\.options|sceneStatus|flags\./i.test(error)
  );
}

function buildTurnResponseRepairPrompt({ request, originalPrompt, invalidResponse, validationErrors }) {
  return [
    "You are repairing a LoreKeeper tabletop turn JSON response.",
    "Return valid JSON only. Do not use markdown. Do not explain.",
    `The response MUST use requestId exactly: ${request.requestId}`,
    "",
    "Validation errors to fix:",
    ...validationErrors.map((error) => `- ${error}`),
    "",
    "Critical repair rules:",
    "- Preserve the user's latest action and the useful table narration from the invalid response.",
    "- If this is resolved player-submitted combat, include visible mechanics with rolls/checks/damage/resources/status.",
    "- If this is resolved player-submitted combat, include a combat proposedChange with data.turnResolved true, data.advanceTurn true, and data.resolvedActorId set to context.combat.currentTurnId.",
    "- If context.combat.currentTurnId is an enemy, do not invent HP/resource/initiative changes unless the request includes an app-resolved action record to narrate.",
    "- Do not add a new player action. Do not repeat an old choice prompt unless the turn genuinely awaits the active actor.",
    "",
    "Original request context JSON:",
    JSON.stringify(compactRepairRequest(request)),
    "",
    "Invalid response to repair:",
    invalidResponse,
    "",
    "Original generation prompt, for schema/rules reference only:",
    originalPrompt.slice(0, 12000),
  ].join("\n");
}

function compactRepairRequest(request) {
  return {
    requestId: request.requestId,
    user: request.user,
    generation: request.generation,
    combat: request.context?.combat,
    scene: request.context?.scene,
    rulesLedger: request.context?.rulesLedger,
  };
}
