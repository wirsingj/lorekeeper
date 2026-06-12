import { validateProposedChange } from "./validate-updates.js";

export function createReviewBatch({ campaignId, source, rawResponse, proposedChanges }) {
  const createdAt = new Date().toISOString();
  return {
    id: `review-${Date.now()}`,
    campaignId,
    source,
    status: "pending_review",
    createdAt,
    decidedAt: null,
    rawResponse,
    proposedChanges: proposedChanges.map((change, index) => {
      const validation = validateProposedChange(change);
      return {
        id: `change-${index + 1}`,
        ...change,
        status: validation.valid ? "pending" : "rejected",
        decidedAt: null,
        validation,
      };
    }),
  };
}

export function summarizeReviewBatch(batch) {
  return batch.proposedChanges.map((change) => ({
    id: change.id,
    status: change.status,
    operation: change.operation,
    domain: change.domain,
    targetId: change.targetId,
    summary: change.summary,
    confidence: change.confidence ?? "unknown",
  }));
}

export function getCommittableChanges(batch) {
  return batch.proposedChanges.filter((change) => {
    const validation = validateProposedChange(change);
    return validation.valid && (change.status === "approved" || change.status === "edited");
  });
}
