import { controllerKinds } from "./types.js";

export function controllerForActor(campaign, actorId) {
  const partyMember = (campaign?.party ?? []).find((member) => member.id === actorId);
  if (partyMember) {
    return normalizeController(partyMember.controllerKind ?? partyMember.controller?.kind ?? partyMember.agency, partyMember);
  }

  const enemy = (campaign?.combat?.enemies ?? []).find((item) => item.id === actorId);
  if (enemy) {
    return {
      kind: controllerKinds.NPC_DM,
      controllerId: "dm",
      reason: "combat_enemy",
    };
  }

  const person = (campaign?.people ?? []).find((item) => item.id === actorId);
  if (person) {
    return normalizeController(person.controllerKind ?? controllerKinds.NPC_DM, person);
  }

  return {
    kind: controllerKinds.UNASSIGNED,
    controllerId: null,
    reason: "actor_not_found",
  };
}

export function canProviderActForActor(campaign, actorId, options = {}) {
  const controller = controllerForActor(campaign, actorId);
  const scope = options.actionScope ?? "major";
  if (controller.kind === controllerKinds.NPC_DM) return true;
  if (controller.kind === controllerKinds.AI_COMPANION) return scope !== "major" || options.allowMajorAiCompanion === true;
  return false;
}

export function requiresHumanInput(campaign, actorId, options = {}) {
  const controller = controllerForActor(campaign, actorId);
  const scope = options.actionScope ?? "major";
  if (scope !== "major" && controller.kind === controllerKinds.AI_COMPANION) return false;
  return controller.kind === controllerKinds.HOST ||
    controller.kind === controllerKinds.REMOTE_PLAYER ||
    controller.kind === controllerKinds.UNASSIGNED;
}

export function assignController(campaign, actorId, controllerKind, controllerId = null) {
  const next = structuredClone(campaign);
  const member = (next.party ?? []).find((item) => item.id === actorId);
  if (!member) {
    throw new Error(`Cannot assign controller for missing party member: ${actorId}`);
  }
  member.controllerKind = normalizeControllerKind(controllerKind);
  member.controllerId = controllerId;
  return next;
}

export function fallbackControllerForActor(actor = {}) {
  if (actor.fallbackControllerKind) {
    return normalizeController(actor.fallbackControllerKind, actor);
  }
  if (actor.isPrimaryPlayerCharacter || actor.hostControlled || actor.controllerKind === controllerKinds.HOST) {
    return { kind: controllerKinds.HOST, controllerId: "host", reason: "primary_or_host_controlled" };
  }
  return { kind: controllerKinds.AI_COMPANION, controllerId: "provider", reason: "party_companion_default" };
}

function normalizeController(value, actor) {
  const kind = normalizeControllerKind(value);
  if (kind === controllerKinds.UNASSIGNED) {
    return { kind: controllerKinds.UNASSIGNED, controllerId: null, reason: "unassigned" };
  }
  return {
    kind,
    controllerId: actor?.controllerId ?? actor?.controller?.id ?? defaultControllerId(kind),
    reason: "explicit_or_normalized",
  };
}

function normalizeControllerKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (Object.values(controllerKinds).includes(normalized)) return normalized;
  if (["host", "primary_player_character", "player", "human"].includes(normalized)) return controllerKinds.HOST;
  if (["remote", "remote_player", "guest"].includes(normalized)) return controllerKinds.REMOTE_PLAYER;
  if (["ai", "ai_companion", "companion", "dm_controlled_companion"].includes(normalized)) return controllerKinds.AI_COMPANION;
  if (["npc", "enemy", "npc_dm", "dm"].includes(normalized)) return controllerKinds.NPC_DM;
  return controllerKinds.UNASSIGNED;
}

function defaultControllerId(kind) {
  if (kind === controllerKinds.HOST) return "host";
  if (kind === controllerKinds.AI_COMPANION) return "provider";
  if (kind === controllerKinds.NPC_DM) return "dm";
  return null;
}
