export const CAMPAIGN_SCHEMA_VERSION = "2.0.0";

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
    hidden: overrides.hidden ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    summary: overrides.summary ?? "",
    people: arrayOrEmpty(overrides.people),
    party: arrayOrEmpty(overrides.party),
    factions: arrayOrEmpty(overrides.factions),
    places: arrayOrEmpty(overrides.places),
    maps: arrayOrEmpty(overrides.maps),
    items: arrayOrEmpty(overrides.items),
    inventory: arrayOrEmpty(overrides.inventory),
    lore: arrayOrEmpty(overrides.lore),
    timeline: arrayOrEmpty(overrides.timeline),
    quests: arrayOrEmpty(overrides.quests),
    relationships: arrayOrEmpty(overrides.relationships),
    scene: normalizeSceneState(overrides.scene),
    sessionLog: normalizeSessionLog(overrides.sessionLog),
    combat: normalizeCombatState(overrides.combat),
    engineState: normalizeEngineState(overrides.engineState),
    turnLog: arrayOrEmpty(overrides.turnLog),
    diceLog: arrayOrEmpty(overrides.diceLog),
    stateEffectLog: arrayOrEmpty(overrides.stateEffectLog),
    combatActionLog: arrayOrEmpty(overrides.combatActionLog),
    providerEventLog: arrayOrEmpty(overrides.providerEventLog),
    rulesProfile: overrides.rulesProfile ?? createDefaultRulesProfile(),
    style: overrides.style ?? createDefaultStyleRules(),
    promptTemplates: overrides.promptTemplates ?? createDefaultPromptTemplateSettings(),
    recapTemplates: overrides.recapTemplates ?? createDefaultRecapTemplateSettings(),
    providerSettings: {
      ...createDefaultProviderSettings(),
      ...(overrides.providerSettings ?? {}),
      preferredProvider:
        overrides.providerSettings?.preferredProvider === "chatgpt"
          ? "bridge"
          : overrides.providerSettings?.preferredProvider ?? createDefaultProviderSettings().preferredProvider,
    },
    multiplayer: normalizeMultiplayerState(overrides.multiplayer),
    sourceDocuments: arrayOrEmpty(overrides.sourceDocuments),
    assets: arrayOrEmpty(overrides.assets),
    reviewLog: arrayOrEmpty(overrides.reviewLog),
    rawImports: arrayOrEmpty(overrides.rawImports),
  };
}

export function createDefaultMultiplayerState() {
  return {
    protocolVersion: 1,
    localTable: {
      running: false,
      host: "",
      port: null,
      lanAddress: "",
      startedAt: null,
      stoppedAt: null,
    },
    hostTurnState: "waiting_for_player",
    players: [],
    seats: [],
    invites: [],
    connections: [],
    pendingTurnInputs: [],
    events: [],
  };
}

function normalizeMultiplayerState(multiplayer = {}) {
  const defaults = createDefaultMultiplayerState();
  return {
    protocolVersion: Number(multiplayer.protocolVersion) || defaults.protocolVersion,
    localTable: {
      ...defaults.localTable,
      ...(multiplayer.localTable ?? {}),
    },
    hostTurnState: multiplayer.hostTurnState || defaults.hostTurnState,
    players: Array.isArray(multiplayer.players) ? multiplayer.players : [],
    seats: Array.isArray(multiplayer.seats) ? multiplayer.seats : [],
    invites: Array.isArray(multiplayer.invites) ? multiplayer.invites : [],
    connections: Array.isArray(multiplayer.connections) ? multiplayer.connections : [],
    pendingTurnInputs: Array.isArray(multiplayer.pendingTurnInputs) ? multiplayer.pendingTurnInputs : [],
    events: Array.isArray(multiplayer.events) ? multiplayer.events.slice(-100) : [],
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

function normalizeSceneState(scene = {}) {
  const defaults = createEmptyScene();
  const source = scene && typeof scene === "object" ? scene : {};
  return {
    ...defaults,
    ...source,
    nearbyPlaceIds: arrayOrEmpty(source.nearbyPlaceIds),
    presentPeopleIds: arrayOrEmpty(source.presentPeopleIds),
    presentPartyMemberIds: arrayOrEmpty(source.presentPartyMemberIds),
    activeQuestIds: arrayOrEmpty(source.activeQuestIds),
    localNotes: arrayOrEmpty(source.localNotes),
    status: source.status ?? defaults.status,
    currentPlaceId: source.currentPlaceId ?? defaults.currentPlaceId,
    immediateSituation: source.immediateSituation ?? source.situation ?? defaults.immediateSituation,
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

function normalizeSessionLog(sessionLog = {}) {
  const defaults = createEmptySessionLog();
  const source = sessionLog && typeof sessionLog === "object" ? sessionLog : {};
  const sessions = arrayOrEmpty(source.sessions);
  const messages = arrayOrEmpty(source.messages);
  return {
    ...defaults,
    ...source,
    activeSessionId: source.activeSessionId || sessions[0]?.id || defaults.activeSessionId,
    sessions: sessions.length ? sessions : defaults.sessions,
    messages,
  };
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

export function createEmptyCombatState() {
  return {
    inCombat: false,
    round: null,
    initiative: [],
    turnOrder: [],
    currentTurnId: null,
    enemies: [],
    conditions: [],
    turnEconomy: {},
    stakes: "",
    lastAction: null,
    lastOutcome: null,
    turnFormat:
      "Combat result format: character/creature and HP when known, chosen action, visible roll/math breakdown, HP/resource updates, vivid narration; options only when asking for an active actor's decision.",
    preferences: [
      "Keep combat tactical but cinematic.",
      "Track HP, conditions, initiative, and enemy intent when available.",
      "Ask for missing player choices instead of assuming major tactics.",
      "Use lettered A/B/C/D options before resolving a non-player combatant's chosen action.",
      "Show damage math and HP deltas explicitly when combat resolves.",
      "Options are suggestions, not restrictions; the player can combine options, add flavor, or attempt a reasonable different action.",
      "When a player attempts something uncertain, resolve it with an appropriate roll or clearly stated automatic outcome.",
    ],
  };
}

export function createEmptyEngineState() {
  return {
    mode: "rp",
    turn: {
      state: "idle",
      activeTurnId: null,
      activeActorId: null,
      activeProviderRequestId: null,
      lastCompletedTurnId: null,
      lastError: null,
    },
    pendingInputs: [],
    proposedEffects: [],
  };
}

function normalizeEngineState(engineState = {}) {
  const defaults = createEmptyEngineState();
  const source = engineState && typeof engineState === "object" ? engineState : {};
  const turn = source.turn && typeof source.turn === "object" ? source.turn : {};
  return {
    ...defaults,
    ...source,
    turn: {
      ...defaults.turn,
      ...turn,
    },
    pendingInputs: arrayOrEmpty(source.pendingInputs),
    proposedEffects: arrayOrEmpty(source.proposedEffects),
  };
}

function normalizeCombatState(combat = {}) {
  const defaults = createEmptyCombatState();
  return reconcileCombatState({
    ...defaults,
    ...(combat ?? {}),
    inCombat: Boolean(combat?.inCombat ?? defaults.inCombat),
    round: combat?.round ?? defaults.round,
    initiative: Array.isArray(combat?.initiative) ? combat.initiative : defaults.initiative,
    turnOrder: Array.isArray(combat?.turnOrder) ? combat.turnOrder : defaults.turnOrder,
    currentTurnId: combat?.currentTurnId ?? defaults.currentTurnId,
    enemies: Array.isArray(combat?.enemies) ? combat.enemies : defaults.enemies,
    conditions: Array.isArray(combat?.conditions) ? combat.conditions : defaults.conditions,
    turnEconomy: combat?.turnEconomy && typeof combat.turnEconomy === "object" ? combat.turnEconomy : defaults.turnEconomy,
    preferences: Array.isArray(combat?.preferences) ? combat.preferences : defaults.preferences,
  });
}

function reconcileCombatState(combat) {
  if (!combat.inCombat || !Array.isArray(combat.enemies) || !combat.enemies.length) {
    return combat;
  }

  const enemyIds = new Set(combat.enemies.map((enemy) => enemy?.id).filter(Boolean));
  const livingEnemyIds = new Set(combat.enemies
    .filter((enemy) => !isDefeatedCombatant(enemy))
    .map((enemy) => enemy.id)
    .filter(Boolean));

  if (enemyIds.size > 0 && livingEnemyIds.size === 0) {
    return {
      ...combat,
      inCombat: false,
      initiative: [],
      turnOrder: [],
      currentTurnId: null,
      turnEconomy: {},
      turnResolved: false,
      advanceTurn: false,
      lastOutcome: combat.lastOutcome || "Combat ended: all known enemies defeated.",
    };
  }

  const turnOrder = Array.isArray(combat.turnOrder)
    ? combat.turnOrder.filter((entry) => {
      const id = entry?.id || entry?.actorId;
      return !enemyIds.has(id) || livingEnemyIds.has(id);
    })
    : [];
  const initiative = turnOrder.length
    ? turnOrder.map((entry) => entry.id || entry.actorId).filter(Boolean)
    : (Array.isArray(combat.initiative) ? combat.initiative : []).filter((id) => !enemyIds.has(id) || livingEnemyIds.has(id));

  return {
    ...combat,
    turnOrder,
    initiative,
    currentTurnId: combat.currentTurnId && initiative.includes(combat.currentTurnId)
      ? combat.currentTurnId
      : initiative[0] ?? combat.currentTurnId,
  };
}

function isDefeatedCombatant(combatant = {}) {
  const conditions = Array.isArray(combatant.conditions) ? combatant.conditions : [];
  if (conditions.some((condition) => ["dead", "defeated", "destroyed", "unconscious"].includes(String(condition).toLowerCase()))) {
    return true;
  }
  const hp = normalizeHpValue(combatant.hp ?? combatant.hitPoints);
  return hp.current !== null && hp.current <= 0;
}

function normalizeHpValue(value) {
  if (value === null || value === undefined || value === "") {
    return { current: null, max: null };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return {
      current: numberOrNull(value.current ?? value.value ?? value.hp),
      max: numberOrNull(value.max ?? value.maximum ?? value.total),
    };
  }
  if (typeof value === "string") {
    const match = value.match(/(-?\d+)\s*\/\s*(-?\d+)/);
    if (match) {
      return { current: Number(match[1]), max: Number(match[2]) };
    }
  }
  const number = numberOrNull(value);
  return { current: number, max: number };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
      "End most scenes with solid narration or an immediate prompt; reserve structured options for combat, immediate danger, or explicit option requests.",
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
    preferredProvider: "ollama",
    selectedModel: "llama3.1:8b",
    generationTimeoutMs: 120000,
    outputLimit: 1800,
    fastMode: false,
    ollamaBaseUrl: "http://127.0.0.1:11434",
    bridgeMode: "manual_until_adapter_ready",
    requireExplicitTabSelection: true,
    automationVisible: true,
    allowBackgroundArbitraryTabs: false,
    projectHint: "LoreKeeper",
    activeConversationId: null,
    conversations: [],
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
      "On each turn, show actor and HP, then an Options section with 2-4 sensible actions.",
      "State that options can be mixed, flavored, or replaced by another reasonable action.",
      "Resolve with a Chosen line, roll/math breakdown, result, HP/resource updates, and narration.",
      "Update HP, conditions, resources, position, enemy intent, and unresolved consequences.",
      "End the round with a concise state summary.",
    ],
    combatTurnExample: [
      "Character Name (HP current/max)",
      "Options:",
      "A. Direct attack or spell.",
      "B. Utility/help/defense action.",
      "C. Analysis, movement, setup, or support action.",
      "Player may choose A+B, add flavor, or do something else reasonable; call for rolls when uncertain.",
      "Chosen: (A) - concise action name.",
      "Rolls/Damage: show dice, modifiers, total, and HP math.",
      "Narration: short cinematic result with clear battlefield consequence.",
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
  requireArray(campaign, "turnLog", errors);
  requireArray(campaign, "diceLog", errors);
  requireArray(campaign, "stateEffectLog", errors);
  requireArray(campaign, "combatActionLog", errors);
  requireArray(campaign, "providerEventLog", errors);
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

  if (!campaign.engineState || typeof campaign.engineState !== "object") {
    errors.push("engineState must be an object.");
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
