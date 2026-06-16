import { resolveCombatAction } from "../src/engine/combat-engine.js";

export function resolveEnemyCombatTurn(campaign, currentActor, turnKey) {
  return resolveCombatAction(campaign, {
    turnId: `enemy-turn-${String(turnKey).replace(/[^a-z0-9_-]+/gi, "-")}`,
    actorId: currentActor.id,
    actionType: "attack",
    declaredText: `${currentActor.name} takes their combat turn.`,
  }, { seed: `enemy-turn:${campaign.id}:${turnKey}` });
}

export function engineCombatResolutionChange(previousCampaign, resolution, options = {}) {
  const nextCampaign = resolution.campaign;
  return {
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: options.summary || resolution.actionRecord?.summary || "Combat turn resolved by LoreKeeper.",
    data: {
      ...(nextCampaign.combat ?? {}),
      actorUpdates: changedPartyActorUpdates(previousCampaign, nextCampaign),
      combatActionLog: [resolution.actionRecord].filter(Boolean),
      diceLog: resolution.actionRecord?.rolls ?? [],
      stateEffectLog: resolution.actionRecord?.effects ?? [],
      lastAction: resolution.actionRecord?.summary || nextCampaign.combat?.lastAction || "Combat turn resolved by LoreKeeper.",
    },
    confidence: "high",
    reason: "LoreKeeper resolved the active combat actor with app-owned rules before narration.",
  };
}

export function combatResolutionMessage(resolution) {
  return {
    role: "dm",
    title: "DM",
    body: resolution.actionRecord.narration,
    source: "combat_engine",
    meta: "Mechanics resolved by LoreKeeper.",
    data: {
      kind: "combat_engine_resolution",
      actionRecord: resolution.actionRecord,
      nextActorId: resolution.nextActorId,
    },
  };
}

function changedPartyActorUpdates(previousCampaign, nextCampaign) {
  const previousById = new Map((previousCampaign?.party ?? []).map((member) => [member.id, member]));
  return (nextCampaign?.party ?? []).flatMap((member) => {
    const previous = previousById.get(member.id);
    if (!previous) {
      return [];
    }
    const update = { actorId: member.id };
    const previousHp = JSON.stringify(previous.stats?.hp ?? previous.hp ?? null);
    const nextHp = JSON.stringify(member.stats?.hp ?? member.hp ?? null);
    const previousResources = JSON.stringify(previous.resources ?? previous.stats?.resources ?? null);
    const nextResources = JSON.stringify(member.resources ?? member.stats?.resources ?? null);
    const previousConditions = JSON.stringify(previous.conditions ?? previous.stats?.conditions ?? []);
    const nextConditions = JSON.stringify(member.conditions ?? member.stats?.conditions ?? []);
    if (previousHp !== nextHp) {
      update.hp = member.stats?.hp ?? member.hp;
    }
    if (previousResources !== nextResources) {
      update.resources = member.resources ?? member.stats?.resources;
      update.spellSlots = member.resources?.spellSlots ?? member.stats?.spellSlots;
    }
    if (previousConditions !== nextConditions) {
      update.conditions = member.conditions ?? member.stats?.conditions ?? [];
    }
    return Object.keys(update).length > 1 ? [update] : [];
  });
}
