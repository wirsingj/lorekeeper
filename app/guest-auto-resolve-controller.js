export function shouldScheduleGuestAutoResolve({
  clientMode = false,
  hasGuestHostBaseUrl = false,
  campaignWizardCreating = false,
} = {}) {
  return !clientMode && !hasGuestHostBaseUrl && !campaignWizardCreating;
}

export function buildGuestAutoResolvePlan({
  campaign = null,
  campaignWizardCreating = false,
  requireGuestActionApproval = campaign?.multiplayer?.settings?.requireGuestActionApproval,
  holdGuestActionsForGroupInput = campaign?.multiplayer?.settings?.holdGuestActionsForGroupInput,
  localTableRunning = campaign?.multiplayer?.localTable?.running,
  autoResolvingGuestInputs = false,
  turnFlowBlocksNewTurn = false,
  hostDraftText = "",
  stagedInputs = [],
} = {}) {
  if (campaignWizardCreating) {
    return blocked("campaign_wizard_creating");
  }
  if (!localTableRunning) {
    return blocked("local_table_not_running");
  }
  if (requireGuestActionApproval) {
    return blocked("approval_required");
  }
  if (holdGuestActionsForGroupInput) {
    return blocked("group_input_hold");
  }
  if (autoResolvingGuestInputs) {
    return blocked("already_resolving");
  }
  if (turnFlowBlocksNewTurn) {
    return blocked("turn_flow_busy");
  }
  if (String(hostDraftText ?? "").trim()) {
    return blocked("host_draft_present");
  }
  const inputs = Array.isArray(stagedInputs) ? stagedInputs.filter(Boolean) : [];
  if (!inputs.length) {
    return blocked("no_staged_inputs");
  }

  return {
    shouldResolve: true,
    reason: "ready",
    inputs,
    activityText: inputs.length === 1
      ? `${inputs[0].characterName || "Guest"} sent an action; resolving...`
      : "Guest actions received; resolving...",
  };
}

function blocked(reason) {
  return {
    shouldResolve: false,
    reason,
    inputs: [],
    activityText: "",
  };
}
