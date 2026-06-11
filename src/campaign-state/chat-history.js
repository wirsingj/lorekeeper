import { createEmptySessionLog, touchCampaign } from "./schema.js";

export function addChatMessage(campaign, input) {
  const working = structuredClone(campaign);
  const sessionLog = normalizeSessionLog(working.sessionLog);
  const message = createMessage(input, sessionLog.activeSessionId);

  sessionLog.messages.push(message);
  working.sessionLog = sessionLog;

  return {
    campaign: touchCampaign(working),
    message,
  };
}

export function normalizeSessionLog(sessionLog) {
  const fallback = createEmptySessionLog();
  const normalized = {
    activeSessionId: sessionLog?.activeSessionId || fallback.activeSessionId,
    sessions: Array.isArray(sessionLog?.sessions) && sessionLog.sessions.length ? sessionLog.sessions : fallback.sessions,
    messages: Array.isArray(sessionLog?.messages) ? sessionLog.messages.map(normalizeMessage).filter(Boolean) : [],
  };

  if (!normalized.sessions.some((session) => session.id === normalized.activeSessionId)) {
    normalized.sessions.push({
      id: normalized.activeSessionId,
      title: "Campaign Play",
      startedAt: new Date().toISOString(),
      endedAt: null,
      recap: "",
    });
  }

  return normalized;
}

function createMessage(input, fallbackSessionId) {
  const now = new Date().toISOString();
  return normalizeMessage({
    id: input.id || `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: input.sessionId || fallbackSessionId,
    role: input.role,
    title: input.title,
    body: input.body,
    meta: input.meta,
    source: input.source || "lorekeeper_ui",
    providerRunId: input.providerRunId || null,
    createdAt: input.createdAt || now,
  });
}

function normalizeMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }

  const body = String(message.body || "").trim();
  if (!body) {
    return null;
  }

  const role = normalizeRole(message.role);
  return {
    id: message.id || `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    sessionId: message.sessionId || "session-main",
    role,
    title: message.title || (role === "player" ? "You" : "DM"),
    body,
    meta: message.meta || "",
    source: message.source || "unknown",
    providerRunId: message.providerRunId || null,
    createdAt: message.createdAt || new Date().toISOString(),
  };
}

function normalizeRole(role) {
  if (role === "player" || role === "dm" || role === "system") {
    return role;
  }

  if (role === "provider" || role === "assistant") {
    return "dm";
  }

  return "system";
}
