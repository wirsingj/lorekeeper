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
  normalizeProviderRuntimeSettings,
  providerModes,
} from "./provider-settings.js";

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
  const generationOptions = {
    outputLimit: settings.fastMode ? Math.min(settings.outputLimit, 550) : settings.outputLimit,
    temperature: settings.fastMode ? 0.45 : 0.72,
    format: "json",
  };
  const cachedOllamaContext = findOllamaContextForCampaign(campaign, settings);
  let result = await provider.generateTurn({
    prompt,
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
    const repairPrompt = buildTurnResponseRepairPrompt({
      request,
      originalPrompt: prompt,
      invalidResponse: result.text,
      validationErrors: parsed.validationErrors,
    });
    result = await provider.generateTurn({
      prompt: repairPrompt,
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
    parsed = parseTurnJsonResponse(result.text, {
      requestId: request.requestId,
      choicePolicy: request.generation.choicePolicy,
      request,
      repairRequestIdMismatch: true,
    });
    repairAttempt.repaired = !parsed.error;
    repairAttempt.finalError = parsed.error;
  }
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
    "- If this is resolved combat, include visible mechanics with rolls/checks/damage/resources/status.",
    "- If this is resolved combat, include a combat proposedChange with data.turnResolved true, data.advanceTurn true, and data.resolvedActorId set to context.combat.currentTurnId.",
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
