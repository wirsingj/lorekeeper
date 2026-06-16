export function buildProviderImportOutcome({
  extractionError = "",
  autoCommitAppliedCount = 0,
  proposedChangesCount = 0,
  source = "provider",
} = {}) {
  if (extractionError) {
    return {
      state: "imported_with_warning",
      bridgeStatus: `DM response imported; ${extractionError}`,
      activityText: "Imported response; no state updates saved",
      activityState: "waiting",
    };
  }
  if (autoCommitAppliedCount > 0) {
    return {
      state: "state_saved",
      bridgeStatus: `${autoCommitAppliedCount} state change${autoCommitAppliedCount === 1 ? "" : "s"} saved to SQLite`,
      activityText: source === "local" ? "State updated from local response" : "State updated from DM response",
      activityState: "idle",
    };
  }
  if (proposedChangesCount > 0) {
    return {
      state: "review_pending",
      bridgeStatus: `${proposedChangesCount} proposed state change${proposedChangesCount === 1 ? "" : "s"} awaiting review`,
      activityText: "Imported response; proposed changes awaiting review",
      activityState: "waiting",
    };
  }
  return {
    state: "imported",
    bridgeStatus: "DM response imported with no proposed changes",
    activityText: "Imported provider response",
    activityState: "idle",
  };
}

export function decideLatestProviderImport({
  latestText = "",
  newerThanText = "",
  lastImportedProviderText = "",
  requireNewerThanLastImport = false,
} = {}) {
  const trimmedLatest = latestText.trim();
  if (!trimmedLatest) {
    return {
      action: "skip",
      reason: "empty",
      bridgeStatus: "No DM response found",
      activityText: "No DM response found",
      activityState: "idle",
    };
  }

  if (newerThanText && trimmedLatest === newerThanText.trim()) {
    return {
      action: "skip",
      reason: "unchanged",
      bridgeStatus: "Latest DM response has not changed",
      activityText: "Latest DM response has not changed",
      activityState: "idle",
    };
  }

  if (requireNewerThanLastImport && trimmedLatest === lastImportedProviderText.trim()) {
    return {
      action: "skip",
      reason: "duplicate",
      bridgeStatus: "Latest DM response is already in the table",
      activityText: "Latest DM response is already in the table",
      activityState: "idle",
    };
  }

  return {
    action: "import",
    reason: "new",
    bridgeStatus: "Adding latest DM response...",
    activityText: "Adding latest DM response...",
    activityState: "working",
    text: trimmedLatest,
  };
}

export function prepareAutoCommitReviewBatch(reviewBatch) {
  if (!reviewBatch?.proposedChanges?.length) {
    return null;
  }

  const safeBatch = {
    ...reviewBatch,
    proposedChanges: reviewBatch.proposedChanges.map((change) => ({
      ...change,
      status: shouldAutoApproveProviderChange(change) ? "approved" : change.status,
    })),
  };

  return safeBatch.proposedChanges.some((change) => change.status === "approved")
    ? safeBatch
    : null;
}

export function shouldAutoApproveProviderChange(change = {}) {
  if (change.validation?.valid === false || change.status === "rejected") {
    return false;
  }
  if (isHiddenStoryChange(change)) {
    return true;
  }
  if (change.importance === "major" || change.visibility === "dm_only" || change.visibility === "system_only") {
    return false;
  }
  return true;
}

function isHiddenStoryChange(change = {}) {
  return (
    normalizeChangeDomain(change.domain) === "quests" &&
    change.visibility === "dm_only" &&
    (change.data?.threadType === "story_arc" ||
      change.data?.thread_type === "story_arc" ||
      change.data?.kind === "story_arc" ||
      change.data?.type === "story_arc")
  );
}

function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}
