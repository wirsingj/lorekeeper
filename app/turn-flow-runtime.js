import {
  applyProviderEvent as applyTurnProviderEvent,
  beginTurn,
  cancelTurn,
  createTurnEngineState,
  deriveTurnUiState,
  failTurn,
  lockTurn,
  retryTurn,
  startGenerating,
} from "../src/engine/turn-engine.js";
import { gameModes, turnStates } from "../src/engine/types.js";

export function createTurnFlowRuntime(options = {}) {
  let turnState = createTurnEngineState();
  let activeRun = null;
  let lastTurn = null;
  let repair = null;
  const listeners = new Set();

  function emit(event) {
    for (const listener of listeners) {
      listener({ ...event, projection: getProjection() });
    }
  }

  function setTurnState(next, event = { type: "turn_state_changed" }) {
    turnState = next;
    emit(event);
    return turnState;
  }

  function modeForCampaign(campaign) {
    if (campaign?.combat?.inCombat) return gameModes.COMBAT;
    if (campaign?.scene?.status === "downtime") return gameModes.DOWNTIME;
    if (campaign?.scene?.status === "exploration") return gameModes.EXPLORATION;
    return gameModes.RP;
  }

  function getProjection() {
    const ui = deriveTurnUiState(turnState);
      return {
        ...ui,
      turnId: turnState.turnId,
      hasActiveGeneration: Boolean(activeRun),
      hasRepair: Boolean(repair),
      repair,
      canSubmit: [turnStates.IDLE, turnStates.AWAITING_INPUT, turnStates.COLLECTING_INPUTS, turnStates.COMPLETE].includes(turnState.state) && !activeRun && !repair,
      canNudge: !activeRun && !repair,
      canCancel: Boolean(activeRun) || ui.canCancel,
      canRetry: Boolean(repair) || ui.canRetry,
      activeRequestId: activeRun?.requestId ?? turnState.activeProviderRequestId ?? null,
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getProjection,
    getTurnState() {
      return structuredClone(turnState);
    },
    getActiveRun() {
      return activeRun;
    },
    getRepair() {
      return repair;
    },
    hasActiveGeneration() {
      return Boolean(activeRun);
    },
    hasRepair() {
      return Boolean(repair);
    },
    reset({ reason = "reset", cancelActiveRun = true } = {}) {
      const run = activeRun;
      activeRun = null;
      repair = null;
      lastTurn = null;
      turnState = createTurnEngineState();
      if (cancelActiveRun && run?.cancel) {
        try {
          run.cancel();
        } catch {
          // Reset must leave the UI safe even if provider cancellation fails.
        }
      }
      emit({ type: "turn_flow_reset", reason });
      return getProjection();
    },
    canSubmit() {
      return getProjection().canSubmit;
    },
    beginLogicalTurn({ campaign, turn, inputKind = "player", actorId = null, turnId = null }) {
      const mode = modeForCampaign(campaign);
      const nextTurnId = turnId ?? `${inputKind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      lastTurn = {
        turn,
        campaignId: campaign?.id ?? null,
        inputKind,
        actorId,
        mode,
        turnId: nextTurnId,
      };
      turn.turnId = nextTurnId;
      let next = beginTurn(turnState.state === turnStates.IDLE || turnState.state === turnStates.COMPLETE || turnState.state === turnStates.ERROR
        ? turnState
        : createTurnEngineState({ mode }), {
        turnId: nextTurnId,
        mode,
        actorId,
      });
      next = lockTurn(next);
      return setTurnState(next, { type: "turn_locked", turnId: nextTurnId });
    },
    startGeneration(run) {
      if (activeRun) {
        throw new Error("A provider generation is already active");
      }
      activeRun = run;
      const next = startGenerating(turnState, { requestId: run.requestId });
      setTurnState(next, { type: "generation_started", turnId: run.turnId, requestId: run.requestId });
      return run;
    },
    applyProviderEvent(event) {
      const next = applyTurnProviderEvent(turnState, event);
      setTurnState(next, event);
      if (event.type === "generation_completed" || event.type === "generation_failed" || event.type === "generation_cancelled") {
        if (!activeRun || activeRun.requestId === event.requestId) {
          activeRun = null;
        }
      }
      return next;
    },
    completeGeneration(response) {
      return this.applyProviderEvent({
        type: "generation_completed",
        turnId: turnState.turnId,
        requestId: turnState.activeProviderRequestId,
        response,
      });
    },
    failGeneration(error) {
      return setTurnState(failTurn(turnState, error), { type: "generation_failed", error });
    },
    cancelGeneration(reason = "cancelled") {
      if (activeRun?.cancel) {
        activeRun.cancel();
      } else {
        activeRun = null;
        setTurnState(cancelTurn(turnState), { type: "generation_cancelled", reason });
      }
    },
    retryLastTurn() {
      if (activeRun) {
        throw new Error("Cannot retry while provider generation is active");
      }
      if (!repair && turnState.state !== turnStates.ERROR) {
        throw new Error("No failed turn is available to retry");
      }
      repair = null;
      const next = turnState.state === turnStates.ERROR ? retryTurn(turnState) : lockTurn(beginTurn(createTurnEngineState({ mode: lastTurn?.mode ?? gameModes.RP }), {
        turnId: lastTurn?.turnId ?? `retry-${Date.now()}`,
        mode: lastTurn?.mode ?? gameModes.RP,
        actorId: lastTurn?.actorId ?? null,
      }));
      setTurnState(next, { type: "turn_retrying", turnId: next.turnId });
      return lastTurn?.turn ?? null;
    },
    setRepair(nextRepair) {
      repair = nextRepair ? { ...nextRepair, createdAt: nextRepair.createdAt || new Date().toISOString() } : null;
      if (repair) {
        setTurnState(failTurn(turnState, repair.reason || "Provider response needs repair"), { type: "turn_repair_required", repair });
      } else if (turnState.state === turnStates.ERROR) {
        setTurnState(cancelTurn(turnState), { type: "turn_repair_cleared" });
      } else {
        emit({ type: "turn_repair_cleared" });
      }
      return repair;
    },
    clearRepair() {
      return this.setRepair(null);
    },
  };
}
