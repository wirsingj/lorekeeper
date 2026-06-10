import { applyCanonicalChanges } from "../campaign-state/apply-changes.js";
import { getCommittableChanges } from "../canon-review/proposals.js";
import { loadActiveCampaign, saveActiveCampaign } from "./campaign-repository.js";

export async function commitReviewBatch(projectRoot, reviewBatch) {
  const { campaign } = await loadActiveCampaign(projectRoot);
  const committable = getCommittableChanges(reviewBatch);
  const result = applyCanonicalChanges(campaign, committable);
  const saveResult = await saveActiveCampaign(projectRoot, result.campaign);

  return {
    campaign: result.campaign,
    applied: result.applied,
    skipped: result.skipped,
    sqlitePath: saveResult.sqlitePath,
    bytes: saveResult.bytes,
  };
}

