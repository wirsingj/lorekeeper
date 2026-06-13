const effectTypes = new Set([
  "hp_delta",
  "condition_add",
  "condition_remove",
  "resource_delta",
  "position_note",
  "inventory_add",
  "quest_note",
]);

export function validateStateEffect(effect, campaign) {
  if (!effect || typeof effect !== "object" || !effectTypes.has(effect.type)) {
    return "effect type is not supported";
  }
  if (requiresTarget(effect.type) && !findActorRecord(campaign, effect.targetId)) {
    return `target not found: ${effect.targetId || "(missing)"}`;
  }
  if (effect.type === "hp_delta" && !Number.isFinite(Number(effect.amount))) {
    return "hp_delta amount must be numeric";
  }
  if (effect.type === "resource_delta" && (!effect.resource || !Number.isFinite(Number(effect.amount)))) {
    return "resource_delta requires resource and numeric amount";
  }
  if ((effect.type === "inventory_add" || effect.type === "quest_note") && effect.reviewRequired !== false) {
    return null;
  }
  return null;
}

export function applyStateEffects(campaign, effects = [], options = {}) {
  const next = structuredClone(campaign);
  const appliedEffects = [];
  const proposedChanges = [];
  const errors = [];

  for (const effect of effects) {
    const validationError = validateStateEffect(effect, next);
    if (validationError) {
      errors.push({ effect, error: validationError });
      continue;
    }
    if (effect.reviewRequired === true) {
      proposedChanges.push(effectToProposedChange(effect, options));
      continue;
    }
    applyEffect(next, effect);
    const loggedEffect = {
      id: effect.id ?? `effect-${Date.now()}-${appliedEffects.length + 1}`,
      ...effect,
      source: options.source ?? effect.source ?? "app_engine",
      turnId: options.turnId ?? effect.turnId ?? null,
      createdAt: effect.createdAt ?? options.now ?? new Date().toISOString(),
      status: "applied",
    };
    appliedEffects.push(loggedEffect);
  }

  if (appliedEffects.length) {
    next.stateEffectLog = appendUniqueById(next.stateEffectLog, appliedEffects);
  }

  return { campaign: next, appliedEffects, proposedChanges, errors };
}

function applyEffect(campaign, effect) {
  if (effect.type === "hp_delta") {
    applyHpDelta(campaign, effect);
  } else if (effect.type === "condition_add") {
    const record = findActorRecord(campaign, effect.targetId).record;
    record.conditions = unique([...(record.conditions ?? []), effect.condition]);
  } else if (effect.type === "condition_remove") {
    const record = findActorRecord(campaign, effect.targetId).record;
    record.conditions = (record.conditions ?? []).filter((condition) => condition !== effect.condition);
  } else if (effect.type === "resource_delta") {
    const record = findActorRecord(campaign, effect.targetId).record;
    record.resources = record.resources ?? {};
    record.resources[effect.resource] = Number(record.resources[effect.resource] ?? 0) + Number(effect.amount);
  } else if (effect.type === "position_note") {
    const record = findActorRecord(campaign, effect.targetId).record;
    record.positionNotes = [...(record.positionNotes ?? []), effect.note].filter(Boolean).slice(-10);
  } else if (effect.type === "inventory_add") {
    campaign.inventory = [...(campaign.inventory ?? []), { ownerId: effect.targetId, itemId: effect.itemId }];
  } else if (effect.type === "quest_note") {
    const quest = (campaign.quests ?? []).find((item) => item.id === effect.questId);
    if (quest) {
      quest.notes = [...(quest.notes ?? []), effect.note].filter(Boolean);
    }
  }
}

function applyHpDelta(campaign, effect) {
  const target = findActorRecord(campaign, effect.targetId).record;
  const amount = Number(effect.amount);
  if (target.stats?.hp && typeof target.stats.hp === "object") {
    target.stats.hp.current = clampHp(Number(target.stats.hp.current ?? target.stats.hp.max ?? 0) + amount, target.stats.hp.max);
    return;
  }
  if (target.hp && typeof target.hp === "object") {
    target.hp.current = clampHp(Number(target.hp.current ?? target.hp.max ?? 0) + amount, target.hp.max);
    return;
  }
  if (typeof target.hp === "number") {
    target.hp = Math.max(0, target.hp + amount);
    return;
  }
  target.hp = { current: Math.max(0, amount), max: null };
}

function clampHp(value, max) {
  const numericMax = Number(max);
  const lowerBound = Math.max(0, Number(value) || 0);
  return Number.isFinite(numericMax) && numericMax > 0 ? Math.min(numericMax, lowerBound) : lowerBound;
}

function findActorRecord(campaign, actorId) {
  const partyMember = (campaign?.party ?? []).find((item) => item.id === actorId);
  if (partyMember) return { kind: "party", record: partyMember };
  const enemy = (campaign?.combat?.enemies ?? []).find((item) => item.id === actorId);
  if (enemy) return { kind: "enemy", record: enemy };
  const person = (campaign?.people ?? []).find((item) => item.id === actorId);
  if (person) return { kind: "person", record: person };
  return null;
}

function requiresTarget(type) {
  return ["hp_delta", "condition_add", "condition_remove", "resource_delta", "position_note", "inventory_add"].includes(type);
}

function effectToProposedChange(effect, options) {
  return {
    id: `proposed-${effect.type}-${Date.now()}`,
    type: effect.type,
    status: "pending_review",
    source: options.source ?? "app_engine",
    effect,
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function appendUniqueById(existing = [], additions = []) {
  const seen = new Set(existing.map((item) => item.id).filter(Boolean));
  const next = existing.slice();
  for (const item of additions) {
    if (item.id && seen.has(item.id)) {
      continue;
    }
    next.push(item);
    if (item.id) seen.add(item.id);
  }
  return next.slice(-1000);
}
