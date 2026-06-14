import { renderContextPackMarkdown } from "../context-packs/build-context-pack.js";
import { renderTemplateInstructions, sidecarTurnTemplate } from "./templates.js";

export function buildSidecarPrompt({
  campaign,
  contextPack,
  userIntent = "",
  metaInstructions = [],
  playerInputs = [],
  template = sidecarTurnTemplate,
}) {
  const metaLines = metaInstructions.length
    ? metaInstructions.map((instruction) => `- ${compactLine(instruction, 240)}`)
    : ["- None."];
  const updateSchema = JSON.stringify(createEmptyUpdateContract(), null, 2);
  const sections = [
    "# Lorekeeper Sidecar Prompt",
    "",
    "## Role",
    renderTemplateInstructions(template),
    "",
    `Provider chat hint: ${campaign.title} [${shortCampaignId(campaign.id)}].`,
    "",
    "## Player Turn",
    compactLine(userIntent || "Continue the current scene while preserving established canon.", 1200),
    "",
    "Structured Player Inputs:",
    ...formatPlayerInputs(playerInputs),
    "",
    "Resolve the Player Turn above as the newest table action. Do not repeat an older DM question or offer the same choices again after the player has moved past them.",
    "If the player calls to, questions, or asks help from an NPC/party member, narrate that character's immediate response or visible action.",
    "",
    "Meta:",
    ...metaLines,
    "",
    `Campaign Summary: ${compactLine(campaign.summary || "No campaign summary recorded.", 900)}`,
    "",
    renderContextPackMarkdown(contextPack),
    "",
    "## Lorekeeper Update Contract",
    "Only include changed/new canon that matters. Prefer compact data. One record per party/person/place/item/quest/etc. Use party for PCs and trusted companions.",
    "Your final lines must be exactly one fenced block like this. If nothing changed, use an empty proposedChanges array.",
    "",
    "```json lorekeeper_updates",
    updateSchema,
    "```",
  ];

  return sections.join("\n").trim();
}

function formatPlayerInputs(playerInputs) {
  const inputs = Array.isArray(playerInputs)
    ? playerInputs.filter((input) => String(input?.text ?? "").trim())
    : [];
  if (!inputs.length) {
    return ["- None."];
  }
  return inputs.slice(0, 8).map((input) => {
    const name = input.characterName || input.playerName || input.characterId || "Player";
    return `- ${compactLine(name, 80)}: ${compactLine(input.text, 500)}`;
  });
}

function shortCampaignId(id = "") {
  const compact = String(id).replace(/[^a-z0-9]/gi, "");
  return compact.slice(0, 8) || "campaign";
}

export function createEmptyUpdateContract() {
  return {
    proposedChanges: [
      {
        operation: "add|update|remove|note",
        domain: "party|people|factions|places|items|inventory|lore|timeline|quests|relationships|scene|combat|style",
        targetId: null,
        summary: "",
        data: {},
        confidence: "low|medium|high",
        reason: "",
      },
    ],
  };
}

function compactLine(value, limit) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
