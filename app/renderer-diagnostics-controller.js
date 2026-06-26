export function normalizeDebugPlayMessages(messages = [], options = {}) {
  const {
    offset = 0,
    sessionId = "debug-session",
    cleanMeta = defaultCleanMeta,
    nowMs = Date.now(),
  } = options;
  return (Array.isArray(messages) ? messages : []).map((message, index) => {
    const role = message.role || (index % 2 === 0 ? "player" : "dm");
    return {
      id: message.id || `debug-message-${offset + index + 1}`,
      sessionId: message.sessionId || sessionId,
      role,
      title: message.title || (role === "player" ? "Harness Player" : "DM"),
      body: message.body || `Harness table message ${offset + index + 1}.`,
      meta: cleanMeta(message.meta || ""),
      source: message.source || "debug_harness",
      data: message.data || {},
      createdAt: message.createdAt || new Date(nowMs + index).toISOString(),
    };
  });
}

export function buildTableTimelineSummaryProjection(timeline = [], { limit = 8, formatTime = identity } = {}) {
  const recent = Array.isArray(timeline) ? timeline.slice(-limit).reverse() : [];
  if (!recent.length) {
    return {
      empty: true,
      emptyText: "No table timeline yet.",
      items: [],
    };
  }

  return {
    empty: false,
    emptyText: "",
    items: recent.map((event) => ({
      label: event.label || event.message || event.type || "Table event",
      dateTime: event.at || "",
      timeText: formatTime(event.at),
    })),
  };
}

export function buildSessionHealthSummary(tableSession = {}) {
  return {
    headline: tableSession.headline,
    tone: tableSession.tone,
    phase: tableSession.phase,
    lines: tableSession.lines?.length ? tableSession.lines : ["No blockers detected."],
    tableSession,
  };
}

export function buildRendererDiagnosticsSnapshot({
  generatedAt = new Date().toISOString(),
  url = "",
  clientMode = false,
  sourceMode = "",
  sqlitePath = "",
  providerActivity = {},
  bridgeStatus = "",
  turnProjection = null,
  currentTurn = null,
  prompt = "",
  reviewBatch = null,
  bridge = null,
  repair = null,
  tableSession = null,
  debugSnapshot = null,
  playMessages = [],
  tableTimeline = [],
  diagnosticsEvents = [],
  campaign = null,
} = {}) {
  return {
    generatedAt,
    url,
    clientMode,
    sourceMode,
    sqlitePath: sqlitePath || "",
    providerActivity: {
      text: providerActivity.text || "",
      state: providerActivity.state || "",
    },
    bridgeStatus,
    turnEngine: turnProjection,
    currentTurn: summarizeCurrentTurn(currentTurn),
    promptChars: prompt?.length ?? 0,
    promptTail: prompt ? prompt.slice(-6000) : "",
    reviewBatch,
    bridge,
    turnRepair: summarizeTurnRepair(repair),
    tableSession,
    debugSnapshot,
    sessionHealth: buildSessionHealthSummary(tableSession ?? {}),
    recentPlayMessages: (Array.isArray(playMessages) ? playMessages : []).slice(-30),
    tableTimeline: (Array.isArray(tableTimeline) ? tableTimeline : []).slice(-80),
    diagnosticsEvents: (Array.isArray(diagnosticsEvents) ? diagnosticsEvents : []).slice(-80),
    campaignCounts: campaign ? {
      party: campaign.party?.length ?? 0,
      people: campaign.people?.length ?? 0,
      places: campaign.places?.length ?? 0,
      items: campaign.items?.length ?? 0,
      threads: campaign.quests?.length ?? 0,
      messages: campaign.sessionLog?.messages?.length ?? 0,
    } : {},
  };
}

export function summarizeCurrentTurn(turn) {
  if (!turn) {
    return null;
  }

  return {
    playerMessage: turn.playerMessage,
    playerInputs: turn.playerInputs ?? [],
    parsedMessage: turn.parsedMessage,
    contextSections: turn.contextPack?.sections?.map((section) => ({
      id: section.id,
      title: section.title,
      entries: section.entries?.length ?? 0,
    })) ?? [],
    providerPromptChars: turn.providerPrompt?.length ?? 0,
  };
}

export function summarizeTurnRepair(repair) {
  if (!repair) {
    return null;
  }
  return {
    reason: repair.reason,
    validationErrors: repair.validationErrors,
    parseError: repair.parseError,
    responseTextChars: repair.responseText?.length ?? 0,
    rawTextChars: repair.rawText?.length ?? 0,
    model: repair.providerResult?.model,
    createdAt: repair.createdAt,
  };
}

export function turnFlowTimelineEventDetail(event = {}) {
  const type = event.type || "turn_state_changed";
  const label = turnFlowTimelineLabel(type, event);
  if (!label) {
    return null;
  }
  return {
    type,
    detail: {
      message: label,
      turnId: event.turnId || event.projection?.turnId || "",
      requestId: event.requestId || event.projection?.activeRequestId || "",
      reason: event.reason || event.error || "",
    },
  };
}

export function turnFlowTimelineLabel(type, event = {}) {
  if (type === "turn_locked") return "Turn submitted; DM is resolving it.";
  if (type === "generation_started") return "DM started thinking.";
  if (type === "generation_completed") return "DM response received.";
  if (type === "generation_cancelled") return "DM response canceled.";
  if (type === "generation_failed") return "DM response failed; retry is available.";
  if (type === "turn_retrying") return "Retrying the DM response.";
  if (type === "turn_repair_required") return "DM response needs review.";
  if (type === "turn_repair_cleared") return "DM response review cleared.";
  if (type === "turn_flow_reset") {
    return event.reason === "campaign_changed"
      ? "Campaign switched; table state reset."
      : "Table turn state reset.";
  }
  return "";
}

function defaultCleanMeta(value) {
  return String(value ?? "").trim();
}

function identity(value) {
  return value;
}
