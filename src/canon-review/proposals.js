export function createReviewBatch({ campaignId, source, rawResponse, proposedChanges }) {
  return {
    id: `review-${Date.now()}`,
    campaignId,
    source,
    status: "pending_review",
    createdAt: new Date().toISOString(),
    rawResponse,
    proposedChanges: proposedChanges.map((change, index) => ({
      id: `change-${index + 1}`,
      status: "pending",
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

export function decideChange(batch, changeId, decision, editedChange = null) {
  const allowed = new Set(["approved", "rejected", "edited"]);
  if (!allowed.has(decision)) {
    throw new Error(`Unsupported review decision: ${decision}`);
  }

  return {
    ...batch,
    proposedChanges: batch.proposedChanges.map((change) => {
      if (change.id !== changeId) {
        return change;
      }

      return {
        ...change,
        ...(editedChange ?? {}),
        status: decision,
        decidedAt: new Date().toISOString(),
      };
    }),
  };
}

export function getCommittableChanges(batch) {
  return batch.proposedChanges.filter((change) => change.status === "approved" || change.status === "edited");
}

