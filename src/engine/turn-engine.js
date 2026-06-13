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
    lastInput: overrides.lastInput ?? null,
    lastProviderResponse: overrides.lastProviderResponse ?? null,
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
    lastInput: input,
  };
}

export function submitInput(turnState, input, options = {}) {
  const begun = [turnStates.AWAITING_INPUT, turnStates.COLLECTING_INPUTS].includes(turnState.state)
    ? turnState
    : beginTurn(turnState, options);
  const withInput = addPendingInput(begun, input);
  return lockTurn(withInput, options);
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
  if (isStaleTurnOrRequest(turnState, options)) {
    return { ...turnState, staleCompletionIgnored: true };
  }
  return {
    ...turnState,
    state: turnStates.COMPLETE,
    completedAt: options.now ?? new Date().toISOString(),
    activeProviderRequestId: null,
    error: null,
    lastProviderResponse: options.response ?? null,
  };
}

export function failTurn(turnState, error, options = {}) {
  if (isStaleTurnOrRequest(turnState, options)) {
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
  if (options.turnId || options.requestId) {
    if (isStaleTurnOrRequest(turnState, options)) {
      return { ...turnState, staleCancellationIgnored: true };
    }
  }
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

export function applyProviderEvent(turnState, event) {
  if (!event || !event.type) {
    return turnState;
  }
  const turnId = event.turnId;
  const requestId = event.requestId;
  if (turnId && turnId !== turnState.turnId) {
    return { ...turnState, staleProviderEventIgnored: true };
  }
  if (turnState.activeProviderRequestId && requestId && requestId !== turnState.activeProviderRequestId) {
    return { ...turnState, staleProviderEventIgnored: true };
  }
  if (event.type === "generation_started") {
    if (turnState.state === turnStates.GENERATING && (!requestId || requestId === turnState.activeProviderRequestId)) {
      return turnState;
    }
    if (![turnStates.LOCKED, turnStates.ROLLING, turnStates.AWAITING_REVIEW].includes(turnState.state)) {
      return { ...turnState, staleProviderEventIgnored: true };
    }
    return startGenerating(turnState, { requestId });
  }
  if (event.type === "generation_delta") {
    return turnState;
  }
  if (event.type === "generation_completed") {
    return completeTurn(turnState, { turnId, requestId, response: event.response });
  }
  if (event.type === "generation_failed") {
    return failTurn(turnState, event.error || "Provider generation failed", { turnId, requestId });
  }
  if (event.type === "generation_cancelled") {
    return cancelTurn(turnState, { turnId, requestId, reason: event.reason });
  }
  return turnState;
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
    isResolving: [turnStates.LOCKED, turnStates.ROLLING, turnStates.GENERATING].includes(state),
    disabledReason: disabledReasonForState(state),
    error: turnState?.error ?? null,
    activeProviderRequestId: turnState?.activeProviderRequestId ?? null,
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

function isStaleTurnOrRequest(turnState, options = {}) {
  if (options.turnId && options.turnId !== turnState.turnId) {
    return true;
  }
  if (turnState.activeProviderRequestId && options.requestId && options.requestId !== turnState.activeProviderRequestId) {
    return true;
  }
  return false;
}
