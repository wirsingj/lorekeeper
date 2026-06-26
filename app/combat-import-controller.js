import { normalizeChangeDomain } from "./change-domain-controller.js";
import { latestDmNarration } from "./combat-prompt-repair-controller.js";
import { compactSceneSituation } from "./table-text-controller.js";

// Combat import policy lives outside app.js so provider-response imports cannot
// weaken combat ownership by accident. Provider narration may describe combat,
// but this controller keeps the fallback rules explicit and testable.
export function createImplicitCombatStartChange({
  campaign,
  tableMessages = [],
  proposedChanges = [],
  turnResponse = null,
} = {}) {
  if (campaign?.combat?.inCombat) {
    return null;
  }
  if (proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "combat")) {
    return null;
  }

  const latestDmText = latestDmNarration(tableMessages);
  const structuredCombatSignal = hasStructuredCombatSignal(turnResponse);
  if (!structuredCombatSignal && !isCombatStartNarration(latestDmText)) {
    return null;
  }

  const enemies = inferCombatEnemies(latestDmText);
  if (!enemies.length) {
    return null;
  }
  const immediateSituation = compactSceneSituation(latestDmText);
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Combat started from latest DM narration.",
    data: {
      inCombat: true,
      round: campaign?.combat?.round || 1,
      stakes: immediateSituation,
      enemies,
      lastAction: "Combat started from DM narration.",
    },
    confidence: structuredCombatSignal ? "high" : "medium",
    reason: "Keeps SQLite combat state aligned when a fight is visibly underway but the model omitted an explicit combat update.",
  };
}

export function createImplicitCombatEnemySyncChange({
  campaign,
  tableMessages = [],
  proposedChanges = [],
  turnResponse = null,
} = {}) {
  const latestDmText = latestDmNarration(tableMessages);
  const combatWillBeActive =
    Boolean(campaign?.combat?.inCombat) ||
    proposedChanges.some((change) => normalizeChangeDomain(change.domain) === "combat" && change.data?.inCombat === true) ||
    hasStructuredCombatSignal(turnResponse) ||
    isCombatStartNarration(latestDmText);
  if (!combatWillBeActive) {
    return null;
  }

  const inferredEnemies = inferCombatEnemies(latestDmText);
  if (!inferredEnemies.length) {
    return null;
  }

  const knownEnemies = [
    ...(campaign?.combat?.enemies ?? []),
    ...proposedChanges.flatMap((change) => {
      if (normalizeChangeDomain(change.domain) !== "combat") {
        return [];
      }
      return [
        ...(Array.isArray(change.data?.enemies) ? change.data.enemies : []),
        ...(Array.isArray(change.data?.enemyUpdates) ? change.data.enemyUpdates : []),
      ];
    }),
  ];
  const missingEnemies = inferredEnemies.filter((enemy) => !isKnownEnemy(enemy, knownEnemies));
  if (!missingEnemies.length) {
    return null;
  }

  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Combatant inferred from latest DM narration.",
    data: {
      inCombat: true,
      round: campaign?.combat?.round || 1,
      enemyUpdates: missingEnemies,
      lastAction: "Missing combatant added to initiative from DM narration.",
    },
    confidence: hasStructuredCombatSignal(turnResponse) ? "high" : "medium",
    reason: "Keeps the 5E initiative tracker populated when the DM narration names an active hostile but the model omits it from combat state.",
  };
}

export function createImplicitCombatAdvanceChange({
  campaign,
  proposedChanges = [],
  turnResponse = null,
  submittedTurn = null,
  labelForActor = (_campaign, id) => id,
} = {}) {
  const combat = campaign?.combat ?? {};
  if (!combat.inCombat || !combat.currentTurnId) {
    return null;
  }

  const rawTurn = submittedCombatTurnText(submittedTurn);
  if (!rawTurn || isNonResolvingCombatInput(rawTurn)) {
    return null;
  }
  if (!hasResolvedMechanics(turnResponse)) {
    return null;
  }

  const combatChanges = proposedChanges.filter((change) => normalizeChangeDomain(change.domain) === "combat");
  if (combatChanges.some((change) =>
    change.data?.advanceTurn ||
    change.data?.turnResolved ||
    (change.data?.currentTurnId && change.data.currentTurnId !== combat.currentTurnId) ||
    (change.data?.activeActorId && change.data.activeActorId !== combat.currentTurnId)
  )) {
    return null;
  }

  const actorId =
    submittedTurn?.playerInputs?.find((input) => input.characterId)?.characterId ||
    combat.currentTurnId;
  if (!actorId || actorId !== combat.currentTurnId) {
    return null;
  }
  if (!isTurnEndingCombatInput(rawTurn, turnResponse)) {
    return null;
  }

  const actorLabel = labelForActor(campaign, actorId);
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: `${actorLabel} completed their combat turn.`,
    data: {
      inCombat: true,
      turnResolved: true,
      advanceTurn: true,
      resolvedActorId: actorId,
      lastAction: `${actorLabel}'s combat turn resolved.`,
    },
    confidence: turnResponse?.sceneStatus?.mode === "combat" ? "high" : "medium",
    reason: "Advances the persisted 5E initiative tracker after the active actor's action resolves.",
  };
}

export function submittedCombatTurnText(turn = {}) {
  const direct = String(turn?.playerMessage || "").trim();
  const structured = (turn?.playerInputs ?? [])
    .map((input) => input?.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  return [direct, structured].filter(Boolean).join("\n").trim();
}

export function hasResolvedMechanics(turnResponse = null) {
  return (turnResponse?.mechanics ?? []).some((mechanic) =>
    mechanic &&
    mechanic.type !== "none" &&
    mechanic.outcome !== "pending" &&
    /\d|roll|damage|healing|hp|hit|miss|success|failure|resource|condition/i.test([
      mechanic.text,
      mechanic.roll,
      mechanic.damage,
      mechanic.reason,
      mechanic.outcome,
    ].filter(Boolean).join(" "))
  );
}

export function hasStructuredCombatSignal(turnResponse = null) {
  return Boolean(
    turnResponse?.sceneStatus?.mode === "combat" ||
    turnResponse?.sceneStatus?.danger === "combat" ||
    turnResponse?.flags?.startsCombat === true
  );
}

export function inferCombatEnemies(text = "") {
  const lower = String(text).toLowerCase();
  const enemies = [];
  const addEnemy = (id, name, type = "enemy") => {
    if (!enemies.some((enemy) => enemy.id === id || normalizeNameKey(enemy.name) === normalizeNameKey(name))) {
      enemies.push({ id, name, type, hp: null, conditions: [] });
    }
  };

  if (/\bwolf\b/.test(lower)) {
    addEnemy("enemy-wolf", "Massive wolf", "beast");
  } else if (/\bbeast\b/.test(lower)) {
    addEnemy("enemy-beast", "Unknown beast", "beast");
  } else if (/\bcreature\b/.test(lower)) {
    addEnemy("enemy-creature", "Unknown creature", "creature");
  } else if (/\bmonster\b/.test(lower)) {
    addEnemy("enemy-monster", "Unknown monster", "monster");
  }

  if (/\bdrunk (?:miner|dwarf|mining dwarf)\b|\bminer dwarf\b|\bdwarven miner\b/.test(lower)) {
    addEnemy("enemy-drunk-miner", "Drunk miner", "humanoid");
  } else if (/\bminer\b/.test(lower) && /\b(bar fight|brawl|throws? (?:a )?punch|punch(?:es|ed|ing)?|attacks?|hostile|counterattack)\b/.test(lower)) {
    addEnemy("enemy-hostile-miner", "Hostile miner", "humanoid");
  }
  if (/\b(?:bully|brawler|thug)\b/.test(lower)) {
    addEnemy("enemy-brawler", "Brawler", "humanoid");
  }
  if (/\bbandit\b/.test(lower)) {
    addEnemy("enemy-bandit", "Bandit", "humanoid");
  }
  return enemies;
}

function isCombatStartNarration(text = "") {
  return /\b(under attack|roll initiative|initiative|enemy|monster|creature|beast|wolf|wounded beast|bar fight|brawl|throws? (?:a )?punch|punch(?:es|ed|ing)?|counterattack|crossbow bolt|blood|fangs|claws|charging|charges|attacks|attackers?|weapon drawn|readies? (?:a )?(?:weapon|crossbow|bow|spell))\b/i.test(text);
}

function enemyIdentityKeys(enemy = {}) {
  return [
    enemy.id,
    enemy.enemyId,
    enemy.name,
    enemy.title,
  ]
    .map(normalizeNameKey)
    .filter(Boolean);
}

function isKnownEnemy(candidate = {}, knownEnemies = []) {
  const knownKeys = new Set(knownEnemies.flatMap(enemyIdentityKeys));
  if (enemyIdentityKeys(candidate).some((key) => knownKeys.has(key))) {
    return true;
  }

  const candidateTokens = enemyIdentityTokens(candidate);
  if (!candidateTokens.length) {
    return false;
  }
  return knownEnemies.some((enemy) => {
    const knownTokens = enemyIdentityTokens(enemy);
    return candidateTokens.some((token) => knownTokens.includes(token));
  });
}

function enemyIdentityTokens(enemy = {}) {
  const words = [
    enemy.id,
    enemy.enemyId,
    enemy.name,
    enemy.title,
    enemy.type,
  ]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const combatantNouns = new Set([
    "wolf",
    "beast",
    "creature",
    "monster",
    "miner",
    "dwarf",
    "brawler",
    "thug",
    "bandit",
  ]);
  return [...new Set(words.filter((word) => combatantNouns.has(word)))];
}

function normalizeNameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isNonResolvingCombatInput(text = "") {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return true;
  }
  if (/^\(DM nudge:/i.test(trimmed) || /^\(?\s*meta\s*:/i.test(trimmed)) {
    return true;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 3 && !/\b(attack|attacks|shoot|shot|fire|stab|strike|cast|dash|dodge|disengage|hide|help|ready|release|loose|swing|slash|thrust|charge|flee|retreat)\b/i.test(trimmed)) {
    return true;
  }
  return false;
}

function isTurnEndingCombatInput(text = "", turnResponse = null) {
  const normalized = String(text ?? "").toLowerCase();
  if (/\b(wait|hold|pause|ask|say|tell|call|shout|yell|look|listen|inspect|what|where|why|who|ready\s+to|prepare\s+to)\b/.test(normalized) &&
      !/\b(attack|attacks|shoot|shot|fire|fires|stab|strike|cast|dash|dodge|disengage|hide|help|release|loose|swing|slash|thrust|charge|grapple|shove|flee|retreat)\b/.test(normalized)) {
    return false;
  }
  if (turnResponse?.sceneStatus?.awaitingPlayer === true && !hasResolvedMechanics(turnResponse)) {
    return false;
  }
  return /\b(attack|attacks|shoot|shot|fire|fires|firing|stab|stabs|strike|strikes|cast|casts|dash|dodge|disengage|hide|help|release|loose|swing|slash|thrust|charge|grapple|shove|heal|drink|use|throw|hurl|flee|retreat)\b/i.test(text) ||
    hasResolvedMechanics(turnResponse);
}
