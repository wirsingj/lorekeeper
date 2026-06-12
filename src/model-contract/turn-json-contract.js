const REQUEST_TYPE = "lorekeeper.turn.request";
const RESPONSE_TYPE = "lorekeeper.turn.response";
const SCHEMA_VERSION = 1;

const allowedActionIntents = new Set([
  "combat_action",
  "skill_or_scene_check",
  "social_action",
  "movement_or_exploration",
  "freeform_table_action",
]);
const allowedGenerationModes = new Set(["normal", "fast", "combat", "summary"]);
const allowedResponseModes = new Set(["turn", "continue", "resolve_check", "resolve_combat", "summarize"]);
const allowedSceneModes = new Set(["social", "exploration", "combat", "downtime", "travel"]);
const allowedDangerLevels = new Set(["none", "tense", "immediate", "combat"]);
const allowedTableRoles = new Set(["dm", "player", "party", "npc", "system"]);
const allowedTableKinds = new Set(["narration", "dialogue", "action", "mechanics", "status", "aside"]);
const allowedTableVisibility = new Set(["table", "dm_only", "party"]);
const allowedMechanicTypes = new Set(["suggested_check", "check", "save", "attack", "damage", "initiative", "resource_note", "status", "none"]);
const allowedMechanicOutcomes = new Set(["success", "failure", "mixed", "pending", "none"]);
const allowedOperations = new Set(["add", "update", "remove", "note"]);
const allowedDomains = new Set([
  "party",
  "people",
  "factions",
  "places",
  "items",
  "inventory",
  "lore",
  "timeline",
  "quests",
  "relationships",
  "scene",
  "combat",
  "style",
]);
const allowedImportance = new Set(["minor", "normal", "major"]);
const allowedVisibility = new Set(["player_visible", "dm_only", "system_only"]);
const allowedSectionKinds = new Set([
  "current_scene",
  "recent_history",
  "recent_play_history",
  "relevant_lore",
  "active_threads",
  "unresolved_threads",
  "nearby_entities",
  "nearby_people_places",
  "combat_state",
  "style_rules",
  "rules_profile",
  "active_party",
  "current_inventory",
  "relationship_notes",
]);
const TEXT_LIMITS = Object.freeze({
  summary: 520,
  sectionEntry: 260,
  partyNote: 180,
  userPrompt: 1600,
});

export function buildTurnJsonPrompt({ campaign, contextPack, playerTurn, parsedMessage, options = {} } = {}) {
  const request = buildTurnRequestEnvelope({ campaign, contextPack, playerTurn, parsedMessage, options });
  return [
    "You are LoreKeeper's local tabletop RPG engine.",
    "Read this JSON request. Return only one valid JSON object matching responseFormat.schema.",
    "No markdown. No fenced code. No prose outside JSON.",
    JSON.stringify(request),
  ].join("\n");
}

export function buildTurnRequestEnvelope({ campaign, contextPack, playerTurn, parsedMessage, options = {} } = {}) {
  const mode = normalizeEnum(options.mode, allowedGenerationModes, inferGenerationMode(campaign, parsedMessage, options));
  const responseMode = normalizeEnum(options.responseMode, allowedResponseModes, inferResponseMode(campaign, parsedMessage, options));
  const request = {
    type: REQUEST_TYPE,
    schemaVersion: SCHEMA_VERSION,
    requestId: options.requestId || createRequestId(),
    meta: {
      intent: "generate_next_tabletop_turn",
      campaignId: campaign.id,
      campaignTitle: campaign.title,
      system: "D&D 5e-lite",
      canonSource: "SQLite campaign state in this request",
      instructionPriority: [
        "Never contradict canon context.",
        "Do not decide the primary player character's major choices.",
        "Parenthetical player text is meta direction, not in-world speech.",
        "Write a strong, specific scene beat with useful choices.",
        "Return valid JSON only.",
      ],
    },
    responseFormat: createResponseFormatSchema(),
    user: {
      raw: compactText(parsedMessage?.raw || playerTurn || "", TEXT_LIMITS.userPrompt),
      inWorld: compactText(parsedMessage?.inWorldText || playerTurn || "", TEXT_LIMITS.userPrompt),
      meta: (parsedMessage?.metaInstructions ?? []).map((item) => compactText(item, 260)),
      actionIntent: inferActionIntent(parsedMessage?.inWorldText || playerTurn || ""),
      requestedRolls: inferRequestedRolls(parsedMessage?.raw || playerTurn || ""),
    },
    generation: {
      mode,
      responseMode,
      maxTableEntries: mode === "fast" ? 4 : 8,
      maxChoices: mode === "fast" ? 4 : 6,
      allowMechanics: true,
      allowProposedChanges: true,
      tone: compactText(campaign.style?.tone || "engaging D&D-style adventure with strong continuity and player agency", 180),
    },
    context: buildCompactContext(contextPack, campaign, { mode }),
  };

  const validation = validateTurnRequest(request);
  if (!validation.valid) {
    return {
      ...request,
      validationWarnings: validation.errors,
    };
  }

  return request;
}

export function parseTurnJsonResponse(rawText, options = {}) {
  const parsed = parseJsonObject(rawText);
  if (!parsed.value) {
    return {
      ok: false,
      error: parsed.error || "Model did not return JSON.",
      validationErrors: [parsed.error || "Model did not return JSON."],
      recovery: parsed.recovery,
      response: createFallbackResponse({
        requestId: options.requestId,
        text: "The local model returned malformed JSON. No state changes were applied.",
        warning: parsed.error || "Malformed JSON response.",
      }),
      rawText,
    };
  }

  const normalized = normalizeTurnResponse(parsed.value, {
    expectedRequestId: options.requestId,
  });
  const validation = validateTurnResponse(normalized, {
    expectedRequestId: options.requestId,
  });

  return {
    ok: validation.valid,
    error: validation.valid ? null : validation.errors.join("; "),
    validationErrors: validation.errors,
    recovery: parsed.recovery,
    response: validation.valid
      ? normalized
      : {
        ...normalized,
        proposedChanges: [],
        warnings: [...normalized.warnings, ...validation.errors],
      },
    rawText,
  };
}

export function renderTurnResponseForImport(turnResponse) {
  const response = normalizeTurnResponse(turnResponse);
  const lines = [];

  for (const entry of response.table) {
    if (entry.visibility === "dm_only") {
      continue;
    }

    const speaker = String(entry.speaker || "DM").trim();
    const text = String(entry.text || "").trim();
    if (!text) {
      continue;
    }

    if (speaker.toLowerCase() === "dm" || entry.role === "dm") {
      lines.push(text);
    } else {
      lines.push(`${speaker}: ${text}`);
    }
  }

  if (response.mechanics.length) {
    lines.push(response.mechanics.map((item) => `${item.label}: ${item.text}`).join("\n"));
  }

  if (response.sceneStatus.awaitingPlayer && response.choices.options.length) {
    lines.push([
      response.choices.prompt || "What do you do?",
      ...response.choices.options.map((option, index) => {
        const actor = option.actor || response.choices.forActor || "";
        return `${option.id || index + 1}. ${actor ? `${actor}: ` : ""}${option.text}`;
      }),
      response.choices.allowOther ? "Something else." : "",
    ].filter(Boolean).join("\n"));
  }

  lines.push([
    "```json lorekeeper_updates",
    JSON.stringify({ proposedChanges: response.proposedChanges ?? [] }),
    "```",
  ].join("\n"));

  return lines.filter(Boolean).join("\n\n").trim();
}

export function validateTurnRequest(request) {
  const errors = [];
  requireValue(request, "type", REQUEST_TYPE, errors);
  requireValue(request, "schemaVersion", SCHEMA_VERSION, errors);
  requireString(request, "requestId", errors);
  requireObject(request.meta, "meta", errors);
  requireValue(request.meta, "intent", "generate_next_tabletop_turn", errors);
  requireString(request.meta, "campaignId", errors);
  requireString(request.meta, "campaignTitle", errors);
  requireObject(request.responseFormat, "responseFormat", errors);
  requireValue(request.responseFormat, "type", "json_only", errors);
  requireObject(request.user, "user", errors);
  requireEnum(request.user?.actionIntent, "user.actionIntent", allowedActionIntents, errors);
  requireObject(request.generation, "generation", errors);
  requireEnum(request.generation?.mode, "generation.mode", allowedGenerationModes, errors);
  requireEnum(request.generation?.responseMode, "generation.responseMode", allowedResponseModes, errors);
  requireObject(request.context, "context", errors);
  requireObject(request.context?.scene, "context.scene", errors);
  requireEnum(request.context?.scene?.mode, "context.scene.mode", allowedSceneModes, errors);
  requireEnum(request.context?.scene?.danger, "context.scene.danger", allowedDangerLevels, errors);
  validateArray(request.context?.sections, "context.sections", errors);

  for (const [index, section] of (request.context?.sections ?? []).entries()) {
    requireEnum(section.kind, `context.sections[${index}].kind`, allowedSectionKinds, errors);
  }

  return { valid: errors.length === 0, errors };
}

export function validateTurnResponse(response, options = {}) {
  const errors = [];
  requireValue(response, "type", RESPONSE_TYPE, errors);
  requireValue(response, "schemaVersion", SCHEMA_VERSION, errors);
  requireString(response, "requestId", errors);
  if (options.expectedRequestId && response.requestId !== options.expectedRequestId) {
    errors.push(`response.requestId mismatch: expected ${options.expectedRequestId}, got ${response.requestId}`);
  }

  validateArray(response.table, "table", errors);
  if (!response.table?.length) {
    errors.push("table must contain at least one entry");
  }
  for (const [index, entry] of (response.table ?? []).entries()) {
    requireString(entry, `table[${index}].speaker`, errors);
    requireEnum(entry.role, `table[${index}].role`, allowedTableRoles, errors);
    requireEnum(entry.kind, `table[${index}].kind`, allowedTableKinds, errors);
    requireEnum(entry.visibility, `table[${index}].visibility`, allowedTableVisibility, errors);
    requireString(entry, `table[${index}].text`, errors);
  }

  requireObject(response.sceneStatus, "sceneStatus", errors);
  requireEnum(response.sceneStatus?.mode, "sceneStatus.mode", allowedSceneModes, errors);
  requireEnum(response.sceneStatus?.danger, "sceneStatus.danger", allowedDangerLevels, errors);
  if (typeof response.sceneStatus?.awaitingPlayer !== "boolean") {
    errors.push("sceneStatus.awaitingPlayer must be boolean");
  }

  requireObject(response.choices, "choices", errors);
  if (response.sceneStatus?.awaitingPlayer && !response.choices?.options?.length) {
    errors.push("choices.options are required when sceneStatus.awaitingPlayer is true");
  }

  validateArray(response.mechanics, "mechanics", errors);
  for (const [index, mechanic] of (response.mechanics ?? []).entries()) {
    requireEnum(mechanic.type, `mechanics[${index}].type`, allowedMechanicTypes, errors);
    requireEnum(mechanic.outcome, `mechanics[${index}].outcome`, allowedMechanicOutcomes, errors);
  }

  requireObject(response.flags, "flags", errors);
  for (const key of ["requiresReview", "startsCombat", "endsScene", "containsSecretInfo"]) {
    if (typeof response.flags?.[key] !== "boolean") {
      errors.push(`flags.${key} must be boolean`);
    }
  }

  validateArray(response.proposedChanges, "proposedChanges", errors);
  for (const [index, change] of (response.proposedChanges ?? []).entries()) {
    requireEnum(change.operation, `proposedChanges[${index}].operation`, allowedOperations, errors);
    requireEnum(change.domain, `proposedChanges[${index}].domain`, allowedDomains, errors);
    requireEnum(change.importance, `proposedChanges[${index}].importance`, allowedImportance, errors);
    requireEnum(change.visibility, `proposedChanges[${index}].visibility`, allowedVisibility, errors);
    if (change.importance === "major" && response.flags?.requiresReview !== true) {
      errors.push(`proposedChanges[${index}] has importance major and requires flags.requiresReview true`);
    }
  }

  validateArray(response.warnings, "warnings", errors);
  return { valid: errors.length === 0, errors };
}

function createResponseFormatSchema() {
  return {
    type: "json_only",
    schema: {
      type: RESPONSE_TYPE,
      schemaVersion: SCHEMA_VERSION,
      requestId: "same-id-from-request",
      table: [
        {
          speaker: "DM",
          speakerId: null,
          role: "dm|player|party|npc|system",
          kind: "narration|dialogue|action|mechanics|status|aside",
          visibility: "table|dm_only|party",
          text: "player-facing table chat text",
        },
      ],
      sceneStatus: {
        mode: "social|exploration|combat|downtime|travel",
        danger: "none|tense|immediate|combat",
        awaitingPlayer: true,
      },
      choices: {
        prompt: "question for the player",
        scope: "player|party|character",
        forActorId: "optional character id",
        forActor: "optional character name",
        options: [
          {
            id: "1",
            actorId: "optional actor id",
            actor: "optional actor name",
            text: "clear action option",
          },
        ],
        allowOther: true,
      },
      mechanics: [
        {
          type: "suggested_check|save|attack|damage|initiative|resource_note|status|none",
          actorId: "optional actor id",
          actor: "character or creature name",
          ability: "optional ability",
          skill: "optional skill",
          roll: "optional dice formula or result",
          dc: null,
          reason: "why this mechanic is relevant",
          outcome: "success|failure|mixed|pending|none",
          label: "short roll/check/combat label",
          text: "brief player-facing mechanics",
        },
      ],
      flags: {
        requiresReview: true,
        startsCombat: false,
        endsScene: false,
        containsSecretInfo: false,
      },
      proposedChanges: [],
      warnings: [],
    },
    rules: [
      "Return valid JSON only.",
      "Do not use markdown.",
      "Do not wrap the response in a code fence.",
      "Use proposedChanges: [] when no canon changed.",
      "Use party for PCs and trusted companions.",
      "Use people for NPCs.",
      "Every named add/update should include data.name or data.title.",
      "Choices must be separate objects, not a paragraph.",
      "Use choices.options for every listed option. Do not put action options only in table text.",
      "When options are for a specific party member or NPC, include choices.forActor/forActorId or option.actor/actorId.",
      "Do not silently change HP, inventory, relationships, quests, or major canon.",
      "If stats are missing, suggest a pending check instead of inventing exact math.",
    ],
  };
}

function normalizeTurnResponse(response, options = {}) {
  const rawTable = Array.isArray(response.table) ? response.table : [];
  const table = rawTable.map(normalizeTableEntry).filter((entry) => entry.text);
  const sceneStatus = normalizeSceneStatus(response.sceneStatus);
  const choices = normalizeChoices(response.choices);
  const mechanics = Array.isArray(response.mechanics)
    ? response.mechanics.map(normalizeMechanic).filter((item) => item.text || item.reason)
    : [];
  const proposedChanges = Array.isArray(response.proposedChanges)
    ? response.proposedChanges.map(normalizeProposedChange).filter(Boolean)
    : Array.isArray(response.updates?.proposedChanges)
      ? response.updates.proposedChanges.map(normalizeProposedChange).filter(Boolean)
      : [];

  return {
    type: response.type || RESPONSE_TYPE,
    schemaVersion: Number(response.schemaVersion) || SCHEMA_VERSION,
    requestId: response.requestId || options.expectedRequestId || "",
    table: table.length ? table : [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: fallbackNarration(response) }],
    sceneStatus,
    choices,
    mechanics,
    flags: normalizeFlags(response.flags, proposedChanges),
    proposedChanges,
    warnings: Array.isArray(response.warnings) ? response.warnings.map(compactWhitespace).filter(Boolean) : [],
  };
}

function createFallbackResponse({ requestId = "", text, warning }) {
  return {
    type: RESPONSE_TYPE,
    schemaVersion: SCHEMA_VERSION,
    requestId,
    table: [{ speaker: "System", speakerId: null, role: "system", kind: "status", visibility: "table", text }],
    sceneStatus: { mode: "social", danger: "none", awaitingPlayer: true },
    choices: { prompt: "The model response needs recovery. What would you like to do?", options: [], allowOther: true },
    mechanics: [],
    flags: { requiresReview: true, startsCombat: false, endsScene: false, containsSecretInfo: false },
    proposedChanges: [],
    warnings: [warning].filter(Boolean),
  };
}

function normalizeTableEntry(entry) {
  if (typeof entry === "string") {
    return { speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: compactWhitespace(entry) };
  }

  return {
    speaker: compactWhitespace(entry?.speaker || "DM"),
    speakerId: entry?.speakerId ?? null,
    role: compactWhitespace(entry?.role || ""),
    kind: compactWhitespace(entry?.kind || ""),
    visibility: normalizeTableVisibility(entry?.visibility),
    text: compactWhitespace(entry?.text || entry?.body || ""),
  };
}

function normalizeTableVisibility(value) {
  const text = compactWhitespace(value || "");
  return text || "table";
}

function normalizeSceneStatus(sceneStatus = {}) {
  return {
    mode: compactWhitespace(sceneStatus.mode || ""),
    danger: compactWhitespace(sceneStatus.danger || ""),
    awaitingPlayer: sceneStatus.awaitingPlayer,
  };
}

function normalizeChoices(choices = {}) {
  const options = Array.isArray(choices.options)
    ? choices.options.map((option, index) => ({
      id: String(option?.id ?? index + 1),
      actorId: option?.actorId ?? null,
      actor: compactWhitespace(option?.actor || ""),
      text: compactWhitespace(option?.text || option),
    })).filter((option) => option.text)
    : [];

  return {
    prompt: compactWhitespace(choices.prompt || "What do you do?"),
    scope: compactWhitespace(choices.scope || ""),
    forActorId: choices.forActorId ?? null,
    forActor: compactWhitespace(choices.forActor || ""),
    options: options.slice(0, 7),
    allowOther: choices.allowOther !== false,
  };
}

function normalizeMechanic(item) {
  return {
    type: compactWhitespace(item?.type || ""),
    actorId: item?.actorId ?? null,
    actor: compactWhitespace(item?.actor || ""),
    ability: item?.ability ?? null,
    skill: item?.skill ?? null,
    roll: compactWhitespace(item?.roll || ""),
    dc: item?.dc ?? null,
    reason: compactWhitespace(item?.reason || ""),
    outcome: compactWhitespace(item?.outcome || ""),
    label: compactWhitespace(item?.label || item?.type || "Mechanic"),
    text: compactWhitespace(item?.text || item?.reason || item),
  };
}

function normalizeFlags(flags = {}, proposedChanges = []) {
  return {
    requiresReview: flags.requiresReview,
    startsCombat: flags.startsCombat,
    endsScene: flags.endsScene,
    containsSecretInfo: flags.containsSecretInfo,
  };
}

function normalizeProposedChange(change) {
  if (!change || typeof change !== "object") {
    return null;
  }

  return {
    operation: compactWhitespace(change.operation || ""),
    domain: compactWhitespace(change.domain || ""),
    targetId: change.targetId ?? null,
    importance: compactWhitespace(change.importance || "normal"),
    visibility: compactWhitespace(change.visibility || "player_visible"),
    summary: compactWhitespace(change.summary || "Unlabeled proposed update."),
    data: change.data && typeof change.data === "object" ? change.data : {},
    confidence: normalizeEnum(change.confidence, new Set(["low", "medium", "high", "unknown"]), "unknown"),
    reason: compactWhitespace(change.reason || ""),
  };
}

function fallbackNarration(response) {
  return compactWhitespace(response.narration || response.text || response.message || "The local model returned an empty table response.");
}

function buildCompactContext(contextPack, campaign, options = {}) {
  return {
    summary: compactText(campaign.summary, TEXT_LIMITS.summary),
    scene: {
      status: campaign.scene?.status ?? "active",
      mode: inferSceneMode(campaign, options),
      danger: inferDangerLevel(campaign, options),
      currentPlaceId: campaign.scene?.currentPlaceId ?? null,
      presentPeopleIds: campaign.scene?.presentPeopleIds ?? [],
      presentPartyMemberIds: campaign.scene?.presentPartyMemberIds ?? [],
      activeQuestIds: campaign.scene?.activeQuestIds ?? [],
    },
    party: (campaign.party ?? []).map((member) => compactPartyMember(member, options)).slice(0, 8),
    tableVoices: (campaign.party ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      voice: compactText(member.voice || member.personality || member.role || "reacts as an individual party member", 140),
      agency: member.playerRole === "player" || /player/i.test(member.role ?? "")
        ? "primary_player_character"
        : "companion",
    })).slice(0, 8),
    sections: (contextPack?.sections ?? []).map((section) => ({
      kind: normalizeSectionKind(section.kind),
      title: section.title,
      entries: section.entries.map((entry) => compactText(entry, TEXT_LIMITS.sectionEntry)).slice(0, options.mode === "fast" ? 4 : 8),
    })),
  };
}

function compactPartyMember(member, options = {}) {
  const includeDetail = options.mode === "combat";
  return {
    id: member.id,
    name: member.name,
    role: compactText(member.ancestryClass || member.role || member.class || "party member", 90),
    hp: member.stats?.hp?.current ?? member.stats?.hp ?? member.hp ?? member.hitPoints ?? null,
    maxHp: member.stats?.hp?.max ?? member.maxHp ?? member.hitPointMaximum ?? null,
    level: member.level ?? member.stats?.level ?? member.characterLevel ?? null,
    abilities: compactArray(member.abilities ?? member.features ?? member.traits, includeDetail ? 8 : 5),
    skills: compactArray(member.skills ?? member.specialties ?? member.proficiencies ?? member.stats?.skills, includeDetail ? 8 : 5),
    conditions: compactArray(member.conditions ?? member.stats?.conditions, 5),
    resources: compactArray(member.resources ?? member.stats?.resources ?? member.spells, includeDetail ? 8 : 4),
    notes: compactArray(member.notes, includeDetail ? 4 : 2, TEXT_LIMITS.partyNote),
  };
}

function inferActionIntent(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\b(attack|shoot|stab|strike|cast|damage|initiative)\b/.test(text)) {
    return "combat_action";
  }
  if (/\b(check|roll|inspect|investigate|search|look|listen|track|sneak|hide|persuade|deceive|intimidate)\b/.test(text)) {
    return "skill_or_scene_check";
  }
  if (/\b(talk|ask|say|tell|convince|negotiate)\b/.test(text)) {
    return "social_action";
  }
  if (/\b(go|move|travel|enter|leave|follow|run|climb)\b/.test(text)) {
    return "movement_or_exploration";
  }
  return "freeform_table_action";
}

function inferRequestedRolls(value) {
  const text = String(value ?? "");
  const requests = [];
  const diceMatches = text.match(/\b\d*d(?:4|6|8|10|12|20|100)(?:\s*[+-]\s*\d+)?\b/gi) ?? [];
  for (const formula of diceMatches.slice(0, 4)) {
    requests.push({ type: "explicit_dice", formula, reason: "Player mentioned dice notation." });
  }

  const skillMatches = text.match(/\b(athletics|acrobatics|stealth|arcana|history|investigation|nature|religion|animal handling|insight|medicine|perception|survival|deception|intimidation|performance|persuasion)\b/gi) ?? [];
  for (const skill of [...new Set(skillMatches.map((item) => item.toLowerCase()))].slice(0, 4)) {
    requests.push({ type: "skill_check", skill, reason: "Player mentioned a 5E-style skill." });
  }

  return requests;
}

function inferGenerationMode(campaign, parsedMessage, options = {}) {
  if (options.fastMode) {
    return "fast";
  }
  if (campaign.combat?.inCombat || inferActionIntent(parsedMessage?.inWorldText ?? "") === "combat_action") {
    return "combat";
  }
  return "normal";
}

function inferResponseMode(campaign, parsedMessage, options = {}) {
  if (options.responseMode) {
    return options.responseMode;
  }
  if (options.mode === "summary") {
    return "summarize";
  }
  if (campaign.combat?.inCombat || inferActionIntent(parsedMessage?.inWorldText ?? "") === "combat_action") {
    return "resolve_combat";
  }
  if (inferRequestedRolls(parsedMessage?.raw ?? "").length > 0) {
    return "resolve_check";
  }
  return "turn";
}

function inferSceneMode(campaign, options = {}) {
  if (campaign.combat?.inCombat || options.mode === "combat") {
    return "combat";
  }
  const text = [campaign.scene?.status, campaign.scene?.immediateSituation, campaign.scene?.situation].join(" ").toLowerCase();
  if (/\btravel|road|journey|march\b/.test(text)) {
    return "travel";
  }
  if (/\btavern|talk|negotiate|court|social\b/.test(text)) {
    return "social";
  }
  return "exploration";
}

function inferDangerLevel(campaign, options = {}) {
  if (campaign.combat?.inCombat || options.mode === "combat") {
    return "combat";
  }
  const text = [campaign.scene?.status, campaign.scene?.immediateSituation, campaign.scene?.situation].join(" ").toLowerCase();
  if (/\battack|ambush|combat|initiative|bloodshed\b/.test(text)) {
    return "immediate";
  }
  if (/\btense|danger|threat|pursuit|suspicious|armed\b/.test(text)) {
    return "tense";
  }
  return "none";
}

function normalizeSectionKind(kind) {
  const value = String(kind ?? "");
  const aliases = {
    recent_play_history: "recent_history",
    unresolved_threads: "active_threads",
    nearby_people_places: "nearby_entities",
    rules_profile: "style_rules",
    active_party: "nearby_entities",
    current_inventory: "nearby_entities",
    relationship_notes: "relevant_lore",
  };
  return aliases[value] || value || "relevant_lore";
}

function parseJsonObject(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) {
    return { value: null, error: "Empty model response.", recovery: "empty" };
  }

  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return { value: JSON.parse(stripped), error: null, recovery: stripped === text ? "none" : "markdown_stripped" };
  } catch (directError) {
    const candidate = extractBalancedObject(stripped);
    if (!candidate) {
      return { value: null, error: directError.message, recovery: "failed" };
    }

    try {
      return {
        value: JSON.parse(candidate),
        error: null,
        recovery: candidate === stripped ? "none" : "extracted_json_object",
      };
    } catch (candidateError) {
      return { value: null, error: candidateError.message, recovery: "failed" };
    }
  }
}

function extractBalancedObject(text) {
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, index + 1);
        }
      }
    }
  }

  return "";
}

function validateArray(value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
  }
}

function requireObject(value, path, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} must be an object`);
  }
}

function requireString(object, path, errors) {
  const key = path.split(".").at(-1);
  const value = typeof object === "object" && object !== null ? object[key] : undefined;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireValue(object, key, expected, errors) {
  const value = typeof object === "object" && object !== null ? object[key] : undefined;
  if (value !== expected) {
    errors.push(`${key} must be ${JSON.stringify(expected)}`);
  }
}

function requireEnum(value, path, allowed, errors) {
  if (!allowed.has(value)) {
    errors.push(`${path} must be one of: ${[...allowed].join(", ")}`);
  }
}

function normalizeEnum(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function compactArray(value, limit, textLimit = 90) {
  const array = Array.isArray(value) ? value : value ? [value] : [];
  return array.map((item) => compactText(item, textLimit)).filter(Boolean).slice(0, limit);
}

function compactText(value, limit) {
  const compact = compactWhitespace(value);
  if (!limit || compact.length <= limit) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function createRequestId() {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
