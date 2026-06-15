export function buildReviewPanelProjection({ reviewBatch = null, campaign = null } = {}) {
  if (reviewBatch?.proposedChanges?.length) {
    return {
      count: reviewBatch.proposedChanges.length,
      emptyMessage: "No state changes are waiting for review.",
      entries: reviewBatch.proposedChanges.slice(0, 6).map((change) => ({
        title: `${change.status} / ${change.operation} / ${change.domain}`,
        body: change.validation?.valid === false
          ? `${change.summary} (${change.validation.errors.join("; ")})`
          : change.summary,
      })),
    };
  }

  const lastCommitted = latestCommittedReviewBatch(campaign);
  const changes = lastCommitted?.applied ?? [];
  return {
    count: changes.length,
    emptyMessage: "No recent state changes to review.",
    entries: changes.slice(0, 6).map((change) => ({
      title: `${change.operation} / ${change.domain}`,
      body: change.summary,
    })),
  };
}

export function renderReviewPanel({
  elements,
  projection,
  recordElement,
  emptyOrRecords,
}) {
  elements.reviewCount.textContent = String(projection.count);
  elements.reviewList.replaceChildren(
    ...emptyOrRecords(
      projection.entries.map((entry) => recordElement(entry)),
      projection.emptyMessage,
    ),
  );
}

function latestCommittedReviewBatch(campaign) {
  return [...(campaign?.reviewLog ?? [])]
    .filter((batch) => batch.status === "committed")
    .sort((a, b) => String(b.decidedAt || b.updatedAt || b.createdAt).localeCompare(String(a.decidedAt || a.updatedAt || a.createdAt)))[0] ?? null;
}
