import { createReviewBatch } from "../src/canon-review/proposals.js";
import {
  createImplicitCombatAdvanceChange,
  createImplicitCombatEnemySyncChange,
  createImplicitCombatStartChange,
} from "./combat-import-controller.js";
import { createImplicitCombatActorPromptChange } from "./combat-prompt-repair-controller.js";
import { createImplicitSceneProgressChange } from "./scene-import-controller.js";

// Provider import policy projections. Keep table-facing wording, import
// planning, and auto-commit decisions here so app.js can execute the policy
// without owning it.
export function buildProviderImportPlan({
  campaign,
  responseText = "",
  cleanedText = "",
  extraction = {},
  tableMessages = [],
  options = {},
  labelForActor = () => "",
} = {}) {
  const proposedBase = Array.isArray(extraction.proposedChanges) ? extraction.proposedChanges : [];
  const autoCommit = Boolean(options.autoCommit);
  const implicitSceneChange = autoCommit
    ? createImplicitSceneProgressChange({
      tableMessages,
      proposedChanges: proposedBase,
    })
    : null;
  const implicitCombatChange = autoCommit
    ? createImplicitCombatStartChange({
      campaign,
      tableMessages,
      proposedChanges: proposedBase,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const combatContextChanges = implicitCombatChange
    ? [...proposedBase, implicitCombatChange]
    : proposedBase;
  const implicitCombatEnemyChange = autoCommit
    ? createImplicitCombatEnemySyncChange({
      campaign,
      tableMessages,
      proposedChanges: combatContextChanges,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const implicitCombatAdvanceChange = autoCommit
    ? createImplicitCombatAdvanceChange({
      campaign,
      proposedChanges: proposedBase,
      turnResponse: options.data?.turnResponse,
      submittedTurn: options.data?.turn,
      labelForActor,
    })
    : null;
  const actorPromptContextChanges = [
    ...proposedBase,
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
  ];
  const implicitCombatActorPromptChange = autoCommit
    ? createImplicitCombatActorPromptChange({
      campaign,
      tableMessages,
      proposedChanges: actorPromptContextChanges,
      turnResponse: options.data?.turnResponse,
    })
    : null;
  const proposedChanges = [
    ...proposedBase,
    ...(implicitSceneChange ? [implicitSceneChange] : []),
    ...(implicitCombatChange ? [implicitCombatChange] : []),
    ...(implicitCombatEnemyChange ? [implicitCombatEnemyChange] : []),
    ...(implicitCombatAdvanceChange ? [implicitCombatAdvanceChange] : []),
    ...(implicitCombatActorPromptChange ? [implicitCombatActorPromptChange] : []),
  ];
  const importData = {
    source: options.source || "manual_import",
    responseChars: responseText.length,
    cleanedChars: cleanedText.length,
    proposedChanges: proposedChanges.length,
    extractionError: extraction.error || "",
  };
  const choiceOwnerIndex = choiceOwnerMessageIndex(tableMessages);
  const messagePlans = tableMessages.map((message, messageIndex) => ({
    message,
    data: providerMessageData({
      message,
      messageIndex,
      options,
      choiceOwnerIndex,
      import: importData,
    }),
  }));
  const reviewBatch = createReviewBatch({
    campaignId: campaign?.id,
    source: options.source || "manual_import",
    rawResponse: responseText,
    proposedChanges,
  });

  return {
    proposedChanges,
    messagePlans,
    reviewBatch,
    importData,
  };
}

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
      activityText: "DM response added; no table changes saved",
      activityState: "waiting",
    };
  }
  if (autoCommitAppliedCount > 0) {
    return {
      state: "state_saved",
      bridgeStatus: `${autoCommitAppliedCount} table change${autoCommitAppliedCount === 1 ? "" : "s"} saved`,
      activityText: source === "local" ? "Table updated from local response" : "Table updated from DM response",
      activityState: "idle",
    };
  }
  if (proposedChangesCount > 0) {
    return {
      state: "review_pending",
      bridgeStatus: `${proposedChangesCount} proposed table change${proposedChangesCount === 1 ? "" : "s"} awaiting review`,
      activityText: "DM response added; proposed changes awaiting review",
      activityState: "waiting",
    };
  }
  return {
    state: "imported",
    bridgeStatus: "DM response imported with no proposed changes",
    activityText: "DM response added",
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

export function choiceOwnerMessageIndex(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "dm" || messages[index].role === "provider") {
      return index;
    }
  }
  return Math.max(0, messages.length - 1);
}

export function providerMessageData({ message, messageIndex, options = {}, choiceOwnerIndex, import: importData }) {
  const base = {
    ...(message?.data || {}),
    import: importData,
  };
  const structuredChoices = options.data?.choices ?? null;
  const ownsChoices = structuredChoices?.options?.length && messageIndex === choiceOwnerIndex;
  if (!ownsChoices) {
    return base;
  }

  return {
    ...base,
    choiceOwner: true,
    choices: structuredChoices,
    turnResponse: options.data?.turnResponse ?? null,
    providerRunId: options.data?.providerResult?.requestId ?? options.data?.providerResult?.request_id ?? null,
  };
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
