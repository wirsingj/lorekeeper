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
