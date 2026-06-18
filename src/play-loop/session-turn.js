import { buildContextPack } from "../context-packs/build-context-pack.js";
import { buildTableDmPrompt } from "../prompt-builder/build-prompt.js";
import { parsePlayerMessage } from "./player-message.js";

export function createPlayerTurn({ campaign, playerMessage, providerId = "chatgpt", playerInputs = [] }) {
  const trimmedMessage = String(playerMessage ?? "").trim();
  const structuredInputs = normalizeTurnPlayerInputs(playerInputs);
  if (!trimmedMessage && !structuredInputs.length) {
    throw new Error("Player message or structured player input is required.");
  }
  const parsedMessage = parsePlayerMessage(trimmedMessage);

  const contextPack = buildContextPack(campaign, {
    purpose: "player_turn",
    includeCombatDetail: isCombatRelevant(parsedMessage),
  });
  const providerPrompt = buildTableDmPrompt({
    campaign,
    contextPack,
    userIntent: parsedMessage.inWorldText || (structuredInputs.length ? "Resolve the structured player inputs for this turn." : "No in-world action supplied this turn."),
    metaInstructions: parsedMessage.metaInstructions,
    playerInputs: structuredInputs,
  });

  return {
    id: `turn-${Date.now()}`,
    campaignId: campaign.id,
    providerId,
    status: "prompt_ready",
    createdAt: new Date().toISOString(),
    playerMessage: trimmedMessage,
    parsedMessage,
    playerInputs: structuredInputs,
    contextPack,
    providerPrompt,
    importedResponse: null,
    proposedChanges: [],
  };
}

function normalizeTurnPlayerInputs(playerInputs) {
  return Array.isArray(playerInputs)
    ? playerInputs
      .map((input) => ({
        ...input,
        text: String(input?.text ?? "").trim(),
      }))
      .filter((input) => input.text)
    : [];
}

function isCombatRelevant(parsedMessage) {
  const haystack = [
    parsedMessage.inWorldText,
    ...(parsedMessage.metaInstructions ?? []),
  ].join(" ").toLowerCase();

  return /\b(combat|fight|attack|attacks|attacking|spell|damage|hp|initiative|roll|enemy|monster|creature|beast|wolf|weapon|crossbow|bow|arrow|cast|shoot|shot|fire|fires|firing|stab|strike|wounded|under attack)\b/.test(haystack);
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
