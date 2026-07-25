export function buildRemoteRelayGuestAuthorityPayload({
  guestId = "",
  entry = {},
  message = {},
  fallbackAuthority = {},
  activeSession = null,
} = {}) {
  const normalizedGuestId = String(guestId || message.guestId || "");
  assertActiveRemoteFriendCode({ message, activeSession });
  if (!entry?.connectionId || !entry?.connectionSecret) {
    throw new Error("Remote guest is not seated yet.");
  }
  return {
    connectionId: entry.connectionId,
    clientId: entry.clientId || `relay-${normalizedGuestId}`,
    connectionSecret: entry.connectionSecret,
    characterId: entry.partyMemberId || message.characterId || "",
    characterName: entry.characterName || "",
    campaignId: entry.campaignId || fallbackAuthority.campaignId || "",
    tableId: entry.tableId || fallbackAuthority.tableId || "",
    sessionId: entry.sessionId || fallbackAuthority.sessionId || "",
  };
}

export function buildRemoteRelayGuestSnapshotQuery({
  guestId = "",
  entry = {},
  message = {},
  fallbackAuthority = {},
  activeSession = null,
} = {}) {
  const payload = buildRemoteRelayGuestAuthorityPayload({
    guestId,
    entry,
    message,
    fallbackAuthority,
    activeSession,
  });
  return {
    connectionId: payload.connectionId,
    clientId: payload.clientId,
    connectionSecret: payload.connectionSecret,
    campaignId: payload.campaignId,
    tableId: payload.tableId,
    sessionId: payload.sessionId,
  };
}

export function compactRemoteRelayError(message, fallbackMessage = "Remote request failed.") {
  const compact = String(message || fallbackMessage).replace(/\s+/g, " ").trim();
  return compact.slice(0, 240) || fallbackMessage;
}

export function buildRemoteRelaySnapshotPayload(snapshot = {}) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot;
  }
  const tableState = snapshot.tableState && typeof snapshot.tableState === "object"
    ? {
        ...snapshot.tableState,
        party: [],
        messages: [],
        tableTalk: [],
      }
    : null;
  return {
    ...snapshot,
    campaignTitle: compactRemoteRelayText(snapshot.campaignTitle, 120),
    campaignSummary: compactRemoteRelayText(snapshot.campaignSummary, 600),
    scene: compactRemoteRelayObject(snapshot.scene, 900),
    assignedCharacter: compactRemoteRelayObject(snapshot.assignedCharacter, 800),
    connection: snapshot.connection ? {
      id: snapshot.connection.id,
      displayName: compactRemoteRelayText(snapshot.connection.displayName, 80),
      status: snapshot.connection.status,
      partyMemberId: snapshot.connection.partyMemberId,
    } : snapshot.connection,
    party: boundedList(snapshot.party ?? snapshot.tableState?.party, 6).map((member) => compactRemoteRelayObject(member, 300)),
    messages: boundedMessages(snapshot.messages ?? tableState?.messages),
    tableTalk: boundedTalk(snapshot.tableTalk ?? tableState?.tableTalk),
    tableState,
  };
}

function assertActiveRemoteFriendCode({ message = {}, activeSession = null } = {}) {
  const activeCode = normalizeFriendCode(activeSession?.code || "");
  if (!activeCode) {
    return;
  }
  const messageCode = normalizeFriendCode(message.code || "");
  if (messageCode !== activeCode) {
    throw new Error("Remote friend code is no longer active. Ask the host for a fresh code.");
  }
}

function normalizeFriendCode(value = "") {
  return String(value || "").trim().toUpperCase();
}

function boundedMessages(messages = []) {
  return boundedList(messages, 3).map((message) => ({
    ...compactRemoteRelayObject(message, 700),
    title: compactRemoteRelayText(message?.title, 120),
    body: compactRemoteRelayText(message?.body, 650),
    meta: compactRemoteRelayText(message?.meta, 120),
    blocks: boundedList(message?.blocks, 2).map((block) => compactRemoteRelayObject(block, 220)),
  }));
}

function boundedTalk(messages = []) {
  return boundedList(messages, 6).map((message) => ({
    ...compactRemoteRelayObject(message, 360),
    playerName: compactRemoteRelayText(message?.playerName, 80),
    text: compactRemoteRelayText(message?.text, 280),
  }));
}

function boundedList(value, limit) {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function compactRemoteRelayObject(value, stringLimit = 800) {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? compactRemoteRelayText(value, stringLimit) : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => compactRemoteRelayObject(item, Math.max(180, Math.floor(stringLimit / 2))));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    typeof entry === "string"
      ? compactRemoteRelayText(entry, stringLimit)
      : Array.isArray(entry) || (entry && typeof entry === "object")
        ? compactRemoteRelayObject(entry, Math.max(240, Math.floor(stringLimit / 2)))
        : entry,
  ]));
}

function compactRemoteRelayText(value, limit = 800) {
  const text = String(value ?? "");
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}
