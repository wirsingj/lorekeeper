import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { touchCampaign } from "../campaign-state/schema.js";
import { isAllowedInviteHost } from "./invite-security.js";
import { buildAggregatedPlayerTurn as buildAggregatedPlayerTurnPure } from "./turn-inputs.js";
import { addMissingCombatantsToTurnOrder } from "../rules/combat-turns.js";

// Current local-table authority center.
// Campaign state is still persisted as a single campaign snapshot, but every
// live multiplayer record is stamped with campaign/table/session identity so
// stale guest tabs cannot mutate whatever campaign the host happens to view.
export const multiplayerProtocolVersion = 1;

export const controllerKinds = Object.freeze({
  HOST: "host",
  REMOTE_PLAYER: "remote_player",
  AI_COMPANION: "ai_companion",
  UNASSIGNED: "unassigned",
});

export const hostTurnStates = Object.freeze({
  WAITING_FOR_PLAYER: "waiting_for_player",
  COLLECTING_PARTY_INPUTS: "collecting_party_inputs",
  RESOLVING_TURN: "resolving_turn",
  BROADCASTING_RESULT: "broadcasting_result",
  REVIEWING_UPDATES: "reviewing_updates",
});

export const inviteKinds = Object.freeze({
  PARTY_MEMBER: "party_member",
  CHARACTER_REQUEST: "character_request",
});

const allowedControllerKinds = new Set(Object.values(controllerKinds));
const allowedTurnStates = new Set(Object.values(hostTurnStates));
const defaultMultiplayerSettings = Object.freeze({
  requireGuestActionApproval: false,
  holdGuestActionsForGroupInput: false,
});
export const waitingGuestHeartbeatTimeoutMs = 20000;
const tableStateLimits = Object.freeze({
  party: 24,
  people: 80,
  places: 80,
  items: 80,
  inventory: 80,
  quests: 60,
  factions: 60,
  lore: 60,
  relationships: 80,
  messages: 100,
  tableTalk: 120,
  objectKeys: 60,
  arrayItems: 80,
  stringLength: 4000,
});

export function normalizeControllerFields(member = {}) {
  return {
    ...member,
    controllerKind: normalizeControllerKind(member.controllerKind, inferDefaultControllerKind(member)),
    controllerId: member.controllerId ?? null,
    fallbackControllerKind: normalizeControllerKind(member.fallbackControllerKind, controllerKinds.AI_COMPANION),
  };
}

export function normalizeMultiplayerCampaign(campaign) {
  return {
    ...campaign,
    party: (campaign.party ?? []).map(normalizeControllerFields),
    multiplayer: normalizeMultiplayerState(campaign.multiplayer, campaign),
  };
}

export function startLocalTable(campaign, options = {}) {
  const now = nowIso();
  const port = Number(options.port) || 4173;
  const lanAddress = options.lanAddress || firstLanAddress() || "127.0.0.1";
  const next = normalizeMultiplayerCampaign(campaign);
  const previousSessionId = next.multiplayer.localTable?.sessionId || "";
  const tableId = options.tableId || next.multiplayer.localTable?.tableId || defaultTableId(next);
  const sessionId = options.sessionId || `table-${randomToken(12)}`;
  const freshSession = sessionId !== previousSessionId;
  next.multiplayer.localTable = {
    running: true,
    tableId,
    sessionId,
    host: options.host || "0.0.0.0",
    port,
    lanAddress,
    startedAt: now,
    stoppedAt: null,
  };
  if (freshSession) {
    resetRuntimeForFreshTableSession(next, now);
  } else {
    reviveApprovedConnections(next);
  }
  next.multiplayer.hostTurnState = hostTurnStates.COLLECTING_PARTY_INPUTS;
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "local_table_started",
    summary: `Local table started at ${lanAddress}:${port}.`,
  });
  return touchCampaign(next);
}

function resetRuntimeForFreshTableSession(campaign, now = nowIso()) {
  campaign.multiplayer.connections = campaign.multiplayer.connections.map((connection) => ({
    ...connection,
    status: connection.status === "connected" || connection.status === "pending" ? "disconnected" : connection.status,
    disconnectedAt: connection.disconnectedAt ?? now,
    disconnectReason: connection.disconnectReason || "table_session_restarted",
  }));
  campaign.multiplayer.waitingGuests = campaign.multiplayer.waitingGuests.map((guest) => ({
    ...guest,
    status: guest.status === "waiting" || guest.status === "seated" ? "closed" : guest.status,
    closedAt: guest.closedAt ?? now,
  }));
  campaign.party = campaign.party.map((member) => releaseRemoteControllerToHost(member));
  campaign.multiplayer.seats = campaign.multiplayer.seats.map((seat) => {
    const member = campaign.party.find((item) => item.id === seat.partyMemberId);
    return {
      ...seat,
      controllerKind: member?.controllerKind ?? seat.controllerKind,
      controllerId: member?.controllerId ?? null,
      updatedAt: now,
    };
  });
  campaign.multiplayer.pendingTurnInputs = [];
  campaign.multiplayer.choiceVotes = [];
}

export function stopLocalTable(campaign) {
  // Stopping a table is also an authority reset: remote controllers, waiting
  // guests, and staged inputs must not silently survive into the next session.
  const next = normalizeMultiplayerCampaign(campaign);
  next.multiplayer.localTable = {
    ...next.multiplayer.localTable,
    running: false,
    stoppedAt: nowIso(),
  };
  next.multiplayer.connections = next.multiplayer.connections.map((connection) => ({
    ...connection,
    status: connection.status === "connected" || connection.status === "pending" ? "disconnected" : connection.status,
    disconnectedAt: connection.disconnectedAt ?? nowIso(),
  }));
  next.multiplayer.waitingGuests = next.multiplayer.waitingGuests.map((guest) => ({
    ...guest,
    status: guest.status === "waiting" ? "closed" : guest.status,
    closedAt: guest.status === "waiting" ? nowIso() : guest.closedAt ?? null,
  }));
  next.party = next.party.map((member) => releaseRemoteController(member));
  next.multiplayer.pendingTurnInputs = [];
  next.multiplayer.hostTurnState = hostTurnStates.WAITING_FOR_PLAYER;
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "local_table_stopped",
    summary: "Local table stopped; remote controllers released.",
  });
  return touchCampaign(next);
}

export function updateMultiplayerSettings(campaign, settings = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const current = next.multiplayer.settings;
  next.multiplayer.settings = {
    ...current,
    requireGuestActionApproval: Object.hasOwn(settings, "requireGuestActionApproval")
      ? Boolean(settings.requireGuestActionApproval)
      : current.requireGuestActionApproval,
    holdGuestActionsForGroupInput: Object.hasOwn(settings, "holdGuestActionsForGroupInput")
      ? Boolean(settings.holdGuestActionsForGroupInput)
      : current.holdGuestActionsForGroupInput,
  };
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "multiplayer_settings_updated",
    summary: multiplayerSettingsSummary(next.multiplayer.settings),
  });
  return touchCampaign(next);
}

export function createInviteForPartyMember(campaign, { partyMemberId, host, port } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const member = next.party.find((item) => item.id === partyMemberId);
  if (!member) {
    throw new Error("Party member not found.");
  }
  const table = next.multiplayer.localTable;
  if (!table.running) {
    throw new Error("Start Local Table before creating invite links.");
  }

  const invite = {
    id: `invite-${randomToken(8)}`,
    token: randomToken(18),
    campaignId: next.id,
    tableId: table.tableId || defaultTableId(next),
    sessionId: table.sessionId || "",
    kind: inviteKinds.PARTY_MEMBER,
    seatId: member.id,
    partyMemberId: member.id,
    status: "active",
    approvalRequired: true,
    createdAt: nowIso(),
    revokedAt: null,
    claimedByPlayerId: null,
  };
  const inviteLink = buildInviteLink({
    host: host || table.lanAddress || "127.0.0.1",
    port: port || table.port || 4173,
    campaign: next.id,
    table: invite.tableId,
    session: invite.sessionId,
    seat: member.id,
    token: invite.token,
  });

  next.multiplayer.invites = [...next.multiplayer.invites.filter((item) => item.id !== invite.id), invite];
  next.multiplayer.seats = upsertById(next.multiplayer.seats, {
    id: member.id,
    partyMemberId: member.id,
    label: member.name,
    controllerKind: member.controllerKind,
    controllerId: member.controllerId ?? null,
    inviteId: invite.id,
    updatedAt: nowIso(),
  });
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "invite_created",
    summary: `Invite created for ${member.name}.`,
    partyMemberId: member.id,
  });

  return {
    campaign: touchCampaign(next),
    invite,
    inviteLink,
  };
}

export function createCharacterRequestInvite(campaign, { host, port } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const table = next.multiplayer.localTable;
  if (!table.running) {
    throw new Error("Start Local Table before creating invite links.");
  }

  const invite = {
    id: `invite-${randomToken(8)}`,
    token: randomToken(18),
    campaignId: next.id,
    tableId: table.tableId || defaultTableId(next),
    sessionId: table.sessionId || "",
    kind: inviteKinds.CHARACTER_REQUEST,
    seatId: "new-character",
    partyMemberId: null,
    status: "active",
    approvalRequired: true,
    createdAt: nowIso(),
    revokedAt: null,
    claimedByPlayerId: null,
  };
  const inviteLink = buildInviteLink({
    host: host || table.lanAddress || "127.0.0.1",
    port: port || table.port || 4173,
    campaign: next.id,
    table: invite.tableId,
    session: invite.sessionId,
    seat: invite.seatId,
    token: invite.token,
  });

  next.multiplayer.invites = [...next.multiplayer.invites, invite];
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "character_request_invite_created",
    summary: "Open character request invite created.",
  });

  return {
    campaign: touchCampaign(next),
    invite,
    inviteLink,
  };
}

export function registerWaitingGuest(campaign, { playerName, clientId, campaignId, tableId, sessionId, tableSessionId, preferredPartyMemberId } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  if (!next.multiplayer.localTable?.running) {
    throw publicMultiplayerError("The host local table is not open yet.", 409);
  }
  assertTableAuthority(next, { campaignId, tableId, sessionId: sessionId || tableSessionId });
  const normalizedClientId = compactLine(clientId || "", 120);
  const displayName = compactLine(playerName || "Guest Player", 80);
  const preferredSeatId = normalizePreferredSeatId(next, preferredPartyMemberId);
  const existing = normalizedClientId
    ? next.multiplayer.waitingGuests.find((guest) =>
      guest.clientId === normalizedClientId &&
      (guest.status === "waiting" || guest.status === "seated")
    )
    : null;
  if (existing) {
    existing.displayName = displayName || existing.displayName;
    existing.lastSeenAt = nowIso();
    existing.preferredPartyMemberId = preferredSeatId || existing.preferredPartyMemberId || null;
    if (!existing.secret) {
      existing.secret = randomToken(24);
    }
    return {
      campaign: touchCampaign(next),
      waitingGuest: existing,
      waitingSecret: existing.secret,
    };
  }

  const waitingGuest = {
    id: `wait-${randomToken(10)}`,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    displayName,
    clientId: normalizedClientId,
    status: "waiting",
    secret: randomToken(24),
    requestedAt: nowIso(),
    lastSeenAt: nowIso(),
    seatedAt: null,
    connectionId: null,
    partyMemberId: null,
    preferredPartyMemberId: preferredSeatId,
    deniedAt: null,
  };
  next.multiplayer.waitingGuests = upsertById(next.multiplayer.waitingGuests, waitingGuest);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "guest_waiting",
    summary: waitingGuest.preferredPartyMemberId
      ? `${waitingGuest.displayName || "Guest"} requested ${seatLabel(next, waitingGuest.preferredPartyMemberId)}.`
      : `${waitingGuest.displayName || "Guest"} is waiting for a table seat.`,
    waitingGuestId: waitingGuest.id,
    partyMemberId: waitingGuest.preferredPartyMemberId || null,
  });
  return {
    campaign: touchCampaign(next),
    waitingGuest,
    waitingSecret: waitingGuest.secret,
  };
}

export function createWaitingGuestSnapshot(campaign, { waitingGuestId, clientId, waitingSecret, campaignId, tableId, sessionId, tableSessionId } = {}) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(normalized, { campaignId, tableId, sessionId: sessionId || tableSessionId });
  const waitingGuest = normalized.multiplayer.waitingGuests.find((guest) => guest.id === waitingGuestId);
  if (!waitingGuest) {
    throw publicMultiplayerError("Waiting guest not found. Ask the host for the table address again.", 404);
  }
  assertWaitingGuestSecret(waitingGuest, waitingSecret);
  const normalizedClientId = compactLine(clientId || "", 120);
  if (waitingGuest.clientId && normalizedClientId && waitingGuest.clientId !== normalizedClientId) {
    throw publicMultiplayerError("This waiting room session belongs to a different device.", 403);
  }
  waitingGuest.lastSeenAt = nowIso();
  const connection = waitingGuest.connectionId
    ? normalized.multiplayer.connections.find((item) => item.id === waitingGuest.connectionId)
    : null;
  const seated = waitingGuest.status === "seated" && connection?.status === "connected";
  return {
    protocolVersion: multiplayerProtocolVersion,
    revision: tableRevision(normalized),
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    localTable: normalized.multiplayer.localTable,
    waitingGuest: publicWaitingGuest(waitingGuest),
    seated,
    connection: connection ? publicConnection(connection) : null,
    connectionSecret: seated ? connection.secret : "",
    snapshot: seated
      ? createGuestSnapshot(normalized, connection.id, {
        clientId: waitingGuest.clientId,
        connectionSecret: connection.secret,
      })
      : null,
  };
}

export function heartbeatWaitingGuest(campaign, options = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, {
    campaignId: options.campaignId,
    tableId: options.tableId,
    sessionId: options.sessionId || options.tableSessionId,
  });
  const waitingGuest = next.multiplayer.waitingGuests.find((guest) => guest.id === options.waitingGuestId);
  if (!waitingGuest) {
    throw publicMultiplayerError("Waiting room session expired. Ask the host for the guest link, then click Ask To Join again.", 404);
  }
  assertWaitingGuestSecret(waitingGuest, options.waitingSecret);
  const normalizedClientId = compactLine(options.clientId || "", 120);
  if (waitingGuest.clientId && normalizedClientId && waitingGuest.clientId !== normalizedClientId) {
    throw publicMultiplayerError("This waiting room session belongs to a different device.", 403);
  }
  if (waitingGuest.status !== "waiting" && waitingGuest.status !== "seated") {
    throw publicMultiplayerError("This waiting room seat is no longer active. Click Ask To Join again if you still need a seat.", 409);
  }
  waitingGuest.lastSeenAt = nowIso();
  const campaignWithHeartbeat = touchCampaign(next);
  return {
    campaign: campaignWithHeartbeat,
    snapshot: createWaitingGuestSnapshot(campaignWithHeartbeat, options),
  };
}

export function seatWaitingGuest(campaign, { waitingGuestId, partyMemberId } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const waitingGuest = next.multiplayer.waitingGuests.find((guest) => guest.id === waitingGuestId);
  if (!waitingGuest || waitingGuest.status !== "waiting") {
    throw publicMultiplayerError("That guest is no longer waiting. Ask them to click Ask To Join again.", 409);
  }
  if (!isFreshWaitingGuest(waitingGuest)) {
    throw publicMultiplayerError(`${waitingGuest.displayName || "That guest"} is no longer connected to the waiting room. Ask them to click Ask To Join again.`, 409);
  }
  const member = next.party.find((item) => item.id === partyMemberId);
  if (!member) {
    throw new Error("Party member not found.");
  }
  const playerId = `player-${slugify(waitingGuest.displayName || waitingGuest.clientId || "guest")}-${randomToken(4)}`;
  const connectionId = `conn-${randomToken(10)}`;
  const invite = {
    id: `invite-${randomToken(8)}`,
    token: randomToken(18),
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    kind: inviteKinds.PARTY_MEMBER,
    seatId: member.id,
    partyMemberId: member.id,
    status: "active",
    approvalRequired: false,
    createdAt: nowIso(),
    revokedAt: null,
    claimedByPlayerId: playerId,
    source: "waiting_room",
  };
  const player = {
    id: playerId,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    displayName: waitingGuest.displayName || "Guest Player",
    kind: "remote_player",
    clientId: waitingGuest.clientId,
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  const connection = {
    id: connectionId,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    playerId,
    displayName: player.displayName,
    inviteId: invite.id,
    partyMemberId: member.id,
    proposedCharacter: null,
    requestedNewCharacter: false,
    status: "connected",
    secret: randomToken(24),
    requestedAt: waitingGuest.requestedAt || nowIso(),
    approvedAt: nowIso(),
    deniedAt: null,
    disconnectedAt: null,
    source: "waiting_room",
  };

  releaseActiveConnectionsForPartyMember(next, member.id, "controller_reassigned_waiting_guest");
  next.multiplayer.invites = upsertById(next.multiplayer.invites, invite);
  next.multiplayer.players = upsertById(next.multiplayer.players, player);
  next.multiplayer.connections = upsertById(next.multiplayer.connections, connection);
  next.multiplayer.seats = upsertById(next.multiplayer.seats, {
    id: member.id,
    partyMemberId: member.id,
    label: member.name,
    controllerKind: controllerKinds.REMOTE_PLAYER,
    controllerId: player.id,
    inviteId: invite.id,
    updatedAt: nowIso(),
  });
  waitingGuest.status = "seated";
  waitingGuest.seatedAt = nowIso();
  waitingGuest.connectionId = connection.id;
  waitingGuest.partyMemberId = member.id;
  assignController(next, connection);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "waiting_guest_seated",
    summary: `${waitingGuest.displayName || "Guest"} was seated as ${member.name}.`,
    waitingGuestId: waitingGuest.id,
    connectionId: connection.id,
    partyMemberId: member.id,
  });
  return touchCampaign(next);
}

export function revokeInvite(campaign, inviteId) {
  const next = normalizeMultiplayerCampaign(campaign);
  const invite = next.multiplayer.invites.find((item) => item.id === inviteId);
  if (!invite) {
    throw new Error("Invite not found.");
  }
  invite.status = "revoked";
  invite.revokedAt = nowIso();
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "invite_revoked",
    summary: "Invite revoked.",
    partyMemberId: invite.partyMemberId,
  });
  return touchCampaign(next);
}

export function requestJoin(campaign, { inviteLink, playerName, clientId, proposedCharacter } = {}) {
  const parsed = typeof inviteLink === "string" ? parseInviteLink(inviteLink) : inviteLink;
  if (!parsed.valid) {
    throw publicMultiplayerError(parsed.error || "Invalid invite link.", 400);
  }

  const next = normalizeMultiplayerCampaign(campaign);
  if (parsed.campaign !== next.id) {
    throw publicMultiplayerError("Invite is for a different campaign. Ask the host for a fresh invite link.", 409);
  }
  assertTableAuthority(next, {
    campaignId: parsed.campaign,
    tableId: parsed.tableId,
    sessionId: parsed.sessionId,
  });
  const invite = findActiveInvite(next, parsed);
  const requestedNewCharacter = hasCharacterProposal(proposedCharacter);
  const isCharacterRequest = invite.kind === inviteKinds.CHARACTER_REQUEST || !invite.partyMemberId || requestedNewCharacter;
  const member = isCharacterRequest ? null : next.party.find((item) => item.id === invite.partyMemberId);
  const characterProposal = isCharacterRequest ? normalizeCharacterProposal(proposedCharacter, playerName) : null;
  if (isCharacterRequest && !characterProposal.name) {
    throw publicMultiplayerError("Character name is required for this invite.", 400);
  }
  if (!isCharacterRequest && !member) {
    throw publicMultiplayerError("Invite seat no longer exists. Ask the host for a fresh invite link.", 409);
  }
  const existing = findExistingConnectionForClient(next, invite.id, clientId);
  if (existing) {
    if (!existing.secret) {
      existing.secret = randomToken(24);
    }
    const existingPlayer = next.multiplayer.players.find((player) => player.id === existing.playerId);
    if (existingPlayer) {
      existingPlayer.displayName = compactLine(playerName || existingPlayer.displayName || "Guest Player", 80);
      existingPlayer.lastSeenAt = nowIso();
    }
    existing.displayName = existingPlayer?.displayName || existing.displayName;
    existing.deniedAt = existing.status === "denied" ? existing.deniedAt : null;
    existing.disconnectedAt = existing.status === "disconnected" ? existing.disconnectedAt : null;
    if (characterProposal) {
      existing.proposedCharacter = characterProposal;
    }
    if (existing.status === "disconnected") {
      existing.status = "connected";
      existing.approvedAt = existing.approvedAt || nowIso();
      existing.disconnectedAt = null;
      next.multiplayer.events = appendEvent(next.multiplayer.events, {
        type: "guest_reconnected",
        summary: `${existing.displayName || "Guest"} reconnected to the table.`,
        connectionId: existing.id,
        partyMemberId: existing.partyMemberId ?? null,
      });
    }
    if (existing.status === "connected") {
      assignController(next, existing);
    }
    return {
      campaign: touchCampaign(next),
      connection: existing,
      player: existingPlayer ?? {
        id: existing.playerId,
        displayName: existing.displayName,
        kind: "remote_player",
        clientId: compactLine(clientId || "", 120),
        createdAt: existing.requestedAt,
        lastSeenAt: nowIso(),
      },
      approved: existing.status === "connected",
      connectionSecret: existing.secret,
    };
  }

  const playerId = `player-${slugify(playerName || clientId || "guest")}-${randomToken(4)}`;
  const connectionId = `conn-${randomToken(10)}`;
  const player = {
    id: playerId,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    displayName: compactLine(playerName || "Guest Player", 80),
    kind: "remote_player",
    clientId: compactLine(clientId || "", 120),
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  const connection = {
    id: connectionId,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    playerId,
    displayName: player.displayName,
    inviteId: invite.id,
    partyMemberId: member?.id ?? null,
    proposedCharacter: characterProposal,
    requestedNewCharacter,
    status: invite.approvalRequired ? "pending" : "connected",
    secret: randomToken(24),
    requestedAt: nowIso(),
    approvedAt: invite.approvalRequired ? null : nowIso(),
    deniedAt: null,
    disconnectedAt: null,
  };

  next.multiplayer.players = upsertById(next.multiplayer.players, player);
  next.multiplayer.connections = upsertById(next.multiplayer.connections, connection);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "join_requested",
    summary: isCharacterRequest
      ? `${player.displayName} requested to join as ${characterProposal.name}.`
      : `${player.displayName} requested control of ${member.name}.`,
    connectionId,
    partyMemberId: member?.id ?? null,
  });

  if (!invite.approvalRequired) {
    assignController(next, connection);
  }

  return {
    campaign: touchCampaign(next),
    connection,
    player,
    approved: connection.status === "connected",
    connectionSecret: connection.secret,
  };
}

export function approveJoinRequest(campaign, connectionId, options = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error("Join request not found.");
  }
  if (connection.status === "denied") {
    throw new Error("Join request was denied.");
  }
  const hostIntegrationPrompt = compactLine(options.hostIntegrationPrompt || options.hostContext || "", 1600);
  if (hostIntegrationPrompt) {
    connection.hostIntegrationPrompt = hostIntegrationPrompt;
  }
  let createdMember = null;
  if (!connection.partyMemberId) {
    const member = createPartyMemberFromProposal(connection.proposedCharacter, connection.displayName, { hostIntegrationPrompt });
    const existingIds = new Set(next.party.map((item) => item.id));
    const uniqueMember = {
      ...member,
      id: uniqueId(member.id, existingIds),
    };
    next.party = [...next.party, uniqueMember];
    createdMember = uniqueMember;
    connection.partyMemberId = uniqueMember.id;
    const invite = next.multiplayer.invites.find((item) => item.id === connection.inviteId);
    if (invite && (invite.kind === inviteKinds.CHARACTER_REQUEST || !invite.partyMemberId)) {
      invite.partyMemberId = uniqueMember.id;
      invite.seatId = uniqueMember.id;
    }
    next.multiplayer.seats = upsertById(next.multiplayer.seats, {
      id: uniqueMember.id,
      partyMemberId: uniqueMember.id,
      label: uniqueMember.name,
      controllerKind: uniqueMember.controllerKind,
      controllerId: uniqueMember.controllerId ?? null,
      inviteId: connection.inviteId,
      updatedAt: nowIso(),
    });
  }
  connection.status = "connected";
  connection.approvedAt = connection.approvedAt || nowIso();
  connection.disconnectedAt = null;
  next.multiplayer.connections = next.multiplayer.connections.map((item) => (
    item.id !== connection.id && item.partyMemberId === connection.partyMemberId && item.status === "pending"
      ? { ...item, status: "disconnected", disconnectedAt: nowIso() }
      : item
  ));
  assignController(next, connection);
  if (createdMember) {
    markPartyMemberPresent(next, createdMember.id);
    const reconciledCombat = reconcileActiveCombatParty(next, `${createdMember.name} joined the combat.`);
    next.combat = reconciledCombat.combat;
    next.scene = reconciledCombat.scene;
    appendCharacterJoinMessage(next, createdMember, connection);
  }
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "join_approved",
    summary: `${connection.displayName} joined the table${connection.proposedCharacter?.name ? ` as ${connection.proposedCharacter.name}` : ""}.`,
    connectionId,
    partyMemberId: connection.partyMemberId,
  });
  return touchCampaign(next);
}

export function joinPartyMemberCombat(campaign, { partyMemberId, connectionId = "", clientId = "", connectionSecret = "", campaignId = "", tableId = "", sessionId = "" } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, { campaignId, tableId, sessionId });
  const member = next.party.find((item) => item.id === partyMemberId);
  if (!member) {
    throw new Error("Party member not found.");
  }
  if (!next.combat?.inCombat) {
    throw new Error("No active combat to join.");
  }

  if (connectionId) {
    const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
    if (!connection || connection.status !== "connected") {
      throw new Error("Connection is not approved.");
    }
    assertClientMatchesConnection(next, connection, clientId);
    assertConnectionSecret(connection, connectionSecret);
    if (connection.partyMemberId !== partyMemberId) {
      throw new Error("This player cannot join combat for that character.");
    }
    connection.lastSeenAt = nowIso();
  }

  markPartyMemberPresent(next, partyMemberId);
  const reconciled = reconcileActiveCombatParty(next, `${member.name} joined the combat.`);
  reconciled.multiplayer.events = appendEvent(reconciled.multiplayer.events, {
    type: "combat_joined",
    summary: `${member.name} joined the combat.`,
    connectionId,
    partyMemberId,
  });
  return touchCampaign(reconciled);
}

export function denyJoinRequest(campaign, connectionId) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error("Join request not found.");
  }
  connection.status = "denied";
  connection.deniedAt = nowIso();
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "join_denied",
    summary: `${connection.displayName} was denied table access.`,
    connectionId,
    partyMemberId: connection.partyMemberId,
  });
  return touchCampaign(next);
}

export function submitGuestAction(campaign, { connectionId, clientId, connectionSecret, characterId, text, ready = true, campaignId = "", tableId = "", sessionId = "" } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, { campaignId, tableId, sessionId });
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connection is not approved.");
  }
  assertClientMatchesConnection(next, connection, clientId);
  assertConnectionSecret(connection, connectionSecret);
  if (connection.partyMemberId !== characterId) {
    throw new Error("Guest can only submit for their assigned party member.");
  }
  const member = ensureConnectedController(next, connection);
  if (!member || member.id !== characterId) {
    throw new Error("Guest does not control that party member.");
  }
  const trimmedText = compactLine(text, 1200);
  if (!trimmedText && ready) {
    throw new Error("Action text is required.");
  }

  const input = {
    id: `input-${connection.playerId}-${characterId}`,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    type: "player_action",
    playerId: connection.playerId,
    playerName: connection.displayName,
    characterId,
    characterName: member.name,
    text: trimmedText,
    ready: Boolean(ready),
    passed: false,
    updatedAt: nowIso(),
  };
  next.multiplayer.pendingTurnInputs = upsertById(next.multiplayer.pendingTurnInputs, input);
  appendVisibleRemoteMessage(next, input, {
    requireApproval: next.multiplayer.settings.requireGuestActionApproval,
    holdForGroup: next.multiplayer.settings.holdGuestActionsForGroupInput,
  });
  next.multiplayer.hostTurnState = hostTurnStates.COLLECTING_PARTY_INPUTS;
  connection.lastSeenAt = nowIso();
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "player_action_submit",
    summary: `${member.name} submitted an action.`,
    connectionId,
    partyMemberId: characterId,
  });
  return touchCampaign(next);
}

export function submitGuestChoiceVote(campaign, {
  connectionId,
  clientId,
  connectionSecret,
  characterId,
  choiceKey,
  optionId,
  optionLabel,
  optionText,
  prompt,
  campaignId = "",
  tableId = "",
  sessionId = "",
} = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, { campaignId, tableId, sessionId });
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connection is not approved.");
  }
  assertClientMatchesConnection(next, connection, clientId);
  assertConnectionSecret(connection, connectionSecret);
  if (connection.partyMemberId !== characterId) {
    throw new Error("Guest can only vote for their assigned party member.");
  }
  const member = ensureConnectedController(next, connection);
  if (!member || member.id !== characterId) {
    throw new Error("Guest does not control that party member.");
  }
  const normalizedChoiceKey = compactLine(choiceKey || "", 500);
  const normalizedOptionId = compactLine(optionId || optionLabel || "", 120);
  if (!normalizedChoiceKey || !normalizedOptionId) {
    throw new Error("Choice vote must identify a choice and option.");
  }
  const vote = {
    id: `vote-${connection.playerId}-${characterId}-${normalizedChoiceKey}`,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    choiceKey: normalizedChoiceKey,
    optionId: normalizedOptionId,
    optionLabel: compactLine(optionLabel || normalizedOptionId, 12),
    optionText: compactLine(optionText || "", 800),
    prompt: compactLine(prompt || "", 500),
    playerId: connection.playerId,
    playerName: connection.displayName,
    characterId,
    characterName: member.name,
    updatedAt: nowIso(),
  };
  next.multiplayer.choiceVotes = upsertById(
    (next.multiplayer.choiceVotes ?? []).filter((item) => sameTableRecord(item, next)),
    vote,
  ).slice(-200);
  connection.lastSeenAt = nowIso();
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "choice_vote",
    summary: `${member.name} voted ${vote.optionLabel}.`,
    connectionId,
    partyMemberId: characterId,
    choiceKey: normalizedChoiceKey,
    optionId: normalizedOptionId,
  });
  return touchCampaign(next);
}

export function passGuestAction(campaign, { connectionId, clientId, connectionSecret, characterId, campaignId = "", tableId = "", sessionId = "" } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, { campaignId, tableId, sessionId });
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connection is not approved.");
  }
  assertClientMatchesConnection(next, connection, clientId);
  assertConnectionSecret(connection, connectionSecret);
  if (connection.partyMemberId !== characterId) {
    throw new Error("Guest can only pass for their assigned party member.");
  }
  const member = ensureConnectedController(next, connection);
  if (!member || member.id !== characterId) {
    throw new Error("Guest does not control that party member.");
  }
  const input = {
    id: `input-${connection.playerId}-${characterId}`,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    type: "player_action",
    playerId: connection.playerId,
    playerName: connection.displayName,
    characterId,
    characterName: member?.name || "Assigned character",
    text: "",
    ready: true,
    passed: true,
    updatedAt: nowIso(),
  };
  next.multiplayer.pendingTurnInputs = upsertById(next.multiplayer.pendingTurnInputs, input);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "player_pass",
    summary: `${input.characterName} passed.`,
    connectionId,
    partyMemberId: characterId,
  });
  return touchCampaign(next);
}

export function postTableTalk(campaign, { connectionId, clientId, connectionSecret, playerName, text, campaignId = "", tableId = "", sessionId = "" } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(next, { campaignId, tableId, sessionId });
  const trimmedText = compactLine(text, 800);
  if (!trimmedText) {
    throw new Error("Table talk text is required.");
  }

  let connection = null;
  let player = null;
  if (connectionId) {
    connection = next.multiplayer.connections.find((item) => item.id === connectionId);
    if (!connection || connection.status !== "connected") {
      throw new Error("Connection is not approved.");
    }
    assertClientMatchesConnection(next, connection, clientId);
    assertConnectionSecret(connection, connectionSecret);
    player = next.multiplayer.players.find((item) => item.id === connection.playerId) ?? null;
    connection.lastSeenAt = nowIso();
    if (player) {
      player.lastSeenAt = nowIso();
    }
  }

  const message = {
    id: `talk-${randomToken(8)}`,
    campaignId: next.id,
    tableId: currentTableId(next),
    sessionId: currentSessionId(next),
    playerId: connection?.playerId ?? "host",
    playerName: compactLine(connection?.displayName || playerName || "Host", 80),
    role: connection ? "guest" : "host",
    text: trimmedText,
    createdAt: nowIso(),
  };

  next.multiplayer.tableTalk = [
    ...(Array.isArray(next.multiplayer.tableTalk) ? next.multiplayer.tableTalk : []),
    message,
  ].slice(-tableStateLimits.tableTalk);
  return touchCampaign(next);
}

export function disconnectGuest(campaign, connectionId, options = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error("Connection not found.");
  }
  if (options.requireConnectionSecret) {
    assertClientMatchesConnection(next, connection, options.clientId);
    assertConnectionSecret(connection, options.connectionSecret);
  }
  connection.status = "disconnected";
  connection.disconnectedAt = nowIso();
  next.party = next.party.map((member) => (
    member.id === connection.partyMemberId && member.controllerId === connection.playerId
      ? releaseRemoteControllerToHost(member)
      : member
  ));
  next.multiplayer.pendingTurnInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.playerId !== connection.playerId);
  next.multiplayer.waitingGuests = next.multiplayer.waitingGuests.map((guest) => (
    guest.connectionId === connection.id || (guest.partyMemberId === connection.partyMemberId && guest.clientId === connection.clientId)
      ? {
        ...guest,
        status: "closed",
        closedAt: nowIso(),
      }
      : guest
  ));
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "guest_disconnected",
    summary: `${connection.displayName} disconnected; character control returned to the host.`,
    connectionId,
    partyMemberId: connection.partyMemberId,
  });
  return touchCampaign(next);
}

export function revokeController(campaign, partyMemberId) {
  const next = normalizeMultiplayerCampaign(campaign);
  next.party = next.party.map((member) => member.id === partyMemberId ? releaseRemoteController(member) : member);
  next.multiplayer.connections = next.multiplayer.connections.map((connection) => (
    connection.partyMemberId === partyMemberId && connection.status === "connected"
      ? { ...connection, status: "disconnected", disconnectedAt: nowIso() }
      : connection
  ));
  next.multiplayer.pendingTurnInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.characterId !== partyMemberId);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "controller_revoked",
    summary: "Remote controller revoked.",
    partyMemberId,
  });
  return touchCampaign(next);
}

export function returnToAiCompanion(campaign, partyMemberId) {
  const next = normalizeMultiplayerCampaign(campaign);
  next.party = next.party.map((member) => (
    member.id === partyMemberId
      ? {
        ...member,
        controllerKind: controllerKinds.AI_COMPANION,
        controllerId: null,
        fallbackControllerKind: controllerKinds.AI_COMPANION,
      }
      : member
  ));
  releaseActiveConnectionsForPartyMember(next, partyMemberId, "controller_returned_to_ai");
  next.multiplayer.pendingTurnInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.characterId !== partyMemberId);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "controller_ai_companion",
    summary: "Character returned to AI companion control.",
    partyMemberId,
  });
  return touchCampaign(next);
}

export function setHostController(campaign, partyMemberId) {
  const next = normalizeMultiplayerCampaign(campaign);
  next.party = next.party.map((member) => (
    member.id === partyMemberId
      ? {
        ...member,
        controllerKind: controllerKinds.HOST,
        controllerId: "host",
        fallbackControllerKind: controllerKinds.HOST,
      }
      : member
  ));
  releaseActiveConnectionsForPartyMember(next, partyMemberId, "controller_assigned_to_host");
  next.multiplayer.pendingTurnInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.characterId !== partyMemberId);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "controller_host",
    summary: "Character assigned to host control.",
    partyMemberId,
  });
  return touchCampaign(next);
}

export function buildAggregatedPlayerTurn(campaign, { hostText = "" } = {}) {
  return buildAggregatedPlayerTurnPure(normalizeMultiplayerCampaign(campaign), { hostText });
}

export function clearPendingTurnInputs(campaign, inputIds = null, options = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const ids = Array.isArray(inputIds) && inputIds.length ? new Set(inputIds) : null;
  const clearedIds = ids ?? new Set(next.multiplayer.pendingTurnInputs.map((input) => input.id));
  next.multiplayer.pendingTurnInputs = ids
    ? next.multiplayer.pendingTurnInputs.filter((input) => !ids.has(input.id))
    : [];
  markClearedPendingMessages(next, clearedIds, options);
  next.multiplayer.hostTurnState = options.disposition === "dropped"
    ? hostTurnStates.COLLECTING_PARTY_INPUTS
    : hostTurnStates.RESOLVING_TURN;
  return touchCampaign(next);
}

export function createHostSnapshot(campaign) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  const revision = tableRevision(normalized);
  return {
    protocolVersion: multiplayerProtocolVersion,
    revision,
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    localTable: {
      ...normalized.multiplayer.localTable,
      campaignId: normalized.id,
    },
    settings: normalized.multiplayer.settings,
    hostTurnState: normalized.multiplayer.hostTurnState,
    party: normalized.party.map((member) => ({
      id: member.id,
      name: member.name,
      controllerKind: member.controllerKind,
      controllerId: member.controllerId ?? null,
      fallbackControllerKind: member.fallbackControllerKind,
    })),
    invites: normalized.multiplayer.invites.map((invite) => ({
      id: invite.id,
      partyMemberId: invite.partyMemberId,
      status: invite.status,
      createdAt: invite.createdAt,
      revokedAt: invite.revokedAt,
    })),
    connections: normalized.multiplayer.connections.map(publicConnection),
    waitingGuests: normalized.multiplayer.waitingGuests
      .filter((guest) => guest.status === "waiting")
      .filter((guest) => isFreshWaitingGuest(guest))
      .map(publicWaitingGuest),
    pendingTurnInputs: normalized.multiplayer.pendingTurnInputs,
    choiceVotes: normalized.multiplayer.choiceVotes.map(publicChoiceVote),
    tableTalk: normalized.multiplayer.tableTalk.map(publicTableTalkMessage),
    events: normalized.multiplayer.events.slice(-20),
  };
}

function isFreshWaitingGuest(guest, nowMs = Date.now()) {
  const seenAt = Date.parse(guest?.lastSeenAt || guest?.requestedAt || "");
  if (!Number.isFinite(seenAt)) {
    return false;
  }
  return nowMs - seenAt <= waitingGuestHeartbeatTimeoutMs;
}

function isJoinableGuestSeat(member) {
  const normalized = normalizeControllerFields(member);
  if (normalized.controllerKind === controllerKinds.REMOTE_PLAYER) {
    return false;
  }
  if (normalized.controllerKind === controllerKinds.HOST && member.inviteIntent !== "remote_player") {
    return false;
  }
  return true;
}

function normalizePreferredSeatId(campaign, preferredPartyMemberId) {
  const requested = compactLine(preferredPartyMemberId || "", 160);
  if (!requested) {
    return null;
  }
  const joinable = new Set(joinableGuestSeats(campaign).map((seat) => seat.id));
  return joinable.has(requested) ? requested : null;
}

function sameTableRecord(record, campaign) {
  return (!record.campaignId || record.campaignId === campaign.id) &&
    (!record.tableId || record.tableId === currentTableId(campaign)) &&
    (!record.sessionId || record.sessionId === currentSessionId(campaign));
}

function seatLabel(campaign, partyMemberId) {
  return campaign.party?.find((member) => member.id === partyMemberId)?.name || "a party seat";
}

function assertLocalTableSession(campaign, tableSessionId) {
  assertTableAuthority(campaign, { sessionId: tableSessionId });
}

function assertTableAuthority(campaign, { campaignId = "", tableId = "", sessionId = "" } = {}) {
  const expectedCampaignId = compactLine(campaignId || "", 160);
  if (expectedCampaignId && expectedCampaignId !== campaign.id) {
    throw publicMultiplayerError("That request belongs to a different campaign. Ask the host for a fresh table link.", 409);
  }

  const expectedTableId = compactLine(tableId || "", 160);
  if (expectedTableId && expectedTableId !== currentTableId(campaign)) {
    throw publicMultiplayerError("That request belongs to a different table. Ask the host for a fresh table link.", 409);
  }

  const expectedSessionId = compactLine(sessionId || "", 160);
  if (expectedSessionId && expectedSessionId !== currentSessionId(campaign)) {
    throw publicMultiplayerError("That table session is no longer active. Ask the host for a fresh table link.", 409);
  }
}

function normalizeOwnedRecord(record = {}, campaign = {}, multiplayer = {}) {
  return {
    ...record,
    campaignId: record.campaignId || campaign.id || "",
    tableId: record.tableId || multiplayer.localTable?.tableId || defaultTableId(campaign),
    sessionId: record.sessionId || multiplayer.localTable?.sessionId || "",
  };
}

function currentTableId(campaign) {
  return campaign.multiplayer?.localTable?.tableId || defaultTableId(campaign);
}

function currentSessionId(campaign) {
  return campaign.multiplayer?.localTable?.sessionId || "";
}

function defaultTableId(campaign = {}) {
  return `table-${slugify(campaign.id || campaign.title || "campaign")}`;
}

export function createGuestSnapshot(campaign, connectionId, options = {}) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  assertTableAuthority(normalized, {
    campaignId: options.campaignId,
    tableId: options.tableId,
    sessionId: options.sessionId,
  });
  const revision = tableRevision(normalized);
  const requestedConnection = normalized.multiplayer.connections.find((item) => item.id === connectionId);
  const connection =
    findApprovedSiblingConnection(normalized, requestedConnection) ??
    findBestConnectionForClient(normalized, options.clientId, requestedConnection) ??
    requestedConnection;
  if (!connection) {
    throw new Error("Connection not found.");
  }
  assertConnectionSecret(connection, options.connectionSecret);
  const assigned = normalized.party.find((member) => member.id === connection.partyMemberId);
  if (connection.status !== "connected") {
    const tableStopped = !normalized.multiplayer.localTable?.running;
    const situation = tableStopped
      ? "The host local table is off. Ask the host to start the local table again, then refresh the table."
      : connection.status === "pending"
        ? "Waiting for the host to approve this local table seat."
        : `Guest connection is ${connection.status}.`;
    return {
      protocolVersion: multiplayerProtocolVersion,
      revision,
      campaignId: normalized.id,
      campaignTitle: normalized.title,
      connection: publicConnection(connection),
      assignedCharacter: assigned ? publicPartyMember(assigned) : null,
      scene: {
        status: connection.status,
        currentPlaceId: tableStopped ? "host-table-off" : "host-approval",
        immediateSituation: situation,
      },
      party: assigned ? [publicPartyMember(assigned)] : [],
      places: [],
      people: [],
      quests: [],
      messages: [],
      choices: null,
      hostTurnState: normalized.multiplayer.hostTurnState,
      pendingInput: null,
      settings: normalized.multiplayer.settings,
      awaitingApproval: !tableStopped && connection.status === "pending",
      tableStopped,
      tableState: {
        updatedAt: normalized.updatedAt ?? nowIso(),
        revision,
        generatedAt: nowIso(),
        scene: {
          status: connection.status,
          currentPlaceId: tableStopped ? "host-table-off" : "host-approval",
          immediateSituation: situation,
        },
        party: assigned ? [publicPartyMember(assigned)] : [],
        people: [],
        places: [],
        items: [],
        inventory: [],
        quests: [],
        factions: [],
        lore: [],
        relationships: [],
        combat: null,
        messages: [],
        tableTalk: [],
        choices: null,
        pendingInput: null,
      },
    };
  }
  const tableState = createVisibleTableState(normalized, connection);

  return {
    protocolVersion: multiplayerProtocolVersion,
    revision,
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    connection: publicConnection(connection),
    assignedCharacter: assigned ? publicPartyMember(assigned) : null,
    scene: tableState.scene,
    party: tableState.party,
    places: tableState.places,
    people: tableState.people,
    items: tableState.items,
    inventory: tableState.inventory,
    quests: tableState.quests,
    factions: tableState.factions,
    lore: tableState.lore,
    relationships: tableState.relationships,
    combat: tableState.combat,
    messages: tableState.messages,
    tableTalk: tableState.tableTalk,
    choices: tableState.choices,
    hostTurnState: normalized.multiplayer.hostTurnState,
    settings: normalized.multiplayer.settings,
    pendingInput: tableState.pendingInput,
    awaitingApproval: false,
    tableState,
  };
}

export function createGuestLobbyPreview(campaign, options = {}) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  if (!normalized.multiplayer.localTable?.running) {
    throw publicMultiplayerError("The host local table is not open yet.", 409);
  }
  assertTableAuthority(normalized, {
    campaignId: options.campaignId,
    tableId: options.tableId,
    sessionId: options.sessionId || options.tableSessionId,
  });
  const scene = publicData(normalized.scene) ?? {};
  const recentMessages = (normalized.sessionLog?.messages ?? [])
    .filter((message) => message.data?.visibility !== "dm_only")
    .slice(-6)
    .map(publicMessage);
  return {
    protocolVersion: multiplayerProtocolVersion,
    revision: tableRevision(normalized),
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    campaignSummary: compactLine(normalized.summary || normalized.description || "", 1200),
    localTable: {
      ...normalized.multiplayer.localTable,
      campaignId: normalized.id,
    },
    invite: null,
    scene,
    party: normalized.party.slice(-tableStateLimits.party).map(publicPartyMember),
    joinableSeats: joinableGuestSeats(normalized),
    people: publicRecords(normalized.people, 8),
    places: publicRecords(normalized.places, 8),
    quests: publicRecords(normalized.quests, 8),
    recentMessages,
  };
}

export function joinableGuestSeats(campaign) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  return normalized.party
    .filter(isJoinableGuestSeat)
    .slice(-tableStateLimits.party)
    .map(publicGuestSeat);
}

export function createJoinPreview(campaign, inviteLink, options = {}) {
  const rawInvite = typeof inviteLink === "string" ? inviteLink.trim() : inviteLink;
  if (!rawInvite) {
    return createGuestLobbyPreview(campaign, options);
  }
  const parsed = typeof rawInvite === "string" ? parseInviteLink(rawInvite) : rawInvite;
  if (!parsed.valid) {
    throw publicMultiplayerError(parsed.error || "Invalid invite link.", 400);
  }
  const normalized = normalizeMultiplayerCampaign(campaign);
  if (parsed.campaign !== normalized.id) {
    throw publicMultiplayerError("Invite is for a different campaign. Ask the host for a fresh invite link.", 409);
  }
  assertTableAuthority(normalized, {
    campaignId: parsed.campaign,
    tableId: parsed.tableId,
    sessionId: parsed.sessionId,
  });
  const invite = findActiveInvite(normalized, parsed);
  const scene = publicData(normalized.scene) ?? {};
  const recentMessages = (normalized.sessionLog?.messages ?? [])
    .filter((message) => message.data?.visibility !== "dm_only")
    .slice(-6)
    .map(publicMessage);
  return {
    protocolVersion: multiplayerProtocolVersion,
    revision: tableRevision(normalized),
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    campaignSummary: compactLine(normalized.summary || normalized.description || "", 1200),
    invite: {
      id: invite.id,
      kind: invite.kind,
      seatId: invite.seatId,
      partyMemberId: invite.partyMemberId,
    },
    scene,
    party: normalized.party.slice(-tableStateLimits.party).map(publicPartyMember),
    people: publicRecords(normalized.people, 8),
    places: publicRecords(normalized.places, 8),
    quests: publicRecords(normalized.quests, 8),
    recentMessages,
  };
}

export function parseInviteLink(value) {
  const text = String(value ?? "").trim();
  try {
    const url = new URL(text);
    if (url.protocol !== "lorekeeper:") {
      return { valid: false, error: "Invite link must start with lorekeeper://join." };
    }
    if (url.hostname !== "join") {
      return { valid: false, error: "Invite link must use lorekeeper://join." };
    }
    const host = url.searchParams.get("host") || "";
    const port = Number(url.searchParams.get("port"));
    const campaign = url.searchParams.get("campaign") || "";
    const tableId = url.searchParams.get("table") || "";
    const sessionId = url.searchParams.get("session") || "";
    const seat = url.searchParams.get("seat") || "";
    const token = url.searchParams.get("token") || "";
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !campaign || !seat || !token) {
      return { valid: false, error: "Invite link is missing host, port, campaign, seat, or token." };
    }
    if (!isAllowedInviteHost(host)) {
      return { valid: false, error: "Invite host must be a local or private LAN address." };
    }
    return {
      valid: true,
      host,
      port,
      campaign,
      tableId,
      sessionId,
      seat,
      token,
    };
  } catch {
    return { valid: false, error: "Invite link is not a valid URL." };
  }
}

export function buildInviteLink({ host, port, campaign, table, session, seat, token }) {
  const params = new URLSearchParams({
    host: String(host || "127.0.0.1"),
    port: String(port || 4173),
    campaign: String(campaign || ""),
    table: String(table || ""),
    session: String(session || ""),
    seat: String(seat || ""),
    token: String(token || ""),
  });
  return `lorekeeper://join?${params.toString()}`;
}

export function firstLanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        return entry.address;
      }
    }
  }
  return "";
}

function normalizeMultiplayerState(multiplayer = {}, campaign = {}) {
  return {
    protocolVersion: Number(multiplayer.protocolVersion) || multiplayerProtocolVersion,
    localTable: {
      running: Boolean(multiplayer.localTable?.running),
      tableId: multiplayer.localTable?.tableId || defaultTableId(campaign),
      sessionId: multiplayer.localTable?.sessionId || "",
      host: multiplayer.localTable?.host || "",
      port: multiplayer.localTable?.port ?? null,
      lanAddress: multiplayer.localTable?.lanAddress || "",
      startedAt: multiplayer.localTable?.startedAt ?? null,
      stoppedAt: multiplayer.localTable?.stoppedAt ?? null,
    },
    settings: {
      ...defaultMultiplayerSettings,
      ...(multiplayer.settings ?? {}),
      requireGuestActionApproval: Boolean(multiplayer.settings?.requireGuestActionApproval),
      holdGuestActionsForGroupInput: Boolean(multiplayer.settings?.holdGuestActionsForGroupInput),
    },
    hostTurnState: allowedTurnStates.has(multiplayer.hostTurnState) ? multiplayer.hostTurnState : hostTurnStates.WAITING_FOR_PLAYER,
    players: Array.isArray(multiplayer.players) ? multiplayer.players.map((player) => normalizeOwnedRecord(player, campaign, multiplayer)) : [],
    seats: normalizeSeats(multiplayer.seats, campaign.party ?? []),
    invites: Array.isArray(multiplayer.invites) ? multiplayer.invites.map((invite) => normalizeOwnedRecord(invite, campaign, multiplayer)) : [],
    connections: Array.isArray(multiplayer.connections) ? multiplayer.connections.map((connection) => normalizeOwnedRecord(connection, campaign, multiplayer)) : [],
    waitingGuests: Array.isArray(multiplayer.waitingGuests) ? multiplayer.waitingGuests.map((guest) => normalizeOwnedRecord(guest, campaign, multiplayer)) : [],
    pendingTurnInputs: Array.isArray(multiplayer.pendingTurnInputs) ? multiplayer.pendingTurnInputs.map((input) => normalizeOwnedRecord(input, campaign, multiplayer)) : [],
    choiceVotes: Array.isArray(multiplayer.choiceVotes) ? multiplayer.choiceVotes.map((vote) => normalizeOwnedRecord(vote, campaign, multiplayer)) : [],
    tableTalk: Array.isArray(multiplayer.tableTalk)
      ? multiplayer.tableTalk.slice(-tableStateLimits.tableTalk).map(normalizeTableTalkMessage).filter(Boolean)
      : [],
    events: Array.isArray(multiplayer.events) ? multiplayer.events.slice(-100) : [],
    lastChoices: multiplayer.lastChoices ?? null,
  };
}

function multiplayerSettingsSummary(settings = {}) {
  if (settings.requireGuestActionApproval) {
    return "Friend actions now wait for host review.";
  }
  if (settings.holdGuestActionsForGroupInput) {
    return "Friend actions now collect into a group turn.";
  }
  return "Friend actions now reach the table one actor at a time.";
}

function normalizeTableTalkMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  const text = compactLine(message.text, 800);
  if (!text) {
    return null;
  }
  return {
    id: compactLine(message.id || `talk-${randomToken(8)}`, 80),
    playerId: compactLine(message.playerId || "", 120),
    playerName: compactLine(message.playerName || "Player", 80),
    role: message.role === "guest" ? "guest" : "host",
    text,
    createdAt: message.createdAt || nowIso(),
  };
}

function normalizeSeats(seats = [], party = []) {
  const existing = Array.isArray(seats) ? seats : [];
  const byPartyId = new Map(existing.map((seat) => [seat.partyMemberId, seat]));
  return party.map((member) => ({
    id: member.id,
    partyMemberId: member.id,
    label: member.name,
    controllerKind: member.controllerKind,
    controllerId: member.controllerId ?? null,
    inviteId: byPartyId.get(member.id)?.inviteId ?? null,
    updatedAt: byPartyId.get(member.id)?.updatedAt ?? member.updatedAt ?? member.createdAt ?? nowIso(),
  }));
}

function markPartyMemberPresent(campaign, partyMemberId) {
  if (!partyMemberId) {
    return;
  }
  campaign.scene = {
    ...(campaign.scene ?? {}),
    presentPartyMemberIds: Array.isArray(campaign.scene?.presentPartyMemberIds)
      ? campaign.scene.presentPartyMemberIds
      : [],
  };
  if (!campaign.scene.presentPartyMemberIds.includes(partyMemberId)) {
    campaign.scene.presentPartyMemberIds = [...campaign.scene.presentPartyMemberIds, partyMemberId];
  }
}

function reconcileActiveCombatParty(campaign, summary = "Party combatants reconciled.") {
  if (!campaign?.combat?.inCombat) {
    return campaign;
  }
  return addMissingCombatantsToTurnOrder(campaign, { reroll: false, summary });
}

function assignController(campaign, connection) {
  const invite = campaign.multiplayer.invites.find((item) => item.id === connection.inviteId);
  if (invite) {
    invite.claimedByPlayerId = connection.playerId;
  }
  campaign.party = campaign.party.map((member) => (
    member.id === connection.partyMemberId
      ? {
        ...member,
        controllerKind: controllerKinds.REMOTE_PLAYER,
        controllerId: connection.playerId,
        fallbackControllerKind: member.fallbackControllerKind || controllerKinds.AI_COMPANION,
      }
      : member
  ));
  campaign.multiplayer.seats = campaign.multiplayer.seats.map((seat) => (
    seat.partyMemberId === connection.partyMemberId
      ? {
        ...seat,
        controllerKind: controllerKinds.REMOTE_PLAYER,
        controllerId: connection.playerId,
        updatedAt: nowIso(),
      }
      : seat
  ));
}

function ensureConnectedController(campaign, connection) {
  const member = campaign.party.find((item) => item.id === connection.partyMemberId);
  if (!member) {
    return null;
  }
  if (member.controllerKind !== controllerKinds.REMOTE_PLAYER || member.controllerId !== connection.playerId) {
    assignController(campaign, connection);
  }
  return campaign.party.find((item) => item.id === connection.partyMemberId) ?? null;
}

function reviveApprovedConnections(campaign) {
  campaign.multiplayer.connections = campaign.multiplayer.connections.map((connection) => {
    if (connection.status !== "disconnected" || !connection.approvedAt) {
      return connection;
    }
    if (/^controller_/.test(connection.disconnectReason || "")) {
      return connection;
    }
    const invite = campaign.multiplayer.invites.find((item) => item.id === connection.inviteId);
    if (!invite || invite.status !== "active" || invite.revokedAt) {
      return connection;
    }
    return {
      ...connection,
      status: "connected",
      disconnectedAt: null,
    };
  });

  for (const connection of campaign.multiplayer.connections) {
    if (connection.status === "connected") {
      assignController(campaign, connection);
    }
  }
}

function releaseRemoteController(member) {
  if (member.controllerKind !== controllerKinds.REMOTE_PLAYER) {
    return member;
  }
  const fallback = normalizeControllerKind(member.fallbackControllerKind, controllerKinds.AI_COMPANION);
  return {
    ...member,
    controllerKind: fallback,
    controllerId: fallback === controllerKinds.HOST ? "host" : null,
  };
}

function releaseRemoteControllerToHost(member) {
  if (member.controllerKind !== controllerKinds.REMOTE_PLAYER) {
    return member;
  }
  return {
    ...member,
    controllerKind: controllerKinds.HOST,
    controllerId: "host",
    fallbackControllerKind: controllerKinds.HOST,
    inviteIntent: "remote_player",
  };
}

function releaseActiveConnectionsForPartyMember(campaign, partyMemberId, reason) {
  campaign.multiplayer.connections = campaign.multiplayer.connections.map((connection) => (
    connection.partyMemberId === partyMemberId && connection.status === "connected"
      ? {
        ...connection,
        status: "disconnected",
        disconnectedAt: nowIso(),
        disconnectReason: reason,
      }
      : connection
  ));
  campaign.multiplayer.seats = campaign.multiplayer.seats.map((seat) => (
    seat.partyMemberId === partyMemberId
      ? {
        ...seat,
        controllerKind: controllerKinds.UNASSIGNED,
        controllerId: null,
        updatedAt: nowIso(),
      }
      : seat
  ));
}

function findActiveInvite(campaign, parsed) {
  const invite = campaign.multiplayer.invites.find((item) =>
    item.status === "active" &&
    item.token === parsed.token &&
    item.campaignId === parsed.campaign &&
    (!parsed.tableId || !item.tableId || item.tableId === parsed.tableId) &&
    (!parsed.sessionId || !item.sessionId || item.sessionId === parsed.sessionId) &&
    (item.partyMemberId === parsed.seat || item.seatId === parsed.seat)
  );
  if (!invite) {
    throw publicMultiplayerError("Invite token is invalid, expired, or revoked. Ask the host for a fresh invite link.", 410);
  }
  return invite;
}

function publicMultiplayerError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function findExistingConnectionForClient(campaign, inviteId, clientId) {
  const normalizedClientId = compactLine(clientId || "", 120);
  if (!normalizedClientId) {
    return null;
  }
  const playerIds = new Set(
    campaign.multiplayer.players
      .filter((player) => player.clientId === normalizedClientId)
      .map((player) => player.id),
  );
  return campaign.multiplayer.connections.find((connection) =>
    connection.inviteId === inviteId &&
    playerIds.has(connection.playerId) &&
    (connection.status === "pending" || connection.status === "connected" || connection.status === "disconnected")
  ) ?? null;
}

function findApprovedSiblingConnection(campaign, connection) {
  if (!connection || connection.status === "connected") {
    return null;
  }
  const player = campaign.multiplayer.players.find((item) => item.id === connection.playerId);
  const clientId = player?.clientId;
  if (!clientId) {
    return null;
  }
  const siblingPlayerIds = new Set(
    campaign.multiplayer.players
      .filter((item) => item.clientId === clientId)
      .map((item) => item.id),
  );
  return campaign.multiplayer.connections.find((item) =>
    item.id !== connection.id &&
    item.inviteId === connection.inviteId &&
    item.partyMemberId === connection.partyMemberId &&
    item.status === "connected" &&
    siblingPlayerIds.has(item.playerId)
  ) ?? null;
}

function findBestConnectionForClient(campaign, clientId, fallbackConnection = null) {
  const normalizedClientId = compactLine(clientId || "", 120);
  if (!normalizedClientId) {
    return null;
  }
  const playerIds = new Set(
    campaign.multiplayer.players
      .filter((item) => item.clientId === normalizedClientId)
      .map((item) => item.id),
  );
  const connections = campaign.multiplayer.connections.filter((connection) =>
    playerIds.has(connection.playerId) &&
    (!fallbackConnection || connection.partyMemberId === fallbackConnection.partyMemberId)
  );
  return (
    connections.find((connection) => connection.status === "connected") ??
    connections.find((connection) => connection.status === "pending") ??
    connections.find((connection) => connection.approvedAt) ??
    connections[0] ??
    null
  );
}

function assertClientMatchesConnection(campaign, connection, clientId) {
  const expectedClientId = campaign.multiplayer.players.find((player) => player.id === connection.playerId)?.clientId || "";
  const actualClientId = compactLine(clientId || "", 120);
  if (expectedClientId && actualClientId && expectedClientId !== actualClientId) {
    throw new Error("Guest client does not match this connection.");
  }
}

function assertConnectionSecret(connection, connectionSecret) {
  if (!connection.secret) {
    return;
  }
  if (connection.secret !== String(connectionSecret ?? "")) {
    throw new Error("Guest connection secret does not match.");
  }
}

function assertWaitingGuestSecret(waitingGuest, waitingSecret) {
  if (!waitingGuest.secret) {
    return;
  }
  if (waitingGuest.secret !== String(waitingSecret ?? "")) {
    throw publicMultiplayerError("Waiting room secret does not match.", 403);
  }
}

function normalizeControllerKind(value, fallback) {
  return allowedControllerKinds.has(value) ? value : fallback;
}

function inferDefaultControllerKind(member) {
  if (member.type === "player_character" || /player character/i.test(member.playerRole || "")) {
    return controllerKinds.HOST;
  }
  return controllerKinds.AI_COMPANION;
}

function appendEvent(events = [], event) {
  return [
    ...events,
    {
      id: `event-${randomToken(8)}`,
      at: nowIso(),
      ...event,
    },
  ].slice(-100);
}

function tableRevision(campaign) {
  const updatedAt = campaign.updatedAt ?? "";
  const eventCount = campaign.multiplayer?.events?.length ?? 0;
  const messageCount = campaign.sessionLog?.messages?.length ?? 0;
  const pendingCount = campaign.multiplayer?.pendingTurnInputs?.length ?? 0;
  const tableTalk = campaign.multiplayer?.tableTalk ?? [];
  const tableTalkCount = tableTalk.length;
  const latestTableTalkAt = tableTalk.at(-1)?.createdAt ?? "";
  const combatTurn = campaign.combat?.currentTurnId ?? "";
  return `${updatedAt}:${eventCount}:${messageCount}:${pendingCount}:${tableTalkCount}:${latestTableTalkAt}:${combatTurn}`;
}

function upsertById(records, record) {
  const index = records.findIndex((item) => item.id === record.id);
  if (index === -1) {
    return [...records, record];
  }
  return records.map((item, itemIndex) => itemIndex === index ? { ...item, ...record } : item);
}

function publicRecord(record) {
  return {
    id: record.id,
    name: record.name,
    title: record.title,
    type: record.type,
    status: record.status,
    summary: record.summary,
    stakes: record.stakes,
    notes: publicData(record.notes),
    description: publicData(record.description),
    data: publicData(record.data),
  };
}

function publicRecords(records = [], limit = tableStateLimits.people) {
  return records
    .filter((record) => record?.visibility !== "dm_only" && record?.data?.visibility !== "dm_only")
    .slice(-limit)
    .map(publicRecord);
}

function publicConnection(connection) {
  return {
    id: connection.id,
    campaignId: connection.campaignId ?? null,
    tableId: connection.tableId ?? null,
    sessionId: connection.sessionId ?? null,
    playerId: connection.playerId,
    displayName: connection.displayName,
    status: connection.status,
    partyMemberId: connection.partyMemberId,
    proposedCharacter: publicData(connection.proposedCharacter),
    requestedAt: connection.requestedAt,
    approvedAt: connection.approvedAt,
    deniedAt: connection.deniedAt,
    disconnectedAt: connection.disconnectedAt,
  };
}

function publicTableTalkMessage(message) {
  return {
    id: message.id,
    campaignId: message.campaignId ?? null,
    tableId: message.tableId ?? null,
    sessionId: message.sessionId ?? null,
    playerId: message.playerId,
    playerName: message.playerName,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
  };
}

function publicChoiceVote(vote) {
  return {
    id: vote.id,
    campaignId: vote.campaignId ?? null,
    tableId: vote.tableId ?? null,
    sessionId: vote.sessionId ?? null,
    choiceKey: vote.choiceKey,
    optionId: vote.optionId,
    optionLabel: vote.optionLabel,
    optionText: vote.optionText,
    prompt: vote.prompt,
    playerId: vote.playerId,
    playerName: vote.playerName,
    characterId: vote.characterId,
    characterName: vote.characterName,
    updatedAt: vote.updatedAt,
  };
}

function publicWaitingGuest(waitingGuest) {
  return {
    id: waitingGuest.id,
    campaignId: waitingGuest.campaignId ?? null,
    tableId: waitingGuest.tableId ?? null,
    sessionId: waitingGuest.sessionId ?? null,
    displayName: waitingGuest.displayName,
    clientId: waitingGuest.clientId,
    status: waitingGuest.status,
    requestedAt: waitingGuest.requestedAt,
    lastSeenAt: waitingGuest.lastSeenAt,
    seatedAt: waitingGuest.seatedAt ?? null,
    connectionId: waitingGuest.connectionId ?? null,
    partyMemberId: waitingGuest.partyMemberId ?? null,
    preferredPartyMemberId: waitingGuest.preferredPartyMemberId ?? null,
  };
}

function publicGuestSeat(member) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    ancestryClass: member.ancestryClass,
    playerRole: member.playerRole,
    controllerKind: member.controllerKind,
    fallbackControllerKind: member.fallbackControllerKind,
    summary: member.summary,
    background: member.background,
    level: member.level,
  };
}

function publicPartyMember(member) {
  return {
    id: member.id,
    name: member.name,
    type: member.type,
    role: member.role,
    ancestryClass: member.ancestryClass,
    playerRole: member.playerRole,
    controllerKind: member.controllerKind,
    controllerId: member.controllerId ?? null,
    fallbackControllerKind: member.fallbackControllerKind,
    summary: member.summary,
    background: member.background,
    level: member.level,
    experience: member.experience,
    proficiencyBonus: member.proficiencyBonus,
    stats: publicData(member.stats),
    skills: publicData(member.skills),
    abilities: publicData(member.abilities),
    spells: publicData(member.spells),
    inventory: publicData(member.inventory),
    conditions: publicData(member.conditions),
    notes: publicData(member.notes),
  };
}

function createVisibleTableState(campaign, connection) {
  return {
    updatedAt: campaign.updatedAt ?? nowIso(),
    revision: tableRevision(campaign),
    generatedAt: nowIso(),
    scene: publicData(campaign.scene),
    party: campaign.party.slice(-tableStateLimits.party).map(publicPartyMember),
    people: publicRecords(campaign.people, tableStateLimits.people),
    places: publicRecords(campaign.places, tableStateLimits.places),
    items: publicRecords(campaign.items, tableStateLimits.items),
    inventory: publicRecords(campaign.inventory, tableStateLimits.inventory),
    quests: publicRecords(campaign.quests, tableStateLimits.quests),
    factions: publicRecords(campaign.factions, tableStateLimits.factions),
    lore: publicRecords(campaign.lore, tableStateLimits.lore),
    relationships: publicRecords(campaign.relationships, tableStateLimits.relationships),
    combat: publicCombat(campaign.combat),
    messages: (campaign.sessionLog?.messages ?? [])
      .filter((message) => message.data?.visibility !== "dm_only")
      .slice(-tableStateLimits.messages)
      .map(publicMessage),
    tableTalk: campaign.multiplayer.tableTalk.map(publicTableTalkMessage),
    choices: campaign.multiplayer.lastChoices ?? null,
    choiceVotes: campaign.multiplayer.choiceVotes.map(publicChoiceVote),
    pendingInput: campaign.multiplayer.pendingTurnInputs
      .find((input) => input.playerId === connection.playerId && input.characterId === connection.partyMemberId) ?? null,
  };
}

function publicCombat(combat) {
  if (!combat || combat.visibility === "dm_only" || combat.data?.visibility === "dm_only") {
    return null;
  }
  const visible = publicData(combat);
  return {
    ...visible,
    enemies: Array.isArray(visible?.enemies)
      ? visible.enemies.map(redactEnemyCombatantHp)
      : visible?.enemies,
    turnOrder: Array.isArray(visible?.turnOrder)
      ? visible.turnOrder.map((entry) => entry?.type === "enemy" ? redactEnemyCombatantHp(entry) : entry)
      : visible?.turnOrder,
  };
}

function redactEnemyCombatantHp(combatant) {
  if (!combatant || typeof combatant !== "object") {
    return combatant;
  }
  const next = { ...combatant };
  if (next.hp !== undefined || next.hitPoints !== undefined) {
    next.hp = { hidden: true };
    delete next.hitPoints;
  }
  return next;
}

function publicData(data) {
  return sanitizePublicValue(data);
}

function publicMessage(message) {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    title: message.title,
    body: message.body,
    meta: message.meta,
    source: message.source,
    providerRunId: null,
    createdAt: message.createdAt,
    data: publicData(message.data),
  };
}

function sanitizePublicValue(value, depth = 0) {
  if (value == null || depth > 6) {
    return undefined;
  }
  if (typeof value === "string") {
    return compactLine(value, tableStateLimits.stringLength);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => !isHiddenValue(item))
      .slice(0, tableStateLimits.arrayItems)
      .map((item) => sanitizePublicValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== "object" || isHiddenValue(value)) {
    return undefined;
  }
  const blockedKeys = new Set([
    "token",
    "secret",
    "rawResponse",
    "rawPrompt",
    "providerPrompt",
    "dmOnly",
    "dmNotes",
  ]);
  const entries = Object.entries(value)
    .filter(([key]) => !blockedKeys.has(key))
    .slice(0, tableStateLimits.objectKeys)
    .map(([key, item]) => [key, sanitizePublicValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined);
  return Object.fromEntries(entries);
}

function isHiddenValue(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value.visibility === "dm_only" || value.hidden === true || value.dmOnly === true)
  );
}

function appendVisibleRemoteMessage(campaign, input, { requireApproval = false, holdForGroup = false } = {}) {
  const sessionLog = campaign.sessionLog ?? { activeSessionId: "session-main", sessions: [], messages: [] };
  const activeSessionId = sessionLog.activeSessionId || "session-main";
  if (!Array.isArray(sessionLog.sessions) || !sessionLog.sessions.some((session) => session.id === activeSessionId)) {
    sessionLog.sessions = [
      ...(Array.isArray(sessionLog.sessions) ? sessionLog.sessions : []),
      {
        id: activeSessionId,
        title: "Campaign Play",
        startedAt: nowIso(),
        endedAt: null,
        recap: "",
      },
    ];
  }

  const existingIndex = (sessionLog.messages ?? []).findIndex((message) => message.data?.pendingInputId === input.id);
  const createdAt = input.updatedAt || nowIso();
  const message = {
    id: existingIndex === -1 ? `msg-${input.id}` : sessionLog.messages[existingIndex].id,
    sessionId: activeSessionId,
    role: "party",
    title: input.characterName,
    body: input.text,
    meta: requireApproval
      ? `From ${input.playerName}; waiting for host review`
      : holdForGroup
        ? `From ${input.playerName}; queued for the group turn`
        : `From ${input.playerName}; queued for DM`,
    source: "remote_player_input_pending",
    providerRunId: null,
    createdAt,
    data: {
      pendingInputId: input.id,
      playerId: input.playerId,
      characterId: input.characterId,
      status: "pending_model_submit",
      hostStaged: !requireApproval,
      requiresHostApproval: requireApproval,
      holdForGroup,
      multiplayer: true,
    },
  };

  const messages = Array.isArray(sessionLog.messages) ? [...sessionLog.messages] : [];
  if (existingIndex === -1) {
    messages.push(message);
  } else {
    messages.splice(existingIndex, 1);
    messages.push({
      ...message,
      data: {
        ...(sessionLog.messages[existingIndex].data ?? {}),
        ...message.data,
      },
    });
  }
  campaign.sessionLog = {
    ...sessionLog,
    activeSessionId,
    messages,
  };
}

function markClearedPendingMessages(campaign, clearedIds, options = {}) {
  const messages = campaign.sessionLog?.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  const dropped = options.disposition === "dropped";
  campaign.sessionLog.messages = messages.map((message) => {
    const pendingInputId = message.data?.pendingInputId;
    if (!pendingInputId || !clearedIds.has(pendingInputId)) {
      return message;
    }
    return {
      ...message,
      meta: dropped ? "Dropped by host before the DM resolved it" : "Resolved by DM",
      data: {
        ...(message.data ?? {}),
        status: dropped ? "guest_input_dropped" : "submitted_to_model",
        lifecycle: dropped ? "dropped" : "resolved",
        hostStaged: false,
        submittedAt: dropped ? message.data?.submittedAt ?? null : nowIso(),
        droppedAt: dropped ? nowIso() : message.data?.droppedAt,
      },
    };
  });
}

function normalizeCharacterProposal(proposal = {}, playerName = "") {
  const name = compactLine(proposal.name || playerName || "", 80);
  return {
    name,
    ancestry: compactLine(proposal.ancestry || "", 80),
    characterClass: compactLine(proposal.characterClass || proposal.class || "", 80),
    level: clampNumber(proposal.level, 1, 20) || 1,
    roleIntent: compactLine(proposal.roleIntent || proposal.role || "", 240),
    appearance: compactLine(proposal.appearance || proposal.vibe || "", 1000),
    backstory: compactLine(proposal.backstory || proposal.background || proposal.concept || "", 1600),
    integrationPrompt: compactLine(proposal.integrationPrompt || proposal.integration || proposal.partyConnection || "", 1600),
    personality: compactLine(proposal.personality || "", 600),
    goals: compactLine(proposal.goals || "", 600),
  };
}

function hasCharacterProposal(proposal = {}) {
  if (!proposal || typeof proposal !== "object") {
    return false;
  }
  return [
    proposal.name,
    proposal.ancestry,
    proposal.characterClass,
    proposal.class,
    proposal.roleIntent,
    proposal.role,
    proposal.appearance,
    proposal.vibe,
    proposal.backstory,
    proposal.background,
    proposal.concept,
    proposal.integrationPrompt,
    proposal.integration,
    proposal.partyConnection,
    proposal.personality,
    proposal.goals,
  ].some((value) => String(value ?? "").trim());
}

function createPartyMemberFromProposal(proposal = {}, playerName = "", options = {}) {
  const character = normalizeCharacterProposal(proposal, playerName);
  const hostIntegrationPrompt = compactLine(options.hostIntegrationPrompt || "", 1600);
  const ancestryClass = [character.ancestry, character.characterClass].filter(Boolean).join(" ") || "adventurer";
  const level = character.level || 1;
  const maxHp = Math.max(6, 8 + (level - 1) * 5);
  return {
    id: `party-${slugify(character.name || playerName || "guest-character")}`,
    name: character.name || "Guest Character",
    type: "player_character",
    playerRole: "Remote player character",
    ancestryClass,
    level,
    background: character.backstory || `${character.name || "This character"} joined the campaign from a remote player request.`,
    appearance: character.appearance,
    dmIntegrationPrompt: character.integrationPrompt,
    hostIntegrationPrompt,
    summary: [ancestryClass, character.roleIntent, character.personality, character.goals].filter(Boolean).join(" - "),
    stats: {
      hp: {
        current: maxHp,
        max: maxHp,
      },
      armorClass: 12,
    },
    notes: [
      "Created from a LoreKeeper Join character request.",
      character.roleIntent ? `Table role: ${character.roleIntent}` : "",
      character.appearance ? `Look/vibe: ${character.appearance}` : "",
      character.backstory ? `Backstory: ${character.backstory}` : "",
      character.integrationPrompt ? `DM integration prompt: ${character.integrationPrompt}` : "",
      hostIntegrationPrompt ? `Host scene context: ${hostIntegrationPrompt}` : "",
      character.personality ? `Personality: ${character.personality}` : "",
      character.goals ? `Goals: ${character.goals}` : "",
    ].filter(Boolean),
    controllerKind: controllerKinds.REMOTE_PLAYER,
    controllerId: null,
    fallbackControllerKind: controllerKinds.HOST,
    createdAt: nowIso(),
  };
}

function appendCharacterJoinMessage(campaign, member, connection) {
  const sessionLog = campaign.sessionLog ?? { activeSessionId: "session-main", sessions: [], messages: [] };
  const activeSessionId = sessionLog.activeSessionId || "session-main";
  if (!Array.isArray(sessionLog.sessions) || !sessionLog.sessions.some((session) => session.id === activeSessionId)) {
    sessionLog.sessions = [
      ...(Array.isArray(sessionLog.sessions) ? sessionLog.sessions : []),
      {
        id: activeSessionId,
        title: "Campaign Play",
        startedAt: nowIso(),
        endedAt: null,
        recap: "",
      },
    ];
  }

  const proposal = normalizeCharacterProposal(connection.proposedCharacter, connection.displayName);
  const hostIntegrationPrompt = compactLine(connection.hostIntegrationPrompt || member.hostIntegrationPrompt || "", 1600);
  const body = [
    `${member.name} has joined the party as ${member.ancestryClass || "an adventurer"}.`,
    proposal.roleIntent ? `Table role: ${proposal.roleIntent}.` : "",
    proposal.appearance ? `Look/vibe: ${proposal.appearance}` : "",
    proposal.backstory ? `Character pitch: ${proposal.backstory}` : "",
    proposal.integrationPrompt ? `DM integration prompt: ${proposal.integrationPrompt}` : "",
    hostIntegrationPrompt ? `Host scene context: ${hostIntegrationPrompt}` : "",
  ].filter(Boolean).join("\n\n");

  campaign.sessionLog = {
    ...sessionLog,
    messages: [
      ...(Array.isArray(sessionLog.messages) ? sessionLog.messages : []),
      {
        id: `msg-join-${member.id}-${randomToken(4)}`,
        sessionId: activeSessionId,
        role: "system",
        title: "LoreKeeper",
        body,
        meta: `New remote player character from ${connection.displayName}.`,
        source: "remote_character_join",
        providerRunId: null,
        createdAt: nowIso(),
        data: {
          characterId: member.id,
          playerId: connection.playerId,
          multiplayer: true,
          proposedCharacter: publicData(connection.proposedCharacter),
          hostIntegrationPrompt,
        },
      },
    ],
  };
}

function uniqueId(baseId, existingIds) {
  const fallbackBase = baseId || "party-guest-character";
  let candidate = fallbackBase;
  let counter = 2;
  while (existingIds.has(candidate)) {
    candidate = `${fallbackBase}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}

function nowIso() {
  return new Date().toISOString();
}

function compactLine(value, limit = 240) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function slugify(value) {
  return String(value || "guest")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "guest";
}
