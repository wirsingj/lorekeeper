import {
  buildTurnJsonPrompt,
  parseTurnJsonResponse,
  renderTurnResponseForImport,
} from "../model-contract/turn-json-contract.js";
import { OllamaProvider } from "./ollama-provider.js";
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

  const prompt = buildTurnJsonPrompt({
    campaign,
    contextPack,
    playerTurn: playerTurn || "No in-world action supplied this turn.",
    parsedMessage,
  });

  const provider = new OllamaProvider({ baseUrl: settings.ollamaBaseUrl });
  const result = await provider.generateTurn({
    prompt,
    model: settings.selectedModel,
    signal,
    onToken,
    onEvent,
    options: {
      outputLimit: settings.fastMode ? Math.min(settings.outputLimit, 550) : settings.outputLimit,
      temperature: settings.fastMode ? 0.45 : 0.6,
      format: "json",
    },
  });

  const parsed = parseTurnJsonResponse(result.text);
  return {
    ...result,
    text: renderTurnResponseForImport(parsed.response),
    structured: parsed.response,
    parseError: parsed.error,
    rawText: result.text,
  };
}
