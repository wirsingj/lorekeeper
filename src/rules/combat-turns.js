export function ensureCombatTurnOrder(campaign, options = {}) {
  const next = structuredClone(campaign);
  next.combat = {
    ...(next.combat ?? {}),
    inCombat: true,
    round: next.combat?.round ?? 1,
  };

  const existingOrder = normalizeExistingOrder(next);
  const missingCombatants = combatants(next).some((combatant) => !existingOrder.some((entry) => entry.id === combatant.id));
  if (existingOrder.length && options.reroll !== true && !missingCombatants) {
    next.combat.turnOrder = existingOrder;
    next.combat.initiative = existingOrder.map((entry) => entry.id);
    next.combat.currentTurnId = next.combat.currentTurnId || existingOrder[0]?.id || null;
    next.combat.turnEconomy = {
      ...(next.combat.turnEconomy ?? {}),
      ...turnEconomyForActor(next, next.combat.currentTurnId, { preserveExisting: true }),
    };
    return next;
  }

  const roll = typeof options.roll === "function" ? options.roll : defaultD20;
  const rolledOrder = combatants(next)
    .map((combatant) => {
      const naturalRoll = clampRoll(Number(options.rolls?.[combatant.id] ?? roll(combatant)) || 10);
      const dexMod = dexterityModifier(combatant.record);
      return {
        id: combatant.id,
        name: combatant.name,
        type: combatant.type,
        initiativeRoll: naturalRoll,
        initiativeModifier: dexMod,
        initiativeScore: naturalRoll + dexMod,
      };
    })
    .sort((a, b) => b.initiativeScore - a.initiativeScore || b.initiativeRoll - a.initiativeRoll || a.name.localeCompare(b.name));

  next.combat.turnOrder = rolledOrder;
  next.combat.initiative = rolledOrder.map((entry) => entry.id);
  next.combat.currentTurnId = rolledOrder[0]?.id ?? null;
  next.combat.round = next.combat.round ?? 1;
  next.combat.turnEconomy = {
    ...(next.combat.turnEconomy ?? {}),
    ...turnEconomyForActor(next, next.combat.currentTurnId, { preserveExisting: true }),
  };
  next.combat.lastAction = next.combat.lastAction ?? "Initiative rolled.";
  return next;
}

export function advanceCombatTurn(campaign, options = {}) {
  const next = ensureCombatTurnOrder(campaign);
  const order = next.combat.turnOrder ?? [];
  if (!order.length) {
    return next;
  }

  const fromActorId = options.fromActorId || next.combat.currentTurnId;
  const currentIndex = Math.max(0, order.findIndex((entry) => entry.id === fromActorId));
  const nextIndex = (currentIndex + 1) % order.length;
  const wrapped = nextIndex === 0;
  const nextActor = order[nextIndex];
  next.combat.currentTurnId = nextActor.id;
  next.combat.round = Math.max(1, Number(next.combat.round) || 1) + (wrapped ? 1 : 0);
  next.combat.turnEconomy = {
    ...(next.combat.turnEconomy ?? {}),
    ...turnEconomyForActor(next, nextActor.id),
  };
  next.combat.lastAction = options.summary || next.combat.lastAction || "Combat turn advanced.";
  return next;
}

export function currentCombatActor(campaign) {
  if (!campaign?.combat?.inCombat) {
    return null;
  }
  const normalized = ensureCombatTurnOrder(campaign);
  return (normalized.combat.turnOrder ?? []).find((entry) => entry.id === normalized.combat.currentTurnId) ?? null;
}

export function isActorCurrentCombatTurn(campaign, actorId) {
  const current = currentCombatActor(campaign);
  return Boolean(current && actorId && current.id === actorId);
}

function normalizeExistingOrder(campaign) {
  const order = Array.isArray(campaign.combat?.turnOrder) ? campaign.combat.turnOrder : [];
  if (order.length) {
    return order
      .map((entry) => ({
        id: String(entry.id || entry.actorId || "").trim(),
        name: String(entry.name || labelForId(campaign, entry.id || entry.actorId)).trim(),
        type: entry.type || actorType(campaign, entry.id || entry.actorId),
        initiativeRoll: numberOrNull(entry.initiativeRoll),
        initiativeModifier: numberOrNull(entry.initiativeModifier) ?? 0,
        initiativeScore: numberOrNull(entry.initiativeScore) ?? numberOrNull(entry.initiative) ?? 0,
      }))
      .filter((entry) => entry.id);
  }

  const ids = Array.isArray(campaign.combat?.initiative) ? campaign.combat.initiative : [];
  return ids
    .map((id) => ({
      id,
      name: labelForId(campaign, id),
      type: actorType(campaign, id),
      initiativeRoll: null,
      initiativeModifier: 0,
      initiativeScore: null,
    }))
    .filter((entry) => entry.id);
}

function combatants(campaign) {
  const presentIds = campaign.scene?.presentPartyMemberIds?.length
    ? campaign.scene.presentPartyMemberIds
    : (campaign.party ?? []).map((member) => member.id);
  const party = presentIds
    .map((id) => (campaign.party ?? []).find((member) => member.id === id))
    .filter(Boolean)
    .map((member) => ({
      id: member.id,
      name: member.name || member.id,
      type: "party",
      record: member,
    }));
  const enemies = (campaign.combat?.enemies ?? [])
    .map((enemy) => ({
      id: enemy.id,
      name: enemy.name || enemy.title || enemy.id || "Enemy",
      type: "enemy",
      record: enemy,
    }))
    .filter((enemy) => enemy.id);
  return [...party, ...enemies];
}

function turnEconomyForActor(campaign, actorId, options = {}) {
  if (!actorId || !(campaign.party ?? []).some((member) => member.id === actorId)) {
    return {};
  }
  if (options.preserveExisting && campaign.combat?.turnEconomy?.[actorId]) {
    return {
      [actorId]: campaign.combat.turnEconomy[actorId],
    };
  }
  const member = campaign.party.find((item) => item.id === actorId);
  const speed = Number(member?.speedFt ?? member?.speed ?? member?.stats?.speedFt ?? member?.stats?.speed ?? 30) || 30;
  return {
    [actorId]: {
      action: "available",
      bonusAction: "available",
      reaction: campaign.combat?.turnEconomy?.[actorId]?.reaction ?? "available",
      movementRemainingFt: speed,
      freeObjectInteraction: "available",
    },
  };
}

function dexterityModifier(record = {}) {
  const explicitModifier = record.dexMod ?? record.initiativeModifier ?? record.stats?.dexMod ?? record.stats?.initiativeModifier;
  if (explicitModifier !== undefined && explicitModifier !== null) {
    const modifier = Number(explicitModifier);
    return Number.isFinite(modifier) ? modifier : 0;
  }

  const raw = record.stats?.abilityScores?.DEX ??
    record.stats?.abilityScores?.dex ??
    record.abilityScores?.DEX ??
    record.abilityScores?.dex ??
    record.stats?.abilities?.DEX ??
    record.stats?.abilities?.dex ??
    record.dexterity ??
    record.dex ??
    10;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor((value - 10) / 2);
}

function defaultD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function clampRoll(value) {
  return Math.max(1, Math.min(20, Math.round(value)));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function labelForId(campaign, id) {
  return (
    (campaign.party ?? []).find((member) => member.id === id)?.name ||
    (campaign.combat?.enemies ?? []).find((enemy) => enemy.id === id)?.name ||
    id
  );
}

function actorType(campaign, id) {
  if ((campaign.party ?? []).some((member) => member.id === id)) {
    return "party";
  }
  if ((campaign.combat?.enemies ?? []).some((enemy) => enemy.id === id)) {
    return "enemy";
  }
  return "unknown";
}
