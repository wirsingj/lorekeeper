import { isHardBlockedTurnRepair, tableRepairReason } from "./turn-repair-controller.js";

export function buildHostResponseReviewProjection({ repair = null, reviewBatch = null } = {}) {
  const pendingChanges = (reviewBatch?.proposedChanges ?? reviewBatch?.proposals ?? [])
    .filter((change) => change?.status !== "committed");
  if (repair) {
    const hardBlocked = isHardBlockedTurnRepair(repair);
    return {
      state: "repair",
      title: "DM Response Needs A Table Check",
      body: `LoreKeeper paused because ${tableRepairReason(repair.reason)}.`,
      nextStep: hardBlocked
        ? "Try Again so the DM can answer without taking over a controlled character, or open Details to inspect what happened."
        : "Try Again for a cleaner response, open Details to inspect what happened, or Use Anyway only if the visible table text is right.",
      tone: "review",
      responseChars: repair.responseText?.length ?? repair.rawText?.length ?? 0,
      pendingChanges: pendingChanges.length,
    };
  }
  if (pendingChanges.length) {
    return {
      state: "changes",
      title: "Proposed Table Changes Waiting",
      body: `${pendingChanges.length} proposed state ${pendingChanges.length === 1 ? "change needs" : "changes need"} host review before becoming campaign memory.`,
      nextStep: "Review and save the changes that should become canon.",
      tone: "waiting",
      responseChars: 0,
      pendingChanges: pendingChanges.length,
    };
  }
  return {
    state: "idle",
    title: "No DM Response Waiting",
    body: "When a response needs attention, LoreKeeper will summarize what happened here before showing raw details.",
    nextStep: "Use the paste box only for an intentionally copied DM response.",
    tone: "idle",
    responseChars: 0,
    pendingChanges: 0,
  };
}

export function renderHostResponseReview(container, projection) {
  if (!container) {
    return;
  }
  const view = projection ?? buildHostResponseReviewProjection();
  container.dataset.state = view.state;
  const title = document.createElement("strong");
  title.textContent = view.title;
  const body = document.createElement("p");
  body.textContent = view.body;
  const next = document.createElement("p");
  next.className = "review-next-step";
  next.textContent = view.nextStep;
  container.replaceChildren(title, body, next);
}
