import assert from "node:assert/strict";
import { normalizeCampaign } from "../src/campaign-state/schema.js";
import {
  createFriendCodeSession,
  effectiveFriendCodeStatus,
  friendCodePublicLink,
  friendCodeSessionStatus,
  normalizeFriendCode,
  publicFriendCodeSession,
  relayMessageKinds,
  stopFriendCodeSession,
  validateGuestRelayMessage,
} from "../src/multiplayer/friend-code-session.js";
import {
  approveJoinRequest,
  buildAggregatedPlayerTurn,
  buildShareTableSession,
  clearPendingTurnInputs,
  controllerKinds,
  createCharacterRequestInvite,
  createGuestSnapshot,
  createHostSnapshot,
  createInviteForPartyMember,
  createJoinPreview,
  createWaitingGuestSnapshot,
  disconnectGuest,
  heartbeatWaitingGuest,
  guestSafeShareRouteBoundary,
  joinableGuestSeats,
  parseInviteLink,
  passGuestAction,
  postTableTalk,
  registerWaitingGuest,
  requestJoin,
  returnToAiCompanion,
  seatWaitingGuest,
  stopLocalTable,
  startLocalTable,
  startRemoteFriendCodeSession,
  stopRemoteFriendCodeSession,
  submitGuestAction,
  submitGuestChoiceVote,
  updateMultiplayerSettings,
  waitingGuestHeartbeatTimeoutMs,
} from "../src/multiplayer/local-table.js";
import { buildMultiplayerSessionProjection } from "../app/multiplayer-session-panel.js";
import { choicePanelKey } from "../src/engine/choice-vote-identity.js";

const base64UrlTokenPattern = /^[A-Za-z0-9_-]+$/;

function assertTokenShape(label, token, minLength) {
  assert.equal(typeof token, "string", `${label} should be a string`);
  assert.ok(token.length >= minLength, `${label} should be at least ${minLength} characters`);
  assert.match(token, base64UrlTokenPattern, `${label} should be URL-safe`);
}

const friendCodeSession = createFriendCodeSession({
  campaignId: "campaign-remote",
  tableId: "table-remote",
  sessionId: "session-remote",
  relayBaseUrl: "https://play.lorekeeper.example/",
  hostSlug: "host-123515123",
  now: new Date("2026-07-25T12:00:00Z"),
  code: "m7ss7k4p",
});
assert.equal(friendCodeSession.code, "M7SS-7K4P");
assert.equal(friendCodeSession.hostSlug, "host-123515123");
assertTokenShape("friend-code internal token", friendCodeSession.internalToken, 32);
assert.notEqual(friendCodeSession.internalToken, friendCodeSession.code);
assert.equal(friendCodePublicLink(friendCodeSession), "https://play.lorekeeper.example/host/host-123515123/table-code/M7SS-7K4P");
assert.equal(normalizeFriendCode(" m7ss 7k4p "), "M7SS-7K4P");
assert.equal(effectiveFriendCodeStatus(friendCodeSession, { now: new Date("2026-07-25T13:00:00Z") }), friendCodeSessionStatus.ACTIVE);
assert.equal(effectiveFriendCodeStatus(friendCodeSession, { now: new Date("2026-07-25T15:00:00Z") }), friendCodeSessionStatus.EXPIRED);
const stoppedFriendCodeSession = stopFriendCodeSession(friendCodeSession, { now: new Date("2026-07-25T13:30:00Z") });
assert.equal(effectiveFriendCodeStatus(stoppedFriendCodeSession, { now: new Date("2026-07-25T13:31:00Z") }), friendCodeSessionStatus.STOPPED);
const publicFriendCode = publicFriendCodeSession(friendCodeSession);
assert.equal(publicFriendCode.code, "M7SS-7K4P");
assert.equal(publicFriendCode.link, "https://play.lorekeeper.example/host/host-123515123/table-code/M7SS-7K4P");
assert.equal("internalToken" in publicFriendCode, false);
assert.match(publicFriendCode.safety, /Host settings, model setup, Ollama, files, diagnostics/);

const validRelayMessage = validateGuestRelayMessage({
  kind: relayMessageKinds.GUEST_JOIN_REQUEST,
  code: "M7SS-7K4P",
  displayName: "Nora",
  preferredPartyMemberId: "lysa",
  proposedCharacter: {
    name: "Nora",
    roleIntent: "quiet scout",
  },
});
assert.equal(validRelayMessage.valid, true);
assert.equal(validRelayMessage.kind, relayMessageKinds.GUEST_JOIN_REQUEST);
assert.equal(validateGuestRelayMessage({ kind: "host.provider.settings.read" }).valid, false);
assert.match(validateGuestRelayMessage({ kind: relayMessageKinds.GUEST_ACTION_SUBMIT, providerSettings: {} }).errors.join(" "), /host-only field/);
assert.match(validateGuestRelayMessage({ kind: relayMessageKinds.GUEST_TABLE_TALK_POST, text: "x".repeat(20000) }).errors.join(" "), /exceeds/);

let campaign = testCampaign();
assert.throws(
  () => startRemoteFriendCodeSession(campaign, { relayBaseUrl: "https://play.lorekeeper.example" }),
  /Start Local Table/,
);
campaign = startLocalTable(campaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
assert.equal(campaign.multiplayer.localTable.running, true);
assert.ok(campaign.multiplayer.localTable.tableId);
assert.ok(campaign.multiplayer.localTable.sessionId);
assert.equal(campaign.multiplayer.settings.requireGuestActionApproval, false);
assert.equal(campaign.multiplayer.settings.holdGuestActionsForGroupInput, false);
const shareSession = buildShareTableSession({
  table: campaign.multiplayer.localTable,
  campaignId: campaign.id,
});
assert.equal(shareSession.campaignId, campaign.id);
assert.equal(shareSession.tableId, campaign.multiplayer.localTable.tableId);
assert.equal(shareSession.sessionId, campaign.multiplayer.localTable.sessionId);
assert.equal(shareSession.guestLink, "http://192.168.1.24:7347/guest");
assert.deepEqual(shareSession.routeBoundary, [...guestSafeShareRouteBoundary]);
assert.match(shareSession.safety, /Host settings, model setup, Ollama, files, and diagnostics stay on this machine/);
assert.match(shareSession.safety, /leave\/rejoin, combat participation/);
const liveRemoteCampaign = startRemoteFriendCodeSession(campaign, { relayBaseUrl: "https://play.lorekeeper.example" });
assert.equal(liveRemoteCampaign.multiplayer.remoteFriendCodeSession.status, friendCodeSessionStatus.ACTIVE);
assert.match(liveRemoteCampaign.multiplayer.remoteFriendCodeSession.link || friendCodePublicLink(liveRemoteCampaign.multiplayer.remoteFriendCodeSession), /\/host\/.+\/table-code\//);
const normalizedRemoteCampaign = normalizeCampaign(liveRemoteCampaign);
assert.equal(normalizedRemoteCampaign.multiplayer.remoteFriendCodeSession.status, friendCodeSessionStatus.ACTIVE);
assert.equal(createHostSnapshot(normalizedRemoteCampaign).remoteFriendCode.status, friendCodeSessionStatus.ACTIVE);
const stoppedRemoteCampaign = stopRemoteFriendCodeSession(liveRemoteCampaign);
assert.equal(stoppedRemoteCampaign.multiplayer.remoteFriendCodeSession.status, friendCodeSessionStatus.STOPPED);
campaign.multiplayer.remoteFriendCodeSession = createFriendCodeSession({
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  sessionId: campaign.multiplayer.localTable.sessionId,
  relayBaseUrl: "https://play.lorekeeper.example",
  hostSlug: "host-123515123",
  code: "m7ss7k4p",
});
const hostRemoteSnapshot = createHostSnapshot(campaign);
assert.equal(hostRemoteSnapshot.remoteFriendCode.code, "M7SS-7K4P");
assert.equal(hostRemoteSnapshot.remoteFriendCode.link, "https://play.lorekeeper.example/host/host-123515123/table-code/M7SS-7K4P");
assert.equal("internalToken" in hostRemoteSnapshot.remoteFriendCode, false);
const hostRemoteProjection = buildMultiplayerSessionProjection({ campaign });
assert.equal(hostRemoteProjection.remoteFriendCode.code, "M7SS-7K4P");
assert.equal(hostRemoteProjection.remoteFriendCode.link, "https://play.lorekeeper.example/host/host-123515123/table-code/M7SS-7K4P");
assert.match(hostRemoteProjection.remoteFriendCode.safety, /Ollama, files, diagnostics, provider keys/);

let waitingResult = registerWaitingGuest(campaign, {
  playerName: "Nora",
  clientId: "waiting-client",
  preferredPartyMemberId: "lysa",
  proposedCharacter: {
    name: "Nora",
    ancestry: "Human",
    characterClass: "Ranger",
    roleIntent: "quiet scout",
    integrationPrompt: "Nora has been tracking the same wagon.",
  },
});
campaign = waitingResult.campaign;
assert.ok(waitingResult.waitingSecret);
assertTokenShape("waiting-room secret", waitingResult.waitingSecret, 32);
let waitingHostSnapshot = createHostSnapshot(campaign);
assert.equal(waitingHostSnapshot.shareSession.campaignId, campaign.id);
assert.equal(waitingHostSnapshot.shareSession.tableId, campaign.multiplayer.localTable.tableId);
assert.equal(waitingHostSnapshot.shareSession.sessionId, campaign.multiplayer.localTable.sessionId);
assert.equal(waitingHostSnapshot.shareSession.guestLink, "http://192.168.1.24:7347/guest");
assert.equal(waitingHostSnapshot.waitingGuests.length, 1);
assert.equal(waitingHostSnapshot.waitingGuests[0].displayName, "Nora");
assert.equal(waitingHostSnapshot.waitingGuests[0].preferredPartyMemberId, "lysa");
assert.equal(waitingHostSnapshot.waitingGuests[0].proposedCharacter.name, "Nora");
assert.equal(waitingHostSnapshot.waitingGuests[0].proposedCharacter.characterClass, "Ranger");
assert.equal("secret" in waitingHostSnapshot.waitingGuests[0], false);
const lobbyPreview = createJoinPreview(campaign, "");
assert.equal(lobbyPreview.invite, null);
assert.equal(lobbyPreview.joinableSeats.some((seat) => seat.id === "lysa"), true);
assert.equal(lobbyPreview.joinableSeats.some((seat) => seat.id === "jarin"), false);
assert.equal(joinableGuestSeats(campaign).some((seat) => seat.id === "lysa"), true);
const waitingGuestSnapshot = createWaitingGuestSnapshot(campaign, {
  waitingGuestId: waitingResult.waitingGuest.id,
  clientId: "waiting-client",
  waitingSecret: waitingResult.waitingSecret,
});
assert.equal(waitingGuestSnapshot.seated, false);
assert.equal(waitingGuestSnapshot.snapshot, null);
campaign.multiplayer.waitingGuests[0].lastSeenAt = new Date(Date.now() - waitingGuestHeartbeatTimeoutMs - 1000).toISOString();
assert.equal(createHostSnapshot(campaign).waitingGuests.length, 0);
assert.throws(
  () => seatWaitingGuest(campaign, {
    waitingGuestId: waitingResult.waitingGuest.id,
    partyMemberId: "jarin",
  }),
  /no longer connected/i,
);
waitingResult = registerWaitingGuest(campaign, {
  playerName: "Nora",
  clientId: "waiting-client",
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  tableSessionId: campaign.multiplayer.localTable.sessionId,
});
campaign = waitingResult.campaign;
assert.throws(
  () => registerWaitingGuest(campaign, {
    playerName: "Wrong Table",
    clientId: "wrong-table-client",
    tableId: "table-stale",
    sessionId: campaign.multiplayer.localTable.sessionId,
  }),
  /different table/i,
);
assert.throws(
  () => registerWaitingGuest(campaign, {
    playerName: "Wrong Campaign",
    clientId: "wrong-campaign-client",
    campaignId: "campaign-other",
    tableId: campaign.multiplayer.localTable.tableId,
    sessionId: campaign.multiplayer.localTable.sessionId,
  }),
  /different campaign/i,
);
assert.throws(
  () => registerWaitingGuest(campaign, {
    playerName: "Wrong Session",
    clientId: "wrong-session-client",
    campaignId: campaign.id,
    tableId: campaign.multiplayer.localTable.tableId,
    sessionId: "session-stale",
  }),
  /session is no longer active/i,
);
assert.equal(createHostSnapshot(campaign).waitingGuests.length, 1);
const heartbeatResult = heartbeatWaitingGuest(campaign, {
  waitingGuestId: waitingResult.waitingGuest.id,
  clientId: "waiting-client",
  waitingSecret: waitingResult.waitingSecret,
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  tableSessionId: campaign.multiplayer.localTable.sessionId,
});
campaign = heartbeatResult.campaign;
assert.equal(heartbeatResult.snapshot.waitingGuest.displayName, "Nora");
assert.equal(heartbeatResult.snapshot.waitingGuest.proposedCharacter.roleIntent, "quiet scout");
campaign = seatWaitingGuest(campaign, {
  waitingGuestId: waitingResult.waitingGuest.id,
  partyMemberId: "lysa",
});
waitingHostSnapshot = createHostSnapshot(campaign);
assert.equal(waitingHostSnapshot.waitingGuests.length, 0);
const seatedStatus = createWaitingGuestSnapshot(campaign, {
  waitingGuestId: waitingResult.waitingGuest.id,
  clientId: "waiting-client",
  waitingSecret: waitingResult.waitingSecret,
});
assert.equal(seatedStatus.seated, true);
assert.equal(seatedStatus.snapshot.assignedCharacter.id, "lysa");
assert.equal(seatedStatus.connection.proposedCharacter.integrationPrompt, "Nora has been tracking the same wagon.");
assert.equal(campaign.party.find((member) => member.id === "lysa").controllerKind, controllerKinds.REMOTE_PLAYER);
const restartedCampaign = startLocalTable(JSON.parse(JSON.stringify(campaign)), {
  host: "0.0.0.0",
  lanAddress: "192.168.1.24",
  port: 7347,
  sessionId: "table-fresh-session",
});
assert.equal(restartedCampaign.multiplayer.localTable.sessionId, "table-fresh-session");
assert.equal(restartedCampaign.party.find((member) => member.id === "lysa").controllerKind, controllerKinds.HOST);
assert.equal(restartedCampaign.party.find((member) => member.id === "lysa").inviteIntent, "remote_player");
assert.equal(restartedCampaign.multiplayer.connections.find((connection) => connection.id === seatedStatus.connection.id).status, "disconnected");
assert.equal(restartedCampaign.multiplayer.waitingGuests.find((guest) => guest.id === waitingResult.waitingGuest.id).status, "closed");
assert.equal(joinableGuestSeats(restartedCampaign).some((seat) => seat.id === "lysa"), true);
assert.equal(createJoinPreview(restartedCampaign, "").joinableSeats.some((seat) => seat.id === "lysa"), true);
assert.throws(
  () => heartbeatWaitingGuest(restartedCampaign, {
    waitingGuestId: waitingResult.waitingGuest.id,
    clientId: "waiting-client",
    waitingSecret: waitingResult.waitingSecret,
    campaignId: restartedCampaign.id,
    tableId: restartedCampaign.multiplayer.localTable.tableId,
    tableSessionId: restartedCampaign.multiplayer.localTable.sessionId,
  }),
  /no longer active/i,
);
assert.throws(
  () => createWaitingGuestSnapshot(campaign, {
    waitingGuestId: waitingResult.waitingGuest.id,
    clientId: "waiting-client",
    waitingSecret: "wrong-secret",
  }),
  /Waiting room secret/,
);
campaign = disconnectGuest(campaign, seatedStatus.connection.id, {
  clientId: "waiting-client",
  connectionSecret: seatedStatus.connectionSecret,
  requireConnectionSecret: true,
});
const releasedLysa = campaign.party.find((member) => member.id === "lysa");
assert.equal(releasedLysa.controllerKind, controllerKinds.HOST);
assert.equal(releasedLysa.inviteIntent, "remote_player");
waitingResult = registerWaitingGuest(campaign, {
  playerName: "Nora",
  clientId: "waiting-client",
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  tableSessionId: campaign.multiplayer.localTable.sessionId,
  preferredPartyMemberId: "lysa",
});
campaign = waitingResult.campaign;
waitingHostSnapshot = createHostSnapshot(campaign);
assert.equal(waitingHostSnapshot.waitingGuests.length, 1);
assert.equal(waitingHostSnapshot.waitingGuests[0].preferredPartyMemberId, "lysa");
campaign.multiplayer.waitingGuests = campaign.multiplayer.waitingGuests.map((guest) => (
  guest.id === waitingResult.waitingGuest.id ? { ...guest, status: "closed", closedAt: new Date().toISOString() } : guest
));

const inviteResult = createInviteForPartyMember(campaign, {
  partyMemberId: "kevric",
  host: "192.168.1.24",
  port: 7347,
});
campaign = inviteResult.campaign;
const parsedInvite = parseInviteLink(inviteResult.inviteLink);
assert.equal(parsedInvite.valid, true);
assertTokenShape("fixed-seat invite token", inviteResult.invite.token, 24);
assert.equal(parsedInvite.token, inviteResult.invite.token);
assert.equal(parsedInvite.seat, "kevric");
assert.equal(parsedInvite.port, 7347);
assert.equal(parsedInvite.campaign, campaign.id);
assert.equal(parsedInvite.tableId, campaign.multiplayer.localTable.tableId);
assert.equal(parsedInvite.sessionId, campaign.multiplayer.localTable.sessionId);
assert.equal(
  parseInviteLink("lorekeeper://join?host=example.com&port=7347&campaign=campaign-mp&seat=kevric&token=abc").valid,
  false,
);
assert.equal(
  parseInviteLink("lorekeeper://join?host=8.8.8.8&port=7347&campaign=campaign-mp&seat=kevric&token=abc").valid,
  false,
);
assert.equal(
  parseInviteLink("lorekeeper://join?host=127.0.0.1&port=7347&campaign=campaign-mp&seat=kevric&token=abc").valid,
  true,
);
const joinPreview = createJoinPreview(campaign, inviteResult.inviteLink);
assert.equal(joinPreview.campaignTitle, "Campaign Test");
assert.match(joinPreview.campaignSummary, /test campaign/i);
assert.match(joinPreview.scene.immediateSituation, /hidden camp/i);
assert.equal(joinPreview.party.some((member) => member.name === "Jarin"), true);
assert.equal(joinPreview.people?.some?.((person) => person.name === "Hidden Handler"), false);

const joinResult = requestJoin(campaign, {
  inviteLink: inviteResult.inviteLink,
  playerName: "Jess",
  clientId: "guest-client",
});
campaign = joinResult.campaign;
assert.equal(joinResult.approved, false);
assert.ok(joinResult.connectionSecret);
assertTokenShape("guest connection secret", joinResult.connectionSecret, 32);
assert.equal(campaign.multiplayer.connections.find((connection) => connection.id === joinResult.connection.id).status, "pending");
const duplicateJoinResult = requestJoin(campaign, {
  inviteLink: inviteResult.inviteLink,
  playerName: "Jess",
  clientId: "guest-client",
});
campaign = duplicateJoinResult.campaign;
assert.equal(duplicateJoinResult.connection.id, joinResult.connection.id);
assert.equal(duplicateJoinResult.connectionSecret, joinResult.connectionSecret);
assert.equal(
  campaign.multiplayer.connections.filter((connection) => connection.inviteId === inviteResult.invite.id).length,
  1,
);

campaign = approveJoinRequest(campaign, joinResult.connection.id);
const connected = campaign.multiplayer.connections.find((connection) => connection.id === joinResult.connection.id);
const connectionSecret = joinResult.connectionSecret;
const kevric = campaign.party.find((member) => member.id === "kevric");
assert.equal(connected.status, "connected");
assert.equal(connected.campaignId, campaign.id);
assert.equal(connected.tableId, campaign.multiplayer.localTable.tableId);
assert.equal(connected.sessionId, campaign.multiplayer.localTable.sessionId);
assert.equal(kevric.controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(kevric.controllerId, connected.playerId);

const activeRiverChoice = {
  prompt: "What do you do?",
  scope: "vote",
  options: [
    { id: "keep-watch", text: "Keep watch from the bank." },
    { id: "load-boat", text: "Offer to help load the last boat." },
    { id: "sneak-boat", text: "Sneak onto the boat." },
  ],
  allowVote: true,
  allowOther: true,
};
const activeRiverChoiceKey = testChoiceKey(activeRiverChoice);
campaign.sessionLog.messages.push({
  id: "dm-river-crossing-choice",
  sessionId: "session-main",
  role: "dm",
  title: "DM",
  body: "The last boat creaks at the river crossing. What do you do?",
  meta: "",
  source: "test",
  providerRunId: null,
  createdAt: new Date().toISOString(),
  data: {
    choiceOwner: true,
    choices: activeRiverChoice,
  },
});
campaign = submitGuestChoiceVote(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  choiceKey: activeRiverChoiceKey,
  optionId: "load-boat",
  optionLabel: "B",
  optionText: "Offer to help load the last boat.",
  prompt: "What do you do?",
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  sessionId: campaign.multiplayer.localTable.sessionId,
});
let hostVoteSnapshot = createHostSnapshot(campaign);
assert.equal(hostVoteSnapshot.choiceVotes.length, 1);
assert.equal(hostVoteSnapshot.choiceVotes[0].characterId, "kevric");
assert.equal(hostVoteSnapshot.choiceVotes[0].optionLabel, "B");
campaign = submitGuestChoiceVote(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  choiceKey: activeRiverChoiceKey,
  optionId: "sneak-boat",
  optionLabel: "C",
  optionText: "Sneak onto the boat.",
  prompt: "What do you do?",
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  sessionId: campaign.multiplayer.localTable.sessionId,
});
hostVoteSnapshot = createHostSnapshot(campaign);
assert.equal(hostVoteSnapshot.choiceVotes.length, 1);
assert.equal(hostVoteSnapshot.choiceVotes[0].optionLabel, "C");
assert.throws(
  () => submitGuestChoiceVote(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
    choiceKey: "stale-river-crossing-choice",
    optionId: "B",
    optionLabel: "B",
  }),
  /choice is no longer active/i,
);
assert.throws(
  () => submitGuestChoiceVote(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
    choiceKey: activeRiverChoiceKey,
    optionId: "missing-option",
    optionLabel: "Z",
  }),
  /option is no longer active/i,
);
assert.throws(
  () => submitGuestChoiceVote(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "jarin",
    choiceKey: activeRiverChoiceKey,
    optionId: "keep-watch",
    optionLabel: "A",
  }),
  /assigned party member/i,
);

assert.throws(
  () => createGuestSnapshot(campaign, connected.id, {
    clientId: "guest-client",
    connectionSecret,
    campaignId: campaign.id,
    tableId: "table-wrong",
    sessionId: campaign.multiplayer.localTable.sessionId,
  }),
  /different table/i,
);

assert.throws(
  () => submitGuestAction(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
    text: "Kevric acts from an old session.",
    campaignId: campaign.id,
    tableId: campaign.multiplayer.localTable.tableId,
    sessionId: "session-wrong",
  }),
  /session is no longer active/i,
);

let switchedCampaign = testCampaign();
switchedCampaign = {
  ...switchedCampaign,
  id: "campaign-after-switch",
  title: "Campaign After Switch",
};
switchedCampaign = startLocalTable(switchedCampaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7348 });
assert.throws(
  () => createGuestSnapshot(switchedCampaign, connected.id, {
    clientId: "guest-client",
    connectionSecret,
    campaignId: campaign.id,
    tableId: campaign.multiplayer.localTable.tableId,
    sessionId: campaign.multiplayer.localTable.sessionId,
  }),
  /different campaign/i,
);
assert.throws(
  () => submitGuestAction(switchedCampaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
    text: "Kevric acts from a campaign that is no longer selected.",
    campaignId: campaign.id,
    tableId: campaign.multiplayer.localTable.tableId,
    sessionId: campaign.multiplayer.localTable.sessionId,
  }),
  /different campaign/i,
);

const driftedCampaign = JSON.parse(JSON.stringify(campaign));
driftedCampaign.party = driftedCampaign.party.map((member) => member.id === "kevric"
  ? {
    ...member,
    controllerKind: controllerKinds.AI_COMPANION,
    controllerId: null,
  }
  : member);
const healedControllerCampaign = submitGuestAction(driftedCampaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric tests that an approved guest seat repairs controller drift.",
});
assert.equal(healedControllerCampaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(healedControllerCampaign.party.find((member) => member.id === "kevric").controllerId, connected.playerId);

const staleCampaign = JSON.parse(JSON.stringify(campaign));
const connectedPlayer = staleCampaign.multiplayer.players.find((player) => player.id === connected.playerId);
const legacyPlayer = {
  ...connectedPlayer,
  id: "player-legacy-duplicate",
};
const legacyConnection = {
  ...connected,
  id: "conn-legacy-duplicate",
  playerId: legacyPlayer.id,
  status: "pending",
  approvedAt: null,
  secret: connectionSecret,
};
staleCampaign.multiplayer.players.push(legacyPlayer);
staleCampaign.multiplayer.connections.push(legacyConnection);
const healedSnapshot = createGuestSnapshot(staleCampaign, legacyConnection.id, {
  clientId: "guest-client",
  connectionSecret,
});
assert.equal(healedSnapshot.connection.status, "connected");
assert.equal(healedSnapshot.connection.id, connected.id);

let openingGateCampaign = {
  ...testCampaign(),
  id: "campaign-opening-gate",
  scene: {
    ...testCampaign().scene,
    status: "campaign_start",
  },
};
openingGateCampaign = startLocalTable(openingGateCampaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const openingInviteResult = createInviteForPartyMember(openingGateCampaign, {
  partyMemberId: "kevric",
  host: "192.168.1.24",
  port: 7347,
});
openingGateCampaign = openingInviteResult.campaign;
const openingJoinResult = requestJoin(openingGateCampaign, {
  inviteLink: openingInviteResult.inviteLink,
  playerName: "Opening Jess",
  clientId: "opening-guest",
});
openingGateCampaign = approveJoinRequest(openingJoinResult.campaign, openingJoinResult.connection.id);
assert.throws(
  () => submitGuestAction(openingGateCampaign, {
    connectionId: openingJoinResult.connection.id,
    clientId: "opening-guest",
    connectionSecret: openingJoinResult.connectionSecret,
    characterId: "kevric",
    text: "Kevric tries to act before the opening scene.",
  }),
  /not started the adventure/i,
);
assert.throws(
  () => passGuestAction(openingGateCampaign, {
    connectionId: openingJoinResult.connection.id,
    clientId: "opening-guest",
    connectionSecret: openingJoinResult.connectionSecret,
    characterId: "kevric",
  }),
  /not started the adventure/i,
);

const wrongCombatTurnCampaign = {
  ...JSON.parse(JSON.stringify(campaign)),
  combat: {
    inCombat: true,
    round: 1,
    currentTurnId: "jarin",
    turnOrder: [
      { id: "jarin", name: "Jarin", type: "party" },
      { id: "kevric", name: "Kevric", type: "party" },
    ],
    enemies: [],
  },
};
assert.throws(
  () => submitGuestAction(wrongCombatTurnCampaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
    text: "Kevric tries to take Jarin's combat turn.",
  }),
  /Wait for Jarin's combat turn/i,
);
assert.throws(
  () => passGuestAction(wrongCombatTurnCampaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "kevric",
  }),
  /Wait for Jarin's combat turn/i,
);

assert.throws(
  () => submitGuestAction(campaign, {
    connectionId: connected.id,
    clientId: "other-client",
    connectionSecret,
    characterId: "kevric",
    text: "Kevric acts from the wrong join client.",
  }),
  /client does not match/,
);

assert.throws(
  () => submitGuestAction(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret: "wrong-secret",
    characterId: "kevric",
    text: "Kevric acts with the wrong connection secret.",
  }),
  /secret does not match/,
);

assert.throws(
  () => submitGuestAction(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret,
    characterId: "jarin",
    text: "Jarin acts from the guest client.",
  }),
  /assigned party member/,
);

campaign = submitGuestAction(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric ducks behind the nearest tree and watches Jarin's blind side.",
  campaignId: campaign.id,
  tableId: campaign.multiplayer.localTable.tableId,
  sessionId: campaign.multiplayer.localTable.sessionId,
});
assert.equal(campaign.multiplayer.pendingTurnInputs.length, 1);
assert.equal(campaign.multiplayer.pendingTurnInputs[0].tableId, campaign.multiplayer.localTable.tableId);
assert.equal(campaign.multiplayer.pendingTurnInputs[0].sessionId, campaign.multiplayer.localTable.sessionId);

const publicMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === campaign.multiplayer.pendingTurnInputs[0].id);
assert.equal(publicMessage.role, "party");
assert.equal(publicMessage.title, "Kevric");
assert.equal(publicMessage.body, "Kevric ducks behind the nearest tree and watches Jarin's blind side.");
assert.equal(publicMessage.data.status, "pending_model_submit");
assert.equal(publicMessage.data.hostStaged, true);
assert.equal(publicMessage.data.requiresHostApproval, false);
assert.match(publicMessage.meta, /queued for DM/i);
let hostProjection = buildMultiplayerSessionProjection({ campaign });
assert.match(hostProjection.flowSummary, /Kevric queued and ready/i);
assert.equal(hostProjection.resolvePartyInputsLabel, "Send Friend Action");
assert.match(hostProjection.pendingInputs[0].statusLabel, /Friend action queued for the DM/i);
let liveGuestSnapshot = createGuestSnapshot(campaign, connected.id, { clientId: "guest-client", connectionSecret });
assert.match(liveGuestSnapshot.pendingInput.text, /Kevric ducks/i);

campaign.sessionLog.messages.push({
  id: "dm-after-first-remote-draft",
  sessionId: "session-main",
  role: "dm",
  title: "DM",
  body: "The DM asks a follow-up after the first remote action.",
  meta: "Test DM prompt after first guest action.",
  source: "test",
  providerRunId: null,
  createdAt: new Date().toISOString(),
  data: {},
});
campaign = submitGuestAction(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric changes course and signals Jarin instead.",
});
const updatedPublicMessage = campaign.sessionLog.messages.at(-1);
assert.equal(campaign.multiplayer.pendingTurnInputs.length, 1);
assert.equal(updatedPublicMessage.title, "Kevric");
assert.equal(updatedPublicMessage.body, "Kevric changes course and signals Jarin instead.");
assert.equal(updatedPublicMessage.data.pendingInputId, campaign.multiplayer.pendingTurnInputs[0].id);

campaign = clearPendingTurnInputs(campaign, [campaign.multiplayer.pendingTurnInputs[0].id]);
campaign = updateMultiplayerSettings(campaign, { holdGuestActionsForGroupInput: true });
assert.equal(campaign.multiplayer.settings.holdGuestActionsForGroupInput, true);
campaign = submitGuestAction(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric waits for the rest of the table before committing.",
});
const heldMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === campaign.multiplayer.pendingTurnInputs[0].id);
assert.equal(heldMessage.data.hostStaged, true);
assert.equal(heldMessage.data.holdForGroup, true);
assert.match(heldMessage.meta, /group turn/i);
hostProjection = buildMultiplayerSessionProjection({ campaign });
assert.match(hostProjection.flowSummary, /Kevric held for the group turn/i);
assert.equal(hostProjection.resolvePartyInputsLabel, "Send Group Turn");
assert.match(hostProjection.pendingInputs[0].statusLabel, /Held for the group turn/i);

const heldInputId = campaign.multiplayer.pendingTurnInputs[0].id;
campaign = clearPendingTurnInputs(campaign, [heldInputId], { disposition: "dropped" });
assert.equal(campaign.multiplayer.pendingTurnInputs.length, 0);
const droppedHeldMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === heldInputId);
assert.equal(droppedHeldMessage.data.status, "guest_input_dropped");
assert.equal(droppedHeldMessage.data.lifecycle, "dropped");
assert.equal(droppedHeldMessage.meta, "Dropped by host before the DM resolved it");
campaign = updateMultiplayerSettings(campaign, { requireGuestActionApproval: true });
assert.equal(campaign.multiplayer.settings.requireGuestActionApproval, true);
assert.equal(campaign.multiplayer.settings.holdGuestActionsForGroupInput, true);
campaign = submitGuestAction(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric waits for host review before stepping into the clearing.",
});
const approvalMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === campaign.multiplayer.pendingTurnInputs[0].id);
assert.equal(approvalMessage.data.hostStaged, false);
assert.equal(approvalMessage.data.requiresHostApproval, true);
assert.match(approvalMessage.meta, /waiting for host review/i);
hostProjection = buildMultiplayerSessionProjection({ campaign });
assert.match(hostProjection.flowSummary, /Kevric waiting for your review/i);
assert.equal(hostProjection.resolvePartyInputsLabel, "Send To DM");
assert.match(hostProjection.pendingInputs[0].statusLabel, /Waiting for host review/i);

const hostSnapshot = createHostSnapshot(campaign);
assert.equal(hostSnapshot.connections.some((connection) => "secret" in connection), false);
assert.equal(hostSnapshot.settings.requireGuestActionApproval, true);
assert.equal(hostSnapshot.settings.holdGuestActionsForGroupInput, true);
campaign.combat = {
  inCombat: true,
  round: 1,
  currentTurnId: "kevric",
  turnOrder: [
    { id: "kevric", name: "Kevric", type: "party", hp: { current: 12, max: 12 } },
    { id: "wolf", name: "Wolf", type: "enemy", hp: { current: 7, max: 7 } },
  ],
  enemies: [{ id: "wolf", name: "Wolf", hp: { current: 7, max: 7 } }],
};
campaign.party.find((member) => member.id === "kevric").notes.push({
  visible: "Kevric carries a brass lantern.",
  connectionSecret: "guest-secret-should-not-leak",
  waitingSecret: "waiting-secret-should-not-leak",
  providerSettings: { selectedModel: "private-model" },
  sqlitePath: "C:\\private\\campaign.sqlite",
  nested: {
    apiKey: "provider-key-should-not-leak",
    originalPath: "C:\\private\\asset.png",
    partyConnection: "Met Jarin on the road.",
  },
});
campaign.sessionLog.messages.push({
  id: "sensitive-debug-message",
  sessionId: "session-main",
  role: "system",
  title: "LoreKeeper",
  body: "Visible table update.",
  meta: "Sanitizer regression.",
  source: "test",
  createdAt: new Date().toISOString(),
  data: {
    visible: true,
    connectionSecret: "guest-secret-should-not-leak",
    rawResponse: "raw model output should not leak",
    providerPrompt: "prompt should not leak",
    localPath: "C:\\private\\debug.txt",
    nested: {
      apiKey: "provider-key-should-not-leak",
      partyConnection: "Met Jarin on the road.",
    },
  },
});
const guestSnapshot = createGuestSnapshot(campaign, connected.id, { clientId: "guest-client", connectionSecret });
assert.equal(guestSnapshot.assignedCharacter.name, "Kevric");
assert.ok(guestSnapshot.revision);
assert.equal(guestSnapshot.messages.some((message) => message.title === "Kevric"), true);
assert.equal(guestSnapshot.tableState.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(guestSnapshot.tableState.places.find((place) => place.id === "forest").name, "Forest");
assert.equal(guestSnapshot.tableState.items.find((item) => item.id === "flag").name, "Training Flag");
assert.equal(guestSnapshot.tableState.updatedAt, campaign.updatedAt);
assert.equal(guestSnapshot.tableState.people.some((person) => person.name === "Hidden Handler"), false);
assert.equal(guestSnapshot.tableState.party.find((member) => member.id === "kevric").notes.some((note) => /secret/i.test(note)), false);
const redactedNote = guestSnapshot.tableState.party.find((member) => member.id === "kevric").notes.find((note) => note.visible);
assert.equal(redactedNote.visible, "Kevric carries a brass lantern.");
assert.equal("connectionSecret" in redactedNote, false);
assert.equal("waitingSecret" in redactedNote, false);
assert.equal("providerSettings" in redactedNote, false);
assert.equal("sqlitePath" in redactedNote, false);
assert.equal("apiKey" in redactedNote.nested, false);
assert.equal("originalPath" in redactedNote.nested, false);
assert.equal(redactedNote.nested.partyConnection, "Met Jarin on the road.");
const redactedMessage = guestSnapshot.messages.find((message) => message.id === "sensitive-debug-message");
assert.equal(redactedMessage.data.visible, true);
assert.equal("connectionSecret" in redactedMessage.data, false);
assert.equal("rawResponse" in redactedMessage.data, false);
assert.equal("providerPrompt" in redactedMessage.data, false);
assert.equal("localPath" in redactedMessage.data, false);
assert.equal("apiKey" in redactedMessage.data.nested, false);
assert.equal(redactedMessage.data.nested.partyConnection, "Met Jarin on the road.");
assert.deepEqual(guestSnapshot.tableState.combat.enemies[0].hp, { hidden: true });
assert.deepEqual(guestSnapshot.tableState.combat.turnOrder.find((entry) => entry.id === "wolf").hp, { hidden: true });

campaign = postTableTalk(campaign, {
  playerName: "Host",
  text: "Snack break after this scene?",
});
campaign = postTableTalk(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  text: "Yes please.",
});
assert.equal(campaign.multiplayer.tableTalk.length, 2);
assert.equal(campaign.sessionLog.messages.some((message) => /Snack break/i.test(message.body)), false);
assert.throws(
  () => postTableTalk(campaign, {
    connectionId: connected.id,
    clientId: "guest-client",
    connectionSecret: "wrong-secret",
    text: "Spoofed side chat.",
  }),
  /secret does not match/,
);
const tableTalkHostSnapshot = createHostSnapshot(campaign);
assert.equal(tableTalkHostSnapshot.tableTalk.length, 2);
assert.equal(tableTalkHostSnapshot.tableTalk.at(-1).text, "Yes please.");
assert.equal(tableTalkHostSnapshot.tableTalk.some((message) => "connectionSecret" in message || "secret" in message), false);
const tableTalkGuestSnapshot = createGuestSnapshot(campaign, connected.id, { clientId: "guest-client", connectionSecret });
assert.equal(tableTalkGuestSnapshot.tableState.tableTalk.at(-1).playerName, "Jess");
assert.equal(tableTalkGuestSnapshot.tableState.tableTalk.at(-1).text, "Yes please.");

const aggregated = buildAggregatedPlayerTurn(campaign, {
  hostText: "Jarin slows down and signals silently.",
});
assert.match(aggregated.text, /Jarin slows down/);
assert.equal(aggregated.playerInputs.find((input) => input.characterId === "kevric").characterName, "Kevric");

campaign = clearPendingTurnInputs(campaign, [campaign.multiplayer.pendingTurnInputs[0].id]);
assert.equal(campaign.multiplayer.pendingTurnInputs.length, 0);
const submittedMessage = campaign.sessionLog.messages.find((message) => message.title === "Kevric");
assert.equal(submittedMessage.data.status, "submitted_to_model");
assert.equal(submittedMessage.data.lifecycle, "resolved");
assert.equal(submittedMessage.meta, "Resolved by DM");

campaign.sessionLog.messages.push({
  id: "dm-after-guest-action",
  sessionId: "session-main",
  role: "dm",
  title: "DM",
  body: "Kevric slips behind the tree while Jarin keeps the sentry's eyes forward.",
  meta: "Test DM result after host resolution.",
  source: "test",
  createdAt: new Date().toISOString(),
  data: {},
});
const resolvedGuestSnapshot = createGuestSnapshot(campaign, connected.id, { clientId: "guest-client", connectionSecret });
assert.equal(resolvedGuestSnapshot.messages.some((message) => message.id === "dm-after-guest-action"), true);
assert.equal(
  resolvedGuestSnapshot.messages.find((message) => message.title === "Kevric").data.status,
  "submitted_to_model",
);
assert.equal(
  resolvedGuestSnapshot.messages.find((message) => message.title === "Kevric").data.lifecycle,
  "resolved",
);

assert.throws(
  () => disconnectGuest(campaign, connected.id, {
    clientId: "guest-client",
    connectionSecret: "wrong-secret",
    requireConnectionSecret: true,
  }),
  /connection secret/i,
);
campaign = disconnectGuest(campaign, connected.id, {
  clientId: "guest-client",
  connectionSecret,
  requireConnectionSecret: true,
});
const releasedKevric = campaign.party.find((member) => member.id === "kevric");
assert.equal(releasedKevric.controllerKind, controllerKinds.HOST);
assert.equal(releasedKevric.controllerId, "host");
const reconnectResult = requestJoin(campaign, {
  inviteLink: inviteResult.inviteLink,
  playerName: "Jess",
  clientId: "guest-client",
});
campaign = reconnectResult.campaign;
assert.equal(reconnectResult.connection.id, connected.id);
assert.equal(reconnectResult.approved, true);
assert.equal(reconnectResult.connection.status, "connected");
assert.equal(campaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(campaign.multiplayer.events.some((event) => event.type === "guest_reconnected"), true);

let aiTransferCampaign = returnToAiCompanion(structuredClone(campaign), "kevric");
assert.equal(aiTransferCampaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.AI_COMPANION);
assert.equal(aiTransferCampaign.multiplayer.connections.find((connection) => connection.id === connected.id).status, "disconnected");
assert.match(aiTransferCampaign.multiplayer.connections.find((connection) => connection.id === connected.id).disconnectReason, /^controller_/);
aiTransferCampaign = startLocalTable(aiTransferCampaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
assert.equal(aiTransferCampaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.AI_COMPANION);
assert.equal(aiTransferCampaign.multiplayer.connections.find((connection) => connection.id === connected.id).status, "disconnected");

let tableStopCampaign = approveJoinRequest(joinResult.campaign, joinResult.connection.id);
tableStopCampaign = stopLocalTable(tableStopCampaign);
const stoppedSnapshot = createGuestSnapshot(tableStopCampaign, joinResult.connection.id, { clientId: "guest-client", connectionSecret });
assert.equal(stoppedSnapshot.tableStopped, true);
assert.equal(stoppedSnapshot.awaitingApproval, false);
assert.match(stoppedSnapshot.scene.immediateSituation, /host local table is off/i);
const stoppedSessionId = tableStopCampaign.multiplayer.localTable.sessionId;
tableStopCampaign = startLocalTable(tableStopCampaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
assert.notEqual(tableStopCampaign.multiplayer.localTable.sessionId, stoppedSessionId);
assert.throws(
  () => createGuestSnapshot(tableStopCampaign, joinResult.connection.id, {
    clientId: "guest-client",
    connectionSecret,
    campaignId: tableStopCampaign.id,
    tableId: tableStopCampaign.multiplayer.localTable.tableId,
    sessionId: stoppedSessionId,
  }),
  /session is no longer active/i,
);
const staleRestartSnapshot = createGuestSnapshot(tableStopCampaign, joinResult.connection.id, { clientId: "guest-client", connectionSecret });
assert.equal(staleRestartSnapshot.connection.status, "disconnected");
assert.notEqual(tableStopCampaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(joinableGuestSeats(tableStopCampaign).some((seat) => seat.id === "kevric"), true);

let joinAsCampaign = startLocalTable(testCampaign(), { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const characterInviteResult = createCharacterRequestInvite(joinAsCampaign, { host: "192.168.1.24", port: 7347 });
joinAsCampaign = characterInviteResult.campaign;
const characterInvite = parseInviteLink(characterInviteResult.inviteLink);
assert.equal(characterInvite.valid, true);
assertTokenShape("character-request invite token", characterInviteResult.invite.token, 24);
assert.equal(characterInvite.token, characterInviteResult.invite.token);
assert.equal(characterInvite.seat, "new-character");
const characterJoinResult = requestJoin(joinAsCampaign, {
  inviteLink: characterInviteResult.inviteLink,
  playerName: "Nora",
  clientId: "join-as-client",
  proposedCharacter: {
    name: "Mira",
    ancestry: "Human",
    characterClass: "Ranger",
    level: 2,
    roleIntent: "Road scout and careful ranged support",
    appearance: "Weathered cloak, travel-worn boots, and a hawk-feather braid.",
    backstory: "A road scout looking for her missing sister.",
    integrationPrompt: "Mira knows the merchant road and can enter as a hired guide who recognizes the party needs help.",
  },
});
joinAsCampaign = characterJoinResult.campaign;
assert.equal(characterJoinResult.approved, false);
assert.equal(joinAsCampaign.party.some((member) => member.name === "Mira"), false);
assert.equal(joinAsCampaign.multiplayer.connections[0].proposedCharacter.name, "Mira");
assert.match(joinAsCampaign.multiplayer.connections[0].proposedCharacter.integrationPrompt, /hired guide/);
joinAsCampaign = approveJoinRequest(joinAsCampaign, characterJoinResult.connection.id, {
  hostIntegrationPrompt: "Introduce Mira at the next crossroads as the only scout who knows the flooded bridge detour.",
});
const mira = joinAsCampaign.party.find((member) => member.name === "Mira");
assert.ok(mira);
assert.equal(mira.controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(mira.ancestryClass, "Human Ranger");
assert.equal(mira.level, 2);
assert.match(mira.summary, /Road scout/);
assert.match(mira.appearance, /hawk-feather/);
assert.match(mira.background, /missing sister/);
assert.match(mira.dmIntegrationPrompt, /hired guide/);
assert.match(mira.hostIntegrationPrompt, /flooded bridge detour/);
assert.equal(mira.notes.some((note) => /DM integration prompt: Mira knows/.test(note)), true);
assert.equal(mira.notes.some((note) => /Host scene context: Introduce Mira/.test(note)), true);
assert.equal(joinAsCampaign.sessionLog.messages.some((message) =>
  message.source === "remote_character_join" &&
  /Mira has joined the party/.test(message.body) &&
  /hired guide/.test(message.body) &&
  /flooded bridge detour/.test(message.body)
), true);
assert.equal(joinAsCampaign.multiplayer.connections[0].partyMemberId, mira.id);

let combatJoinAsCampaign = startLocalTable({
  ...testCampaign(),
  combat: {
    inCombat: true,
    round: 1,
    currentTurnId: "jarin",
    initiative: ["jarin"],
    turnOrder: [{ id: "jarin", name: "Jarin", type: "party", initiativeScore: 12 }],
    enemies: [{ id: "enemy-miner", name: "Hostile miner", hp: { current: 8, max: 8 }, armorClass: 12 }],
  },
}, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const combatJoinInviteResult = createCharacterRequestInvite(combatJoinAsCampaign, { host: "192.168.1.24", port: 7347 });
combatJoinAsCampaign = combatJoinInviteResult.campaign;
const combatMiraJoinResult = requestJoin(combatJoinAsCampaign, {
  inviteLink: combatJoinInviteResult.inviteLink,
  playerName: "Mira Player",
  clientId: "combat-mira-client",
  proposedCharacter: {
    name: "Mira",
    ancestry: "Dwarf",
    characterClass: "Ranger",
    backstory: "A road scout already standing beside the party.",
  },
});
combatJoinAsCampaign = approveJoinRequest(combatMiraJoinResult.campaign, combatMiraJoinResult.connection.id);
const combatMira = combatJoinAsCampaign.party.find((member) => member.name === "Mira");
assert.ok(combatMira, "approving a join-as character during combat should create the party member");
assert.equal(combatJoinAsCampaign.scene.presentPartyMemberIds.includes(combatMira.id), true, "join-as character should be marked present in the scene");
assert.equal(combatJoinAsCampaign.combat.turnOrder.some((entry) => entry.id === combatMira.id), true, "join-as character should be added to initiative");
assert.equal(combatJoinAsCampaign.combat.currentTurnId, "jarin", "adding a combatant should not steal the active turn");

let nameOnlyJoinCampaign = startLocalTable(testCampaign(), { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const nameOnlyInviteResult = createCharacterRequestInvite(nameOnlyJoinCampaign, { host: "192.168.1.24", port: 7347 });
nameOnlyJoinCampaign = nameOnlyInviteResult.campaign;
const nameOnlyJoinResult = requestJoin(nameOnlyJoinCampaign, {
  inviteLink: nameOnlyInviteResult.inviteLink,
  playerName: "Am",
  clientId: "name-only-client",
});
nameOnlyJoinCampaign = nameOnlyJoinResult.campaign;
assert.equal(nameOnlyJoinResult.connection.proposedCharacter.name, "Am");
assert.equal(nameOnlyJoinResult.connection.partyMemberId, null);
nameOnlyJoinCampaign = approveJoinRequest(nameOnlyJoinCampaign, nameOnlyJoinResult.connection.id);
assert.ok(nameOnlyJoinCampaign.party.find((member) => member.name === "Am"));

assert.throws(
  () => requestJoin(nameOnlyJoinCampaign, {
    inviteLink: nameOnlyInviteResult.inviteLink.replace("campaign=campaign-test", "campaign=stale-campaign"),
    playerName: "Am",
    clientId: "stale-client",
  }),
  (error) => error.statusCode === 409 && /fresh invite/i.test(error.publicMessage),
);

let wrongInviteCampaign = startLocalTable(testCampaign(), { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const garrenInviteResult = createInviteForPartyMember(wrongInviteCampaign, {
  partyMemberId: "jarin",
  host: "192.168.1.24",
  port: 7347,
});
wrongInviteCampaign = garrenInviteResult.campaign;
const eveJoinResult = requestJoin(wrongInviteCampaign, {
  inviteLink: garrenInviteResult.inviteLink,
  playerName: "Jess",
  clientId: "eve-client",
  proposedCharacter: {
    name: "Eve",
    ancestry: "Fairy",
    characterClass: "Druid",
    backstory: "A tiny storm-bright troublemaker who wants to help.",
    integrationPrompt: "Eve flutters in as an old friend who knows the tavern's back room.",
  },
});
wrongInviteCampaign = eveJoinResult.campaign;
assert.equal(eveJoinResult.connection.partyMemberId, null, "filled join-as forms must not claim the existing invited seat");
assert.equal(eveJoinResult.connection.proposedCharacter.name, "Eve");
wrongInviteCampaign = approveJoinRequest(wrongInviteCampaign, eveJoinResult.connection.id);
const eve = wrongInviteCampaign.party.find((member) => member.name === "Eve");
assert.ok(eve, "approving a filled join-as form should create the submitted character");
assert.equal(eve.controllerKind, controllerKinds.REMOTE_PLAYER);
assert.notEqual(wrongInviteCampaign.party.find((member) => member.id === "jarin").controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(wrongInviteCampaign.multiplayer.connections.find((connection) => connection.id === eveJoinResult.connection.id).partyMemberId, eve.id);

console.log("LoreKeeper multiplayer tests passed.");

function testChoiceKey(choices = {}) {
  return choicePanelKey(choices);
}

function testCampaign() {
  return {
    id: "campaign-test",
    title: "Campaign Test",
    summary: "A test campaign.",
    scene: {
      currentPlaceId: "forest",
      immediateSituation: "Two trainees are racing toward a hidden camp.",
      presentPartyMemberIds: ["jarin", "kevric"],
    },
    party: [
      {
        id: "jarin",
        name: "Jarin",
        type: "player_character",
        playerRole: "player character",
      },
      {
        id: "kevric",
        name: "Kevric",
        type: "companion",
        playerRole: "trusted party member",
        notes: [
          "Loyal training partner.",
          { visibility: "dm_only", text: "Secret handler reports on Kevric." },
        ],
      },
      {
        id: "lysa",
        name: "Lysa",
        type: "companion",
        playerRole: "scout",
      },
    ],
    people: [
      {
        id: "hidden-handler",
        name: "Hidden Handler",
        type: "npc",
        visibility: "dm_only",
      },
    ],
    places: [{ id: "forest", name: "Forest", type: "location" }],
    items: [{ id: "flag", name: "Training Flag", type: "quest item" }],
    quests: [],
    sessionLog: {
      activeSessionId: "session-main",
      sessions: [
        {
          id: "session-main",
          title: "Campaign Play",
          startedAt: new Date().toISOString(),
          endedAt: null,
          recap: "",
        },
      ],
      messages: [],
    },
    multiplayer: {},
  };
}
