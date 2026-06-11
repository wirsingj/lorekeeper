export function createReviewBatch({ campaignId, source, rawResponse, proposedChanges }) {
  const decidedAt = new Date().toISOString();
  return {
    id: `review-${Date.now()}`,
    campaignId,
    source,
    status: "auto_approved",
    createdAt: decidedAt,
    decidedAt,
    rawResponse,
    proposedChanges: proposedChanges.map((change, index) => ({
      id: `change-${index + 1}`,
      status: "approved",
      decidedAt,
      ...change,
    })),
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
  return batch.proposedChanges.filter((change) => change.status === "approved" || change.status === "edited");
}
