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

function groupPlan(inputs, action) {
  const list = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
  return {
    action,
    inputs: list,
    hasInputs: list.length > 0,
  };
}
