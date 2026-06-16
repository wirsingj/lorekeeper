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
