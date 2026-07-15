import { isHardBlockedTurnRepair, tableRepairReason } from "./turn-repair-controller.js";

export function buildHostResponseReviewProjection({ repair = null, reviewBatch = null, turnProjection = {} } = {}) {
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
      decisionGuide: hardBlocked
        ? [
          "Try Again keeps player agency protected.",
          "Details shows the exact table check.",
        ]
        : [
          "Try Again asks the DM for a cleaner response.",
          "Use Anyway only if the visible table text is right.",
          "Details shows what LoreKeeper blocked.",
        ],
      tone: "review",
      responseChars: repair.responseText?.length ?? repair.rawText?.length ?? 0,
      pendingChanges: pendingChanges.length,
    };
  }
  if (turnProjection?.canRetry) {
    return {
      state: "failed",
      title: "DM Could Not Answer",
      body: "LoreKeeper did not receive table text from the DM model.",
      nextStep: "Use Try Again from the table. If it keeps failing, check Model Setup and confirm the selected local model is installed and running.",
      decisionGuide: [
        "Try Again reruns the same table prompt.",
        "Check Model Setup if the local model is missing, stopped, or returning errors.",
        "No table state was imported from the failed response.",
      ],
      actions: [
        {
          id: "open_model_setup",
          label: "Open Model Setup",
          title: "Check Ollama, model download, and provider settings",
          kind: "secondary",
        },
      ],
      tone: "error",
      responseChars: 0,
      pendingChanges: pendingChanges.length,
    };
  }
  if (pendingChanges.length) {
    return {
      state: "changes",
      title: "Proposed Table Changes Waiting",
      body: `${pendingChanges.length} proposed state ${pendingChanges.length === 1 ? "change needs" : "changes need"} host review before becoming campaign memory.`,
      nextStep: "Review and save the changes that should become canon.",
      decisionGuide: [
        "Save only the changes that should become campaign memory.",
        "Leave uncertain changes uncommitted until the table is clear.",
      ],
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
    decisionGuide: [],
    actions: [],
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
      summary: hasDraftText ? "Copied DM Response Ready" : "Copied DM Response Fallback",
      hint: "Only use this when you intentionally copied a DM response from another chat and want LoreKeeper to review it.",
      open: Boolean(hasDraftText),
      pasteLabel: "Paste Copied Response",
      useLabel: "Review Copied Response",
    };
  }
  if (pendingChanges.length) {
    return {
      state: "changes",
      visible,
      summary: "Copied DM Response Fallback",
      hint: "Usually you should review the waiting table changes above. Use copied text only for a deliberate alternate DM response.",
      open: Boolean(hasDraftText),
      pasteLabel: "Paste Copied Response",
      useLabel: "Review Copied Response",
    };
  }
  return {
    state: "idle",
    visible,
    summary: "Copied DM Response Fallback",
    hint: "Rare fallback for a deliberately copied DM response. Most tables should use DM Voice or Read Latest instead.",
    open: Boolean(hasDraftText),
    pasteLabel: "Paste Copied Response",
    useLabel: "Review Copied Response",
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
  const children = [title, body, next];
  if (view.decisionGuide?.length) {
    const guide = document.createElement("ul");
    guide.className = "review-decision-guide";
    for (const item of view.decisionGuide) {
      const entry = document.createElement("li");
      entry.textContent = item;
      guide.append(entry);
    }
    children.push(guide);
  }
  if (view.actions?.length) {
    const actions = document.createElement("div");
    actions.className = "review-action-row";
    for (const action of view.actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = [
        "mini-action",
        action.kind === "danger" ? "danger-button" : "secondary-action",
      ].join(" ");
      button.dataset.reviewAction = action.id;
      button.textContent = action.label;
      button.title = action.title || action.label;
      actions.append(button);
    }
    children.push(actions);
  }
  container.replaceChildren(...children);
}

export function buildHostResponseReviewActionPlan(actionId = "") {
  if (actionId === "open_model_setup") {
    return {
      action: "open_settings",
      tab: "ai",
      mode: "app",
      activityText: "Model Setup is open",
      activityState: "waiting",
    };
  }
  return {
    action: "none",
    activityText: "",
    activityState: "idle",
  };
}

export function applyManualResponseFallbackProjection(elements, projection) {
  if (!elements?.manualResponseFallback || !projection) {
    return;
  }
  elements.manualResponseFallback.dataset.state = projection.state || "idle";
  elements.manualResponseFallback.hidden = !projection.visible;
  elements.manualResponseFallback.open = Boolean(projection.open);
  if (elements.manualResponseFallbackSummary) {
    elements.manualResponseFallbackSummary.textContent = projection.summary || "Copied DM Response Fallback";
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
