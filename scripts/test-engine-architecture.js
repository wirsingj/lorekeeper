import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildCombatTrackerView } from "../app/combat-tracker-view.js";
import { buildInputComposerProjection } from "../app/input-composer-controller.js";
import { buildMultiplayerSessionProjection } from "../app/multiplayer-session-panel.js";
import { buildReviewPanelProjection } from "../app/proposed-changes-panel.js";
import { createTurnFlowRuntime } from "../app/turn-flow-runtime.js";
import { controllerForActor, canProviderActForActor, requiresHumanInput } from "../src/engine/agency-controller.js";
import { getActiveCombatActor, legalActionsForActor, resolveCombatAction, startCombat } from "../src/engine/combat-engine.js";
import { createCampaignStateStore } from "../src/engine/campaign-state-store.js";
import { addConsequence, resolveConsequence } from "../src/engine/consequence-engine.js";
import { rollD20, rollFormula } from "../src/engine/dice-engine.js";
import { buildProviderTaskRequest, acceptProviderResponseForTurn, createProviderOrchestrator } from "../src/engine/provider-orchestrator.js";
import { buildSceneRetrieval, transitionScene } from "../src/engine/scene-engine.js";
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
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 10, max: 10 }, armorClass: 10, attackBonus: 3, damage: "1d4+1" }],
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

  const retrieval = buildSceneRetrieval(campaign);
  assert.equal(retrieval.scene.title, "Tavern brawl standoff");
  assert.equal(retrieval.activeConsequences[0].id, "consequence-barkeep-memory");
  assert.equal(retrieval.relevantRelationships[0].id, "rel-thor-barkeep");
  assert.equal(retrieval.activeThreads[0].id, "quest-1");

  const resolved = resolveConsequence(campaign, "consequence-barkeep-memory", {
    now: "2026-01-01T00:00:02.000Z",
    resolution: "Thor paid for the broken stool.",
  });
  assert.equal(resolved.consequences.find((item) => item.id === "consequence-barkeep-memory").state, "resolved");
  assert.equal(buildSceneRetrieval(resolved).activeConsequences.length, 0);
}

function testProviderBoundary() {
  const campaign = campaignFixture();
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
  assert.equal(request.readonlyContext.scene.title, "Barkeep's tense room");
  assert.equal(request.readonlyContext.activeConsequences[0].id, "consequence-provider");
  assert.equal(request.readonlyContext.relevantRelationships[0].id, "rel-thor-barkeep");
  assert.equal(request.readonlyContext.activeThreads[0].id, "quest-1");
  assert.equal(request.readonlyContext.party, undefined, "provider request should not include whole campaign dumps");

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
  await run.promise;
  assert.equal(turnFlow.getProjection().state, turnStates.AWAITING_INPUT);
  const before = turnFlow.getProjection().state;
  turnFlow.applyProviderEvent({ type: "generation_completed", turnId: "stale", requestId: "stale", response: {} });
  assert.equal(turnFlow.getProjection().state, before, "stale completion must not change state");
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

function testMultiplayerSessionProjection() {
  const campaign = campaignFixture();
  campaign.multiplayer = {
    localTable: { running: true, lanAddress: "192.168.1.24", port: 7347 },
    connections: [{ id: "conn-1", displayName: "Jess", status: "pending", partyMemberId: "karl" }],
    pendingTurnInputs: [{ characterName: "Karl", text: "Karl scouts.", ready: true, passed: false }],
  };
  const hostProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(hostProjection.mode, "host");
  assert.equal(hostProjection.canResolvePartyInputs, true);
  assert.equal(hostProjection.connectedGuests.length, 1);
  assert.match(hostProjection.localTableAddress, /192\.168\.1\.24:7347/);

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
}

testDiceEngine();
testAgencyController();
testTurnEngine();
testStateEffects();
testCombatEngine();
testCombatTrackerView();
testSceneAndConsequenceEngines();
testProviderBoundary();
testCampaignStateStore();
testInputComposerProjection();
testMultiplayerSessionProjection();
testReviewPanelProjection();

await testProviderExecutionLifecycle();
await testInvalidProviderOutputIsRecoverable();
await testCancelAndStaleCompletion();
await testAppJsNoLongerOwnsExtractedStateMachines();

console.log("engine architecture tests passed");
