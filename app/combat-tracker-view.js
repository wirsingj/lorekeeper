import { getActiveCombatActor } from "../src/engine/combat-engine.js";

export function buildCombatTrackerView(campaign, options = {}) {
  const combat = campaign.combat ?? {};
  const turnOrder = normalizedCombatTurnOrder(campaign);
  const activeId = combat.currentTurnId || turnOrder[0]?.id || null;
  const inCombat = Boolean(combat.inCombat && turnOrder.length);
  if (!inCombat) {
    return {
      inCombat: false,
      roundLabel: "",
      activeLabel: "No active turn.",
      rows: [],
    };
  }

  const active = getActiveCombatActor(campaign) ?? turnOrder.find((entry) => entry.id === activeId) ?? turnOrder[0];
  return {
    inCombat: true,
    roundLabel: `R${combat.round ?? 1}`,
    activeLabel: `${active?.name ?? "Unknown"}'s turn`,
    activeId,
    rows: turnOrder.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      active: entry.id === activeId,
      controlled: entry.id === options.controlledActorId,
      defeated: entry.defeated,
      meta: combatOrderMeta(entry, options.controlledActorId),
      hpLabel: combatHpLabel(entry.hp, {
        hidden: entry.type === "enemy" && options.hideEnemyHp === true,
      }),
    })),
  };
}

export function normalizedCombatTurnOrder(campaign) {
  const combat = campaign.combat ?? {};
  const explicit = Array.isArray(combat.turnOrder) ? combat.turnOrder : [];
  if (explicit.length) {
    return explicit.map((entry) => ({
      id: entry.id || entry.actorId,
      name: entry.name || labelById(campaign, entry.id || entry.actorId),
      type: entry.type || combatActorType(campaign, entry.id || entry.actorId),
      initiativeRoll: entry.initiativeRoll ?? null,
      initiativeModifier: entry.initiativeModifier ?? 0,
      initiativeScore: entry.initiativeScore ?? entry.initiative ?? null,
      hp: combatActorHp(campaign, entry.id || entry.actorId, entry),
      conditions: combatActorConditions(campaign, entry.id || entry.actorId, entry),
      turnEconomy: combat.turnEconomy?.[entry.id || entry.actorId] ?? entry.turnEconomy ?? {},
      defeated: combatActorDefeated(campaign, entry.id || entry.actorId, entry),
    })).filter((entry) => entry.id);
  }
  const initiativeIds = combat.initiative?.length
    ? combat.initiative
    : [
        ...(campaign.scene?.presentPartyMemberIds?.length ? campaign.scene.presentPartyMemberIds : (campaign.party ?? []).map((member) => member.id)),
        ...(combat.enemies ?? []).map((enemy) => enemy.id).filter(Boolean),
      ];
  return initiativeIds.map((id) => ({
    id,
    name: labelById(campaign, id),
    type: combatActorType(campaign, id),
    initiativeRoll: null,
    initiativeModifier: 0,
    initiativeScore: null,
    hp: combatActorHp(campaign, id),
    conditions: combatActorConditions(campaign, id),
    turnEconomy: combat.turnEconomy?.[id] ?? {},
    defeated: combatActorDefeated(campaign, id),
  }));
}

export function combatActorType(campaign, id) {
  if ((campaign.party ?? []).some((member) => member.id === id)) {
    return "party";
  }
  if ((campaign.combat?.enemies ?? []).some((enemy) => enemy.id === id)) {
    return "enemy";
  }
  return "unknown";
}

function combatOrderMeta(entry, controlledActorId) {
  const tags = [];
  if (entry.id === controlledActorId) {
    tags.push("You");
  } else if (entry.type === "enemy") {
    tags.push("DM");
  } else {
    tags.push("Party");
  }

  if (entry.defeated) {
    tags.push("Defeated");
  }
  tags.push(...(entry.conditions ?? [])
    .filter((condition) => !isDefeatedCondition(condition))
    .slice(0, 2)
    .map(titleCaseToken));

  const economy = entry.turnEconomy ?? {};
  if (isSpent(economy.action)) {
    tags.push("Action spent");
  }
  if (Number.isFinite(Number(economy.movementRemainingFt))) {
    tags.push(`${Number(economy.movementRemainingFt)} ft`);
  }

  return tags.join(" / ");
}

function labelById(campaign, id) {
  return (
    (campaign.party ?? []).find((item) => item.id === id)?.name ||
    (campaign.people ?? []).find((item) => item.id === id)?.name ||
    (campaign.places ?? []).find((item) => item.id === id)?.name ||
    (campaign.items ?? []).find((item) => item.id === id)?.name ||
    (campaign.quests ?? []).find((item) => item.id === id)?.title ||
    (campaign.combat?.enemies ?? []).find((item) => item.id === id)?.name ||
    id
  );
}

function combatActorHp(campaign, id, fallback = {}) {
  const partyMember = (campaign.party ?? []).find((member) => member.id === id);
  if (partyMember) {
    return normalizeHpValue(partyMember.stats?.hp ?? partyMember.hp ?? partyMember.hitPoints ?? fallback.hp);
  }

  const enemy = (campaign.combat?.enemies ?? []).find((item) => item.id === id);
  if (enemy) {
    return normalizeHpValue(enemy.hp ?? enemy.hitPoints ?? fallback.hp);
  }

  return normalizeHpValue(fallback.hp);
}

function combatActorConditions(campaign, id, fallback = {}) {
  const partyMember = (campaign.party ?? []).find((member) => member.id === id);
  if (partyMember) {
    return normalizeList(partyMember.conditions ?? partyMember.stats?.conditions ?? fallback.conditions);
  }

  const enemy = (campaign.combat?.enemies ?? []).find((item) => item.id === id);
  if (enemy) {
    return normalizeList(enemy.conditions ?? enemy.stats?.conditions ?? fallback.conditions);
  }

  return normalizeList(fallback.conditions);
}

function combatActorDefeated(campaign, id, fallback = {}) {
  const hp = combatActorHp(campaign, id, fallback);
  if (hp?.current !== null && hp?.current <= 0) {
    return true;
  }
  return combatActorConditions(campaign, id, fallback).some(isDefeatedCondition);
}

function isDefeatedCondition(condition) {
  return /^(dead|defeated|destroyed|unconscious)$/i.test(String(condition ?? "").trim());
}

function isSpent(value) {
  return value === true || /^(spent|used|unavailable)$/i.test(String(value ?? ""));
}

function titleCaseToken(value) {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeHpValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const current = numberOrNull(value.current ?? value.value ?? value.hp);
    const max = numberOrNull(value.max ?? value.maximum ?? value.total);
    return current === null && max === null
      ? null
      : { current, max, temporary: numberOrNull(value.temporary ?? value.temp) ?? 0 };
  }
  if (typeof value === "string") {
    const match = value.match(/(-?\d+)\s*\/\s*(-?\d+)/);
    if (match) {
      return { current: Number(match[1]), max: Number(match[2]), temporary: 0 };
    }
  }
  const number = numberOrNull(value);
  return number === null ? null : { current: number, max: number, temporary: 0 };
}

function combatHpLabel(hp, options = {}) {
  if (!hp) {
    return "";
  }
  if (options.hidden) {
    return hp.current !== null ? "HP ?" : "";
  }
  if (hp.current !== null && hp.max !== null) {
    return `${hp.current}/${hp.max}`;
  }
  if (hp.current !== null) {
    return String(hp.current);
  }
  if (hp.max !== null) {
    return `?/${hp.max}`;
  }
  return "";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
