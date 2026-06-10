import { buildContextPack } from "../context-packs/build-context-pack.js";
import { buildSidecarPrompt } from "../prompt-builder/build-prompt.js";

export function createPlayerTurn({ campaign, playerMessage, providerId = "chatgpt" }) {
  const trimmedMessage = playerMessage.trim();
  if (!trimmedMessage) {
    throw new Error("Player message is required.");
  }

  const contextPack = buildContextPack(campaign, {
    purpose: "player_turn",
  });
  const providerPrompt = buildSidecarPrompt({
    campaign,
    contextPack,
    userIntent: trimmedMessage,
  });

  return {
    id: `turn-${Date.now()}`,
    campaignId: campaign.id,
    providerId,
    status: "prompt_ready",
    createdAt: new Date().toISOString(),
    playerMessage: trimmedMessage,
    contextPack,
    providerPrompt,
    importedResponse: null,
    proposedChanges: [],
  };
}

export function attachProviderResponse(turn, responseText) {
  return {
    ...turn,
    status: "response_imported",
    importedResponse: {
      text: responseText,
      importedAt: new Date().toISOString(),
    },
  };
}

