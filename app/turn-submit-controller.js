export function buildTurnSubmitGate({
  turnProjection = {},
  repair = null,
  allowDuringRepair = false,
  readyForOpening = false,
  allowBeforeOpening = false,
} = {}) {
  if (turnProjection.hasActiveGeneration) {
    return {
      blocked: true,
      reason: "busy",
      bridgeText: "The DM is already resolving a turn.",
      activityText: "Wait for the current DM response before sending again",
      activityState: "waiting",
    };
  }
  if (readyForOpening && !allowBeforeOpening) {
    return {
      blocked: true,
      reason: "opening_not_started",
      bridgeText: "Press Start Adventure before sending table actions.",
      activityText: "Start Adventure before sending table actions.",
      activityState: "waiting",
    };
  }
  if (repair && !allowDuringRepair) {
    return {
      blocked: true,
      reason: "repair_required",
      bridgeText: "Review the DM response before sending another turn.",
      activityText: "DM response needs review. Try Again, Details, or Use Anyway.",
      activityState: "error",
    };
  }
  return { blocked: false };
}

export function buildTurnContentGate({
  playerMessage = "",
  playerInputs = [],
} = {}) {
  if (!String(playerMessage || "").trim() && !playerInputs.length) {
    return {
      blocked: true,
      reason: "empty",
      bridgeText: "Type an action or wait for a staged party input first",
      activityText: "Type an action or stage a party input",
      activityState: "idle",
    };
  }
  return { blocked: false };
}
