export function buildDmNudgePrompt() {
  return [
    "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.",
    "Advance the current scene like a real tabletop DM: 3-5 paragraphs with sensory detail, tension, NPC/world reaction, and consequence.",
    "Do not force an option list. Prefer choices.options: [] for narration, consequences, patrol/travel flow, NPC replies, or atmosphere.",
    "Use a direct question instead of a structured option panel unless there is combat, immediate danger, or the user explicitly asks for options.",
    "If combat.inCombat and the current initiative actor is any party member, do not roll, deal damage, move them, speak for them, choose their tactic, or advance initiative unless that character's controller submitted an action.",
    "For any party-member combat turn with no submitted action, write a short spotlight frame: what the actor sees, immediate danger, useful positioning/resources, then ask what they do. Offer 2-4 optional tactical choices only if helpful.",
    "If combat.inCombat and the current initiative actor is an enemy/DM actor, do not invent HP/resource/initiative changes; LoreKeeper resolves enemy mechanics before narration.",
    "If combat/enemies look stale or mismatched with the current scene, propose a compact combat update to clear or correct them.",
    "Do not repeat this instruction in the table narration.)",
  ].join(" ");
}
