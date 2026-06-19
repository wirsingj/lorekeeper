export const defaultPlayLogVisibleLimit = 240;
export const playLogPageSize = 120;

export function buildPlayLogProjection(messages = [], { visibleLimit = defaultPlayLogVisibleLimit } = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const limit = Math.max(1, Number(visibleLimit) || defaultPlayLogVisibleLimit);
  const hiddenCount = Math.max(0, safeMessages.length - limit);
  return {
    totalCount: safeMessages.length,
    visibleLimit: limit,
    hiddenCount,
    hasEarlierMessages: hiddenCount > 0,
    nextVisibleLimit: limit + playLogPageSize,
    visibleMessages: hiddenCount > 0 ? safeMessages.slice(hiddenCount) : safeMessages,
  };
}

export function buildMessageLifecycleProjection(message = {}) {
  const status = message?.data?.status || "";
  const lifecycle = message?.data?.lifecycle || "";
  if (message.role !== "player" && message.role !== "party") {
    return null;
  }
  const key = lifecycle || status;
  const labels = {
    waiting_for_dm: {
      label: "Waiting for DM",
      title: "This action is submitted. The table is waiting for the DM response.",
      tone: "waiting",
    },
    turn_waiting_for_dm: {
      label: "Waiting for DM",
      title: "This action is submitted. The table is waiting for the DM response.",
      tone: "waiting",
    },
    waiting_for_import: {
      label: "Waiting for DM result",
      title: "The DM response was received, but the table has not applied it yet.",
      tone: "waiting",
    },
    turn_waiting_for_import: {
      label: "Waiting for DM result",
      title: "The DM response was received, but the table has not applied it yet.",
      tone: "waiting",
    },
    recovering: {
      label: "Recovering",
      title: "The app is replaying this unresolved action so the DM can answer it.",
      tone: "waiting",
    },
    turn_recovering: {
      label: "Recovering",
      title: "The app is replaying this unresolved action so the DM can answer it.",
      tone: "waiting",
    },
    retrying: {
      label: "Trying again",
      title: "The host asked the DM to try this response again.",
      tone: "waiting",
    },
    turn_retrying: {
      label: "Trying again",
      title: "The host asked the DM to try this response again.",
      tone: "waiting",
    },
    resolved: {
      label: "DM answered",
      title: "The DM response for this action was imported.",
      tone: "done",
    },
    turn_resolved: {
      label: "DM answered",
      title: "The DM response for this action was imported.",
      tone: "done",
    },
    needs_review: {
      label: "DM response needs review",
      title: "The DM responded, but LoreKeeper needs the host to review it before play continues.",
      tone: "review",
    },
    turn_needs_review: {
      label: "DM response needs review",
      title: "The DM responded, but LoreKeeper needs the host to review it before play continues.",
      tone: "review",
    },
    timed_out: {
      label: "DM timed out",
      title: "The DM response timed out. Retry is available.",
      tone: "error",
    },
    turn_timed_out: {
      label: "DM timed out",
      title: "The DM response timed out. Retry is available.",
      tone: "error",
    },
    canceled: {
      label: "Canceled",
      title: "This DM response was canceled.",
      tone: "muted",
    },
    turn_canceled: {
      label: "Canceled",
      title: "This DM response was canceled.",
      tone: "muted",
    },
    dropped: {
      label: "Dropped",
      title: "The host removed this staged action before the DM resolved it.",
      tone: "muted",
    },
    guest_input_dropped: {
      label: "Dropped",
      title: "The host removed this staged action before the DM resolved it.",
      tone: "muted",
    },
    failed: {
      label: "DM failed",
      title: message.data?.failureReason || "The DM response failed. Retry is available.",
      tone: "error",
    },
    turn_failed: {
      label: "DM failed",
      title: message.data?.failureReason || "The DM response failed. Retry is available.",
      tone: "error",
    },
    dm_failed_still_staged: {
      label: "Still staged",
      title: message.data?.failureReason || "The DM did not resolve this staged input. It is still available for retry.",
      tone: "review",
    },
    pending_model_submit: {
      label: remotePendingInputLabel(message),
      title: remotePendingInputTitle(message),
      tone: "waiting",
    },
    submitted_to_model: {
      label: "DM answered",
      title: "The host table resolved this guest action with the DM.",
      tone: "done",
    },
    submitted_to_dm: {
      label: "Submitted to DM",
      title: "This party action was sent to the DM.",
      tone: "done",
    },
  };
  return labels[key] || null;
}

export function buildPendingInputActionProjection(message = {}, pendingTurnInputs = []) {
  const pendingInputId = message.data?.pendingInputId;
  if (!pendingInputId || message.data?.status !== "pending_model_submit") {
    return null;
  }
  const input = (Array.isArray(pendingTurnInputs) ? pendingTurnInputs : [])
    .find((entry) => entry.id === pendingInputId && entry.ready && !entry.passed && entry.text);
  if (!input) {
    return null;
  }
  if (message.data?.hostStaged) {
    return {
      id: input.id,
      kind: "drop",
      status: message.data?.holdForGroup ? "Holding for group turn" : "Queued for DM",
      buttonLabel: "Drop",
      title: "Remove this staged guest action without sending it to the DM",
    };
  }
  return {
    id: input.id,
    kind: "stage",
    buttonLabel: "Stage",
    title: "Stage this character action for the next Send Turn",
  };
}

function remotePendingInputLabel(message) {
  if (!message.data?.hostStaged) {
    return "Waiting for host";
  }
  if (message.data?.holdForGroup) {
    return "Waiting for group turn";
  }
  return "Queued for DM";
}

function remotePendingInputTitle(message) {
  if (!message.data?.hostStaged) {
    return "This action reached the table and is waiting for host review.";
  }
  if (message.data?.holdForGroup) {
    return "This guest action reached the host table and is waiting for the grouped table turn.";
  }
  return "This guest action reached the host table and is queued for the DM.";
}
