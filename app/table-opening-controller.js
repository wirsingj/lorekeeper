const canonOpeningRoles = new Set(["dm", "player", "party", "npc"]);

export function isCampaignReadyForOpening(campaign, { isHost = true } = {}) {
  if (!campaign || !isHost) {
    return false;
  }
  if (campaign.scene?.status !== "campaign_start") {
    return false;
  }
  const storedMessages = campaign.sessionLog?.messages ?? [];
  return !storedMessages.some((message) => canonOpeningRoles.has(message.role));
}

export function buildStartAdventureOpeningProjection({
  campaign,
  turnProjection = {},
  isHost = true,
  openingRequested = false,
} = {}) {
  const ready = isCampaignReadyForOpening(campaign, { isHost });
  const visible = ready && !turnProjection.hasRepair && !openingRequested;
  return {
    visible,
    disabled: !visible || Boolean(turnProjection.hasActiveGeneration),
    title: turnProjection.hasActiveGeneration
      ? "The DM is already starting the adventure"
      : "Begin the opening narration",
  };
}

export function buildAdventureOpeningPrompt() {
  return [
    "(Opening narration: Begin the first session from the current SQLite campaign state.",
    "This is not a player action. Do not invent a player choice before play begins.",
    "Deliver a strong tabletop opening like a real D&D first scene: 4-7 paragraphs, sensory detail, clear location, present party, tone, immediate pressure, and why action matters now.",
    "Use the campaign premise, starting place, party members, party integrations, hidden goal horizon, living-world memory, and current scene facts.",
    "Do not speak, think, move, scan, ready weapons, or make tactical choices for host-controlled, remote-controlled, or unassigned party members.",
    "For host-controlled, remote-controlled, and unassigned party members, use neutral presence only: they are present, positioned by the starting premise, and ready for the table's first choice.",
    "Do not write a named controlled party member as watching, noticing, deciding, stepping, drawing, readying, speaking, gesturing, tightening a grip, reacting, or taking initiative.",
    "Good controlled-party framing: 'Rowan is among the party at the half-buried shrine.' Bad: 'Rowan watches the treeline and reaches for his sword.'",
    "AI companions may have tiny presence only if generation.companionInterjectionPolicy allows it, and never as the main decision-maker.",
    "End with one direct table-facing prompt or immediate situation the players can respond to.",
    "Prefer choices.options: [] unless the opening begins in combat or immediate danger truly requires structured options.",
    "Do not repeat these instructions in the table narration.)",
  ].join(" ");
}
