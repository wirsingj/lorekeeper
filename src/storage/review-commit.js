import { applyCanonicalChanges } from "../campaign-state/apply-changes.js";
import { ensureInferredPlayerCharacter } from "../campaign-state/player-character-inference.js";
import { markReviewBatchCommitted } from "../campaign-state/review-log.js";
import { getCommittableChanges } from "../canon-review/proposals.js";
import { updateActiveCampaign } from "./campaign-repository.js";

export async function commitReviewBatch(projectRoot, reviewBatch) {
  const committable = getCommittableChanges(reviewBatch);
  const payload = await updateActiveCampaign(projectRoot, (campaign) => {
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
    return {
      campaign: reviewResult.campaign,
      applied: result.applied,
      skipped: result.skipped,
    };
  });

  return {
    campaign: payload.campaign,
    applied: payload.applied,
    skipped: payload.skipped,
    sqlitePath: payload.sqlitePath,
    bytes: payload.bytes,
  };
}
