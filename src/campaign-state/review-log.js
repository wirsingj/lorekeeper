import { touchCampaign } from "./schema.js";

export function storeReviewBatch(campaign, reviewBatch) {
  const working = structuredClone(campaign);
  const batch = normalizeReviewBatch(reviewBatch);
  const existing = Array.isArray(working.reviewLog) ? working.reviewLog : [];
  const withoutBatch = existing.filter((item) => item.id !== batch.id);

  working.reviewLog = [...withoutBatch, batch];
  return {
    campaign: touchCampaign(working),
    reviewBatch: batch,
  };
}

export function getLatestPendingReviewBatch(campaign) {
  return [...(campaign.reviewLog ?? [])]
    .filter((batch) => batch.status === "pending_review")
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0] ?? null;
}

export function markReviewBatchCommitted(campaign, reviewBatch, result) {
  const batch = {
    ...normalizeReviewBatch(reviewBatch),
    status: "committed",
    decidedAt: new Date().toISOString(),
    applied: result.applied ?? [],
    skipped: result.skipped ?? [],
  };

  return storeReviewBatch(campaign, batch);
}

function normalizeReviewBatch(reviewBatch) {
  const now = new Date().toISOString();
  return {
    id: reviewBatch.id || `review-${Date.now()}`,
    campaignId: reviewBatch.campaignId,
    source: reviewBatch.source || "unknown",
    status: reviewBatch.status || "pending_review",
    createdAt: reviewBatch.createdAt || now,
    updatedAt: now,
    rawResponse: reviewBatch.rawResponse || "",
    decidedAt: reviewBatch.decidedAt || null,
    proposedChanges: Array.isArray(reviewBatch.proposedChanges)
      ? reviewBatch.proposedChanges.map((change, index) => ({
          id: change.id || `change-${index + 1}`,
          status: change.status || "pending",
          operation: change.operation || "note",
          domain: change.domain || "lore",
          targetId: change.targetId ?? null,
          summary: change.summary || "Unlabeled proposed update.",
          data: change.data ?? {},
          confidence: change.confidence || "unknown",
          reason: change.reason || "",
          decidedAt: change.decidedAt || null,
        }))
      : [],
  };
}
