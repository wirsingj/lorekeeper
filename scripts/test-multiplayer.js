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
  createJoinPreview,
  disconnectGuest,
  parseInviteLink,
  postTableTalk,
  requestJoin,
  stopLocalTable,
  startLocalTable,
  submitGuestAction,
  updateMultiplayerSettings,
} from "../src/multiplayer/local-table.js";

let campaign = testCampaign();
campaign = startLocalTable(campaign, { host: "0.0.0.0", lanAddress: "192.168.1.24", port: 7347 });
assert.equal(campaign.multiplayer.localTable.running, true);
assert.equal(campaign.multiplayer.settings.requireGuestActionApproval, false);
assert.equal(campaign.multiplayer.settings.holdGuestActionsForGroupInput, false);

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
assert.equal(publicMessage.data.requiresHostApproval, false);
assert.match(publicMessage.meta, /sent to host and queued for DM/i);

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
assert.match(heldMessage.meta, /grouped host turn/i);

campaign = clearPendingTurnInputs(campaign, [campaign.multiplayer.pendingTurnInputs[0].id]);
campaign = updateMultiplayerSettings(campaign, { requireGuestActionApproval: true });
assert.equal(campaign.multiplayer.settings.requireGuestActionApproval, true);
assert.equal(campaign.multiplayer.settings.holdGuestActionsForGroupInput, true);
campaign = submitGuestAction(campaign, {
  connectionId: connected.id,
  clientId: "guest-client",
  connectionSecret,
  characterId: "kevric",
  text: "Kevric waits for host approval before stepping into the clearing.",
});
const approvalMessage = campaign.sessionLog.messages.find((message) => message.data?.pendingInputId === campaign.multiplayer.pendingTurnInputs[0].id);
assert.equal(approvalMessage.data.hostStaged, false);
assert.equal(approvalMessage.data.requiresHostApproval, true);
assert.match(approvalMessage.meta, /waiting for host approval/i);

const hostSnapshot = createHostSnapshot(campaign);
assert.equal(hostSnapshot.connections.some((connection) => "secret" in connection), false);
assert.equal(hostSnapshot.settings.requireGuestActionApproval, true);
assert.equal(hostSnapshot.settings.holdGuestActionsForGroupInput, true);
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
