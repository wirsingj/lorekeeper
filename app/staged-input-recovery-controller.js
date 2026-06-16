export const stagedInputRecoveryActions = Object.freeze({
  MARK_SUBMITTED: "mark_submitted",
  CLEAR_PENDING: "clear_pending",
  KEEP_STAGED: "keep_staged",
});

export function buildStagedInputRecoveryPlan({
  runResult = {},
  approvedPartyInputs = [],
  stagedRemoteInputs = [],
  pendingInputs = [],
} = {}) {
  const imported = Boolean(runResult?.imported);
  return {
    imported,
    approvedParty: groupPlan(approvedPartyInputs, imported
      ? stagedInputRecoveryActions.MARK_SUBMITTED
      : stagedInputRecoveryActions.KEEP_STAGED),
    stagedRemote: groupPlan(stagedRemoteInputs, imported
      ? stagedInputRecoveryActions.CLEAR_PENDING
      : stagedInputRecoveryActions.KEEP_STAGED),
    pendingRemote: groupPlan(pendingInputs, imported
      ? stagedInputRecoveryActions.CLEAR_PENDING
      : stagedInputRecoveryActions.KEEP_STAGED),
  };
}

export function providerFailureReason(runResult = {}) {
  if (runResult?.error instanceof Error) {
    return runResult.error.message;
  }
  if (typeof runResult?.error === "string") {
    return runResult.error;
  }
  if (runResult?.timedOut) {
    return "The DM response timed out.";
  }
  if (runResult?.canceled) {
    return "The DM response was canceled.";
  }
  if (runResult?.needsRepair) {
    return "The DM response needs review before it can resolve this input.";
  }
  return "The DM did not resolve this staged input.";
}

function groupPlan(inputs, action) {
  const list = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  return {
    action,
    inputs: list,
    hasInputs: list.length > 0,
  };
}
