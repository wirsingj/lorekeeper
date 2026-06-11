import { buildContextPack } from "../context-packs/build-context-pack.js";
import { buildSidecarPrompt } from "../prompt-builder/build-prompt.js";
import { parsePlayerMessage } from "./player-message.js";

export function createPlayerTurn({ campaign, playerMessage, providerId = "chatgpt" }) {
  const trimmedMessage = playerMessage.trim();
  if (!trimmedMessage) {
    throw new Error("Player message is required.");
  }
  const parsedMessage = parsePlayerMessage(trimmedMessage);

  const contextPack = buildContextPack(campaign, {
    purpose: "player_turn",
    includeCombatDetail: isCombatRelevant(parsedMessage),
  });
  const providerPrompt = buildSidecarPrompt({
    campaign,
    contextPack,
    userIntent: parsedMessage.inWorldText || "No in-world action supplied this turn.",
    metaInstructions: parsedMessage.metaInstructions,
  });

  return {
    id: `turn-${Date.now()}`,
    campaignId: campaign.id,
    providerId,
    status: "prompt_ready",
    createdAt: new Date().toISOString(),
    playerMessage: trimmedMessage,
    parsedMessage,
    contextPack,
    providerPrompt,
    importedResponse: null,
    proposedChanges: [],
  };
}

function isCombatRelevant(parsedMessage) {
  const haystack = [
    parsedMessage.inWorldText,
    ...(parsedMessage.metaInstructions ?? []),
  ].join(" ").toLowerCase();

  return /\b(combat|fight|attack|spell|damage|hp|initiative|roll|enemy|weapon|cast|shoot|stab|strike)\b/.test(haystack);
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
