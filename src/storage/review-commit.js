import { applyCanonicalChanges } from "../campaign-state/apply-changes.js";
import { ensureInferredPlayerCharacter } from "../campaign-state/player-character-inference.js";
import { markReviewBatchCommitted } from "../campaign-state/review-log.js";
import { getCommittableChanges } from "../canon-review/proposals.js";
import { loadActiveCampaign, saveActiveCampaign } from "./campaign-repository.js";

export async function commitReviewBatch(projectRoot, reviewBatch) {
  const { campaign } = await loadActiveCampaign(projectRoot);
  const committable = getCommittableChanges(reviewBatch);
  let result = applyCanonicalChanges(campaign, committable);
  const inference = ensureInferredPlayerCharacter(result.campaign);
  if (inference.inferred) {
    result = {
      ...result,
      campaign: inference.campaign,
      applied: [
        ...result.applied,
        {
          changeId: "inferred-player-character",
          summary: `Added inferred player character: ${inference.inferred.name}`,
          domain: "party",
          operation: "add",
        },
      ],
    };
  }
  const reviewResult = markReviewBatchCommitted(result.campaign, reviewBatch, result);
  const saveResult = await saveActiveCampaign(projectRoot, reviewResult.campaign);

  return {
    campaign: reviewResult.campaign,
    applied: result.applied,
    skipped: result.skipped,
    sqlitePath: saveResult.sqlitePath,
    bytes: saveResult.bytes,
  };
}
