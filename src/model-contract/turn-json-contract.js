import { compactHiddenStoryThreads } from "../context-packs/story-threads.js";

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
const allowedChoiceScopes = new Set(["", "free", "party", "character", "subset", "vote", "combat_actor"]);
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
  "active_consequences",
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
    "You are LoreKeeper's local tabletop DM assistant, not a random story continuation engine.",
    "Read this JSON request. Return only one valid JSON object matching responseFormat.schema.",
    "Resolve user.inWorld as the latest table action. Do not ignore it, reset to a prior choice prompt, or repeat the previous DM question.",
    "If user.inWorld includes a choice label plus extra details, the extra details are authoritative; treat the original choice as context only.",
    "If user.inWorld addresses an NPC or asks another character to act, narrate that character's immediate response or the visible consequence.",
    "Do not invent speech, thoughts, scouting, scanning, movement, or purposeful actions for remote/player-controlled party members unless their controller submitted that input.",
    "Before adding a new threat, NPC, or twist, use generation.dmQuality: existing context, natural consequences, NPC motivations, and campaign continuity come first.",
    "Do not be terse. For normal scene turns, write immersive DM narration with enough detail to feel like tabletop play.",
    "Use context.hiddenDmStory as private DM planning only. Never reveal those notes directly, but keep the campaign moving with long, mid, and short term purpose.",
    "Maintain private story direction with proposedChanges when useful: domain quests, visibility dm_only, data.threadType story_arc, data.horizon long|mid|short.",
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
        "Do not write autonomous table posts for host/player-controlled characters.",
        "Remote/player-controlled party members may be present, but do not invent their speech, thoughts, reactions, scouting, scanning, movement, or purposeful actions unless their controller submitted input.",
        "In combat, do not decide any party member's action on their initiative turn unless that party member's controller submitted it.",
        "Parenthetical player text is meta direction, not in-world speech.",
        "Resolve the latest user.inWorld action before consulting older scene text.",
        "When a selected option is edited or expanded, honor the edited user.inWorld props, positioning, dialogue, and intent over the original option wording.",
        "Do not repeat a prior choice prompt after the user has answered or moved past it.",
        "Default to full DM narration. Offer structured choices only when choicePolicy allows them.",
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
      playerInputs: normalizePlayerInputs(options.playerInputs ?? parsedMessage?.playerInputs ?? []),
    },
    generation: {
      mode,
      responseMode,
      maxTableEntries: mode === "fast" ? 4 : 8,
      maxChoices: mode === "fast" ? 4 : 6,
      choicePolicy: inferChoicePolicy(campaign, parsedMessage, { mode, responseMode }),
      narrationTarget: inferNarrationTarget({ mode, responseMode }),
      dmQuality: createDmQualityPolicy({ mode, responseMode }),
      allowMechanics: true,
      allowProposedChanges: true,
      hiddenStoryPolicy: {
        purpose: "Keep play from becoming disconnected scenes by maintaining DM-only long, mid, and short term story threads.",
        recordShape: "Use proposedChanges with domain quests, visibility dm_only, data.threadType story_arc, and data.horizon long|mid|short.",
        revealPolicy: "Do not narrate hidden thread titles, plans, secrets, or future twists directly. Reveal only table-visible clues and consequences when earned.",
        updateWhen: [
          "the party's action changes the likely direction of the campaign",
          "a clue, NPC motive, faction pressure, or consequence should carry forward",
          "there are no hidden story threads yet and the campaign premise gives enough direction",
        ],
      },
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

  const responseValue = repairResponseRequestId(parsed.value, options);
  const normalized = normalizeTurnResponse(responseValue, {
    expectedRequestId: options.requestId,
    choicePolicy: options.choicePolicy,
  });
  const repaired = repairCombatAdvanceChange(normalized, options.request);
  const validation = validateTurnResponse(repaired, {
    expectedRequestId: options.requestId,
    request: options.request,
  });
  const onlyOptionalChangeErrors = hasOnlyProposedChangeValidationErrors(validation.errors);
  const acceptedResponse = onlyOptionalChangeErrors
    ? {
      ...repaired,
      proposedChanges: [],
      warnings: [
        ...repaired.warnings,
        ...validation.errors.map((error) => `Dropped invalid proposedChange: ${error}`),
      ],
    }
    : repaired;

  return {
    ok: validation.valid || onlyOptionalChangeErrors,
    error: validation.valid || onlyOptionalChangeErrors ? null : validation.errors.join("; "),
    validationErrors: validation.errors,
    recovery: parsed.recovery,
    response: validation.valid || onlyOptionalChangeErrors
      ? acceptedResponse
      : {
        ...acceptedResponse,
        proposedChanges: hasProposedChangeValidationErrors(validation.errors) ? [] : repaired.proposedChanges,
        warnings: [...repaired.warnings, ...validation.errors],
      },
    rawText,
  };
}

function repairResponseRequestId(response, options = {}) {
  if (
    !options.repairRequestIdMismatch ||
    !options.requestId ||
    !response ||
    typeof response !== "object" ||
    !response.requestId ||
    response.requestId === options.requestId
  ) {
    return response;
  }

  return {
    ...response,
    requestId: options.requestId,
    warnings: [
      ...(Array.isArray(response.warnings) ? response.warnings : []),
      `Repaired model requestId mismatch: got ${response.requestId}.`,
    ],
  };
}

function repairCombatAdvanceChange(response, request) {
  if (
    !expectsResolvedCombat(request) ||
    isCombatNudgeRequest(request) ||
    !hasSubmittedCombatInput(request) ||
    !hasVisibleCombatMechanics(response) ||
    hasCombatAdvanceChange(response)
  ) {
    return response;
  }

  const actorId = request?.context?.combat?.currentTurnId || request?.context?.rulesLedger?.activeActorIds?.[0] || null;
  const actorName = combatActorName(request, actorId);
  return {
    ...response,
    proposedChanges: [
      ...(response.proposedChanges ?? []),
      {
        operation: "update",
        domain: "combat",
        targetId: null,
        importance: "normal",
        visibility: "player_visible",
        summary: `${actorName}'s combat turn resolves.`,
        data: {
          inCombat: true,
          turnResolved: true,
          advanceTurn: true,
          resolvedActorId: actorId,
          lastAction: `${actorName}'s combat turn resolved.`,
        },
        confidence: "medium",
        reason: "LoreKeeper inferred turn advancement because the response resolved visible combat mechanics for the active initiative actor.",
      },
    ],
    warnings: [
      ...(response.warnings ?? []),
      "Repaired combat response by adding inferred turnResolved/advanceTurn update.",
    ],
  };
}

function hasProposedChangeValidationErrors(errors = []) {
  return errors.some((error) => /^proposedChanges\[\d+\]\./.test(error));
}

function hasOnlyProposedChangeValidationErrors(errors = []) {
  return errors.length > 0 && errors.every((error) => /^proposedChanges\[\d+\]\./.test(error));
}

export function renderTurnResponseForImport(turnResponse, options = {}) {
  const response = normalizeTurnResponse(turnResponse);
  const includeChoices = options.includeChoices !== false;
  const lines = [];

  for (const entry of response.table) {
    if (entry.visibility === "dm_only") {
      continue;
    }

    const speaker = String(entry.speaker || "DM").trim();
    const rawText = String(entry.text || "").trim();
    const text = stripChoiceEchoFromTableText(rawText, response.choices, { includeChoices });
    if (!text) {
      continue;
    }

    if (isDmSpeaker(speaker)) {
      lines.push(text);
    } else {
      lines.push(`${speaker}: ${text}`);
    }
  }

  if (response.mechanics.length) {
    lines.push(response.mechanics.map((item) => `${item.label}: ${item.text}`).join("\n"));
  }

  if (includeChoices && response.sceneStatus.awaitingPlayer && response.choices.options.length) {
    const renderedOptions = response.choices.options.map((option, index) => {
      const actor = option.actor || response.choices.forActor || "";
      return `${option.id || letterForIndex(index)}. ${actor ? `${actor}: ` : ""}${option.text}`;
    });
    if (response.choices.allowOther) {
      renderedOptions.push(`${letterForIndex(renderedOptions.length)}. Something else.`);
    }

    lines.push([
      response.choices.prompt || "What do you do?",
      ...renderedOptions,
    ].join("\n"));
  }

  lines.push([
    "```json lorekeeper_updates",
    JSON.stringify({ proposedChanges: response.proposedChanges ?? [] }),
    "```",
  ].join("\n"));

  return lines.filter(Boolean).join("\n\n").trim();
}

function isDmSpeaker(speaker = "") {
  const normalized = compactWhitespace(speaker).toLowerCase();
  return !normalized || normalized === "dm" || normalized === "dungeon master" || normalized === "narrator";
}

function stripChoiceEchoFromTableText(text, choices = {}, options = {}) {
  const hasStructuredChoices = Boolean(choices?.options?.length);
  if (!hasStructuredChoices) {
    return String(text ?? "").trim();
  }

  let cleaned = String(text ?? "").trim();
  const optionHeadingIndex = cleaned.search(/\b(?:Options?|Choices?)\s*:/i);
  if (optionHeadingIndex >= 0 && countChoiceMarkers(cleaned.slice(optionHeadingIndex)) >= 2) {
    cleaned = cleaned.slice(0, optionHeadingIndex).trim();
  }

  const letteredIndex = firstChoiceEchoIndex(cleaned);
  if (letteredIndex >= 0 && countChoiceMarkers(cleaned.slice(letteredIndex)) >= 2) {
    cleaned = cleaned.slice(0, letteredIndex).trim();
  }

  if (!options.includeChoices) {
    cleaned = cleaned
      .replace(/\s*["'`]*\s*What (?:do|does|would|will|should|can) [^?]{0,120}\?\s*["'`]*\s*$/i, "")
      .replace(/\s*["'`]*\s*(?:What now|Your move|Choose)\.?\s*["'`]*\s*$/i, "")
      .trim();
  }

  return cleaned;
}

function firstChoiceEchoIndex(text) {
  const match = String(text ?? "").match(/(?:^|[\s"'`])(?:[A-H]|\d{1,2})[.)]\s+/i);
  return match ? match.index + match[0].search(/(?:[A-H]|\d{1,2})[.)]\s+/i) : -1;
}

function countChoiceMarkers(text) {
  return (String(text ?? "").match(/(?:^|[\s"'`])(?:[A-H]|\d{1,2})[.)]\s+/gi) ?? []).length;
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
  validateArray(request.user?.playerInputs, "user.playerInputs", errors);
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
  if (response.choices?.scope && !allowedChoiceScopes.has(response.choices.scope)) {
    errors.push(`choices.scope must be one of ${[...allowedChoiceScopes].filter(Boolean).join(", ")}`);
  }
  validateArray(response.choices?.options, "choices.options", errors);

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

  validateCombatResolution(response, options, errors);
  validateControlledPartyAgency(response, options, errors);
  validateArray(response.warnings, "warnings", errors);
  return { valid: errors.length === 0, errors };
}

function validateCombatResolution(response, options = {}, errors = []) {
  const request = options.request;
  if (!expectsResolvedCombat(request)) {
    return;
  }

  if (isCombatNudgeRequest(request)) {
    return;
  }
  if (!hasSubmittedCombatInput(request)) {
    return;
  }

  if (!hasVisibleCombatMechanics(response)) {
    errors.push("resolved combat must include visible mechanics with rolls, checks, damage, resources, or status");
  }

  if (!hasCombatAdvanceChange(response)) {
    errors.push("resolved combat must include a combat proposedChange with data.turnResolved true or data.advanceTurn true");
  }

  const nextActorOverreach = detectNextActorCombatOverreach(response, request);
  if (nextActorOverreach) {
    errors.push(nextActorOverreach);
  }
}

function expectsResolvedCombat(request) {
  return Boolean(
    request?.generation?.responseMode === "resolve_combat" &&
    request?.context?.combat?.inCombat === true
  );
}

function isCombatNudgeRequest(request) {
  const userText = String(request?.user?.inWorld || request?.user?.raw || "").trim();
  return /^\(DM nudge:/i.test(userText);
}

function hasSubmittedCombatInput(request) {
  const userText = String(request?.user?.inWorld || request?.user?.raw || "").trim();
  return Boolean(userText) || (request?.user?.playerInputs ?? []).length > 0;
}

function hasVisibleCombatMechanics(response) {
  const meaningful = (response.mechanics ?? []).filter((mechanic) => mechanic && mechanic.type !== "none");
  if (!meaningful.length) {
    return false;
  }

  const combined = meaningful
    .map((mechanic) => [mechanic.roll, mechanic.text, mechanic.reason, mechanic.damage, mechanic.dc, mechanic.outcome].filter(Boolean).join(" "))
    .join(" ");
  const hasRollMath = /\b(?:d20|d\d+|roll(?:ed|s)?|natural|total|vs\.?|against|dc|ac|hits?|miss(?:es)?|success|failure|damage|healing|hp)\b/i.test(combined);
  const hasNumericResult = /\d/.test(combined);
  return hasRollMath && hasNumericResult;
}

function hasCombatAdvanceChange(response) {
  return (response.proposedChanges ?? []).some((change) =>
    change?.domain === "combat" &&
    change?.operation !== "remove" &&
    change?.data &&
    (change.data.advanceTurn === true || change.data.turnResolved === true)
  );
}

function detectNextActorCombatOverreach(response, request) {
  const currentActorId = request?.context?.combat?.currentTurnId || "";
  if (!currentActorId || !isPartyActorInRequest(request, currentActorId)) {
    return "";
  }

  const currentActorName = normalizeHumanName(combatActorName(request, currentActorId));
  const otherCombatants = (request?.context?.combat?.turnOrder ?? [])
    .filter((entry) => entry?.id && entry.id !== currentActorId)
    .map((entry) => ({
      id: entry.id,
      name: normalizeHumanName(entry.name || entry.id),
    }))
    .filter((entry) => entry.name && entry.name !== currentActorName);

  if (!otherCombatants.length) {
    return "";
  }

  const combined = [
    ...(response.table ?? []).map((entry) => entry?.text || ""),
    ...(response.mechanics ?? []).map((mechanic) =>
      [mechanic?.actor, mechanic?.target, mechanic?.text, mechanic?.reason, mechanic?.roll, mechanic?.damage].filter(Boolean).join(" ")
    ),
  ].join("\n");
  if (!/\b(attacks?|lunges?|bites?|claws?|slashes?|stabs?|strikes?|shoots?|fires?|casts?|deals?\s+\d+|damage)\b/i.test(combined)) {
    return "";
  }

  for (const combatant of otherCombatants) {
    if (combatant.name.length < 3) {
      continue;
    }
    const namePattern = new RegExp(`\\b${escapeRegExp(combatant.name)}\\b.{0,90}\\b(attacks?|lunges?|bites?|claws?|slashes?|stabs?|strikes?|shoots?|fires?|casts?|deals?\\s+\\d+|damage)\\b`, "i");
    const possessivePattern = new RegExp(`\\b${escapeRegExp(combatant.name)}'?s\\b.{0,90}\\b(attack|bite|claws?|slash|stab|strike|shot|spell|damage)\\b`, "i");
    if (namePattern.test(combined) || possessivePattern.test(combined)) {
      return `resolved party combat response must not narrate or resolve another combatant's action before initiative advances (${combatant.name})`;
    }
  }
  return "";
}

function isPartyActorInRequest(request, actorId) {
  return (request?.context?.combat?.turnOrder ?? []).some((entry) =>
    entry?.id === actorId && normalizeToken(entry.type || "") === "party"
  ) || (request?.context?.party ?? []).some((member) => member?.id === actorId);
}

function normalizeHumanName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function combatActorName(request, actorId) {
  if (!actorId) {
    return "Active actor";
  }
  return (
    request?.context?.combat?.turnOrder?.find((entry) => entry.id === actorId)?.name ||
    request?.context?.rulesLedger?.actors?.find((actor) => actor.id === actorId)?.name ||
    actorId
  );
}

function validateControlledPartyAgency(response, options = {}, errors = []) {
  const request = options.request;
  if (!request?.context) {
    return;
  }

  const controlledActors = controlledPartyActorsFromRequest(request);
  if (!controlledActors.length) {
    return;
  }

  const submittedActorIds = submittedPartyActorIds(request, controlledActors);
  const submittedActorNames = new Set(
    controlledActors
      .filter((actor) => submittedActorIds.has(actor.id))
      .map((actor) => normalizeHumanName(actor.name).toLowerCase())
      .filter(Boolean),
  );

  for (const [index, entry] of (response.table ?? []).entries()) {
    const speakerActor = actorForTableSpeaker(entry, controlledActors);
    if (speakerActor) {
      const hasSubmittedInput = submittedActorIds.has(speakerActor.id) || submittedActorNames.has(normalizeHumanName(speakerActor.name).toLowerCase());
      if (entry.role === "dm") {
        errors.push(`table[${index}] uses DM role for controlled party member ${speakerActor.name}; render this as that party member only when their controller submitted input`);
        continue;
      }
      if ((entry.role === "party" || entry.role === "player") && !hasSubmittedInput) {
        errors.push(`table[${index}] speaks as controlled party member ${speakerActor.name} without submitted controller input`);
      }
      continue;
    }

    if (entry.role !== "dm") {
      continue;
    }
    const text = String(entry.text || "");
    for (const actor of controlledActors) {
      if (submittedActorIds.has(actor.id) || submittedActorNames.has(normalizeHumanName(actor.name).toLowerCase())) {
        continue;
      }
      if (dmTextPilotsControlledActor(text, actor.name)) {
        errors.push(`table[${index}] appears to speak, decide, or act for controlled party member ${actor.name} without submitted controller input`);
        break;
      }
    }
  }
}

function controlledPartyActorsFromRequest(request) {
  const partyById = new Map();
  for (const member of request?.context?.party ?? []) {
    if (!member?.id) {
      continue;
    }
    partyById.set(member.id, {
      id: String(member.id),
      name: normalizeHumanName(member.name || member.id),
      controllerKind: normalizeControlledControllerKind(member.controllerKind || member.controller || member.agency),
    });
  }
  for (const voice of request?.context?.tableVoices ?? []) {
    if (!voice?.id) {
      continue;
    }
    const existing = partyById.get(voice.id) || {};
    partyById.set(voice.id, {
      id: String(voice.id),
      name: normalizeHumanName(voice.name || existing.name || voice.id),
      controllerKind: normalizeControlledControllerKind(voice.controllerKind || existing.controllerKind || voice.agency),
    });
  }
  return [...partyById.values()]
    .filter((actor) => actor.id && actor.name && ["host", "remote_player", "unassigned"].includes(actor.controllerKind));
}

function normalizeControlledControllerKind(value) {
  const normalized = normalizeToken(value || "");
  if (normalized === "remote_player" || normalized === "remote" || normalized === "guest") {
    return "remote_player";
  }
  if (normalized === "host" || normalized === "player" || normalized === "human") {
    return "host";
  }
  if (normalized === "unassigned" || /unassigned/.test(normalized)) {
    return "unassigned";
  }
  if (/remote_player_controlled/.test(normalized)) {
    return "remote_player";
  }
  if (/host_controlled/.test(normalized)) {
    return "host";
  }
  return normalized;
}

function submittedPartyActorIds(request, controlledActors = []) {
  const submitted = new Set();
  const controlledByName = new Map(controlledActors.map((actor) => [normalizeHumanName(actor.name).toLowerCase(), actor]));
  for (const input of request?.user?.playerInputs ?? []) {
    const actorId = input?.characterId || input?.actorId || input?.speakerId || "";
    if (actorId) {
      submitted.add(String(actorId));
    }
    const actorName = normalizeHumanName(input?.characterName || input?.actor || input?.speaker || "").toLowerCase();
    if (actorName && controlledByName.has(actorName)) {
      submitted.add(controlledByName.get(actorName).id);
    }
  }

  const hostText = String(request?.user?.inWorld || request?.user?.raw || "");
  for (const actor of controlledActors) {
    if (actor.controllerKind !== "host" || !actor.name || actor.name.length < 3) {
      continue;
    }
    if (new RegExp(`\\b${escapeRegExp(actor.name)}\\b`, "i").test(hostText)) {
      submitted.add(actor.id);
    }
  }
  return submitted;
}

function actorForTableSpeaker(entry, controlledActors = []) {
  const speakerId = String(entry?.speakerId || entry?.actorId || "").trim();
  if (speakerId) {
    const byId = controlledActors.find((actor) => actor.id === speakerId);
    if (byId) {
      return byId;
    }
  }
  const speaker = normalizeHumanName(entry?.speaker || "").toLowerCase();
  if (!speaker || speaker === "dm" || speaker === "dungeon master") {
    return null;
  }
  return controlledActors.find((actor) => normalizeHumanName(actor.name).toLowerCase() === speaker) || null;
}

function dmTextPilotsControlledActor(text, actorName) {
  const name = normalizeHumanName(actorName);
  if (!name || name.length < 3) {
    return false;
  }
  const activeVerb = "(?:says?|asks?|replies?|answers?|shouts?|whispers?|signals?|gestures?|nods?|steps?|moves?|backs?|runs?|draws?|readies?|raises?|attacks?|strikes?|shoots?|casts?|touches?|grabs?|throws?|scans?|searches?|notices?|realizes?|thinks?|decides?|chooses?|insists?|refuses?)";
  const namedAction = new RegExp(`\\b${escapeRegExp(name)}\\b(?:[^.!?]{0,80})\\b${activeVerb}\\b`, "i");
  const possessiveAction = new RegExp(`\\b${escapeRegExp(name)}'?s\\b(?:[^.!?]{0,80})\\b(?:hand|eyes?|voice|weapon|bow|blade|staff|spell|attention|grip)\\b(?:[^.!?]{0,80})\\b${activeVerb}\\b`, "i");
  return namedAction.test(text) || possessiveAction.test(text);
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
          text: "rich player-facing table chat text; normal scene turns should usually be 3-6 paragraphs",
        },
      ],
      sceneStatus: {
        mode: "exploration",
        danger: "tense",
        awaitingPlayer: true,
      },
      choices: {
        prompt: "",
        scope: "free|party|character|subset|vote|combat_actor",
        forActorId: null,
        forActor: "",
        forActorIds: [],
        allowVote: false,
        voteTieBreaker: "host",
        options: [
          {
            id: "A",
            actorId: null,
            actor: "",
            targetActorId: null,
            targetActor: "",
            legalOptionId: null,
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
          text: "player-facing roll/math/result, e.g. Attack d20+5 = 17 vs AC 14; Damage 1d8+3 = 8; Wolf HP 12 -> 4",
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
      "The default for normal non-combat turns is choices.options: [].",
      "Write to generation.narrationTarget. Normal turns should usually be 3-6 paragraphs and 320-700 words.",
      "Use sensory detail, NPC reaction, consequence, and one concrete new situation. Do not answer with only a single sentence unless generation.mode is fast.",
      "Act like a skilled long-running tabletop DM, not a generic story continuation engine.",
      "Prefer consequences over random events. Ask: what changed, who noticed, who cares, and what follows naturally?",
      "Use existing people, places, factions, relationships, and unresolved threads before creating new entities.",
      "Do not introduce a new threat, ambush, monster, quest, or crisis unless it follows from current context, NPC motives, player action, or an active thread.",
      "Let scenes breathe: conversation, travel, investigation, planning, recovery, and social fallout are valid satisfying turns.",
      "NPCs should act from goals, fears, obligations, relationships, and current leverage; do not use them only as exposition dispensers.",
      "Avoid generic fantasy filler, sudden bandits, repeated phrasing, and obvious restatement of the player's action.",
      "Resolve user.inWorld directly; older context explains continuity but must not override the latest player action.",
      "Never answer a new player action by repeating the previous DM question.",
      "Do not force choices for patrols, travel, investigation progress, NPC replies, atmosphere, consequences, or simple scene continuation.",
      "Offer structured choices only when generation.choicePolicy.choicesAllowed is true or this response establishes immediate danger/combat.",
      "When offering choices, make them separate objects, not a paragraph. Shape: { id: 'A', actorId: null, actor: '', targetActorId: null, targetActor: '', text: 'clear action option', legalOptionId: null }.",
      "Use lettered choices: A, B, C, D. The option id should be the letter.",
      "Use choices.options for every listed option. Do not put action options only in table text.",
      "Use choices.scope to identify who is being asked: party for everyone, vote when the host should call a table vote, character for one party member, subset for several named members, combat_actor for the current initiative actor, free for open table input.",
      "If the DM asks one party member directly, set choices.scope to character and set choices.forActorId/forActor to that party member.",
      "If the DM asks several specific party members, set choices.scope to subset and set choices.forActorIds plus choices.forActor.",
      "If the DM asks the whole table to decide a direction, set choices.scope to party. If it should be voted on, set choices.scope to vote and allowVote true; the host breaks ties.",
      "Do not make every prompt a party prompt. A real table alternates between party questions, targeted character spotlights, and occasional companion/NPC interjections.",
      "When context.rulesLedger.actors[].legalOptions exists and a tactical decision is needed, build choices from those options and include legalOptionId.",
      "Narration/dialogue/feelings may be freeform table text. Stats, rolls, choices, lore, history, relationships, inventory, and character facts must be structured data.",
      "Put checks, rolls, DCs, HP/resource notes, and outcomes in mechanics, not only in narration.",
      "Put canon changes in proposedChanges, not only in narration.",
      "Use context.hiddenDmStory as private planning. Never reveal its titles, secrets, or future twists directly.",
      "For hidden story direction, use proposedChanges with domain quests, visibility dm_only, data.threadType story_arc, and data.horizon long|mid|short.",
      "In combat, respect context.combat.currentTurnId/current turn. Offer choices only for the active actor unless resolving an enemy turn.",
      "If context.combat.currentTurnId is an enemy, resolve that enemy/DM turn using mechanics and then advanceTurn.",
      "If context.combat.currentTurnId is a party member and user.inWorld does not contain that actor's submitted action, do not move, speak, attack, cast, dodge, aim, signal, or choose for them. Spotlight the situation, ask what they do, and optionally provide choices for that actor.",
      "Party-member combat turns are input turns, including AI companions. The host/controller may pick an option or type a custom action/dialogue before resolution.",
      "When resolving a party member's submitted combat action, stop after that actor's action, consequences, state updates, and turn advancement. Do not narrate or resolve the next initiative actor's attack/action in the same response.",
      "If the next initiative actor is an enemy, leave its intent unresolved for the next DM/enemy turn; the app will advance initiative and request that turn separately.",
      "Resolved combat should feel like a tabletop combat beat: actor + current HP when known, chosen action, attack/check/save roll, damage/healing roll, HP/resource update, then vivid narration.",
      "For dodge/counter/reaction-style options, show each relevant step separately: defensive check/save/AC contest, attack roll if counterattacking, damage roll if it hits, and the final HP/resource result.",
      "Do not hide combat rolls in prose. Put the exact visible dice/math in mechanics.text or mechanics.roll/damage so the app can render it.",
      "When a combat actor's submitted action is resolved, include a combat proposedChange with data.turnResolved true, data.advanceTurn true, and data.resolvedActorId.",
      "For resolved combat, propose concrete state updates: party HP/resources/conditions and combat initiative/round/turnEconomy/enemies.",
      "Combat proposedChanges may use domain combat data.actorUpdates for party HP/resource/condition changes and data.enemyUpdates for enemy changes.",
      "If combat has multiple similar enemies, represent each combatant separately in data.enemies/turnOrder, or provide a count/quantity field so the app can expand them into separate initiative rows.",
      "When options are for a specific party member or NPC, include choices.forActor/forActorId or option.actor/actorId.",
      "Any party member may have a visible table post when they submitted input, when their controller/host selected their option, or when an AI companion is nudged/idle for a brief low-stakes contribution.",
      "Never put party-member speech or chosen action in table entries unless it came from user.playerInputs or user.inWorld, or it is clearly labeled as a non-binding suggestion.",
      "Remote/player-controlled party members may be described as present only in neutral staging; do not narrate what they think, notice, scan, say, decide, or do without submitted input.",
      "AI companions may suggest one concise low-stakes contribution outside their own combat turn when nudged or when the table is idle, but their combat turn should still be presented for controller/host input before resolution.",
      "Do not silently change HP, inventory, relationships, quests, or major canon.",
      "If stats are missing, suggest a pending check instead of inventing exact math.",
    ],
  };
}

function createDmQualityPolicy({ mode, responseMode } = {}) {
  const combat = mode === "combat" || responseMode === "resolve_combat";
  return {
    philosophy: "Act as a skilled long-running tabletop DM. The app owns state; you create grounded narration, dialogue, consequences, and suggestions.",
    priorities: [
      "consequence of the latest player action",
      "existing NPC motivations and relationships",
      "hidden long, mid, and short term story direction",
      "world continuity and unresolved threads",
      "tension that follows naturally from the scene",
      "meaningful choices only when the scene truly branches",
    ],
    beforeAddingNewContent: [
      "Prefer existing people, places, factions, items, relationships, and active threads.",
      "Ask why this event happens now. If the answer is weak, do not add it.",
      "A new enemy/crisis must follow from motive, consequence, danger, or established setup.",
    ],
    avoid: [
      "random encounter generation",
      "bandits suddenly appear",
      "generic fantasy filler",
      "repeating the player action as narration",
      "flat NPC reactions",
      "escalating every scene",
      "new quests or threats with no setup",
    ],
    pacing: combat
      ? "Combat should start or continue because goals conflict. Resolve active turns clearly, then advance or end combat."
      : "Let scenes breathe. Conversation, travel, investigation, planning, reflection, and social consequences can be the whole turn.",
    selfCheck: [
      "Am I using existing context?",
      "Am I creating a natural consequence?",
      "Am I respecting NPC motivations?",
      "Am I avoiding random escalation?",
      "Would a human DM likely do this?",
      "Does this feel like the same campaign?",
    ],
  };
}

function normalizeTurnResponse(response, options = {}) {
  const unwrapped = unwrapTurnResponse(response);
  const rawTable = normalizedTableRows(unwrapped);
  const table = rawTable.map(normalizeTableEntry).filter((entry) => entry.text);
  const sceneStatus = normalizeSceneStatus(unwrapped.sceneStatus);
  const mechanics = Array.isArray(unwrapped.mechanics)
    ? unwrapped.mechanics.map(normalizeMechanic).filter((item) => item.text || item.reason)
    : [];
  const proposedChanges = Array.isArray(unwrapped.proposedChanges)
    ? unwrapped.proposedChanges.map(normalizeProposedChange).filter(Boolean)
    : Array.isArray(unwrapped.updates?.proposedChanges)
      ? unwrapped.updates.proposedChanges.map(normalizeProposedChange).filter(Boolean)
      : [];
  const flags = normalizeFlags(unwrapped.flags, proposedChanges);
  const warnings = Array.isArray(unwrapped.warnings) ? unwrapped.warnings.map(compactWhitespace).filter(Boolean) : [];
  const choices = applyChoicePolicy(normalizeChoices(unwrapped.choices), {
    choicePolicy: options.choicePolicy,
    sceneStatus,
    mechanics,
    flags,
    warnings,
  });
  const fallbackText = fallbackNarration(unwrapped);

  return {
    type: unwrapped.type || RESPONSE_TYPE,
    schemaVersion: Number(unwrapped.schemaVersion) || SCHEMA_VERSION,
    requestId: unwrapped.requestId || options.expectedRequestId || "",
    table: table.length
      ? table
      : fallbackText
        ? [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: fallbackText }]
        : [],
    sceneStatus,
    choices,
    mechanics,
    flags,
    proposedChanges,
    warnings,
  };
}

function unwrapTurnResponse(response) {
  if (!response || typeof response !== "object") {
    return {};
  }
  const wrapperKeys = ["response", "turn", "result", "output", "data"];
  for (const key of wrapperKeys) {
    const value = response[key];
    if (value && typeof value === "object" && !Array.isArray(value) && hasTurnResponseShape(value)) {
      return {
        ...value,
        type: value.type || response.type,
        schemaVersion: value.schemaVersion || response.schemaVersion,
        requestId: value.requestId || response.requestId,
        warnings: [...(Array.isArray(response.warnings) ? response.warnings : []), ...(Array.isArray(value.warnings) ? value.warnings : [])],
      };
    }
  }
  return response;
}

function hasTurnResponseShape(value) {
  return Boolean(
    Array.isArray(value.table) ||
    Array.isArray(value.tableRows) ||
    Array.isArray(value.entries) ||
    Array.isArray(value.messages) ||
    value.narration ||
    value.narrative ||
    value.description ||
    value.content ||
    value.text ||
    value.message
  );
}

function normalizedTableRows(response) {
  if (Array.isArray(response.table)) {
    return response.table;
  }
  for (const key of ["tableRows", "entries", "messages", "rows"]) {
    if (Array.isArray(response[key])) {
      return response[key];
    }
  }
  return [];
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
    return { speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: normalizeTableText(entry) };
  }

  const speaker = compactWhitespace(entry?.speaker || entry?.name || entry?.actor || "DM");
  const text = normalizeTableText(entry?.text || entry?.body || entry?.content || entry?.narration || entry?.narrative || entry?.description || entry?.message || "");
  return {
    speaker,
    speakerId: entry?.speakerId ?? null,
    role: normalizeTableRole(entry?.role, speaker),
    kind: normalizeTableKind(entry?.kind, text),
    visibility: normalizeTableVisibility(entry?.visibility),
    text,
  };
}

function normalizeTableText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]*\n[ \t]*/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function normalizeTableRole(value, speaker = "") {
  const rawRole = compactWhitespace(value || "");
  if (allowedTableRoles.has(rawRole)) {
    return rawRole;
  }
  if (!rawRole || isSchemaPlaceholder(rawRole, allowedTableRoles)) {
    return inferTableRoleFromSpeaker(speaker);
  }
  const role = normalizeToken(rawRole);
  const aliases = {
    assistant: "dm",
    narrator: "dm",
    dungeon_master: "dm",
    dungeonmaster: "dm",
    gm: "dm",
    game_master: "dm",
    character: "party",
    companion: "party",
    pc: "player",
    player_character: "player",
    non_player_character: "npc",
  };
  if (aliases[role]) {
    return aliases[role];
  }
  return inferTableRoleFromSpeaker(speaker);
}

function inferTableRoleFromSpeaker(speaker = "") {
  const normalized = compactWhitespace(speaker).toLowerCase();
  if (!normalized || normalized === "dm" || normalized === "dungeon master" || normalized === "narrator") {
    return "dm";
  }
  if (normalized === "system" || normalized === "lorekeeper") {
    return "system";
  }
  return "party";
}

function normalizeTableKind(value, text = "") {
  const rawKind = compactWhitespace(value || "");
  if (allowedTableKinds.has(rawKind)) {
    return rawKind;
  }
  if (!rawKind || isSchemaPlaceholder(rawKind, allowedTableKinds)) {
    return inferTableKindFromText(text);
  }
  const kind = normalizeToken(rawKind);
  const aliases = {
    scene: "narration",
    description: "narration",
    prose: "narration",
    speech: "dialogue",
    talk: "dialogue",
    move: "action",
    roll: "mechanics",
    check: "mechanics",
    update: "status",
  };
  if (aliases[kind]) {
    return aliases[kind];
  }
  return inferTableKindFromText(text);
}

function inferTableKindFromText(text = "") {
  if (/\b(roll|check|dc|damage|hp|initiative|save)\b/i.test(text)) {
    return "mechanics";
  }
  return "narration";
}

function isSchemaPlaceholder(value, allowedSet) {
  const text = compactWhitespace(value);
  if (!text.includes("|")) {
    return false;
  }
  const parts = text.split("|").map((part) => compactWhitespace(part)).filter(Boolean);
  return parts.length > 1 && parts.every((part) => allowedSet.has(part));
}

function normalizeTableVisibility(value) {
  const rawText = compactWhitespace(value || "");
  if (allowedTableVisibility.has(rawText)) {
    return rawText;
  }
  if (!rawText || isSchemaPlaceholder(rawText, allowedTableVisibility)) {
    return "table";
  }
  const text = normalizeToken(rawText);
  if (/secret|hidden|private|gm|dm/.test(text)) {
    return "dm_only";
  }
  if (text === "player_visible" || text === "public" || text === "visible" || text === "everyone") {
    return "table";
  }
  return "table";
}

function normalizeSceneStatus(sceneStatus = {}) {
  return {
    mode: normalizeSceneMode(sceneStatus.mode),
    danger: normalizeDangerLevel(sceneStatus.danger),
    awaitingPlayer: normalizeAwaitingPlayer(sceneStatus.awaitingPlayer),
  };
}

function normalizeSceneMode(value) {
  const rawMode = compactWhitespace(value || "");
  if (allowedSceneModes.has(rawMode)) {
    return rawMode;
  }
  if (!rawMode || isSchemaPlaceholder(rawMode, allowedSceneModes)) {
    return "exploration";
  }
  const mode = normalizeToken(rawMode);
  const aliases = {
    investigation: "exploration",
    investigate: "exploration",
    stealth: "exploration",
    danger: "exploration",
    tense: "exploration",
    chase: "exploration",
    scene: "exploration",
    wilderness: "exploration",
    dialogue: "social",
    conversation: "social",
    roleplay: "social",
    rest: "downtime",
    camp: "downtime",
    journey: "travel",
  };
  if (aliases[mode]) {
    return aliases[mode];
  }
  return "exploration";
}

function normalizeDangerLevel(value) {
  const rawDanger = compactWhitespace(value || "");
  if (allowedDangerLevels.has(rawDanger)) {
    return rawDanger;
  }
  if (!rawDanger || isSchemaPlaceholder(rawDanger, allowedDangerLevels)) {
    return "none";
  }
  const danger = normalizeToken(rawDanger);
  const aliases = {
    safe: "none",
    calm: "none",
    low: "none",
    moderate: "tense",
    threat: "tense",
    dangerous: "immediate",
    danger: "immediate",
    urgent: "immediate",
    monster: "immediate",
    creature: "immediate",
    hostile: "immediate",
    active_combat: "combat",
    fighting: "combat",
  };
  if (aliases[danger]) {
    return aliases[danger];
  }
  return "tense";
}

function normalizeAwaitingPlayer(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = compactWhitespace(value || "").toLowerCase();
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  return true;
}

function normalizeChoices(choices = {}) {
  if (!choices || typeof choices !== "object") {
    choices = {};
  }
  const forActorIds = normalizeActorIdList(choices.forActorIds ?? choices.actorIds ?? choices.targetActorIds ?? choices.targets);
  const options = Array.isArray(choices.options)
    ? choices.options.map((option, index) => ({
      id: String(option?.id ?? letterForIndex(index)),
      actorId: option?.actorId ?? null,
      actor: compactWhitespace(option?.actor || ""),
      targetActorId: option?.targetActorId ?? option?.forActorId ?? null,
      targetActor: compactWhitespace(option?.targetActor || option?.forActor || ""),
      legalOptionId: option?.legalOptionId ?? null,
      text: compactChoiceText(option?.text ?? option?.label ?? option),
    })).filter((option) => option.text)
    : [];

  return {
    prompt: compactWhitespace(choices.prompt || "What do you do?"),
    scope: normalizeChoiceScope(choices.scope, choices, forActorIds),
    forActorId: choices.forActorId ?? null,
    forActor: compactWhitespace(choices.forActor || ""),
    forActorIds,
    allowVote: choices.allowVote === true || normalizeChoiceScope(choices.scope, choices, forActorIds) === "vote",
    voteTieBreaker: compactWhitespace(choices.voteTieBreaker || "host"),
    options: options.slice(0, 7),
    allowOther: choices.allowOther !== false,
  };
}

function normalizeChoiceScope(value, choices = {}, forActorIds = []) {
  const rawScope = compactWhitespace(value || "");
  if (allowedChoiceScopes.has(rawScope)) {
    return rawScope;
  }
  const scope = normalizeToken(rawScope);
  const aliases = {
    all: "party",
    everyone: "party",
    group: "party",
    table: "party",
    whole_party: "party",
    pc: "character",
    player: "character",
    actor: "character",
    target: "character",
    targeted: "character",
    few: "subset",
    several: "subset",
    multiple: "subset",
    poll: "vote",
    voting: "vote",
    initiative: "combat_actor",
    current_actor: "combat_actor",
  };
  if (aliases[scope]) {
    return aliases[scope];
  }
  if (choices.allowVote === true) {
    return "vote";
  }
  if (choices.forActorId || compactWhitespace(choices.forActor || "")) {
    return "character";
  }
  if (forActorIds.length > 1) {
    return "subset";
  }
  return "";
}

function normalizeActorIdList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => typeof item === "object" ? item?.id ?? item?.actorId ?? item?.targetActorId : item)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function applyChoicePolicy(choices, { choicePolicy, sceneStatus, mechanics, flags, warnings } = {}) {
  if (!choices?.options?.length) {
    return choices;
  }

  const policy = choicePolicy && typeof choicePolicy === "object" ? choicePolicy : null;
  if (!policy) {
    return choices;
  }

  const dangerAllowsChoices = sceneStatus?.danger === "immediate" || sceneStatus?.danger === "combat";
  const combatAllowsChoices = sceneStatus?.mode === "combat" || flags?.startsCombat === true;
  const mechanicsNeedChoice = (mechanics ?? []).some((item) => item.outcome === "pending" && item.type !== "none");
  const policyAllowsChoices = policy?.choicesAllowed === true;

  if (dangerAllowsChoices || combatAllowsChoices || mechanicsNeedChoice || policyAllowsChoices) {
    return choices;
  }

  warnings?.push("Structured choices suppressed by choicePolicy; this turn should continue with DM narration.");
  return {
    ...choices,
    prompt: "",
    scope: "",
    forActorId: null,
    forActor: "",
    options: [],
  };
}

function normalizeMechanic(item) {
  const rawType = normalizeToken(item?.type || "");
  const rawOutcome = normalizeToken(item?.outcome || "");
  const rollText = formatMechanicRoll(item?.roll);
  const fallbackText = formatMechanicText(item, rollText);
  return {
    type: normalizeMechanicType(rawType),
    actorId: item?.actorId ?? null,
    actor: compactWhitespace(item?.actor || ""),
    ability: item?.ability ?? null,
    skill: item?.skill ?? null,
    roll: rollText,
    dc: item?.dc ?? null,
    reason: compactWhitespace(item?.reason || ""),
    outcome: normalizeMechanicOutcome(rawOutcome),
    label: compactWhitespace(item?.label || item?.type || "Mechanic"),
    text: compactWhitespace(item?.text || item?.reason || fallbackText),
  };
}

function compactChoiceText(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "object") {
    const primary = value.text || value.label || value.name || value.title || value.action || value.description || value.id;
    if (primary) {
      return compactWhitespace(primary);
    }
    return compactWhitespace(Object.entries(value)
      .map(([key, entry]) => `${key}: ${typeof entry === "object" ? compactChoiceText(entry) : String(entry ?? "")}`)
      .filter(Boolean)
      .join(", "));
  }
  return compactWhitespace(value);
}

function formatMechanicText(item, rollText = "") {
  if (!item || typeof item !== "object") {
    return compactWhitespace(item || "");
  }

  const pieces = [];
  const actor = compactWhitespace(item.actor || item.actorName || "");
  const target = compactWhitespace(item.target || item.targetName || "");
  if (actor || target) {
    pieces.push([actor, target ? `vs ${target}` : ""].filter(Boolean).join(" "));
  }
  if (rollText) {
    pieces.push(`Roll ${rollText}`);
  }
  const dc = item.dc ?? item.armorClass ?? item.ac ?? null;
  if (dc !== null && dc !== undefined && dc !== "") {
    pieces.push(`DC/AC ${dc}`);
  }
  const damage = compactWhitespace(item.damage || item.damageRoll || item.damageText || "");
  if (damage) {
    pieces.push(`Damage ${damage}`);
  }
  const hpDelta = item.hpDelta ?? item.damageDealt ?? item.healing ?? null;
  if (hpDelta !== null && hpDelta !== undefined && hpDelta !== "") {
    pieces.push(`HP delta ${hpDelta}`);
  }
  const outcome = compactWhitespace(item.outcome || item.result || "");
  if (outcome && outcome !== "none") {
    pieces.push(outcome);
  }
  const reason = compactWhitespace(item.reason || "");
  if (reason) {
    pieces.push(reason);
  }
  return pieces.join("; ");
}

function formatMechanicRoll(value) {
  if (!value) {
    return "";
  }
  if (typeof value !== "object") {
    return compactWhitespace(value);
  }
  const formula = compactWhitespace(value.formula || value.dice || value.expression || value.type || "");
  const total = value.total ?? value.result ?? value.value ?? null;
  const bonus = value.bonus ?? value.modifier ?? null;
  const natural = value.natural ?? value.d20 ?? value.roll ?? null;
  const parts = [];
  if (formula) {
    parts.push(formula);
  }
  if (natural !== null && natural !== undefined && natural !== "") {
    parts.push(`natural ${natural}`);
  }
  if (bonus !== null && bonus !== undefined && bonus !== "") {
    parts.push(`bonus ${signedMechanicNumber(bonus)}`);
  }
  if (total !== null && total !== undefined && total !== "") {
    parts.push(`total ${total}`);
  }
  return parts.join(", ");
}

function signedMechanicNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }
  return number >= 0 ? `+${number}` : String(number);
}

function normalizeMechanicType(type) {
  if (allowedMechanicTypes.has(type)) {
    return type;
  }
  const aliases = {
    skill_check: "check",
    ability_check: "check",
    roll: "check",
    saving_throw: "save",
    savingthrow: "save",
    hit: "attack",
    damage_roll: "damage",
    resource: "resource_note",
    resource_update: "resource_note",
    note: "status",
  };
  if (aliases[type]) {
    return aliases[type];
  }
  return type ? "status" : "none";
}

function normalizeMechanicOutcome(outcome) {
  if (allowedMechanicOutcomes.has(outcome)) {
    return outcome;
  }
  const aliases = {
    partial: "mixed",
    partial_success: "mixed",
    complication: "mixed",
    unresolved: "pending",
    needs_roll: "pending",
    waiting: "pending",
    passed: "success",
    succeeded: "success",
    failed: "failure",
    miss: "failure",
  };
  return aliases[outcome] || "none";
}

function normalizeFlags(flags = {}, proposedChanges = []) {
  const hasMajorChange = proposedChanges.some((change) => change.importance === "major");
  return {
    requiresReview: typeof flags.requiresReview === "boolean" ? flags.requiresReview : hasMajorChange,
    startsCombat: typeof flags.startsCombat === "boolean" ? flags.startsCombat : false,
    endsScene: typeof flags.endsScene === "boolean" ? flags.endsScene : false,
    containsSecretInfo: typeof flags.containsSecretInfo === "boolean" ? flags.containsSecretInfo : false,
  };
}

function normalizeProposedChange(change) {
  if (!change || typeof change !== "object") {
    return null;
  }

  return {
    operation: normalizeOperation(change.operation),
    domain: normalizeChangeDomain(change.domain),
    targetId: change.targetId ?? null,
    importance: normalizeImportance(change.importance),
    visibility: normalizeChangeVisibility(change.visibility),
    summary: compactWhitespace(change.summary || "Unlabeled proposed update."),
    data: change.data && typeof change.data === "object" ? change.data : {},
    confidence: normalizeEnum(change.confidence, new Set(["low", "medium", "high", "unknown"]), "unknown"),
    reason: compactWhitespace(change.reason || ""),
  };
}

function normalizeOperation(value) {
  const operation = normalizeToken(value);
  if (allowedOperations.has(operation)) {
    return operation;
  }
  return {
    create: "add",
    insert: "add",
    upsert: "update",
    modify: "update",
    edit: "update",
    delete: "remove",
    append: "note",
  }[operation] || operation;
}

function normalizeChangeDomain(value) {
  const domain = normalizeToken(value);
  if (allowedDomains.has(domain)) {
    return domain;
  }
  return {
    npc: "people",
    npcs: "people",
    person: "people",
    character: "party",
    player_character: "party",
    party_member: "party",
    place: "places",
    location: "places",
    item: "items",
    thing: "items",
    thread: "quests",
    quest: "quests",
    relationship: "relationships",
    scene_status: "scene",
    current_scene: "scene",
    battle: "combat",
  }[domain] || domain;
}

function normalizeImportance(value) {
  const importance = normalizeToken(value || "normal");
  if (allowedImportance.has(importance)) {
    return importance;
  }
  return {
    low: "minor",
    small: "minor",
    medium: "normal",
    significant: "major",
    high: "major",
  }[importance] || "normal";
}

function normalizeChangeVisibility(value) {
  const visibility = normalizeToken(value || "player_visible");
  if (allowedVisibility.has(visibility)) {
    return visibility;
  }
  if (/secret|hidden|private|gm|dm/.test(visibility)) {
    return "dm_only";
  }
  if (visibility === "public" || visibility === "table" || visibility === "visible") {
    return "player_visible";
  }
  return "player_visible";
}

function fallbackNarration(response) {
  const value = response.narration ||
    response.narrative ||
    response.description ||
    response.content ||
    response.text ||
    response.message ||
    response.responseText ||
    response.response_text ||
    "";
  return compactWhitespace(typeof value === "object" ? tableTextFromObject(value) : value);
}

function tableTextFromObject(value) {
  if (!value || typeof value !== "object") {
    return "";
  }
  return compactWhitespace(value.text || value.body || value.content || value.narration || value.narrative || value.description || value.message || "");
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
    combat: {
      inCombat: Boolean(campaign.combat?.inCombat),
      round: campaign.combat?.round ?? null,
      currentTurnId: campaign.combat?.currentTurnId ?? null,
      turnOrder: Array.isArray(campaign.combat?.turnOrder)
        ? campaign.combat.turnOrder.slice(0, 12).map((entry) => ({
          id: entry.id,
          name: entry.name,
          type: entry.type,
          initiativeScore: entry.initiativeScore ?? null,
        }))
        : [],
      enemies: Array.isArray(campaign.combat?.enemies)
        ? campaign.combat.enemies.slice(0, 8).map((enemy) => ({
          id: enemy.id,
          name: enemy.name,
          hp: enemy.hp ?? null,
          conditions: enemy.conditions ?? [],
        }))
        : [],
    },
    party: (campaign.party ?? []).map((member) => compactPartyMember(member, options)).slice(0, 8),
    rulesLedger: compactRulesLedger(contextPack?.rulesLedger, options),
    hiddenDmStory: compactHiddenStoryThreads(campaign),
    tableVoices: (campaign.party ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      voice: compactText(member.voice || member.personality || member.role || "reacts as an individual party member", 140),
      controllerKind: normalizeControllerKind(member),
      agency: describePartyAgency(member),
    })).slice(0, 8),
    sections: (contextPack?.sections ?? []).map((section) => ({
      kind: normalizeSectionKind(section.kind),
      title: section.title,
      entries: section.entries.map((entry) => compactText(entry, TEXT_LIMITS.sectionEntry)).slice(0, options.mode === "fast" ? 4 : 8),
    })),
  };
}

function compactRulesLedger(ledger, options = {}) {
  if (!ledger || typeof ledger !== "object") {
    return {
      system: "dnd-5e-lite",
      source: "campaign_sqlite_snapshot",
      mode: options.mode === "combat" ? "combat" : "scene",
      actors: [],
    };
  }

  return {
    system: ledger.system,
    source: ledger.source,
    mode: ledger.mode,
    round: ledger.round,
    activeActorIds: Array.isArray(ledger.activeActorIds) ? ledger.activeActorIds.slice(0, 8) : [],
    actors: Array.isArray(ledger.actors)
      ? ledger.actors.slice(0, 8).map((actor) => ({
        id: actor.id,
        name: actor.name,
        agency: actor.agency,
        hp: actor.sheet?.hp ?? null,
        armorClass: actor.sheet?.armorClass ?? null,
        speedFt: actor.sheet?.speedFt ?? null,
        resources: actor.sheet?.resources ?? {},
        conditions: actor.sheet?.conditions ?? [],
        turnEconomy: actor.turnEconomy ?? {},
        legalOptions: (actor.legalOptions ?? []).slice(0, options.mode === "fast" ? 5 : 10).map((option) => ({
          id: option.id,
          letter: option.letter,
          label: option.label,
          type: option.type,
          cost: option.cost,
          requirements: option.requirements,
          roll: option.roll,
          effect: option.effect,
          source: option.source,
        })),
        assumptions: actor.sheet?.assumptions ?? [],
      }))
      : [],
    rules: Array.isArray(ledger.rules) ? ledger.rules.slice(0, 4) : [],
  };
}

function compactPartyMember(member, options = {}) {
  const includeDetail = options.mode === "combat";
  return {
    id: member.id,
    name: member.name,
    role: compactText(member.ancestryClass || member.role || member.class || "party member", 90),
    controllerKind: normalizeControllerKind(member),
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

function normalizeControllerKind(member = {}) {
  const raw = normalizeToken(member.controllerKind || member.controller || member.control || "");
  if (["host", "remote_player", "ai_companion", "npc_dm", "unassigned"].includes(raw)) {
    return raw;
  }
  if (raw === "remote" || raw === "guest" || raw === "player_remote") return "remote_player";
  if (raw === "ai" || raw === "companion" || raw === "dm_controlled_companion") return "ai_companion";
  if (raw === "npc" || raw === "dm") return "npc_dm";
  return member.type === "player_character" || member.playerRole === "player" || /player/i.test(member.role ?? "")
    ? "host"
    : "ai_companion";
}

function describePartyAgency(member = {}) {
  const kind = normalizeControllerKind(member);
  if (kind === "host") return "host_controlled_party_member";
  if (kind === "remote_player") return "remote_player_controlled_party_member_no_autonomous_speech_or_action";
  if (kind === "ai_companion") return "ai_companion_may_offer_low_stakes_rp_when_nudged_but_requires_turn_input_for_major_actions";
  if (kind === "unassigned") return "unassigned_party_member_requires_host_input";
  return "party_member_requires_controller_input";
}

function inferActionIntent(value) {
  const text = String(value ?? "").toLowerCase();
  if (/\b(combat|fight|attack|attacks|attacking|shoot|shot|fire|fires|firing|crossbow|bow|arrow|stab|strike|cast|damage|initiative|enemy|monster|creature|beast|wolf|wounded|under attack)\b/.test(text)) {
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

function normalizePlayerInputs(inputs) {
  if (!Array.isArray(inputs)) {
    return [];
  }
  return inputs
    .map((input) => ({
      type: compactText(input?.type || "table_input", 80),
      id: compactText(input?.id || "", 80),
      label: compactText(input?.label || "", 80),
      playerId: compactText(input?.playerId || "", 80),
      playerName: compactText(input?.playerName || "", 80),
      characterId: compactText(input?.characterId || "", 80),
      characterName: compactText(input?.characterName || "", 80),
      prompt: compactText(input?.prompt || "", 240),
      text: compactText(input?.text || "", 700),
      legalOptionId: compactText(input?.legalOptionId || "", 120),
      ready: input?.ready !== false,
    }))
    .filter((input) => input.text)
    .slice(0, 8);
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

function inferChoicePolicy(campaign, parsedMessage, options = {}) {
  const mode = options.mode || inferGenerationMode(campaign, parsedMessage, options);
  const responseMode = options.responseMode || inferResponseMode(campaign, parsedMessage, options);
  const raw = [
    parsedMessage?.raw,
    parsedMessage?.inWorldText,
    ...(parsedMessage?.metaInstructions ?? []),
  ].join(" ");
  const explicitChoiceRequest = /\b(options?|choices?|what can i do|what should i do|give me ideas|suggest)\b/i.test(raw);
  const tactical =
    mode === "combat" ||
    responseMode === "resolve_combat" ||
    campaign.combat?.inCombat ||
    inferDangerLevel(campaign, { mode }) === "immediate";
  const choicesAllowed = Boolean(tactical || explicitChoiceRequest);

  return {
    default: choicesAllowed ? "choice_when_useful" : "narration_first",
    choicesAllowed,
    reason: choicesAllowed
      ? tactical
        ? "combat_or_immediate_danger"
        : "user_requested_options"
      : "ordinary_scene_flow",
    useChoicesWhen: [
      "combat or immediate danger needs tactical input",
      "the user explicitly asks for options",
      "the scene reaches a real irreversible branch",
    ],
    avoidChoicesWhen: [
      "resolving a selected option",
      "patrol/travel/investigation continuation",
      "NPC reply or atmosphere",
      "simple consequence narration",
    ],
  };
}

function inferNarrationTarget({ mode, responseMode } = {}) {
  if (mode === "fast") {
    return {
      style: "brief_but_complete",
      paragraphs: "1-2",
      words: "80-160",
      requiredBeats: ["direct consequence", "current situation"],
    };
  }

  if (mode === "combat" || responseMode === "resolve_combat") {
    return {
      style: "tactical_cinematic",
      paragraphs: "2-4",
      words: "220-480",
      requiredBeats: ["action result", "mechanical consequence", "current battlefield situation"],
    };
  }

  return {
    style: "immersive_tabletop",
    paragraphs: "3-6",
    words: "320-700",
    requiredBeats: ["sensory detail", "NPC or world reaction", "consequence of the player action", "new concrete situation"],
  };
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
  if (/\battack|ambush|combat|initiative|bloodshed|beast|monster|creature|alarm|crossbow|weapon|massive|charging|approach(?:es|ing)?|closing in\b/.test(text)) {
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

  const withoutThinking = stripThinkingBlocks(text);
  const stripped = withoutThinking
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

function stripThinkingBlocks(text) {
  return String(text ?? "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
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

function normalizeToken(value) {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function letterForIndex(index) {
  return String.fromCharCode(65 + index);
}

function createRequestId() {
  return `turn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
