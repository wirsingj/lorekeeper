import { controllerForActor } from "../src/engine/agency-controller.js";
import { getActiveCombatActor, legalActionsForActor } from "../src/engine/combat-engine.js";
import { controllerKinds } from "../src/engine/types.js";

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
      activeCue: null,
      rows: [],
    };
  }

  const active = getActiveCombatActor(campaign) ?? turnOrder.find((entry) => entry.id === activeId) ?? turnOrder[0];
  return {
    inCombat: true,
    roundLabel: `R${combat.round ?? 1}`,
    activeLabel: `${active?.name ?? "Unknown"}'s turn`,
    activeCue: buildActiveCombatCue(campaign, active, options),
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

function buildActiveCombatCue(campaign, active, options = {}) {
  if (!active?.id) {
    return null;
  }
  const controller = controllerForActor(campaign, active.id);
  const actions = legalActionsForActor(campaign, active.id, { maxLegalOptions: 5 })
    .filter((action) => action?.legal !== false)
    .slice(0, 5)
    .map((action) => ({
      id: action.id,
      label: readableActionLabel(action),
      type: action.type || "",
    }));
  const controlled = active.id === options.controlledActorId;
  const type = active.type || combatActorType(campaign, active.id);
  return {
    actorId: active.id,
    actorName: active.name || labelById(campaign, active.id),
    controllerKind: controller.kind,
    controllerLabel: activeControllerLabel(controller.kind, { controlled, type, isHostView: options.isHostView === true }),
    instruction: activeCombatInstruction(controller.kind, { controlled, type }),
    actions,
  };
}

function activeControllerLabel(kind, { controlled = false, type = "", isHostView = false } = {}) {
  if (controlled) {
    return "Your turn";
  }
  if (type === "enemy" || kind === controllerKinds.NPC_DM) {
    return "DM turn";
  }
  if (kind === controllerKinds.REMOTE_PLAYER) {
    return "Friend turn";
  }
  if (kind === controllerKinds.AI_COMPANION) {
    return "Companion turn";
  }
  if (kind === controllerKinds.HOST) {
    return isHostView ? "Your turn" : "Host turn";
  }
  return "Table turn";
}

function activeCombatInstruction(kind, { controlled = false, type = "" } = {}) {
  if (controlled) {
    return "Choose your action and send it to the host table.";
  }
  if (type === "enemy" || kind === controllerKinds.NPC_DM) {
    return "The app resolves enemy mechanics, then the DM narrates the beat.";
  }
  if (kind === controllerKinds.REMOTE_PLAYER) {
    return "Wait for the seated friend, or resolve their staged action when it arrives.";
  }
  if (kind === controllerKinds.AI_COMPANION) {
    return "Ask for a companion suggestion, stage it, or pass their turn.";
  }
  if (kind === controllerKinds.HOST) {
    return "Choose an action, roll, spell, or tactic for the active character.";
  }
  return "Host decides who speaks for this turn before resolving it.";
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
      resources: combatActorResources(campaign, entry.id || entry.actorId, entry),
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
    resources: combatActorResources(campaign, id),
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
  if (isSpent(economy.bonusAction)) {
    tags.push("Bonus spent");
  }
  if (isSpent(economy.reaction)) {
    tags.push("Reaction spent");
  }
  if (Number.isFinite(Number(economy.movementRemainingFt))) {
    tags.push(`${Number(economy.movementRemainingFt)} ft`);
  }
  tags.push(...combatResourceTags(entry.resources).slice(0, 2));

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
    const hp = normalizeHpValue(partyMember.stats?.hp ?? partyMember.hp ?? partyMember.hitPoints ?? fallback.hp);
    const temporary = numberOrNull(
      partyMember.stats?.temporaryHitPoints ??
      partyMember.stats?.tempHp ??
      partyMember.temporaryHitPoints ??
      partyMember.tempHp
    );
    if (hp && temporary !== null) {
      return { ...hp, temporary };
    }
    return hp ?? (temporary > 0 ? { current: null, max: null, temporary } : null);
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

function combatActorResources(campaign, id, fallback = {}) {
  const partyMember = (campaign.party ?? []).find((member) => member.id === id);
  if (partyMember) {
    return normalizeResources(partyMember.resources ?? partyMember.stats?.resources ?? {
      spellSlots: partyMember.stats?.spellSlots,
      uses: partyMember.stats?.uses ?? partyMember.uses,
    });
  }

  return normalizeResources(fallback.resources);
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

function combatResourceTags(resources = {}) {
  const tags = [];
  for (const [level, slot] of Object.entries(resources.spellSlots ?? {}).sort(([a], [b]) => Number(a) - Number(b))) {
    const value = resourceFraction(slot);
    if (value) {
      tags.push(`L${level} slots ${value}`);
    }
  }
  for (const [name, use] of Object.entries(resources.uses ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const value = resourceFraction(use);
    if (value) {
      tags.push(`${readableResourceName(name)} ${value}`);
    }
  }
  return tags;
}

function resourceFraction(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return "";
  }
  const max = numberOrNull(value.max ?? value.maximum ?? value.total);
  const current = numberOrNull(value.current ?? value.remaining ?? value.available);
  const used = numberOrNull(value.used ?? value.spent);
  if (current !== null && max !== null) {
    return `${current}/${max}`;
  }
  if (used !== null && max !== null) {
    return `${Math.max(0, max - used)}/${max}`;
  }
  if (current !== null) {
    return String(current);
  }
  if (max !== null) {
    return `?/${max}`;
  }
  return "";
}

function readableResourceName(value) {
  const text = String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return titleCaseToken(text);
}

function readableActionLabel(action = {}) {
  const label = String(action.label ?? "").trim();
  if (label && !/\[object Object\]/i.test(label)) {
    return label;
  }
  const type = String(action.type || action.id || "").toLowerCase();
  if (type.includes("attack")) return "Attack";
  if (type.includes("spell")) return "Cast Spell";
  if (type.includes("movement") || type.includes("move")) return "Move";
  if (type.includes("dodge")) return "Dodge";
  if (type.includes("help")) return "Help";
  return titleCaseToken(action.type || action.id || "Action");
}

function normalizeList(value) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeResources(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeHpValue(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.hidden === true || value.redacted === true || value.known === true) {
      return { current: null, max: null, temporary: 0, hidden: true };
    }
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
    return "HP ?";
  }
  const tempLabel = Number(hp.temporary) > 0 ? ` +${Number(hp.temporary)} temp` : "";
  if (hp.current !== null && hp.max !== null) {
    return `${hp.current}/${hp.max}${tempLabel}`;
  }
  if (hp.current !== null) {
    return `${hp.current}${tempLabel}`;
  }
  if (hp.max !== null) {
    return `?/${hp.max}${tempLabel}`;
  }
  return tempLabel.trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
