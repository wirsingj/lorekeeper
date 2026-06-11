import { renderContextPackMarkdown } from "../context-packs/build-context-pack.js";
import { renderTemplateInstructions, sidecarTurnTemplate } from "./templates.js";

export function buildSidecarPrompt({
  campaign,
  contextPack,
  userIntent = "",
  metaInstructions = [],
  template = sidecarTurnTemplate,
}) {
  const sections = [
    "# Lorekeeper Sidecar Prompt",
    "",
    "## Role",
    renderTemplateInstructions(template),
    "",
    "## Provider Conversation Identity",
    `Use this provider conversation for campaign: ${campaign.title} (${shortCampaignId(campaign.id)}).`,
    "If the provider UI names or summarizes this chat, prefer the campaign name plus short id.",
    "Do not treat provider chat history as canon; Lorekeeper SQLite state and the context pack are the source of truth.",
    "",
    "## Player Turn",
    "In-world action / character-facing text:",
    userIntent || "Continue the current scene while preserving established canon.",
    "",
    "Meta instructions from parenthetical text:",
    ...(metaInstructions.length
      ? metaInstructions.map((instruction) => `- ${instruction}`)
      : ["- None."]),
    "",
    "Interpret non-parenthetical player text as in-world action, speech, or scene description.",
    "Interpret parenthetical text as out-of-world guidance to Lorekeeper and the AI sidecar, not as character dialogue or visible narration.",
    "",
    "## Campaign Summary",
    campaign.summary || "No campaign summary recorded.",
    "",
    renderContextPackMarkdown(contextPack),
    "",
    "## Lorekeeper Update Contract",
    "At the end of your response, include proposed changes only for facts that changed or new facts that matter.",
    "Use this exact fenced block shape:",
    "",
    "```json lorekeeper_updates",
    JSON.stringify(createEmptyUpdateContract(), null, 2),
    "```",
  ];

  return sections.join("\n").trim();
}

function shortCampaignId(id = "") {
  const compact = String(id).replace(/[^a-z0-9]/gi, "");
  return compact.slice(0, 8) || "campaign";
}

export function createEmptyUpdateContract() {
  return {
    proposedChanges: [
      {
        operation: "add | update | remove | note",
        domain:
          "people | party | factions | places | maps | items | things | inventory | lore | timeline | quests | relationships | scene | combat | style",
        targetId: "existing-id-or-null",
        summary: "Human-readable change summary.",
        data: {},
        confidence: "low | medium | high",
        reason: "Why this should become canon.",
      },
    ],
  };
}
