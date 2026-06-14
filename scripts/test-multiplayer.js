import assert from "node:assert/strict";
import {
  approveJoinRequest,
  buildAggregatedPlayerTurn,
  clearPendingTurnInputs,
  controllerKinds,
  createCharacterRequestInvite,
  createGuestSnapshot,
  createHostSnapshot,
  createInviteForPartyMember,
  disconnectGuest,
  parseInviteLink,
  postTableTalk,
  requestJoin,
  stopLocalTable,
  startLocalTable,
  submitGuestAction,
} from "../src/multiplayer/local-table.js";

let campaign = testCampaign();
campaign = startLocalTable(campaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
assert.equal(campaign.multiplayer.localTable.running, true);

const inviteResult = createInviteForPartyMember(campaign, {
  partyMemberId: "kevric",
  host: "192.168.1.24",
  port: 7347,
});
campaign = inviteResult.campaign;
const parsedInvite = parseInviteLink(inviteResult.inviteLink);
assert.equal(parsedInvite.valid, true);
assert.equal(parsedInvite.seat, "kevric");
assert.equal(parsedInvite.port, 7347);
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

const joinResult = requestJoin(campaign, {
  inviteLink: inviteResult.inviteLink,
  playerName: "Jess",
  clientId: "guest-client",
});
campaign = joinResult.campaign;
assert.equal(joinResult.approved, false);
assert.ok(joinResult.connectionSecret);
assert.equal(campaign.multiplayer.connections[0].status, "pending");
const duplicateJoinResult = requestJoin(campaign, {
  inviteLink: inviteResult.inviteLink,
  playerName: "Jess",
  clientId: "guest-client",
});
campaign = duplicateJoinResult.campaign;
assert.equal(duplicateJoinResult.connection.id, joinResult.connection.id);
assert.equal(duplicateJoinResult.connectionSecret, joinResult.connectionSecret);
assert.equal(campaign.multiplayer.connections.length, 1);

campaign = approveJoinRequest(campaign, joinResult.connection.id);
const connected = campaign.multiplayer.connections[0];
const connectionSecret = joinResult.connectionSecret;
const kevric = campaign.party.find((member) => member.id === "kevric");
assert.equal(connected.status, "connected");
assert.equal(kevric.controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(kevric.controllerId, connected.playerId);

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

assert.throws(
  () => submitGuestAction(campaign, {
    connectionId: connected.id,
    clientId: "other-client",
    connectionSecret,
    characterId: "kevric",
    text: "Kevric acts from the wrong thin client.",
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
});
assert.equal(campaign.multiplayer.pendingTurnInputs.length, 1);

const publicMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === campaign.multiplayer.pendingTurnInputs[0].id);
assert.equal(publicMessage.role, "party");
assert.equal(publicMessage.title, "Kevric");
assert.equal(publicMessage.body, "Kevric ducks behind the nearest tree and watches Jarin's blind side.");
assert.equal(publicMessage.data.status, "pending_model_submit");
assert.equal(publicMessage.data.hostStaged, true);
assert.match(publicMessage.meta, /staged for next Send Turn/i);

const hostSnapshot = createHostSnapshot(campaign);
assert.equal(hostSnapshot.connections.some((connection) => "secret" in connection), false);
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

campaign = disconnectGuest(campaign, connected.id);
const releasedKevric = campaign.party.find((member) => member.id === "kevric");
assert.equal(releasedKevric.controllerKind, controllerKinds.AI_COMPANION);

let tableStopCampaign = approveJoinRequest(joinResult.campaign, joinResult.connection.id);
tableStopCampaign = stopLocalTable(tableStopCampaign);
const stoppedSnapshot = createGuestSnapshot(tableStopCampaign, joinResult.connection.id, { clientId: "guest-client", connectionSecret });
assert.equal(stoppedSnapshot.tableStopped, true);
assert.equal(stoppedSnapshot.awaitingApproval, false);
assert.match(stoppedSnapshot.scene.immediateSituation, /host local table is off/i);
tableStopCampaign = startLocalTable(tableStopCampaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const revivedSnapshot = createGuestSnapshot(tableStopCampaign, joinResult.connection.id, { clientId: "guest-client", connectionSecret });
assert.equal(revivedSnapshot.connection.status, "connected");
assert.equal(revivedSnapshot.assignedCharacter.name, "Kevric");
assert.equal(tableStopCampaign.party.find((member) => member.id === "kevric").controllerKind, controllerKinds.REMOTE_PLAYER);

let joinAsCampaign = startLocalTable(testCampaign(), { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
const characterInviteResult = createCharacterRequestInvite(joinAsCampaign, { host: "192.168.1.24", port: 7347 });
joinAsCampaign = characterInviteResult.campaign;
const characterInvite = parseInviteLink(characterInviteResult.inviteLink);
assert.equal(characterInvite.valid, true);
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
    backstory: "A road scout looking for her missing sister.",
  },
});
joinAsCampaign = characterJoinResult.campaign;
assert.equal(characterJoinResult.approved, false);
assert.equal(joinAsCampaign.party.some((member) => member.name === "Mira"), false);
assert.equal(joinAsCampaign.multiplayer.connections[0].proposedCharacter.name, "Mira");
joinAsCampaign = approveJoinRequest(joinAsCampaign, characterJoinResult.connection.id);
const mira = joinAsCampaign.party.find((member) => member.name === "Mira");
assert.ok(mira);
assert.equal(mira.controllerKind, controllerKinds.REMOTE_PLAYER);
assert.equal(mira.ancestryClass, "Human Ranger");
assert.match(mira.background, /missing sister/);
assert.equal(joinAsCampaign.multiplayer.connections[0].partyMemberId, mira.id);

console.log("Lorekeeper multiplayer tests passed.");

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
