import { buildActorLedger } from "../rules/dnd5e-lite-ledger.js";
import {
  advanceCombatTurn as advanceExistingCombatTurn,
  currentCombatActor,
  ensureCombatTurnOrder,
} from "../rules/combat-turns.js";
import { extractFirstRollFormula, rollD20, rollFormula } from "./dice-engine.js";
import { applyStateEffects } from "./state-effects.js";
import { combatActionTypes } from "./types.js";

export function getCombatState(campaign) {
  return campaign?.combat ?? { inCombat: false };
}

export function startCombat(campaign, options = {}) {
  const next = structuredClone(campaign);
  next.combat = {
    ...(next.combat ?? {}),
    inCombat: true,
    round: Number(next.combat?.round ?? 1) || 1,
    enemies: options.enemies ?? next.combat?.enemies ?? [],
    lastAction: "Combat started.",
  };
  return ensureCombatTurnOrder(next, { reroll: options.reroll ?? true, rolls: options.initiativeRolls });
}

export function getActiveCombatActor(campaign) {
  return currentCombatActor(campaign);
}

export function legalActionsForActor(campaign, actorId, options = {}) {
  const member = (campaign.party ?? []).find((item) => item.id === actorId);
  if (member) {
    return buildActorLedger(campaign, member, { mode: "combat", maxLegalOptions: options.maxLegalOptions ?? 8 }).legalOptions;
  }
  const enemy = (campaign.combat?.enemies ?? []).find((item) => item.id === actorId);
  if (enemy) {
    return [
      { id: "attack", label: `Attack with ${enemy.attackName ?? "natural weapon"}`, type: combatActionTypes.ATTACK, roll: enemy.attack ?? { bonus: enemy.attackBonus ?? 0, damage: enemy.damage ?? "1d4" }, legal: true },
      { id: "improvise", label: "Try an improvised tactic", type: combatActionTypes.IMPROVISE, roll: null, legal: true },
    ];
  }
  return [];
}

export function resolveCombatAction(campaign, action, options = {}) {
  const normalized = ensureCombatTurnOrder(campaign);
  const actor = getActiveCombatActor(normalized);
  if (!actor) throw new Error("Cannot resolve combat action without an active combat actor");
  if (action.actorId && action.actorId !== actor.id) {
    throw new Error(`Stale combat action: ${action.actorId} is not active actor ${actor.id}`);
  }

  const actionType = normalizeActionType(action.actionType ?? action.type);
  const base = {
    turnId: action.turnId ?? `combat-${Date.now()}`,
    actorId: actor.id,
    actionType,
    targetIds: action.targetIds ?? [],
    declaredText: action.declaredText ?? action.label ?? "",
    rolls: [],
    effects: [],
    narration: action.narration ?? "",
  };

  const resolved = actionType === combatActionTypes.ATTACK
    ? resolveAttack(normalized, actor, base, action, options)
    : resolveNonAttack(normalized, actor, base, action);

  const effectsResult = applyStateEffects(normalized, resolved.effects, { source: "combat_engine", turnId: base.turnId });
  const summary = resolved.summary ?? `${actor.name} resolved ${actionType}.`;
  let advanced = resolved.endsCombat
    ? endCombat(effectsResult.campaign, {
      summary,
      outcome: resolved.combatOutcome,
      resolvedAt: options.now,
    })
    : finishCombatIfResolved(effectsResult.campaign, {
      resolvedActorId: actor.id,
      summary,
      resolvedAt: options.now,
    });
  if (advanced.combat?.inCombat) {
    advanced = advanceExistingCombatTurn(advanced, {
      fromActorId: actor.id,
      summary,
    });
  }
  const actionRecord = {
    ...base,
    id: action.id ?? `combat-action-${base.turnId}`,
    rolls: resolved.rolls,
    effects: effectsResult.appliedEffects,
    narration: resolved.narration,
    createdAt: action.createdAt ?? new Date().toISOString(),
  };
  advanced = appendCombatLogs(advanced, actionRecord);

  return {
    campaign: advanced,
    actionRecord,
    rolls: resolved.rolls,
    effects: effectsResult.appliedEffects,
    proposedChanges: effectsResult.proposedChanges,
    errors: effectsResult.errors,
    nextActorId: advanced.combat?.currentTurnId ?? null,
    narrationTask: {
      task: "narrate_resolved_action",
      actionRecord,
    },
  };
}

export function finishCombatIfResolved(campaign, options = {}) {
  if (!campaign?.combat?.inCombat) {
    return campaign;
  }
  const enemiesAlive = (campaign.combat.enemies ?? []).some((enemy) => currentHp(enemy) > 0);
  const partyAlive = (campaign.party ?? []).some((member) => currentHp(member) > 0);
  if (enemiesAlive && partyAlive) {
    return campaign;
  }

  const next = structuredClone(campaign);
  next.combat = {
    ...(next.combat ?? {}),
    inCombat: false,
    currentTurnId: null,
    lastAction: options.summary ?? next.combat?.lastAction ?? "Combat resolved.",
    lastOutcome: enemiesAlive ? "party_defeated" : "enemies_defeated",
    resolvedAt: options.resolvedAt ?? new Date().toISOString(),
  };
  next.engineState = {
    ...(next.engineState ?? {}),
    mode: "rp",
  };
  return next;
}

export function endCombat(campaign, options = {}) {
  const next = structuredClone(campaign);
  next.combat = {
    ...(next.combat ?? {}),
    inCombat: false,
    currentTurnId: null,
    initiative: [],
    turnOrder: [],
    turnEconomy: {},
    lastAction: options.summary ?? next.combat?.lastAction ?? "Combat resolved.",
    lastOutcome: options.outcome || "combat_resolved",
    resolvedAt: options.resolvedAt ?? new Date().toISOString(),
  };
  next.engineState = {
    ...(next.engineState ?? {}),
    mode: "rp",
  };
  return next;
}

export function advanceCombatTurn(campaign, options = {}) {
  return advanceExistingCombatTurn(campaign, options);
}

function resolveAttack(campaign, actor, base, action, options) {
  const targetId = base.targetIds[0] ?? firstHostileTargetId(campaign, actor);
  if (!targetId) throw new Error("Attack requires a target");
  const target = findActor(campaign, targetId);
  const attack = findAttackOption(campaign, actor.id, action);
  const attackBonus = Number(action.attackBonus ?? attack?.roll?.bonus ?? attack?.roll?.attackBonus ?? 0) || 0;
  const ac = Number(target.record?.armorClass ?? target.record?.ac ?? target.record?.stats?.armorClass ?? 10) || 10;
  const attackRoll = rollD20({
    seed: `${options.seed ?? base.turnId}:attack`,
    modifier: attackBonus,
    label: "Attack roll",
    actorId: actor.id,
    targetId,
    advantage: action.advantage,
    disadvantage: action.disadvantage,
  });
  const hit = attackRoll.total >= ac;
  const rolls = [attackRoll];
  const effects = [];
  let narration = `${actor.name} attacks ${target.name}. Attack ${attackRoll.total} vs AC ${ac}: ${hit ? "hit" : "miss"}.`;
  if (hit) {
    const damageFormula = action.damageFormula ?? extractFirstRollFormula(attack?.roll?.damage ?? attack?.damage ?? action.damage ?? target.record?.incomingDamageFallback, "1d4");
    const damageRoll = rollFormula(damageFormula, {
      seed: `${options.seed ?? base.turnId}:damage`,
      label: "Damage roll",
      actorId: actor.id,
      targetId,
    });
    rolls.push(damageRoll);
    effects.push({ type: "hp_delta", targetId, amount: -damageRoll.total, reason: `${actor.name} attack hit` });
    narration += ` Damage ${damageRoll.breakdown}.`;
  }
  return {
    rolls,
    effects,
    narration,
    summary: `${actor.name} attacked ${target.name}${hit ? " and hit." : " and missed."}`,
  };
}

function resolveNonAttack(campaign, actor, base, action) {
  const effects = [];
  if (base.actionType === combatActionTypes.DODGE) {
    effects.push({ type: "condition_add", targetId: actor.id, condition: "dodging", reason: "Dodge action until next turn" });
  } else if (base.actionType === combatActionTypes.HELP) {
    effects.push({ type: "condition_add", targetId: actor.id, condition: "helping", reason: "Help action declared" });
  } else if (base.actionType === combatActionTypes.DISENGAGE) {
    effects.push({ type: "position_note", targetId: actor.id, note: action.positionNote || "Disengaged without provoking immediate pressure." });
  } else if (action.positionNote) {
    effects.push({ type: "position_note", targetId: actor.id, note: action.positionNote });
  }
  for (const effect of normalizeEffects(action.effects)) {
    effects.push(effect);
  }
  const endsCombat = action.endsCombat === true || Boolean(action.combatOutcome);
  const outcome = action.combatOutcome || inferNonlethalOutcome(base.declaredText);
  return {
    rolls: [],
    effects,
    narration: `${actor.name} ${base.declaredText || base.actionType}.`,
    summary: action.summary || `${actor.name} resolved ${base.actionType}.`,
    endsCombat,
    combatOutcome: outcome,
  };
}

function normalizeEffects(effects = []) {
  return Array.isArray(effects)
    ? effects.filter((effect) => effect && typeof effect === "object")
    : [];
}

function inferNonlethalOutcome(text = "") {
  const normalized = String(text).toLowerCase();
  if (/\bsurrender|yield|stand down\b/.test(normalized)) return "enemy_surrendered";
  if (/\bflee|retreat|run away|escape\b/.test(normalized)) return "enemies_retreat";
  if (/\bde-?escalat|calm|bargain|parley|negotiate\b/.test(normalized)) return "deescalated";
  return "combat_resolved";
}

function findAttackOption(campaign, actorId, action) {
  const actions = legalActionsForActor(campaign, actorId);
  return actions.find((option) => option.id === action.optionId) ??
    actions.find((option) => option.type === combatActionTypes.ATTACK && String(action.declaredText ?? "").toLowerCase().includes(String(option.label ?? "").toLowerCase())) ??
    actions.find((option) => option.type === combatActionTypes.ATTACK);
}

function firstHostileTargetId(campaign, actor) {
  if (actor.type === "enemy") {
    return (campaign.party ?? []).find((member) => currentHp(member) > 0)?.id ?? null;
  }
  return (campaign.combat?.enemies ?? []).find((enemy) => currentHp(enemy) > 0)?.id ?? null;
}

function findActor(campaign, actorId) {
  const party = (campaign.party ?? []).find((member) => member.id === actorId);
  if (party) return { type: "party", name: party.name ?? actorId, record: party };
  const enemy = (campaign.combat?.enemies ?? []).find((item) => item.id === actorId);
  if (enemy) return { type: "enemy", name: enemy.name ?? actorId, record: enemy };
  throw new Error(`Combat target not found: ${actorId}`);
}

function currentHp(record) {
  if (typeof record.hp === "number") return record.hp;
  if (record.hp && typeof record.hp === "object") return Number(record.hp.current ?? record.hp.max ?? 1);
  if (record.stats?.hp && typeof record.stats.hp === "object") return Number(record.stats.hp.current ?? record.stats.hp.max ?? 1);
  return 1;
}

function normalizeActionType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(combatActionTypes).includes(normalized) ? normalized : combatActionTypes.IMPROVISE;
}

function appendCombatLogs(campaign, actionRecord) {
  const next = structuredClone(campaign);
  next.combatActionLog = appendUniqueById(next.combatActionLog, [actionRecord]).slice(-500);
  if (actionRecord.rolls?.length) {
    next.diceLog = appendUniqueById(next.diceLog, actionRecord.rolls).slice(-1000);
  }
  return next;
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
  return next;
}
