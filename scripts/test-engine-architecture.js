import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { readTextWithFallback, writeTextWithFallback } from "../app/clipboard-utils.js";
import { buildCombatTrackerView } from "../app/combat-tracker-view.js";
import { randomDevJumpStart } from "../app/dev-jump-start.js";
import { buildInputComposerProjection } from "../app/input-composer-controller.js";
import { buildMultiplayerSessionProjection } from "../app/multiplayer-session-panel.js";
import { buildReviewPanelProjection } from "../app/proposed-changes-panel.js";
import { tableStatusForActivity, tableTimelineEvent } from "../app/table-status.js";
import { createTurnFlowRuntime } from "../app/turn-flow-runtime.js";
import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";
import { controllerForActor, canProviderActForActor, requiresHumanInput } from "../src/engine/agency-controller.js";
import { getActiveCombatActor, legalActionsForActor, resolveCombatAction, startCombat } from "../src/engine/combat-engine.js";
import { createCampaignStateStore } from "../src/engine/campaign-state-store.js";
import { addConsequence, resolveConsequence } from "../src/engine/consequence-engine.js";
import { rollD20, rollFormula } from "../src/engine/dice-engine.js";
import { buildProviderTaskRequest, acceptProviderResponseForTurn, createProviderOrchestrator } from "../src/engine/provider-orchestrator.js";
import { buildSceneIntentPack, buildSceneRetrieval, transitionScene } from "../src/engine/scene-engine.js";
import { applyStateEffects } from "../src/engine/state-effects.js";
import {
  addPendingInput,
  beginTurn,
  canSubmitTurn,
  completeTurn,
  createTurnEngineState,
  failTurn,
  lockTurn,
  retryTurn,
  startGenerating,
  startRolling,
} from "../src/engine/turn-engine.js";
import { controllerKinds, gameModes, turnStates } from "../src/engine/types.js";

function campaignFixture() {
  return {
    id: "campaign-test",
    title: "Engine Test",
    party: [
      {
        id: "thor",
        name: "Thor",
        controllerKind: controllerKinds.HOST,
        stats: {
          hp: { current: 12, max: 12 },
          armorClass: 14,
          abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 10 },
        },
        attacks: [{ name: "Greataxe", attackBonus: 5, damage: "1d12+3" }],
      },
      {
        id: "sy",
        name: "Sy",
        controllerKind: controllerKinds.AI_COMPANION,
        stats: { hp: { current: 9, max: 9 }, armorClass: 13, abilityScores: { DEX: 16 } },
      },
      {
        id: "karl",
        name: "Karl",
        controllerKind: controllerKinds.REMOTE_PLAYER,
        controllerId: "seat-karl",
        stats: { hp: { current: 8, max: 8 }, armorClass: 12, abilityScores: { DEX: 12 } },
      },
    ],
    people: [{ id: "barkeep", name: "Barkeep" }],
    places: [{ id: "tavern", name: "Tavern" }],
    inventory: [],
    quests: [{ id: "quest-1", title: "Calm the brawl", status: "active", stakes: "Keep the tavern from turning hostile.", notes: [] }],
    relationships: [
      {
        id: "rel-thor-barkeep",
        sourceId: "barkeep",
        targetId: "thor",
        type: "cautious_respect",
        notes: "The barkeep respects Thor's restraint but worries about property damage.",
      },
    ],
    scenes: [],
    consequences: [],
    scene: {
      status: "active",
      currentPlaceId: "tavern",
      immediateSituation: "A tavern brawl is starting.",
      activeQuestIds: ["quest-1"],
      presentPartyMemberIds: ["thor", "sy", "karl"],
      presentPeopleIds: ["barkeep"],
    },
    sessionLog: {
      messages: [{ role: "dm", speaker: "DM", text: "The miner throws a punch." }],
    },
    combat: {
      inCombat: false,
      enemies: [],
      turnOrder: [],
      initiative: [],
      currentTurnId: null,
      round: null,
      turnEconomy: {},
    },
  };
}

function testDiceEngine() {
  const first = rollD20({ seed: "same", modifier: 3, now: "now" });
  const second = rollD20({ seed: "same", modifier: 3, now: "now" });
  assert.deepEqual(first, second, "seeded d20 rolls should be deterministic");
  assert.equal(first.formula, "1d20+3");
  assert.equal(first.rolls.length, 1);

  const advantage = rollD20({ seed: "adv", advantage: true, now: "now" });
  assert.equal(advantage.rolls.length, 2);
  assert.equal(advantage.kept[0], Math.max(...advantage.rolls));

  const damage = rollFormula("1d8+3", { seed: "damage", now: "now" });
  assert.match(damage.breakdown, /= \d+$/);
}

async function testClipboardFallback() {
  const nativeFirst = await writeTextWithFallback("invite", {
    desktopWriteText: async (text) => ({ ok: text === "invite" }),
    browserWriteText: async () => {
      throw new Error("Browser clipboard should not be needed.");
    },
  });
  assert.deepEqual(nativeFirst, { copied: true, method: "electron" });

  let browserValue = "";
  const browserFallback = await writeTextWithFallback("invite-link", {
    desktopWriteText: async () => {
      throw new Error("Electron clipboard unavailable.");
    },
    browserWriteText: async (text) => {
      browserValue = text;
    },
  });
  assert.equal(browserFallback.copied, true);
  assert.equal(browserFallback.method, "browser");
  assert.equal(browserValue, "invite-link");

  const blocked = await writeTextWithFallback("invite-link", {
    desktopWriteText: async () => ({ ok: false }),
    browserWriteText: async () => {
      throw new Error("permission denied");
    },
  });
  assert.equal(blocked.copied, false);
  assert.match(blocked.error, /blocked/i);

  const empty = await writeTextWithFallback("");
  assert.equal(empty.copied, false);
  assert.match(empty.error, /empty/i);

  const readNativeFirst = await readTextWithFallback({
    desktopReadText: async () => ({ ok: true, text: "native text" }),
    browserReadText: async () => {
      throw new Error("Browser clipboard should not be needed.");
    },
  });
  assert.deepEqual(readNativeFirst, { ok: true, text: "native text", method: "electron" });

  const readBrowserFallback = await readTextWithFallback({
    desktopReadText: async () => {
      throw new Error("Electron clipboard unavailable.");
    },
    browserReadText: async () => "browser text",
  });
  assert.deepEqual(readBrowserFallback, { ok: true, text: "browser text", method: "browser" });

  const readBlocked = await readTextWithFallback({
    desktopReadText: async () => ({ ok: false }),
    browserReadText: async () => {
      throw new Error("permission denied");
    },
  });
  assert.equal(readBlocked.ok, false);
  assert.match(readBlocked.error, /blocked/i);
}

function testDevJumpStartSeed() {
  const values = [0.1, 0.2, 0.3];
  let index = 0;
  const seed = randomDevJumpStart(() => values[index++ % values.length]);
  assert.match(seed.title, /\d{3}$/);
  assert.ok(seed.premise.length > 40);
  assert.ok(seed.startingLocation.length > 2);
  assert.ok(seed.tone.length > 10);
  assert.ok(seed.playerCharacter.name);
  assert.ok(seed.playerCharacter.ancestry);
  assert.ok(seed.playerCharacter.characterClass);
  assert.equal(seed.playerCharacter.level, "2");
  assert.equal(seed.playerCharacter.autoSheet, true);
  assert.ok(seed.playerCharacter.concept.length > 40);
}

function testAgencyController() {
  const campaign = campaignFixture();
  assert.equal(controllerForActor(campaign, "thor").kind, controllerKinds.HOST);
  assert.equal(controllerForActor(campaign, "karl").kind, controllerKinds.REMOTE_PLAYER);
  assert.equal(controllerForActor(campaign, "barkeep").kind, controllerKinds.NPC_DM);
  assert.equal(requiresHumanInput(campaign, "thor"), true);
  assert.equal(requiresHumanInput(campaign, "karl"), true);
  assert.equal(canProviderActForActor(campaign, "sy", { actionScope: "minor" }), true);
  assert.equal(canProviderActForActor(campaign, "thor", { actionScope: "major" }), false);
}

function testTurnEngine() {
  let turn = createTurnEngineState();
  turn = beginTurn(turn, { turnId: "turn-1", mode: gameModes.EXPLORATION, actorId: "thor", now: "t0" });
  assert.equal(turn.state, turnStates.AWAITING_INPUT);
  assert.equal(canSubmitTurn(turn), true);
  turn = addPendingInput(turn, { actorId: "thor", text: "I dodge." });
  assert.equal(turn.pendingInputs.length, 1);
  turn = lockTurn(turn, { now: "t1" });
  assert.equal(canSubmitTurn(turn), false);
  turn = startRolling(turn);
  turn = startGenerating(turn, { requestId: "request-1" });
  assert.equal(turn.state, turnStates.GENERATING);
  assert.equal(completeTurn(turn, { turnId: "old-turn" }).staleCompletionIgnored, true);
  turn = failTurn(turn, "provider timeout", { turnId: "turn-1" });
  assert.equal(turn.state, turnStates.ERROR);
  turn = retryTurn(turn);
  assert.equal(turn.state, turnStates.LOCKED);
  assert.equal(turn.attempt, 1);
}

function testStateEffects() {
  const campaign = campaignFixture();
  const result = applyStateEffects(campaign, [
    { type: "hp_delta", targetId: "thor", amount: -4, reason: "punch" },
    { type: "condition_add", targetId: "thor", condition: "dodging", reason: "Dodge" },
    { type: "quest_note", questId: "quest-1", note: "Ask about the miner.", reviewRequired: true },
  ]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.campaign.party[0].stats.hp.current, 8);
  assert.deepEqual(result.campaign.party[0].conditions, ["dodging"]);
  assert.equal(result.proposedChanges.length, 1);
}

function testCombatEngine() {
  const campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 50, max: 50 }, armorClass: 10, attackBonus: 3, damage: "1d4+1" }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const active = getActiveCombatActor(campaign);
  assert.equal(active.id, "thor");
  assert.equal(campaign.combat.turnOrder.some((entry) => entry.id === "miner"), true, "enemy must be listed in initiative");

  const actions = legalActionsForActor(campaign, "thor");
  assert.equal(actions.some((action) => action.type === "attack"), true);

  const resolved = resolveCombatAction(campaign, {
    turnId: "combat-turn-1",
    actorId: "thor",
    actionType: "attack",
    targetIds: ["miner"],
    declaredText: "Attack with Greataxe",
  }, { seed: "hit-seed" });

  assert.equal(resolved.actionRecord.actorId, "thor");
  assert.equal(resolved.actionRecord.rolls[0].label, "Attack roll");
  assert.equal(resolved.campaign.combat.currentTurnId, "sy", "combat should advance after app-side resolution");
  assert.equal(resolved.actionRecord.effects.every((effect) => effect.source === "combat_engine"), true);
  assert.equal(resolved.campaign.combatActionLog.length, 1, "combat action should be logged to campaign state");
  assert.equal(resolved.campaign.diceLog.length >= 1, true, "combat rolls should be logged to campaign state");
  assert.equal(resolved.campaign.stateEffectLog.length, resolved.actionRecord.effects.length, "applied effects should be logged to campaign state");

  const dodgeCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const dodged = resolveCombatAction(dodgeCampaign, {
    turnId: "combat-dodge-turn",
    actorId: "thor",
    actionType: "dodge",
    declaredText: "Dodge and keep the miner focused on me.",
  }, { seed: "dodge-seed" });
  assert.equal(dodged.actionRecord.rolls.length, 0);
  assert.ok(dodged.campaign.party.find((member) => member.id === "thor").conditions.includes("dodging"));
  assert.equal(dodged.campaign.combat.currentTurnId, "sy");

  const surrenderCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const surrendered = resolveCombatAction(surrenderCampaign, {
    turnId: "combat-surrender-turn",
    actorId: "thor",
    actionType: "improvise",
    declaredText: "Thor lowers the axe and talks the miner into surrendering.",
    endsCombat: true,
    combatOutcome: "enemy_surrendered",
    summary: "Thor de-escalated the brawl and the miner surrendered.",
  }, { seed: "surrender-seed", now: "2026-01-01T00:00:00.000Z" });
  assert.equal(surrendered.campaign.combat.inCombat, false);
  assert.equal(surrendered.campaign.combat.currentTurnId, null);
  assert.deepEqual(surrendered.campaign.combat.turnOrder, []);
  assert.equal(surrendered.campaign.combat.lastOutcome, "enemy_surrendered");
  assert.equal(surrendered.campaign.combat.lastAction, "Thor de-escalated the brawl and the miner surrendered.");
  assert.equal(surrendered.campaign.engineState.mode, gameModes.RP);
}

function testCombatEndsWhenSideDrops() {
  const campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 1, max: 10 }, armorClass: 1, attackBonus: 3, damage: "1d4+1" }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const resolved = resolveCombatAction(campaign, {
    turnId: "combat-ending-turn",
    actorId: "thor",
    actionType: "attack",
    targetIds: ["miner"],
    declaredText: "Attack with Greataxe",
    attackBonus: 50,
    damageFormula: "1d4",
  }, { seed: "combat-ending-hit" });

  assert.equal(resolved.campaign.combat.inCombat, false, "combat should end when all enemies drop");
  assert.equal(resolved.campaign.combat.currentTurnId, null, "ended combat should not point at a stale active actor");
  assert.equal(resolved.campaign.combat.lastOutcome, "enemies_defeated");
  assert.equal(resolved.campaign.engineState.mode, "rp");
}

function testCombatTrackerView() {
  const campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: 10, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const view = buildCombatTrackerView(campaign, { controlledActorId: "karl" });
  assert.equal(view.inCombat, true);
  assert.equal(view.rows.some((row) => row.name === "Drunk miner" && row.meta === "DM"), true);
  assert.equal(view.rows.find((row) => row.id === "miner").hpLabel, "10/10");
  assert.equal(view.rows.find((row) => row.id === "thor").hpLabel, "12/12");
  assert.equal(view.rows.find((row) => row.id === "karl").controlled, true);
}

function testSceneAndConsequenceEngines() {
  let campaign = transitionScene(campaignFixture(), {
    id: "scene-brawl",
    title: "Tavern brawl standoff",
    type: "social",
    locationId: "tavern",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["barkeep"],
    activeQuestIds: ["quest-1"],
    tensions: ["A miner wants a fight, but the room is watching Thor's restraint."],
    unresolvedQuestions: ["Will the barkeep back Thor if things turn violent?"],
    immediateSituation: "The tavern waits to see whether Thor escalates or de-escalates.",
    whyHere: "Thor's shove changed the tavern's social pressure.",
  }, { now: "2026-01-01T00:00:00.000Z" });
  campaign = addConsequence(campaign, {
    id: "consequence-barkeep-memory",
    title: "Barkeep remembers Thor's restraint",
    description: "The barkeep may support Thor later if he avoids needless damage.",
    sourceSceneId: "scene-brawl",
    participantIds: ["thor", "barkeep"],
    threadIds: ["quest-1"],
    importance: "high",
  }, { now: "2026-01-01T00:00:01.000Z" });
  campaign = addConsequence(campaign, {
    id: "consequence-other-room",
    title: "Kitchen staff panic",
    description: "This should not dominate the brawl unless the scene moves to the kitchen.",
    sourceSceneId: "scene-kitchen",
    participantIds: ["cook"],
    importance: "critical",
  }, { now: "2026-01-01T00:00:01.500Z" });

  const retrieval = buildSceneRetrieval(campaign);
  assert.equal(retrieval.scene.title, "Tavern brawl standoff");
  assert.equal(retrieval.activeConsequences[0].id, "consequence-barkeep-memory");
  assert.equal(campaign.scene.activeConsequenceIds.includes("consequence-other-room"), false, "unrelated consequences should not mark the current scene projection");
  assert.equal(retrieval.activeConsequences.some((item) => item.id === "consequence-other-room"), false, "scene retrieval should not pull unrelated consequences by importance alone");
  assert.equal(retrieval.relevantRelationships[0].id, "rel-thor-barkeep");
  assert.equal(retrieval.activeThreads[0].id, "quest-1");
  const intentPack = buildSceneIntentPack(campaign, { sceneRetrieval: retrieval });
  assert.equal(intentPack.escalationPolicy.level, "soft");
  assert.match(intentPack.escalationPolicy.guidance, /social pressure|grounded next beat/i);
  assert.ok(intentPack.providerScope.appOwns.includes("consequences"));
  assert.ok(intentPack.escalationPolicy.avoid.some((entry) => /sudden|combat|generic/i.test(entry)));

  const resolved = resolveConsequence(campaign, "consequence-barkeep-memory", {
    now: "2026-01-01T00:00:02.000Z",
    resolution: "Thor paid for the broken stool.",
  });
  assert.equal(resolved.consequences.find((item) => item.id === "consequence-barkeep-memory").state, "resolved");
  assert.equal(buildSceneRetrieval(resolved).activeConsequences.length, 0);
}

function testSceneRetrievalFindsParticipantConsequencesWithoutProjectionIds() {
  const sceneCampaign = transitionScene(campaignFixture(), {
    id: "scene-participants",
    title: "A tense talk",
    partyMemberIds: ["thor"],
    peopleIds: ["barkeep"],
  });
  const campaign = {
    ...sceneCampaign,
    scene: {
      ...sceneCampaign.scene,
      activeConsequenceIds: [],
    },
    consequences: [{
      id: "consequence-participant-only",
      title: "The barkeep is watching Thor",
      description: "A consequence tied only by participant should still be retrieved.",
      scope: "person",
      state: "active",
      importance: "medium",
      sourceSceneId: null,
      relatedSceneIds: [],
      participantIds: ["thor", "barkeep"],
      relationshipIds: [],
      threadIds: [],
      tags: [],
    }],
  };
  const retrieval = buildSceneRetrieval(campaign);
  assert.equal(retrieval.activeConsequences[0].id, "consequence-participant-only");
}

function testSceneIntentDiscouragesRandomEscalationAfterSmallFight() {
  const base = campaignFixture();
  base.people.push({ id: "merchant-zean", name: "Zean", role: "protected merchant", notes: ["Garren protected him on the mining road."] });
  let campaign = transitionScene(base, {
    id: "scene-road-aftermath",
    title: "Mining road aftermath",
    type: "social",
    locationId: "road",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["merchant-zean"],
    tensions: ["The miners have backed down, but witnesses will remember how Garren handled it."],
    immediateSituation: "The hostile miner is defeated and Zean is unharmed.",
    whyHere: "A small fight just ended and the social consequences matter more than spawning another fight.",
  });
  campaign = addConsequence(campaign, {
    id: "consequence-zean-grateful",
    title: "Zean owes Garren a favor",
    description: "Zean is grateful and may vouch for Garren in town.",
    sourceSceneId: "scene-road-aftermath",
    participantIds: ["thor", "merchant-zean"],
    importance: "high",
    scope: "person",
  });

  const request = buildProviderTaskRequest({
    task: "generate_scene_beat",
    campaign,
    turn: { turnId: "turn-road-aftermath", mode: gameModes.RP, actorId: "thor" },
  });

  assert.equal(request.readonlyContext.escalationPolicy.level, "soft");
  assert.match(request.readonlyContext.escalationPolicy.guidance, /social pressure|grounded next beat/i);
  assert.ok(request.readonlyContext.escalationPolicy.avoid.some((entry) => /sudden|random|generic/i.test(entry)));
  assert.equal(request.readonlyContext.sceneIntent.consequences[0].id, "consequence-zean-grateful");
}

function testProviderBoundary() {
  const campaign = campaignFixture();
  campaign.sessionLog.messages = [{ role: "dm", title: "DM", text: "Legacy text-only message." }];
  campaign.relationships[0].notes = ["The barkeep remembers restraint.", "He dislikes broken furniture."];
  const sceneCampaign = addConsequence(transitionScene(campaign, {
    id: "scene-provider",
    title: "Barkeep's tense room",
    type: "social",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["barkeep"],
    activeQuestIds: ["quest-1"],
    tensions: ["Everyone is waiting to see whether Thor apologizes."],
  }), {
    id: "consequence-provider",
    title: "Barkeep is deciding whether to trust Thor",
    participantIds: ["thor", "barkeep"],
    threadIds: ["quest-1"],
    description: "Thor's next words may determine future help.",
  });
  const turn = beginTurn(createTurnEngineState(), { turnId: "turn-provider", mode: gameModes.RP, actorId: "thor" });
  const request = buildProviderTaskRequest({ task: "narrate_resolved_action", campaign: sceneCampaign, turn });
  assert.equal(request.turnId, "turn-provider");
  assert.equal(request.mutationPolicy.includes("app-owned"), true);
  assert.equal(request.dmQuality.role, "creative_tabletop_dm_assistant");
  assert.ok(request.dmQuality.avoid.includes("random encounter table behavior"));
  assert.equal(request.readonlyContext.recentMessages.length, 1);
  assert.equal(request.readonlyContext.recentMessages[0].text, "Legacy text-only message.");
  assert.equal(request.readonlyContext.scene.title, "Barkeep's tense room");
  assert.equal(request.readonlyContext.sceneIntent.scene.title, "Barkeep's tense room");
  assert.equal(request.readonlyContext.escalationPolicy.level, "soft");
  assert.equal(request.readonlyContext.activeConsequences[0].id, "consequence-provider");
  assert.equal(request.readonlyContext.relevantRelationships[0].id, "rel-thor-barkeep");
  assert.match(request.readonlyContext.relevantRelationships[0].notes, /broken furniture/);
  assert.equal(request.readonlyContext.activeThreads[0].id, "quest-1");
  assert.equal(request.readonlyContext.party, undefined, "provider request should not include whole campaign dumps");

  const contextPack = buildContextPack(sceneCampaign);
  assert.ok(contextPack.sections.some((section) => section.kind === "active_consequences"), "context pack should include active consequences");
  assert.match(JSON.stringify(contextPack.sections), /broken furniture/, "context pack should tolerate array relationship notes");

  assert.equal(acceptProviderResponseForTurn(turn, { turnId: "wrong", narration: "late" }).accepted, false);
  const accepted = acceptProviderResponseForTurn(turn, {
    turnId: "turn-provider",
    narration: "ok",
    proposedChanges: [{ operation: "add", domain: "lore", summary: "review me" }],
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.proposedChanges.length, 1, "provider changes should remain proposed/reviewed data");

  const combatCampaign = {
    ...campaign,
    combat: {
      inCombat: true,
      currentTurnId: "thor",
      round: 1,
      turnOrder: [{ id: "thor", name: "Thor", type: "party" }],
      enemies: [],
    },
  };
  const combatRequest = buildProviderTaskRequest({ task: "generate_scene_beat", campaign: combatCampaign, turn: { turnId: "nudge-combat", mode: "combat" } });
  assert.equal(combatRequest.mode, "combat");
  assert.equal(combatRequest.readonlyContext.combat.currentTurnId, "thor", "combat context must preserve active human actor");
}

function testStructuredInputsDoNotMergeIntoHostMessage() {
  const turn = createPlayerTurn({
    campaign: campaignFixture(),
    playerMessage: "Rowan tells the shopkeeper to stay quiet.",
    playerInputs: [{
      playerId: "guest-eve",
      playerName: "Jess",
      characterId: "eve",
      characterName: "Eve",
      text: "Eve keeps the collector distracted near the doorway.",
      ready: true,
    }],
  });

  assert.equal(turn.parsedMessage.inWorldText, "Rowan tells the shopkeeper to stay quiet.");
  assert.equal(turn.playerInputs[0].characterName, "Eve");
  assert.match(turn.providerPrompt, /Structured Player Inputs/);
  assert.match(turn.providerPrompt, /Eve keeps the collector distracted/);
  assert.doesNotMatch(turn.parsedMessage.inWorldText, /Eve keeps/);

  const remoteOnlyTurn = createPlayerTurn({
    campaign: campaignFixture(),
    playerMessage: "",
    playerInputs: [{
      playerId: "guest-eve",
      playerName: "Jess",
      characterId: "eve",
      characterName: "Eve",
      text: "Eve ducks behind the stall and watches the collector.",
      ready: true,
    }],
  });
  assert.equal(remoteOnlyTurn.parsedMessage.inWorldText, "");
  assert.match(remoteOnlyTurn.providerPrompt, /Resolve the structured player inputs/);
  assert.match(remoteOnlyTurn.providerPrompt, /Eve ducks behind the stall/);
}

async function testProviderExecutionLifecycle() {
  const events = [];
  const orchestrator = createProviderOrchestrator({
    endpoint: "/generate",
    fetchFn: async () => ({
      ok: true,
      body: ndjsonStream([
        { type: "start", model: "test-model" },
        { type: "token", text: "hello" },
        { type: "done", result: { model: "test-model", text: "{\"table\":[]}", structured: { table: [] } } },
      ]),
    }),
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const turnFlow = createTurnFlowRuntime();
  assert.equal(turnFlow.getProjection().canSubmit, true, "idle UI projection should allow a new turn");
  const turn = { playerMessage: "I look around.", playerInputs: [] };
  turnFlow.beginLogicalTurn({ campaign: campaignFixture(), turn });
  const run = orchestrator.startLocalGeneration({
    turn,
    onEvent: (event) => {
      events.push(event);
      turnFlow.applyProviderEvent(event);
    },
  });
  turnFlow.startGeneration(run);
  assert.throws(() => turnFlow.startGeneration(run), /already active/i, "double generation should be rejected");
  assert.equal(turnFlow.getProjection().canSubmit, false, "send projection must disable during generation");
  const result = await run.promise;
  assert.equal(result.providerReceived, true);
  assert.equal(turnFlow.getProjection().state, turnStates.COMPLETE);
  assert.equal(events.some((event) => event.type === "generation_delta"), true);

  let structuredOnlyRequest = null;
  const structuredOrchestrator = createProviderOrchestrator({
    endpoint: "/generate",
    fetchFn: async (_url, init) => {
      structuredOnlyRequest = JSON.parse(init.body);
      return {
        ok: true,
        body: ndjsonStream([{ type: "done", result: { text: "{\"table\":[]}", structured: { table: [] } } }]),
      };
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const structuredRun = structuredOrchestrator.startLocalGeneration({
    turn: {
      playerMessage: "",
      playerInputs: [{ characterName: "Eve", text: "Eve ducks behind the stall." }],
    },
  });
  const structuredResult = await structuredRun.promise;
  assert.equal(structuredResult.providerReceived, true, "structured-only turns should reach the provider");
  assert.equal(structuredOnlyRequest.playerMessage, "");
  assert.equal(structuredOnlyRequest.playerInputs[0].text, "Eve ducks behind the stall.");
}

async function testInvalidProviderOutputIsRecoverable() {
  const orchestrator = createProviderOrchestrator({
    endpoint: "/generate",
    fetchFn: async () => ({
      ok: true,
      body: ndjsonStream([
        { type: "start", model: "test-model" },
        { type: "done", result: { model: "test-model", text: "not-json", parseError: "bad json" } },
      ]),
    }),
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const turnFlow = createTurnFlowRuntime();
  const turn = { playerMessage: "I search.", playerInputs: [] };
  turnFlow.beginLogicalTurn({ campaign: campaignFixture(), turn });
  const run = orchestrator.startLocalGeneration({
    turn,
    validateProviderResult: (result) => result.parseError || "",
    onEvent: (event) => turnFlow.applyProviderEvent(event),
  });
  turnFlow.startGeneration(run);
  const result = await run.promise;
  assert.equal(result.validationIssue, "bad json");
  assert.equal(turnFlow.getProjection().state, turnStates.ERROR);
  assert.equal(turnFlow.getProjection().canRetry, true);
}

async function testCancelAndStaleCompletion() {
  const orchestrator = createProviderOrchestrator({
    endpoint: "/generate",
    fetchFn: async (_url, init) => {
      init.signal.addEventListener("abort", () => {});
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    },
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
  });
  const turnFlow = createTurnFlowRuntime();
  const turn = { playerMessage: "I wait.", playerInputs: [] };
  turnFlow.beginLogicalTurn({ campaign: campaignFixture(), turn });
  const run = orchestrator.startLocalGeneration({ turn, onEvent: (event) => turnFlow.applyProviderEvent(event) });
  turnFlow.startGeneration(run);
  assert.throws(() => turnFlow.retryLastTurn(), /active/i, "retry during active generation should be rejected");
  turnFlow.cancelGeneration("test_cancel");
  assert.equal(turnFlow.getProjection().state, turnStates.AWAITING_INPUT, "cancel should recover UI before provider abort resolves");
  assert.equal(turnFlow.getProjection().hasActiveGeneration, false);
  assert.equal(turnFlow.getProjection().canSubmit, true);
  await run.promise;
  assert.equal(turnFlow.getProjection().state, turnStates.AWAITING_INPUT);
  const before = turnFlow.getProjection().state;
  turnFlow.applyProviderEvent({ type: "generation_completed", turnId: "stale", requestId: "stale", response: {} });
  assert.equal(turnFlow.getProjection().state, before, "stale completion must not change state");
  turnFlow.applyProviderEvent({ type: "generation_completed", turnId: turn.turnId, requestId: run.requestId, response: {} });
  assert.equal(turnFlow.getProjection().state, before, "late completion from a cancelled request must not change state");
}

function testCancelWithoutProviderAbortEventRecoversImmediately() {
  const turnFlow = createTurnFlowRuntime();
  const turn = { playerMessage: "I wait.", playerInputs: [] };
  turnFlow.beginLogicalTurn({ campaign: campaignFixture(), turn });
  let cancelled = false;
  turnFlow.startGeneration({
    turnId: turn.turnId,
    requestId: "request-no-abort-event",
    cancel: () => {
      cancelled = true;
    },
  });
  const projection = turnFlow.cancelGeneration("manual_cancel");
  assert.equal(cancelled, true);
  assert.equal(projection.state, turnStates.AWAITING_INPUT);
  assert.equal(projection.hasActiveGeneration, false);
  assert.equal(projection.canSubmit, true);
  turnFlow.applyProviderEvent({
    type: "generation_completed",
    turnId: turn.turnId,
    requestId: "request-no-abort-event",
    response: { responseText: "late" },
  });
  assert.equal(turnFlow.getProjection().state, turnStates.AWAITING_INPUT);
}

function testTurnFlowResetCancelsAndIgnoresStaleEvents() {
  const turnFlow = createTurnFlowRuntime();
  const turn = { playerMessage: "I open the door.", playerInputs: [] };
  turnFlow.beginLogicalTurn({ campaign: campaignFixture(), turn });
  let cancelled = false;
  turnFlow.startGeneration({
    turnId: turn.turnId,
    requestId: "request-reset",
    cancel: () => {
      cancelled = true;
    },
  });

  const resetProjection = turnFlow.reset({ reason: "campaign_changed" });
  assert.equal(cancelled, true, "campaign switch reset should cancel active provider work");
  assert.equal(resetProjection.state, turnStates.IDLE);
  assert.equal(resetProjection.hasActiveGeneration, false);
  assert.equal(resetProjection.canSubmit, true);

  turnFlow.applyProviderEvent({
    type: "generation_completed",
    turnId: turn.turnId,
    requestId: "request-reset",
    response: { responseText: "late stale result" },
  });
  const afterStale = turnFlow.getProjection();
  assert.equal(afterStale.state, turnStates.IDLE, "late provider completion after reset must not revive old state");
  assert.equal(afterStale.hasActiveGeneration, false);
}

function ndjsonStream(events) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      }
      controller.close();
    },
  });
}

function testCampaignStateStore() {
  const store = createCampaignStateStore(campaignFixture());
  const events = [];
  store.subscribe((event) => events.push(event.type));
  store.update((draft) => {
    draft.summary = "updated";
    return draft;
  }, { source: "test" });
  assert.equal(store.getState().summary, "updated");
  store.applyEffects([{ type: "hp_delta", targetId: "thor", amount: -1, reason: "test" }]);
  assert.deepEqual(events, ["update", "effects"]);
}

function testInputComposerProjection() {
  const campaign = campaignFixture();
  assert.equal(buildInputComposerProjection({
    clientMode: true,
    campaign,
    guestSession: null,
  }).sendDisabled, true);

  campaign.combat = {
    ...campaign.combat,
    inCombat: true,
    currentTurnId: "thor",
  };
  const hostProjection = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    findPartyMember: (id) => campaign.party.find((member) => member.id === id),
    isHostControlledPartyRecord: (member) => member.controllerKind === controllerKinds.HOST,
    labelById: (id) => campaign.party.find((member) => member.id === id)?.name ?? id,
  });
  assert.equal(hostProjection.inputDisabled, false);
  assert.match(hostProjection.placeholder, /Act as Thor/);

  campaign.combat.currentTurnId = "karl";
  const remoteBlocked = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    collectStagedRemoteInputs: () => [],
    findPartyMember: (id) => campaign.party.find((member) => member.id === id),
    isHostControlledPartyRecord: (member) => member.controllerKind === controllerKinds.HOST,
    labelById: (id) => campaign.party.find((member) => member.id === id)?.name ?? id,
  });
  assert.equal(remoteBlocked.inputDisabled, true);
  assert.equal(remoteBlocked.sendDisabled, true);

  const remoteStaged = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    collectStagedRemoteInputs: () => [{ characterId: "karl", text: "Karl fires." }],
    findPartyMember: (id) => campaign.party.find((member) => member.id === id),
    isHostControlledPartyRecord: (member) => member.controllerKind === controllerKinds.HOST,
    labelById: (id) => campaign.party.find((member) => member.id === id)?.name ?? id,
  });
  assert.equal(remoteStaged.inputDisabled, true);
  assert.equal(remoteStaged.sendDisabled, false);
  assert.match(remoteStaged.placeholder, /remote action is staged/i);
}

function testTableStatusVocabulary() {
  assert.equal(tableStatusForActivity("Generating locally with Ollama...", "working").text, "DM is thinking...");
  assert.equal(tableStatusForActivity("Needs repair - sceneStatus.awaitingPlayer must be boolean. Inspect or retry.", "error").text, "DM response needs review.");
  assert.equal(tableStatusForActivity("Resolving Drunk miner's enemy turn", "working").text, "DM resolving Drunk miner's enemy turn...");
  assert.equal(tableStatusForActivity("Waiting for Tilli's combat turn.", "idle").text, "Waiting for Tilli's combat choice.");
  assert.equal(tableStatusForActivity("Waiting for guest action", "waiting").text, "Waiting for the other player.");
  assert.equal(tableStatusForActivity("Action sent to host", "idle").text, "Action sent to host table.");
  assert.equal(tableStatusForActivity("Local generation timed out; Send Turn can retry", "error").text, "DM response timed out; retry is available.");

  const event = tableTimelineEvent("turn_locked", {
    message: "Turn submitted; DM is resolving it.",
    turnId: "turn-1",
    at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(event.label, "Turn submitted; DM is resolving it.");
  assert.equal(event.at, "2026-01-01T00:00:00.000Z");
}

function testMultiplayerSessionProjection() {
  const campaign = campaignFixture();
  campaign.multiplayer = {
    localTable: { running: true, lanAddress: "192.168.1.24", port: 7347 },
    settings: { requireGuestActionApproval: false, holdGuestActionsForGroupInput: false },
    connections: [{ id: "conn-1", displayName: "Jess", status: "pending", partyMemberId: "karl" }],
    pendingTurnInputs: [{ characterName: "Karl", text: "Karl scouts.", ready: true, passed: false }],
  };
  const hostProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(hostProjection.mode, "host");
  assert.equal(hostProjection.canResolvePartyInputs, true);
  assert.equal(hostProjection.requireGuestActionApproval, false);
  assert.equal(hostProjection.holdGuestActionsForGroupInput, false);
  assert.equal(hostProjection.connectedGuests.length, 1);
  assert.match(hostProjection.localTableAddress, /192\.168\.1\.24:7347/);

  const stoppedProjection = buildMultiplayerSessionProjection({
    campaign: {
      ...campaign,
      multiplayer: {
        ...campaign.multiplayer,
        localTable: { running: false, stoppedAt: "now" },
        pendingTurnInputs: [],
      },
    },
    locationPort: "4173",
  });
  assert.equal(stoppedProjection.localTableState, "Off");
  assert.equal(stoppedProjection.canStopLocalTable, false);
  assert.equal(stoppedProjection.canResolvePartyInputs, false);

  campaign.multiplayer.settings.requireGuestActionApproval = true;
  const approvalProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(approvalProjection.requireGuestActionApproval, true);

  campaign.multiplayer.settings.requireGuestActionApproval = false;
  campaign.multiplayer.settings.holdGuestActionsForGroupInput = true;
  const holdProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(holdProjection.holdGuestActionsForGroupInput, true);

  const guestProjection = buildMultiplayerSessionProjection({
    campaign,
    clientMode: true,
    guestSession: { hostBaseUrl: "http://192.168.1.24:7347", status: "connected" },
    guestSnapshot: { pendingInput: { characterName: "Karl", text: "ready" } },
  });
  assert.equal(guestProjection.mode, "guest");
  assert.equal(guestProjection.canStartLocalTable, false);
  assert.equal(guestProjection.canSyncGuestTable, true);
  assert.equal(guestProjection.pendingInputs.length, 1);
}

function testReviewPanelProjection() {
  const pending = buildReviewPanelProjection({
    reviewBatch: {
      proposedChanges: [{
        status: "pending",
        operation: "update",
        domain: "scene",
        summary: "Move scene forward.",
        validation: { valid: true, errors: [] },
      }],
    },
  });
  assert.equal(pending.count, 1);
  assert.match(pending.entries[0].title, /pending/);

  const committed = buildReviewPanelProjection({
    campaign: {
      reviewLog: [{
        status: "committed",
        decidedAt: "2026-01-01T00:00:00.000Z",
        applied: [{ operation: "add", domain: "people", summary: "Added Karl." }],
      }],
    },
  });
  assert.equal(committed.count, 1);
  assert.equal(committed.entries[0].body, "Added Karl.");
}

async function testAppJsNoLongerOwnsExtractedStateMachines() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  assert.equal(/function hostCombatInputGate/.test(appJs), false);
  assert.equal(/function renderConnectedGuests/.test(appJs), false);
  assert.equal(/function latestCommittedReviewBatch/.test(appJs), false);
  assert.match(
    appJs,
    /!turn\?\.playerMessage\?\.trim\(\)\s*&&\s*!turn\?\.playerInputs\?\.length/,
    "local provider runner must accept remote-only structured player inputs",
  );
  assert.match(appJs, /tableTimeline: state\.tableTimeline\.slice\(-80\)/, "renderer diagnostics should include the table-facing timeline");
  assert.match(appJs, /messageLifecycleForMessage/, "play bubbles should surface turn lifecycle state");
  assert.match(appJs, /turn_waiting_for_dm/, "submitted turns should be visibly marked while waiting for the DM");
  assert.match(appJs, /updatePlayerTurnEchoLifecycle/, "submitted turn bubbles should update after provider completion or failure");
  assert.match(appJs, /renderTableTimelineSummary/, "diagnostics should render a readable table timeline");
  assert.match(appJs, /if\s*\(!enemies\.length\)\s*{\s*return null;\s*}/, "implicit combat starts must require at least one enemy");
  assert.match(appJs, /stripInlineResponseJsonTail/, "table narration cleanup should remove inline provider JSON tails");
  assert.equal(/label:\s*"Play"/.test(appJs), false, "AI companion cards should use Nudge instead of a Play button");
  assert.match(
    appJs,
    /label:\s*"Invite Player"[\s\S]*?label:\s*"Nudge"[\s\S]*?className:\s*"nudge-action"/,
    "AI companion card actions should place Nudge after Invite Player and use nudge styling",
  );
}

async function testNewCampaignPreTableJoinerWiring() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  const appShell = await readFile(path.join("app", "App.jsx"), "utf8");
  assert.match(appShell, /Additional Characters/);
  assert.match(appShell, /add-wizard-party-member/);
  assert.match(appShell, /new-joiner-integration/);
  assert.match(appShell, /new-joiner-host-context/);
  assert.match(appShell, /table-timeline-summary/);
  assert.ok(
    appShell.indexOf('id="provider-activity"') < appShell.indexOf('id="play-log"'),
    "table status strip should live above the play log",
  );
  assert.match(appShell, /id="show-debug-meta"/);
  assert.match(appJs, /collectWizardAdditionalCharacters/);
  assert.match(appJs, /normalizeWizardJoiner/);
  assert.match(appJs, /seedWizardStartingPartyMember/);
  assert.match(appJs, /Additional AI companion party members/);
  assert.match(appJs, /renderDebugMetaControl/);
}

testDiceEngine();
await testClipboardFallback();
testDevJumpStartSeed();
testAgencyController();
testTurnEngine();
testStateEffects();
testCombatEngine();
testCombatEndsWhenSideDrops();
testCombatTrackerView();
testSceneAndConsequenceEngines();
testSceneRetrievalFindsParticipantConsequencesWithoutProjectionIds();
testSceneIntentDiscouragesRandomEscalationAfterSmallFight();
testProviderBoundary();
testStructuredInputsDoNotMergeIntoHostMessage();
testCampaignStateStore();
testInputComposerProjection();
testTableStatusVocabulary();
testMultiplayerSessionProjection();
testReviewPanelProjection();

await testProviderExecutionLifecycle();
await testInvalidProviderOutputIsRecoverable();
await testCancelAndStaleCompletion();
testCancelWithoutProviderAbortEventRecoversImmediately();
testTurnFlowResetCancelsAndIgnoresStaleEvents();
await testAppJsNoLongerOwnsExtractedStateMachines();
await testNewCampaignPreTableJoinerWiring();

console.log("engine architecture tests passed");
