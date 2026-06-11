export const CAMPAIGN_SCHEMA_VERSION = "0.1.0";

export const entityTypes = Object.freeze({
  PERSON: "person",
  PARTY_MEMBER: "party_member",
  FACTION: "faction",
  PLACE: "place",
  ITEM: "item",
  QUEST: "quest",
  LORE_NOTE: "lore_note",
  TIMELINE_EVENT: "timeline_event",
  RELATIONSHIP: "relationship",
  MAP: "map",
});

export const contextPackKinds = Object.freeze({
  SCENE: "current_scene",
  HISTORY: "recent_play_history",
  PARTY: "active_party",
  NEARBY: "nearby_people_places",
  LORE: "relevant_lore",
  INVENTORY: "current_inventory",
  THREADS: "unresolved_threads",
  COMBAT: "combat_state",
  RULES: "rules_profile",
  RELATIONSHIPS: "relationship_notes",
  STYLE: "style_rules",
});

export function createEmptyCampaign(overrides = {}) {
  const now = new Date().toISOString();

  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    id: overrides.id ?? "campaign-local",
    title: overrides.title ?? "Untitled Campaign",
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    summary: overrides.summary ?? "",
    people: overrides.people ?? [],
    party: overrides.party ?? [],
    factions: overrides.factions ?? [],
    places: overrides.places ?? [],
    maps: overrides.maps ?? [],
    items: overrides.items ?? [],
    inventory: overrides.inventory ?? [],
    lore: overrides.lore ?? [],
    timeline: overrides.timeline ?? [],
    quests: overrides.quests ?? [],
    relationships: overrides.relationships ?? [],
    scene: overrides.scene ?? createEmptyScene(),
    sessionLog: overrides.sessionLog ?? createEmptySessionLog(),
    combat: overrides.combat ?? createEmptyCombatState(),
    rulesProfile: overrides.rulesProfile ?? createDefaultRulesProfile(),
    style: overrides.style ?? createDefaultStyleRules(),
    promptTemplates: overrides.promptTemplates ?? createDefaultPromptTemplateSettings(),
    recapTemplates: overrides.recapTemplates ?? createDefaultRecapTemplateSettings(),
    providerSettings: overrides.providerSettings ?? createDefaultProviderSettings(),
    sourceDocuments: overrides.sourceDocuments ?? [],
    assets: overrides.assets ?? [],
    reviewLog: overrides.reviewLog ?? [],
    rawImports: overrides.rawImports ?? [],
  };
}

export function createEmptyScene() {
  return {
    status: "between_scenes",
    currentPlaceId: null,
    nearbyPlaceIds: [],
    presentPeopleIds: [],
    presentPartyMemberIds: [],
    activeQuestIds: [],
    localNotes: [],
    immediateSituation: "",
  };
}

export function createEmptySessionLog() {
  return {
    activeSessionId: "session-main",
    sessions: [
      {
        id: "session-main",
        title: "Campaign Play",
        startedAt: new Date().toISOString(),
        endedAt: null,
        recap: "",
      },
    ],
    messages: [],
  };
}

export function createEmptyCombatState() {
  return {
    inCombat: false,
    round: null,
    initiative: [],
    enemies: [],
    conditions: [],
    stakes: "",
    turnFormat: "Declare intent, resolve action, update HP/conditions, show next initiative.",
    preferences: [
      "Keep combat tactical but cinematic.",
      "Track HP, conditions, initiative, and enemy intent when available.",
      "Ask for missing player choices instead of assuming major tactics.",
    ],
  };
}

export function createDefaultStyleRules() {
  return {
    tone: "immersive, clear, high-agency fantasy adventure",
    pacing: "scene-forward with concise mechanical bookkeeping",
    narrationRules: [
      "Preserve established canon unless the user approves a change.",
      "Keep player agency explicit.",
      "Use vivid sensory details without burying actionable choices.",
    ],
    formattingRules: [
      "End scenes with clear options or an immediate prompt for the player.",
      "Separate mechanical updates from prose when stakes or inventory change.",
    ],
  };
}

export function createDefaultPromptTemplateSettings() {
  return {
    activeTemplateId: "sidecar_turn_v1",
    templates: [
      {
        id: "sidecar_turn_v1",
        name: "Sidecar Campaign Turn",
        purpose: "Run the next campaign beat using a focused Lorekeeper context pack.",
      },
    ],
  };
}

export function createDefaultRecapTemplateSettings() {
  return {
    activeTemplateId: "session_recap_v1",
    templates: [
      {
        id: "session_recap_v1",
        name: "Session Recap",
        purpose: "Condense recent events into canon-safe notes and proposed state changes.",
      },
    ],
  };
}

export function createDefaultProviderSettings() {
  return {
    preferredProvider: "chatgpt",
    bridgeMode: "manual_until_adapter_ready",
    requireExplicitTabSelection: true,
    automationVisible: true,
    allowBackgroundArbitraryTabs: false,
  };
}

export function createDefaultRulesProfile() {
  return {
    id: "dnd-5e-lite",
    name: "D&D 5e Lite",
    purpose:
      "Keep provider-led play mechanically grounded without implementing a full virtual tabletop or strict rules engine.",
    coreStats: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
    trackedCharacterFields: [
      "level",
      "class",
      "ancestry",
      "armorClass",
      "hitPoints",
      "temporaryHitPoints",
      "proficiencyBonus",
      "abilityScores",
      "savingThrows",
      "skills",
      "passivePerception",
      "speed",
      "attacks",
      "features",
      "spells",
      "spellSlots",
      "inventory",
      "conditions",
    ],
    diceConventions: {
      defaultCheck: "d20 + ability modifier + proficiency when applicable",
      advantage: "roll 2d20 and keep the higher",
      disadvantage: "roll 2d20 and keep the lower",
      deathSaves: "optional; track only when the campaign wants that tension",
    },
    combatLoop: [
      "Confirm scene stakes and participants.",
      "Roll or assign initiative.",
      "On each turn, show actor, HP/AC when known, conditions, 3-5 sensible options, chosen action, roll, result, and narration.",
      "Update HP, conditions, resources, position, enemy intent, and unresolved consequences.",
      "End the round with a concise state summary.",
    ],
    conditions: [
      "blinded",
      "charmed",
      "deafened",
      "frightened",
      "grappled",
      "incapacitated",
      "invisible",
      "paralyzed",
      "poisoned",
      "prone",
      "restrained",
      "stunned",
      "unconscious",
      "exhaustion",
      "homebrew",
    ],
    providerGuardRails: [
      "Use real rolls when resolving uncertain actions.",
      "Do not silently change HP, items, spells, relationships, or major canon.",
      "If exact stats are missing, state the assumption and propose a Lorekeeper update.",
      "Keep combat tactical and readable rather than exhaustive.",
      "The user controls their primary character unless they explicitly delegate.",
    ],
  };
}

export function validateCampaign(campaign) {
  const errors = [];

  if (!campaign || typeof campaign !== "object") {
    return ["Campaign must be an object."];
  }

  requireString(campaign, "schemaVersion", errors);
  requireString(campaign, "id", errors);
  requireString(campaign, "title", errors);
  requireArray(campaign, "people", errors);
  requireArray(campaign, "party", errors);
  requireArray(campaign, "factions", errors);
  requireArray(campaign, "places", errors);
  requireArray(campaign, "items", errors);
  requireArray(campaign, "inventory", errors);
  requireArray(campaign, "lore", errors);
  requireArray(campaign, "timeline", errors);
  requireArray(campaign, "quests", errors);
  requireArray(campaign, "relationships", errors);
  requireArray(campaign, "sourceDocuments", errors);
  requireArray(campaign, "assets", errors);

  if (!campaign.scene || typeof campaign.scene !== "object") {
    errors.push("scene must be an object.");
  }

  if (!campaign.sessionLog || typeof campaign.sessionLog !== "object") {
    errors.push("sessionLog must be an object.");
  }

  if (!campaign.combat || typeof campaign.combat !== "object") {
    errors.push("combat must be an object.");
  }

  if (!campaign.rulesProfile || typeof campaign.rulesProfile !== "object") {
    errors.push("rulesProfile must be an object.");
  }

  return errors;
}

export function normalizeCampaign(campaign) {
  return createEmptyCampaign(campaign);
}

export function touchCampaign(campaign, date = new Date()) {
  return {
    ...campaign,
    updatedAt: date.toISOString(),
  };
}

function requireString(object, key, errors) {
  if (typeof object[key] !== "string" || object[key].length === 0) {
    errors.push(`${key} must be a non-empty string.`);
  }
}

function requireArray(object, key, errors) {
  if (!Array.isArray(object[key])) {
    errors.push(`${key} must be an array.`);
  }
}
