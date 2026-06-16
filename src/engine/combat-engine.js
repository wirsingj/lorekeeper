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
    : actionType === combatActionTypes.SPELL
      ? resolveSpell(normalized, actor, base, action, options)
    : actionType === combatActionTypes.CHECK || hasCheckResolution(action)
      ? resolveCombatCheck(normalized, actor, base, action, options)
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

function resolveCombatCheck(campaign, actor, base, action, options) {
  const targetId = base.targetIds[0] ?? action.targetId ?? action.contest?.targetId ?? null;
  const target = targetId ? findActor(campaign, targetId) : null;
  const actorAbility = normalizeAbility(action.ability ?? action.check?.ability ?? action.contest?.actorAbility);
  const actorSkill = normalizeSkill(action.skill ?? action.check?.skill ?? action.contest?.actorSkill);
  const actorModifier = numberOrNull(action.modifier ?? action.check?.modifier ?? action.contest?.actorModifier)
    ?? checkModifier(findActor(campaign, actor.id).record, { ability: actorAbility, skill: actorSkill });
  const actorRoll = rollD20({
    seed: `${options.seed ?? base.turnId}:check`,
    modifier: actorModifier,
    label: action.label || checkLabel({ skill: actorSkill, ability: actorAbility, contest: Boolean(target) }),
    actorId: actor.id,
    targetId,
    advantage: action.advantage,
    disadvantage: action.disadvantage,
  });
  const rolls = [actorRoll];
  let success = false;
  let resultText = "";

  if (target) {
    const targetAbility = normalizeAbility(action.contest?.targetAbility ?? action.targetAbility ?? contestDefaultTargetAbility(actorSkill, actorAbility));
    const targetSkill = normalizeSkill(action.contest?.targetSkill ?? action.targetSkill);
    const targetModifier = numberOrNull(action.contest?.targetModifier ?? action.targetModifier)
      ?? checkModifier(target.record, { ability: targetAbility, skill: targetSkill });
    const targetRoll = rollD20({
      seed: `${options.seed ?? base.turnId}:contest:${targetId}`,
      modifier: targetModifier,
      label: action.contest?.targetLabel || checkLabel({ skill: targetSkill, ability: targetAbility, contest: true, defender: true }),
      actorId: targetId,
      targetId: actor.id,
      advantage: action.contest?.targetAdvantage,
      disadvantage: action.contest?.targetDisadvantage,
    });
    rolls.push(targetRoll);
    success = actorRoll.total >= targetRoll.total;
    resultText = `${actor.name} ${success ? "beats" : "does not beat"} ${target.name}: ${actorRoll.total} vs ${targetRoll.total}.`;
  } else {
    const dc = Number(action.dc ?? action.check?.dc ?? 10) || 10;
    success = actorRoll.total >= dc;
    resultText = `${actor.name} ${success ? "meets" : "misses"} DC ${dc}: ${actorRoll.total}.`;
  }

  const effects = normalizeEffects(success ? action.successEffects : action.failureEffects);
  const outcomeLabel = success ? "success" : "failure";
  return {
    rolls,
    effects,
    narration: `${actor.name} attempts ${base.declaredText || actorRoll.label || "a combat check"}. ${resultText}`,
    summary: action.summary || `${actor.name} resolved a combat check with ${outcomeLabel}.`,
  };
}

function resolveSpell(campaign, actor, base, action, options) {
  const spell = findSpellOption(campaign, actor.id, action);
  const spellName = action.spellName || spellNameFromOption(spell) || base.declaredText || "spell";
  const targetIds = base.targetIds.length ? base.targetIds : [firstHostileTargetId(campaign, actor)].filter(Boolean);
  const rolls = [];
  const effects = [];
  const resourceEffects = spellResourceEffects(actor.id, spell, action);
  effects.push(...resourceEffects);

  if (!targetIds.length && !action.effects?.length && !action.successEffects?.length) {
    return {
      rolls,
      effects,
      narration: `${actor.name} casts ${spellName}.`,
      summary: `${actor.name} cast ${spellName}.`,
    };
  }

  const spellSave = action.save || action.savingThrow || spell?.roll?.save || null;
  const damageFormula = action.damageFormula ?? action.damage ?? spell?.roll?.damage ?? spell?.damage ?? null;
  const healingFormula = action.healingFormula ?? action.healing ?? spell?.roll?.healing ?? null;
  const dc = Number(action.dc ?? spellSave?.dc ?? spell?.roll?.dc ?? spellSaveDc(findActor(campaign, actor.id).record)) || 10;
  const saveAbility = normalizeAbility(spellSave?.ability ?? action.saveAbility ?? "DEX") || "DEX";
  const affected = [];

  for (const targetId of targetIds) {
    const target = findActor(campaign, targetId);
    let failedSave = true;
    if (spellSave || action.saveAbility || action.dc !== undefined) {
      const targetModifier = numberOrNull(action.targetSaveModifier ?? spellSave?.modifier)
        ?? checkModifier(target.record, { ability: saveAbility });
      const saveRoll = rollD20({
        seed: `${options.seed ?? base.turnId}:save:${targetId}`,
        modifier: targetModifier,
        label: `${saveAbility} save`,
        actorId: targetId,
        targetId: actor.id,
        advantage: spellSave?.advantage,
        disadvantage: spellSave?.disadvantage,
      });
      rolls.push(saveRoll);
      failedSave = saveRoll.total < dc;
      affected.push(`${target.name} ${failedSave ? "fails" : "succeeds"} ${saveAbility} save ${saveRoll.total} vs DC ${dc}`);
    }

    const condition = action.conditionOnFail ?? spellSave?.conditionOnFail ?? action.condition;
    if (failedSave && condition) {
      effects.push({ type: "condition_add", targetId, condition, reason: `${spellName} failed save` });
    }
    if (!failedSave && action.conditionOnSuccess) {
      effects.push({ type: "condition_add", targetId, condition: action.conditionOnSuccess, reason: `${spellName} successful save` });
    }
    if (damageFormula) {
      const damageRoll = rollFormula(extractFirstRollFormula(damageFormula, "1d6"), {
        seed: `${options.seed ?? base.turnId}:spell-damage:${targetId}`,
        label: `${spellName} damage`,
        actorId: actor.id,
        targetId,
      });
      rolls.push(damageRoll);
      const multiplier = !failedSave && action.halfDamageOnSave === true ? 0.5 : failedSave ? 1 : 0;
      const amount = Math.floor(damageRoll.total * multiplier);
      if (amount > 0) {
        effects.push({ type: "hp_delta", targetId, amount: -amount, reason: `${spellName} damage` });
      }
    }
    if (healingFormula) {
      const healingRoll = rollFormula(extractFirstRollFormula(healingFormula, "1d4"), {
        seed: `${options.seed ?? base.turnId}:spell-healing:${targetId}`,
        label: `${spellName} healing`,
        actorId: actor.id,
        targetId,
      });
      rolls.push(healingRoll);
      effects.push({ type: "hp_delta", targetId, amount: healingRoll.total, reason: `${spellName} healing` });
    }
  }

  for (const effect of normalizeEffects(action.effects)) {
    effects.push(effect);
  }
  if (!spellSave && !action.saveAbility && action.dc === undefined) {
    for (const effect of normalizeEffects(action.successEffects)) {
      effects.push(effect);
    }
  }

  return {
    rolls,
    effects,
    narration: `${actor.name} casts ${spellName}.${affected.length ? ` ${affected.join("; ")}.` : ""}`,
    summary: action.summary || `${actor.name} cast ${spellName}.`,
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

function hasCheckResolution(action = {}) {
  return Boolean(action.check || action.contest || action.dc !== undefined || action.skill || action.ability);
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

function findSpellOption(campaign, actorId, action) {
  const actions = legalActionsForActor(campaign, actorId);
  const desiredName = normalizeSkill(action.spellName || action.label || action.declaredText || "");
  return actions.find((option) => option.id === action.optionId) ??
    actions.find((option) => option.type === combatActionTypes.SPELL && desiredName && normalizeSkill(option.label || "").includes(desiredName)) ??
    actions.find((option) => option.type === combatActionTypes.SPELL);
}

function spellNameFromOption(option) {
  return String(option?.label || "").replace(/^cast\s+/i, "").trim();
}

function spellResourceEffects(actorId, spell, action) {
  const slotLevel = action.slotLevel ?? action.spellSlotLevel ?? spell?.cost?.spellSlot ?? null;
  if (!slotLevel || Number(slotLevel) <= 0) {
    return [];
  }
  return [{
    type: "resource_delta",
    targetId: actorId,
    resource: `spellSlots.${slotLevel}.used`,
    amount: 1,
    reason: `${action.spellName || spellNameFromOption(spell) || "Spell"} slot spent`,
  }];
}

function spellSaveDc(record = {}) {
  const explicit = Number(record.spellSaveDc ?? record.stats?.spellSaveDc ?? record.stats?.spellcasting?.saveDc);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  const ancestryClass = String(record.ancestryClass || record.class || record.role || "").toLowerCase();
  const ability = /\b(wizard|artificer|arcane)\b/.test(ancestryClass) ? "INT"
    : /\b(bard|sorcerer|warlock|paladin)\b/.test(ancestryClass) ? "CHA"
      : /\b(cleric|druid|ranger)\b/.test(ancestryClass) ? "WIS"
        : "WIS";
  return 8 + proficiencyBonus(record) + abilityModifier(abilityScore(record, ability));
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

function checkModifier(record = {}, { ability, skill } = {}) {
  if (skill) {
    const explicitSkillBonus = explicitSkillModifier(record, skill);
    if (explicitSkillBonus !== null) {
      return explicitSkillBonus;
    }
  }
  const score = abilityScore(record, ability || abilityForSkill(skill) || "STR");
  const base = abilityModifier(score);
  const skills = normalizedSkillNames(record);
  const proficient = skill && skills.has(normalizeSkill(skill));
  return base + (proficient ? proficiencyBonus(record) : 0);
}

function explicitSkillModifier(record = {}, skill) {
  const normalized = normalizeSkill(skill);
  const candidates = [
    record.skillBonuses,
    record.skills,
    record.stats?.skillBonuses,
    record.stats?.skills,
  ];
  for (const source of candidates) {
    if (!source) continue;
    if (Array.isArray(source)) {
      const match = source.find((entry) =>
        typeof entry === "object" && normalizeSkill(entry.name ?? entry.skill ?? entry.id) === normalized && entry.bonus !== undefined
      );
      if (match) return Number(match.bonus) || 0;
      continue;
    }
    if (typeof source === "object") {
      const value = source[skill] ?? source[normalized] ?? source[normalized.replace(/\s+/g, "_")];
      if (value !== undefined && value !== null && value !== true) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
  }
  return null;
}

function normalizedSkillNames(record = {}) {
  const values = [
    ...(Array.isArray(record.skills) ? record.skills : []),
    ...(Array.isArray(record.proficiencies) ? record.proficiencies : []),
    ...(Array.isArray(record.specialties) ? record.specialties : []),
    ...(Array.isArray(record.stats?.skills) ? record.stats.skills : []),
    ...skillMapNames(record.skills),
    ...skillMapNames(record.proficiencies),
    ...skillMapNames(record.stats?.skills),
  ];
  return new Set(values
    .map((item) => normalizeSkill(typeof item === "object" ? item.name ?? item.skill ?? item.id : item))
    .filter(Boolean));
}

function skillMapNames(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return [];
  }
  return Object.entries(value)
    .filter(([, proficient]) => proficient === true || proficient === "true" || proficient === "proficient")
    .map(([name]) => name);
}

function abilityScore(record = {}, ability = "STR") {
  const label = normalizeAbility(ability);
  const aliases = [label, label.toLowerCase(), abilityName(label)];
  for (const source of [record.stats?.abilityScores, record.abilityScores, record.stats?.abilities, record.abilities]) {
    for (const alias of aliases) {
      if (source?.[alias] !== undefined && source?.[alias] !== null) {
        const parsed = Number(source[alias]);
        return Number.isFinite(parsed) ? parsed : 10;
      }
    }
  }
  const direct = record[abilityName(label)] ?? record[label.toLowerCase()];
  const parsed = Number(direct);
  return Number.isFinite(parsed) ? parsed : 10;
}

function abilityModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function proficiencyBonus(record = {}) {
  const level = Number(record.level ?? record.stats?.level ?? record.characterLevel ?? 1) || 1;
  const explicit = Number(record.proficiencyBonus ?? record.stats?.proficiencyBonus);
  return Number.isFinite(explicit) && explicit > 0 ? explicit : Math.max(2, Math.ceil(level / 4) + 1);
}

function normalizeAbility(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const aliases = {
    STRENGTH: "STR",
    DEXTERITY: "DEX",
    CONSTITUTION: "CON",
    INTELLIGENCE: "INT",
    WISDOM: "WIS",
    CHARISMA: "CHA",
  };
  return ["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(normalized) ? normalized : aliases[normalized] || "";
}

function normalizeSkill(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function abilityForSkill(skill) {
  const normalized = normalizeSkill(skill);
  return {
    athletics: "STR",
    acrobatics: "DEX",
    stealth: "DEX",
    "sleight of hand": "DEX",
    arcana: "INT",
    history: "INT",
    investigation: "INT",
    nature: "INT",
    religion: "INT",
    "animal handling": "WIS",
    insight: "WIS",
    medicine: "WIS",
    perception: "WIS",
    survival: "WIS",
    deception: "CHA",
    intimidation: "CHA",
    performance: "CHA",
    persuasion: "CHA",
  }[normalized] || "";
}

function abilityName(ability) {
  return {
    STR: "strength",
    DEX: "dexterity",
    CON: "constitution",
    INT: "intelligence",
    WIS: "wisdom",
    CHA: "charisma",
  }[ability] || "";
}

function contestDefaultTargetAbility(actorSkill, actorAbility) {
  if (normalizeSkill(actorSkill) === "athletics") return "STR";
  if (normalizeSkill(actorSkill) === "intimidation") return "WIS";
  return actorAbility || "DEX";
}

function checkLabel({ skill, ability, contest, defender } = {}) {
  const prefix = defender ? "Opposed " : contest ? "Contest " : "";
  const detail = skill ? titleCase(skill) : ability || "Check";
  return `${prefix}${detail} check`;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
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
