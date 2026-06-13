import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { touchCampaign } from "../campaign-state/schema.js";

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

const allowedControllerKinds = new Set(Object.values(controllerKinds));
const allowedTurnStates = new Set(Object.values(hostTurnStates));
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
  next.multiplayer.localTable = {
    running: true,
    host: options.host || "0.0.0.0",
    port,
    lanAddress,
    startedAt: now,
    stoppedAt: null,
  };
  reviveApprovedConnections(next);
  next.multiplayer.hostTurnState = hostTurnStates.COLLECTING_PARTY_INPUTS;
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "local_table_started",
    summary: `Local table started at ${lanAddress}:${port}.`,
  });
  return touchCampaign(next);
}

export function stopLocalTable(campaign) {
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
  next.party = next.party.map((member) => releaseRemoteController(member));
  next.multiplayer.pendingTurnInputs = [];
  next.multiplayer.hostTurnState = hostTurnStates.WAITING_FOR_PLAYER;
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "local_table_stopped",
    summary: "Local table stopped; remote controllers released.",
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

export function requestJoin(campaign, { inviteLink, playerName, clientId } = {}) {
  const parsed = typeof inviteLink === "string" ? parseInviteLink(inviteLink) : inviteLink;
  if (!parsed.valid) {
    throw new Error(parsed.error || "Invalid invite link.");
  }

  const next = normalizeMultiplayerCampaign(campaign);
  if (parsed.campaign !== next.id) {
    throw new Error("Invite is for a different campaign.");
  }
  const invite = findActiveInvite(next, parsed);
  const member = next.party.find((item) => item.id === invite.partyMemberId);
  if (!member) {
    throw new Error("Invite seat no longer exists.");
  }
  const existing = findExistingConnectionForClient(next, invite.id, clientId);
  if (existing) {
    const existingPlayer = next.multiplayer.players.find((player) => player.id === existing.playerId);
    if (existingPlayer) {
      existingPlayer.displayName = compactLine(playerName || existingPlayer.displayName || "Guest Player", 80);
      existingPlayer.lastSeenAt = nowIso();
    }
    existing.displayName = existingPlayer?.displayName || existing.displayName;
    existing.deniedAt = existing.status === "denied" ? existing.deniedAt : null;
    existing.disconnectedAt = existing.status === "disconnected" ? existing.disconnectedAt : null;
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
    };
  }

  const playerId = `player-${slugify(playerName || clientId || "guest")}-${randomToken(4)}`;
  const connectionId = `conn-${randomToken(10)}`;
  const player = {
    id: playerId,
    displayName: compactLine(playerName || "Guest Player", 80),
    kind: "remote_player",
    clientId: compactLine(clientId || "", 120),
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
  };
  const connection = {
    id: connectionId,
    playerId,
    displayName: player.displayName,
    inviteId: invite.id,
    partyMemberId: member.id,
    status: invite.approvalRequired ? "pending" : "connected",
    requestedAt: nowIso(),
    approvedAt: invite.approvalRequired ? null : nowIso(),
    deniedAt: null,
    disconnectedAt: null,
  };

  next.multiplayer.players = upsertById(next.multiplayer.players, player);
  next.multiplayer.connections = upsertById(next.multiplayer.connections, connection);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "join_requested",
    summary: `${player.displayName} requested control of ${member.name}.`,
    connectionId,
    partyMemberId: member.id,
  });

  if (!invite.approvalRequired) {
    assignController(next, connection);
  }

  return {
    campaign: touchCampaign(next),
    connection,
    player,
    approved: connection.status === "connected",
  };
}

export function approveJoinRequest(campaign, connectionId) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error("Join request not found.");
  }
  if (connection.status === "denied") {
    throw new Error("Join request was denied.");
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
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "join_approved",
    summary: `${connection.displayName} joined the table.`,
    connectionId,
    partyMemberId: connection.partyMemberId,
  });
  return touchCampaign(next);
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

export function submitGuestAction(campaign, { connectionId, clientId, characterId, text, ready = true } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connection is not approved.");
  }
  assertClientMatchesConnection(next, connection, clientId);
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
  appendVisibleRemoteMessage(next, input);
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

export function passGuestAction(campaign, { connectionId, clientId, characterId } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connection is not approved.");
  }
  assertClientMatchesConnection(next, connection, clientId);
  if (connection.partyMemberId !== characterId) {
    throw new Error("Guest can only pass for their assigned party member.");
  }
  const member = ensureConnectedController(next, connection);
  if (!member || member.id !== characterId) {
    throw new Error("Guest does not control that party member.");
  }
  const input = {
    id: `input-${connection.playerId}-${characterId}`,
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

export function disconnectGuest(campaign, connectionId) {
  const next = normalizeMultiplayerCampaign(campaign);
  const connection = next.multiplayer.connections.find((item) => item.id === connectionId);
  if (!connection) {
    throw new Error("Connection not found.");
  }
  connection.status = "disconnected";
  connection.disconnectedAt = nowIso();
  next.party = next.party.map((member) => (
    member.id === connection.partyMemberId && member.controllerId === connection.playerId
      ? releaseRemoteController(member)
      : member
  ));
  next.multiplayer.pendingTurnInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.playerId !== connection.playerId);
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "guest_disconnected",
    summary: `${connection.displayName} disconnected; character control returned to fallback.`,
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
  next.multiplayer.events = appendEvent(next.multiplayer.events, {
    type: "controller_host",
    summary: "Character assigned to host control.",
    partyMemberId,
  });
  return touchCampaign(next);
}

export function buildAggregatedPlayerTurn(campaign, { hostText = "" } = {}) {
  const next = normalizeMultiplayerCampaign(campaign);
  const readyInputs = next.multiplayer.pendingTurnInputs
    .filter((input) => input.ready && !input.passed && input.text)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const lines = [];
  if (hostText.trim()) {
    lines.push(`Host/player: ${hostText.trim()}`);
  }
  for (const input of readyInputs) {
    lines.push(`${input.characterName}: ${input.text}`);
  }
  if (!lines.length) {
    throw new Error("No ready player inputs to resolve.");
  }

  return {
    raw: "Combined structured party turn",
    text: [
      "Combined structured party turn:",
      ...lines.map((line) => `- ${line}`),
      "(meta: Resolve these party inputs together. Preserve each character's agency and voice.)",
    ].join("\n"),
    playerInputs: [
      ...(hostText.trim() ? [{
        playerId: "host",
        playerName: "Host",
        characterId: null,
        characterName: "Host",
        text: hostText.trim(),
        ready: true,
      }] : []),
      ...readyInputs.map((input) => ({
        playerId: input.playerId,
        playerName: input.playerName,
        characterId: input.characterId,
        characterName: input.characterName,
        text: input.text,
        ready: input.ready,
      })),
    ],
  };
}

export function clearPendingTurnInputs(campaign, inputIds = null) {
  const next = normalizeMultiplayerCampaign(campaign);
  const ids = Array.isArray(inputIds) && inputIds.length ? new Set(inputIds) : null;
  const clearedIds = ids ?? new Set(next.multiplayer.pendingTurnInputs.map((input) => input.id));
  next.multiplayer.pendingTurnInputs = ids
    ? next.multiplayer.pendingTurnInputs.filter((input) => !ids.has(input.id))
    : [];
  markSubmittedMessages(next, clearedIds);
  next.multiplayer.hostTurnState = hostTurnStates.RESOLVING_TURN;
  return touchCampaign(next);
}

export function createHostSnapshot(campaign) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  return {
    protocolVersion: multiplayerProtocolVersion,
    campaignId: normalized.id,
    campaignTitle: normalized.title,
    localTable: normalized.multiplayer.localTable,
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
    connections: normalized.multiplayer.connections,
    pendingTurnInputs: normalized.multiplayer.pendingTurnInputs,
    events: normalized.multiplayer.events.slice(-20),
  };
}

export function createGuestSnapshot(campaign, connectionId, options = {}) {
  const normalized = normalizeMultiplayerCampaign(campaign);
  const requestedConnection = normalized.multiplayer.connections.find((item) => item.id === connectionId);
  const connection =
    findApprovedSiblingConnection(normalized, requestedConnection) ??
    findBestConnectionForClient(normalized, options.clientId, requestedConnection) ??
    requestedConnection;
  if (!connection) {
    throw new Error("Connection not found.");
  }
  const assigned = normalized.party.find((member) => member.id === connection.partyMemberId);
  if (connection.status !== "connected") {
    const tableStopped = !normalized.multiplayer.localTable?.running;
    const situation = tableStopped
      ? "The host local table is off. Ask the host to start the local table again, then sync."
      : connection.status === "pending"
        ? "Waiting for the host to approve this local table seat."
        : `Guest connection is ${connection.status}.`;
    return {
      protocolVersion: multiplayerProtocolVersion,
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
      awaitingApproval: !tableStopped && connection.status === "pending",
      tableStopped,
      tableState: {
        updatedAt: normalized.updatedAt ?? nowIso(),
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
        choices: null,
        pendingInput: null,
      },
    };
  }
  const tableState = createVisibleTableState(normalized, connection);

  return {
    protocolVersion: multiplayerProtocolVersion,
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
    choices: tableState.choices,
    hostTurnState: normalized.multiplayer.hostTurnState,
    pendingInput: tableState.pendingInput,
    awaitingApproval: false,
    tableState,
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
    const seat = url.searchParams.get("seat") || "";
    const token = url.searchParams.get("token") || "";
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !campaign || !seat || !token) {
      return { valid: false, error: "Invite link is missing host, port, campaign, seat, or token." };
    }
    return {
      valid: true,
      host,
      port,
      campaign,
      seat,
      token,
    };
  } catch {
    return { valid: false, error: "Invite link is not a valid URL." };
  }
}

export function buildInviteLink({ host, port, campaign, seat, token }) {
  const params = new URLSearchParams({
    host: String(host || "127.0.0.1"),
    port: String(port || 4173),
    campaign: String(campaign || ""),
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
      host: multiplayer.localTable?.host || "",
      port: multiplayer.localTable?.port ?? null,
      lanAddress: multiplayer.localTable?.lanAddress || "",
      startedAt: multiplayer.localTable?.startedAt ?? null,
      stoppedAt: multiplayer.localTable?.stoppedAt ?? null,
    },
    hostTurnState: allowedTurnStates.has(multiplayer.hostTurnState) ? multiplayer.hostTurnState : hostTurnStates.WAITING_FOR_PLAYER,
    players: Array.isArray(multiplayer.players) ? multiplayer.players : [],
    seats: normalizeSeats(multiplayer.seats, campaign.party ?? []),
    invites: Array.isArray(multiplayer.invites) ? multiplayer.invites : [],
    connections: Array.isArray(multiplayer.connections) ? multiplayer.connections : [],
    pendingTurnInputs: Array.isArray(multiplayer.pendingTurnInputs) ? multiplayer.pendingTurnInputs : [],
    events: Array.isArray(multiplayer.events) ? multiplayer.events.slice(-100) : [],
    lastChoices: multiplayer.lastChoices ?? null,
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

function findActiveInvite(campaign, parsed) {
  const invite = campaign.multiplayer.invites.find((item) =>
    item.status === "active" &&
    item.token === parsed.token &&
    item.campaignId === parsed.campaign &&
    item.partyMemberId === parsed.seat
  );
  if (!invite) {
    throw new Error("Invite token is invalid or revoked.");
  }
  return invite;
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
    (connection.status === "pending" || connection.status === "connected")
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
    playerId: connection.playerId,
    displayName: connection.displayName,
    status: connection.status,
    partyMemberId: connection.partyMemberId,
    requestedAt: connection.requestedAt,
    approvedAt: connection.approvedAt,
    deniedAt: connection.deniedAt,
    disconnectedAt: connection.disconnectedAt,
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
    choices: campaign.multiplayer.lastChoices ?? null,
    pendingInput: campaign.multiplayer.pendingTurnInputs
      .find((input) => input.playerId === connection.playerId && input.characterId === connection.partyMemberId) ?? null,
  };
}

function publicCombat(combat) {
  if (!combat || combat.visibility === "dm_only" || combat.data?.visibility === "dm_only") {
    return null;
  }
  return publicData(combat);
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

function appendVisibleRemoteMessage(campaign, input) {
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
  const message = {
    id: existingIndex === -1 ? `msg-${input.id}` : sessionLog.messages[existingIndex].id,
    sessionId: activeSessionId,
    role: "party",
    title: input.characterName,
    body: input.text,
    meta: `From ${input.playerName}; staged for next Send Turn`,
    source: "remote_player_input_pending",
    providerRunId: null,
    createdAt: existingIndex === -1 ? nowIso() : sessionLog.messages[existingIndex].createdAt,
    data: {
      pendingInputId: input.id,
      playerId: input.playerId,
      characterId: input.characterId,
      status: "pending_model_submit",
      hostStaged: true,
      multiplayer: true,
    },
  };

  const messages = Array.isArray(sessionLog.messages) ? [...sessionLog.messages] : [];
  if (existingIndex === -1) {
    messages.push(message);
  } else {
    messages[existingIndex] = {
      ...messages[existingIndex],
      ...message,
      createdAt: messages[existingIndex].createdAt,
    };
  }
  campaign.sessionLog = {
    ...sessionLog,
    activeSessionId,
    messages,
  };
}

function markSubmittedMessages(campaign, clearedIds) {
  const messages = campaign.sessionLog?.messages;
  if (!Array.isArray(messages)) {
    return;
  }
  campaign.sessionLog.messages = messages.map((message) => {
    const pendingInputId = message.data?.pendingInputId;
    if (!pendingInputId || !clearedIds.has(pendingInputId)) {
      return message;
    }
    return {
      ...message,
      meta: String(message.meta || "").replace(/;?\s*(?:waiting for host submit|staged for next Send Turn)/i, "").trim() || "Submitted to DM",
      data: {
        ...(message.data ?? {}),
        status: "submitted_to_model",
        hostStaged: false,
        submittedAt: nowIso(),
      },
    };
  });
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
