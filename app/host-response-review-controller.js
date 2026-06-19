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
    nextStep: "Return to the table when everyone is ready.",
    tone: "idle",
    responseChars: 0,
    pendingChanges: 0,
  };
}

export function buildManualResponseFallbackProjection({
  repair = null,
  reviewBatch = null,
  hasDraftText = false,
  copiedResponseAvailable = false,
} = {}) {
  const pendingChanges = (reviewBatch?.proposedChanges ?? reviewBatch?.proposals ?? [])
    .filter((change) => change?.status !== "committed");
  const visible = Boolean(hasDraftText || copiedResponseAvailable);
  if (repair) {
    return {
      state: "repair",
      visible,
      summary: hasDraftText ? "Replacement DM Response Ready" : "Replacement DM Response",
      hint: "Optional fallback: only use this when you intentionally copied a replacement DM response from another chat.",
      open: Boolean(hasDraftText),
      pasteLabel: "Paste Response",
      useLabel: "Use Response",
    };
  }
  if (pendingChanges.length) {
    return {
      state: "changes",
      visible,
      summary: "Replacement DM Response",
      hint: "Usually you should review the waiting table changes above. Use copied text only for a deliberate replacement response.",
      open: Boolean(hasDraftText),
      pasteLabel: "Paste Response",
      useLabel: "Use Response",
    };
  }
  return {
    state: "idle",
    visible,
    summary: "Replacement DM Response",
    hint: "Rare fallback for a deliberately copied DM response. Most tables should use DM Voice or Read Latest instead.",
    open: Boolean(hasDraftText),
    pasteLabel: "Paste Response",
    useLabel: "Use Response",
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

export function applyManualResponseFallbackProjection(elements, projection) {
  if (!elements?.manualResponseFallback || !projection) {
    return;
  }
  elements.manualResponseFallback.dataset.state = projection.state || "idle";
  elements.manualResponseFallback.hidden = !projection.visible;
  elements.manualResponseFallback.open = Boolean(projection.open);
  if (elements.manualResponseFallbackSummary) {
    elements.manualResponseFallbackSummary.textContent = projection.summary || "Replacement DM Response";
  }
  if (elements.manualResponseFallbackHint) {
    elements.manualResponseFallbackHint.textContent = projection.hint || "";
  }
  if (elements.pasteResponse) {
    elements.pasteResponse.textContent = projection.pasteLabel || "Paste Response";
  }
  if (elements.importResponse) {
    elements.importResponse.textContent = projection.useLabel || "Use Response";
  }
}
