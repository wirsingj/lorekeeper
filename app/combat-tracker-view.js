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
      meta: combatOrderMeta(entry, options.controlledActorId),
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
  }));
}

function combatActorType(campaign, id) {
  if ((campaign.party ?? []).some((member) => member.id === id)) {
    return "party";
  }
  if ((campaign.combat?.enemies ?? []).some((enemy) => enemy.id === id)) {
    return "enemy";
  }
  return "unknown";
}

function combatOrderMeta(entry, controlledActorId) {
  if (entry.id === controlledActorId) return "You";
  if (entry.type === "enemy") return "DM";
  return "Party";
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
