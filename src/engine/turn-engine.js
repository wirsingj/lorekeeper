import { gameModes, turnStates, isValidGameMode } from "./types.js";

export function createTurnEngineState(overrides = {}) {
  return {
    state: overrides.state ?? turnStates.IDLE,
    mode: overrides.mode ?? gameModes.RP,
    turnId: overrides.turnId ?? null,
    actorId: overrides.actorId ?? null,
    pendingInputs: Array.isArray(overrides.pendingInputs) ? overrides.pendingInputs : [],
    lockedAt: overrides.lockedAt ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    error: overrides.error ?? null,
    attempt: Number(overrides.attempt ?? 0),
    activeProviderRequestId: overrides.activeProviderRequestId ?? null,
  };
}

export function beginTurn(turnState, options = {}) {
  assertCanBegin(turnState);
  const mode = options.mode ?? turnState.mode ?? gameModes.RP;
  if (!isValidGameMode(mode)) throw new Error(`Invalid game mode: ${mode}`);
  return {
    ...createTurnEngineState(turnState),
    state: options.collecting ? turnStates.COLLECTING_INPUTS : turnStates.AWAITING_INPUT,
    mode,
    turnId: options.turnId ?? `turn-${Date.now()}`,
    actorId: options.actorId ?? null,
    pendingInputs: [],
    startedAt: options.now ?? new Date().toISOString(),
    completedAt: null,
    error: null,
  };
}

export function addPendingInput(turnState, input) {
  if (![turnStates.AWAITING_INPUT, turnStates.COLLECTING_INPUTS].includes(turnState.state)) {
    throw new Error(`Cannot add input while turn is ${turnState.state}`);
  }
  return {
    ...turnState,
    state: turnStates.COLLECTING_INPUTS,
    pendingInputs: [...(turnState.pendingInputs ?? []), { ...input, turnId: turnState.turnId }],
  };
}

export function lockTurn(turnState, options = {}) {
  if (![turnStates.AWAITING_INPUT, turnStates.COLLECTING_INPUTS].includes(turnState.state)) {
    throw new Error(`Cannot lock turn while state is ${turnState.state}`);
  }
  return {
    ...turnState,
    state: turnStates.LOCKED,
    lockedAt: options.now ?? new Date().toISOString(),
    error: null,
  };
}

export function startRolling(turnState) {
  return transition(turnState, [turnStates.LOCKED], turnStates.ROLLING);
}

export function startGenerating(turnState, options = {}) {
  const next = transition(turnState, [turnStates.LOCKED, turnStates.ROLLING, turnStates.AWAITING_REVIEW], turnStates.GENERATING);
  return {
    ...next,
    activeProviderRequestId: options.requestId ?? next.activeProviderRequestId ?? `provider-${Date.now()}`,
  };
}

export function awaitReview(turnState) {
  return transition(turnState, [turnStates.GENERATING, turnStates.ROLLING], turnStates.AWAITING_REVIEW);
}

export function completeTurn(turnState, options = {}) {
  if (options.turnId && options.turnId !== turnState.turnId) {
    return { ...turnState, staleCompletionIgnored: true };
  }
  return {
    ...turnState,
    state: turnStates.COMPLETE,
    completedAt: options.now ?? new Date().toISOString(),
    activeProviderRequestId: null,
    error: null,
  };
}

export function failTurn(turnState, error, options = {}) {
  if (options.turnId && options.turnId !== turnState.turnId) {
    return { ...turnState, staleErrorIgnored: true };
  }
  return {
    ...turnState,
    state: turnStates.ERROR,
    error: normalizeError(error),
    activeProviderRequestId: null,
  };
}

export function cancelTurn(turnState, options = {}) {
  return {
    ...turnState,
    state: options.toState ?? turnStates.AWAITING_INPUT,
    activeProviderRequestId: null,
    error: null,
  };
}

export function retryTurn(turnState, options = {}) {
  if (turnState.state !== turnStates.ERROR) {
    throw new Error(`Cannot retry turn while state is ${turnState.state}`);
  }
  return {
    ...turnState,
    state: turnStates.LOCKED,
    attempt: (Number(turnState.attempt) || 0) + 1,
    error: null,
    activeProviderRequestId: options.requestId ?? null,
  };
}

export function canSubmitTurn(turnState, options = {}) {
  if (options.activeActorRequiresInput === false) return false;
  return [turnStates.AWAITING_INPUT, turnStates.COLLECTING_INPUTS].includes(turnState.state);
}

export function deriveTurnUiState(turnState) {
  const state = turnState?.state ?? turnStates.IDLE;
  return {
    state,
    mode: turnState?.mode ?? gameModes.RP,
    activeActorId: turnState?.actorId ?? null,
    canSend: canSubmitTurn(turnState ?? createTurnEngineState()),
    canCancel: [turnStates.GENERATING, turnStates.ROLLING, turnStates.LOCKED].includes(state),
    canRetry: state === turnStates.ERROR,
    disabledReason: disabledReasonForState(state),
    error: turnState?.error ?? null,
  };
}

function transition(turnState, allowed, nextState) {
  if (!allowed.includes(turnState.state)) {
    throw new Error(`Cannot transition ${turnState.state} -> ${nextState}`);
  }
  return { ...turnState, state: nextState, error: null };
}

function assertCanBegin(turnState) {
  const current = turnState?.state ?? turnStates.IDLE;
  if ([turnStates.LOCKED, turnStates.ROLLING, turnStates.GENERATING].includes(current)) {
    throw new Error(`Cannot begin a turn while ${current}`);
  }
}

function disabledReasonForState(state) {
  if ([turnStates.LOCKED, turnStates.ROLLING, turnStates.GENERATING].includes(state)) return "Turn is resolving.";
  if (state === turnStates.ERROR) return "Turn needs retry, cancel, or repair.";
  if (state === turnStates.COMPLETE) return "Turn is complete.";
  return "";
}

function normalizeError(error) {
  if (!error) return { message: "Unknown turn error" };
  if (typeof error === "string") return { message: error };
  return { message: error.message ?? "Turn error", detail: error.detail ?? null };
}
