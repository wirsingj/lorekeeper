const relationshipStates = Object.freeze([
  "hostile",
  "fearful",
  "distrustful",
  "neutral",
  "respectful",
  "friendly",
  "loyal",
]);

const stateRank = new Map(relationshipStates.map((state, index) => [state, index]));

export function normalizeRelationshipRecord(input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const sourceId = stringOrEmpty(input.sourceId ?? input.source_id ?? input.fromId ?? input.from);
  const targetId = stringOrEmpty(input.targetId ?? input.target_id ?? input.toId ?? input.to);
  const state = normalizeRelationshipState(input.state ?? input.disposition ?? input.type ?? input.relationshipType);
  const id = input.id || relationshipId(sourceId, targetId);
  return {
    ...input,
    id,
    sourceId,
    targetId,
    type: state,
    state,
    disposition: state,
    trust: Number.isFinite(Number(input.trust)) ? Number(input.trust) : stateRank.get(state) - stateRank.get("neutral"),
    tension: Number.isFinite(Number(input.tension)) ? Number(input.tension) : tensionForState(state),
    notes: normalizeNotes(input.notes ?? input.memory ?? input.summary ?? input.description),
    memory: normalizeNotes(input.memory ?? input.notes ?? input.summary ?? input.description),
    goalIds: uniqueStrings([...(input.goalIds ?? []), ...(input.linkedGoalIds ?? []), input.linkedGoal, input.linkedGoalId]),
    relatedIds: uniqueStrings([
      ...(input.relatedIds ?? []),
      ...(input.relatedEntityIds ?? []),
      ...(input.placeIds ?? []),
      ...(input.factionIds ?? []),
    ]),
    updatedAt: input.updatedAt ?? now,
    createdAt: input.createdAt ?? now,
  };
}

export function applyRelationshipTransition(campaign, input = {}, options = {}) {
  const now = options.now ?? new Date().toISOString();
  const relationships = (campaign.relationships ?? []).map((relationship) => normalizeRelationshipRecord(relationship, { now }));
  const sourceId = stringOrEmpty(input.sourceId ?? input.source_id ?? input.fromId ?? input.from);
  const targetId = stringOrEmpty(input.targetId ?? input.target_id ?? input.toId ?? input.to);
  const requestedId = input.id || input.relationshipId || relationshipId(sourceId, targetId);
  const index = relationships.findIndex((relationship) =>
    relationship.id === requestedId ||
    (sourceId && targetId && relationship.sourceId === sourceId && relationship.targetId === targetId)
  );
  const existing = index === -1
    ? normalizeRelationshipRecord({ id: requestedId, sourceId, targetId, state: input.fromState ?? "neutral" }, { now })
    : relationships[index];
  const previousState = normalizeRelationshipState(input.fromState ?? existing.state ?? existing.type);
  const nextState = nextRelationshipState(previousState, input);
  const note = transitionNote(input, previousState, nextState);
  const updated = normalizeRelationshipRecord({
    ...existing,
    ...input,
    id: existing.id || requestedId,
    sourceId: existing.sourceId || sourceId,
    targetId: existing.targetId || targetId,
    state: nextState,
    type: nextState,
    disposition: nextState,
    notes: uniqueStrings([...normalizeNotes(existing.notes), note, ...normalizeNotes(input.notes)]),
    memory: uniqueStrings([...normalizeNotes(existing.memory), note, ...normalizeNotes(input.memory)]),
    goalIds: uniqueStrings([
      ...(existing.goalIds ?? []),
      ...(input.goalIds ?? []),
      ...(input.linkedGoalIds ?? []),
      input.linkedGoal,
      input.linkedGoalId,
    ]),
    relatedIds: uniqueStrings([
      ...(existing.relatedIds ?? []),
      ...(input.relatedIds ?? []),
      ...(input.relatedEntityIds ?? []),
      ...(input.placeIds ?? []),
      ...(input.factionIds ?? []),
    ]),
    updatedAt: now,
  }, { now });

  const nextRelationships = index === -1
    ? [...relationships, updated]
    : relationships.map((relationship, relationshipIndex) => (relationshipIndex === index ? updated : relationship));

  return {
    campaign: {
      ...campaign,
      relationships: nextRelationships,
    },
    relationship: updated,
    previousState,
    nextState,
    changed: previousState !== nextState || note.length > 0,
  };
}

export function nextRelationshipState(currentState, input = {}) {
  const explicit = normalizeRelationshipState(input.toState ?? input.nextState ?? input.state ?? input.disposition);
  if (explicit && explicit !== normalizeRelationshipState(currentState)) {
    return explicit;
  }
  const current = normalizeRelationshipState(currentState);
  const shift = relationshipShiftValue(input.shift ?? input.delta ?? input.direction ?? input.transition);
  if (shift === 0) {
    return current;
  }
  const currentRank = stateRank.get(current) ?? stateRank.get("neutral");
  return relationshipStates[Math.max(0, Math.min(relationshipStates.length - 1, currentRank + shift))];
}

export function normalizeRelationshipState(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    enemy: "hostile",
    enemies: "hostile",
    hostile: "hostile",
    afraid: "fearful",
    scared: "fearful",
    wary: "distrustful",
    suspicious: "distrustful",
    distrust: "distrustful",
    distrustful: "distrustful",
    neutral: "neutral",
    known: "neutral",
    respect: "respectful",
    respectful: "respectful",
    cautious_respect: "respectful",
    friendly: "friendly",
    friend: "friendly",
    ally: "friendly",
    allied: "friendly",
    loyal: "loyal",
    devoted: "loyal",
  };
  return aliases[normalized] || (stateRank.has(normalized) ? normalized : "neutral");
}

function relationshipShiftValue(value) {
  if (Number.isFinite(Number(value))) {
    return Math.max(-3, Math.min(3, Math.round(Number(value))));
  }
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["improve", "improved", "positive", "warmer", "gain", "up"].includes(normalized)) return 1;
  if (["major_improve", "much_better", "strong_positive"].includes(normalized)) return 2;
  if (["worsen", "worse", "negative", "cooler", "loss", "down"].includes(normalized)) return -1;
  if (["major_worsen", "much_worse", "strong_negative"].includes(normalized)) return -2;
  return 0;
}

function transitionNote(input, previousState, nextState) {
  const reason = stringOrEmpty(input.reason ?? input.summary ?? input.note);
  if (reason) {
    return reason;
  }
  if (previousState !== nextState) {
    return `Relationship shifted from ${previousState} to ${nextState}.`;
  }
  return "";
}

function relationshipId(sourceId, targetId) {
  return ["relationship", sourceId || "unknown", targetId || "unknown"].join("-");
}

function tensionForState(state) {
  if (["hostile", "fearful", "distrustful"].includes(state)) {
    return Math.abs((stateRank.get(state) ?? 0) - stateRank.get("neutral"));
  }
  return 0;
}

function stringOrEmpty(value) {
  return String(value ?? "").trim();
}

function normalizeNotes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}
