export const tableTalkVisibleLimit = 80;

export function currentTableTalkMessages({
  guestSnapshot = null,
  multiplayerSnapshot = null,
  campaign = null,
} = {}) {
  if (guestSnapshot) {
    return safeMessages(guestSnapshot.tableState?.tableTalk).length
      ? safeMessages(guestSnapshot.tableState.tableTalk)
      : safeMessages(guestSnapshot.tableTalk);
  }

  return freshestTableTalkMessages(
    safeMessages(multiplayerSnapshot?.tableTalk),
    safeMessages(campaign?.multiplayer?.tableTalk),
  );
}

export function buildTableTalkProjection({
  guestSnapshot = null,
  multiplayerSnapshot = null,
  campaign = null,
  visibleLimit = tableTalkVisibleLimit,
} = {}) {
  const messages = currentTableTalkMessages({ guestSnapshot, multiplayerSnapshot, campaign });
  const limit = Math.max(1, Number(visibleLimit) || tableTalkVisibleLimit);
  const hiddenCount = Math.max(0, messages.length - limit);
  return {
    messages,
    visibleMessages: hiddenCount > 0 ? messages.slice(hiddenCount) : messages,
    totalCount: messages.length,
    visibleLimit: limit,
    hiddenCount,
  };
}

export function freshestTableTalkMessages(snapshotTalk = [], campaignTalk = []) {
  const snapshotMessages = safeMessages(snapshotTalk);
  const campaignMessages = safeMessages(campaignTalk);
  if (!campaignMessages.length) {
    return snapshotMessages;
  }
  if (!snapshotMessages.length) {
    return campaignMessages;
  }

  const snapshotLatest = latestCreatedAt(snapshotMessages);
  const campaignLatest = latestCreatedAt(campaignMessages);
  if (snapshotLatest && campaignLatest && snapshotLatest !== campaignLatest) {
    return snapshotLatest > campaignLatest ? snapshotMessages : campaignMessages;
  }
  if (snapshotMessages.length !== campaignMessages.length) {
    return snapshotMessages.length > campaignMessages.length ? snapshotMessages : campaignMessages;
  }
  return snapshotMessages;
}

function safeMessages(messages) {
  return Array.isArray(messages) ? messages : [];
}

function latestCreatedAt(messages) {
  return messages.at(-1)?.createdAt ?? "";
}
