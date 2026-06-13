import assert from "node:assert/strict";

import { controllerForActor, canProviderActForActor, requiresHumanInput } from "../src/engine/agency-controller.js";
import { getActiveCombatActor, legalActionsForActor, resolveCombatAction, startCombat } from "../src/engine/combat-engine.js";
import { createCampaignStateStore } from "../src/engine/campaign-state-store.js";
import { rollD20, rollFormula } from "../src/engine/dice-engine.js";
import { buildProviderTaskRequest, acceptProviderResponseForTurn } from "../src/engine/provider-orchestrator.js";
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
    quests: [{ id: "quest-1", notes: [] }],
    scene: {
      status: "active",
      currentPlaceId: "tavern",
      immediateSituation: "A tavern brawl is starting.",
      presentPartyMemberIds: ["thor", "sy", "karl"],
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
}

function testProviderBoundary() {
  const campaign = campaignFixture();
  const turn = beginTurn(createTurnEngineState(), { turnId: "turn-provider", mode: gameModes.RP, actorId: "thor" });
  const request = buildProviderTaskRequest({ task: "narrate_resolved_action", campaign, turn });
  assert.equal(request.turnId, "turn-provider");
  assert.equal(request.mutationPolicy.includes("app-owned"), true);
  assert.equal(request.readonlyContext.recentMessages.length, 1);
  assert.equal(request.readonlyContext.party, undefined, "provider request should not include whole campaign dumps");

  assert.equal(acceptProviderResponseForTurn(turn, { turnId: "wrong", narration: "late" }).accepted, false);
  assert.equal(acceptProviderResponseForTurn(turn, { turnId: "turn-provider", narration: "ok" }).accepted, true);
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

testDiceEngine();
testAgencyController();
testTurnEngine();
testStateEffects();
testCombatEngine();
testProviderBoundary();
testCampaignStateStore();

console.log("engine architecture tests passed");
