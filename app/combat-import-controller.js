// Combat import policy lives outside app.js so provider-response imports cannot
// weaken initiative ownership by accident. Provider narration may describe a
// combat turn, but this controller only advances initiative when structured
// mechanics show the active actor's turn actually resolved.
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

function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}
