export const gameModes = Object.freeze({
  RP: "rp",
  EXPLORATION: "exploration",
  COMBAT: "combat",
  DOWNTIME: "downtime",
});

export const turnStates = Object.freeze({
  IDLE: "idle",
  AWAITING_INPUT: "awaiting_input",
  COLLECTING_INPUTS: "collecting_inputs",
  LOCKED: "locked",
  ROLLING: "rolling",
  GENERATING: "generating",
  AWAITING_REVIEW: "awaiting_review",
  COMPLETE: "complete",
  ERROR: "error",
});

export const controllerKinds = Object.freeze({
  HOST: "host",
  REMOTE_PLAYER: "remote_player",
  AI_COMPANION: "ai_companion",
  NPC_DM: "npc_dm",
  UNASSIGNED: "unassigned",
});

export const combatActionTypes = Object.freeze({
  ATTACK: "attack",
  SPELL: "spell",
  DASH: "dash",
  DODGE: "dodge",
  DISENGAGE: "disengage",
  HELP: "help",
  HIDE: "hide",
  READY: "ready",
  IMPROVISE: "improvise",
});

export function isValidGameMode(mode) {
  return Object.values(gameModes).includes(mode);
}

export function isValidTurnState(state) {
  return Object.values(turnStates).includes(state);
}

export function isValidControllerKind(kind) {
  return Object.values(controllerKinds).includes(kind);
}
