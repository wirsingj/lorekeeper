import { renderContextPackMarkdown } from "../context-packs/build-context-pack.js";
import { renderTemplateInstructions, sidecarTurnTemplate } from "./templates.js";

export function buildSidecarPrompt({ campaign, contextPack, userIntent = "", template = sidecarTurnTemplate }) {
  const sections = [
    "# Lorekeeper Sidecar Prompt",
    "",
    "## Role",
    renderTemplateInstructions(template),
    "",
    "## User Intent",
    userIntent || "Continue the current scene while preserving established canon.",
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

export function createEmptyUpdateContract() {
  return {
    proposedChanges: [
      {
        operation: "add | update | remove | note",
        domain:
          "people | party | factions | places | maps | items | inventory | lore | timeline | quests | relationships | scene | combat | style",
        targetId: "existing-id-or-null",
        summary: "Human-readable change summary.",
        data: {},
        confidence: "low | medium | high",
        reason: "Why this should become canon.",
      },
    ],
  };
}

