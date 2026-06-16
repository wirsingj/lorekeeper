import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { readTextWithFallback, writeTextWithFallback } from "../app/clipboard-utils.js";
import { buildCombatTrackerView } from "../app/combat-tracker-view.js";
import { combatResolutionMessage, engineCombatResolutionChange, resolveEnemyCombatTurn } from "../app/combat-resolution-controller.js";
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
  assert.equal(canProviderActForActor(campaign, "sy", { actionScope: "major" }), false);
  assert.equal(canProviderActForActor(campaign, "sy", { actionScope: "major", allowMajorAiCompanion: true }), true);
  assert.equal(canProviderActForActor(campaign, "thor", { actionScope: "major" }), false);
  assert.equal(requiresHumanInput(campaign, "missing-actor"), true);
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

  const resourceCampaign = {
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? { ...member, resources: { spellSlots: { 1: { max: 2, used: 0 } } } }
      : member),
  };
  const resourceResult = applyStateEffects(resourceCampaign, [
    { type: "resource_delta", targetId: "thor", resource: "spellSlots.1.used", amount: 1, reason: "spell slot spent" },
  ]);
  const thorAfterResource = resourceResult.campaign.party.find((member) => member.id === "thor");
  assert.equal(thorAfterResource.resources.spellSlots[1].used, 1);
  assert.equal(thorAfterResource.stats.spellSlots[1].used, 1);

  const statsOnlyResourceCampaign = {
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? { ...member, stats: { ...member.stats, spellSlots: { 1: { max: 2, used: 0 } } } }
      : member),
  };
  const statsOnlyResourceResult = applyStateEffects(statsOnlyResourceCampaign, [
    { type: "resource_delta", targetId: "thor", resource: "spellSlots.1.used", amount: 1, reason: "spell slot spent" },
  ]);
  const thorAfterStatsOnlyResource = statsOnlyResourceResult.campaign.party.find((member) => member.id === "thor");
  assert.equal(thorAfterStatsOnlyResource.resources.spellSlots[1].max, 2);
  assert.equal(thorAfterStatsOnlyResource.resources.spellSlots[1].used, 1);
  assert.equal(thorAfterStatsOnlyResource.stats.spellSlots[1].max, 2);
  assert.equal(thorAfterStatsOnlyResource.stats.spellSlots[1].used, 1);
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

  const helpCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const helped = resolveCombatAction(helpCampaign, {
    turnId: "combat-help-turn",
    actorId: "thor",
    actionType: "help",
    declaredText: "Help Sy line up a shot.",
  }, { seed: "help-seed" });
  assert.equal(helped.actionRecord.rolls.length, 0);
  assert.ok(helped.campaign.party.find((member) => member.id === "thor").conditions.includes("helping"));
  assert.equal(helped.campaign.combat.currentTurnId, "sy");

  const disengageCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const disengaged = resolveCombatAction(disengageCampaign, {
    turnId: "combat-disengage-turn",
    actorId: "thor",
    actionType: "disengage",
    declaredText: "Disengage and back toward the doorway.",
    positionNote: "Backed toward the doorway without provoking.",
  }, { seed: "disengage-seed" });
  assert.equal(disengaged.actionRecord.rolls.length, 0);
  assert.ok(disengaged.campaign.party.find((member) => member.id === "thor").positionNotes.includes("Backed toward the doorway without provoking."));
  assert.equal(disengaged.campaign.combat.currentTurnId, "sy");

  const checkCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const checked = resolveCombatAction(checkCampaign, {
    turnId: "combat-check-turn",
    actorId: "thor",
    actionType: "check",
    declaredText: "Kick the table over to create cover.",
    ability: "STR",
    modifier: 20,
    dc: 10,
    successEffects: [{ type: "position_note", targetId: "thor", note: "Has overturned table cover." }],
  }, { seed: "combat-check-seed" });
  assert.equal(checked.actionRecord.rolls.length, 1);
  assert.equal(checked.actionRecord.rolls[0].label, "STR check");
  assert.ok(checked.campaign.party.find((member) => member.id === "thor").positionNotes.includes("Has overturned table cover."));
  assert.equal(checked.campaign.combat.currentTurnId, "sy");

  const skillCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor" ? { ...member, skills: ["Athletics"] } : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const skilled = resolveCombatAction(skillCampaign, {
    turnId: "combat-skill-check-turn",
    actorId: "thor",
    actionType: "check",
    declaredText: "Brace against the door.",
    skill: "Athletics",
    dc: 5,
  }, { seed: "combat-skill-check-seed" });
  assert.equal(skilled.actionRecord.rolls[0].formula, "1d20+5");

  const hideCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor" ? { ...member, skills: ["Stealth"] } : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const hidden = resolveCombatAction(hideCampaign, {
    turnId: "combat-hide-turn",
    actorId: "thor",
    actionType: "check",
    declaredText: "Hide behind the overturned bar.",
    skill: "Stealth",
    modifier: 20,
    dc: 10,
    successEffects: [{ type: "condition_add", targetId: "thor", condition: "hidden", reason: "Successful hide action" }],
  }, { seed: "combat-hide-seed" });
  assert.equal(hidden.actionRecord.rolls[0].label, "Stealth check");
  assert.ok(hidden.campaign.party.find((member) => member.id === "thor").conditions.includes("hidden"));
  assert.equal(hidden.campaign.combat.currentTurnId, "sy");

  const contestCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const contested = resolveCombatAction(contestCampaign, {
    turnId: "combat-contest-turn",
    actorId: "thor",
    actionType: "improvise",
    declaredText: "Shove the miner to the floor.",
    targetIds: ["miner"],
    contest: {
      actorSkill: "Athletics",
      actorModifier: 20,
      targetSkill: "Athletics",
      targetModifier: -5,
    },
    successEffects: [{ type: "condition_add", targetId: "miner", condition: "prone", reason: "Shoved prone" }],
    failureEffects: [{ type: "position_note", targetId: "thor", note: "Failed shove left Thor exposed." }],
  }, { seed: "combat-contest-seed" });
  assert.equal(contested.actionRecord.rolls.length, 2);
  assert.equal(contested.actionRecord.rolls[0].label, "Contest Athletics check");
  assert.equal(contested.actionRecord.rolls[1].label, "Opposed Athletics check");
  assert.ok(contested.campaign.combat.enemies.find((enemy) => enemy.id === "miner").conditions.includes("prone"));
  assert.equal(contested.actionRecord.effects.some((effect) => effect.condition === "prone"), true);
  assert.equal(contested.campaign.combat.currentTurnId, "sy");

  const intimidationCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10, stats: { abilityScores: { WIS: 8 } } }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const intimidated = resolveCombatAction(intimidationCampaign, {
    turnId: "combat-intimidation-contest-turn",
    actorId: "thor",
    actionType: "improvise",
    declaredText: "Thor cracks the greataxe haft against the floor and demands the miner stand down.",
    targetIds: ["miner"],
    contest: {
      actorSkill: "Intimidation",
      actorModifier: 20,
      targetAbility: "WIS",
      targetModifier: -5,
    },
    successEffects: [{ type: "condition_add", targetId: "miner", condition: "shaken", reason: "Intimidated into hesitation" }],
    failureEffects: [{ type: "position_note", targetId: "thor", note: "The miner is not cowed." }],
  }, { seed: "combat-intimidation-contest-seed" });
  assert.equal(intimidated.actionRecord.rolls[0].label, "Contest Intimidation check");
  assert.equal(intimidated.actionRecord.rolls[1].label, "Opposed WIS check");
  assert.ok(intimidated.campaign.combat.enemies.find((enemy) => enemy.id === "miner").conditions.includes("shaken"));

  const chaseCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor" ? { ...member, skills: ["Athletics"] } : member),
  }, {
    enemies: [{ id: "miner", name: "Fleeing miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const chased = resolveCombatAction(chaseCampaign, {
    turnId: "combat-chase-turn",
    actorId: "thor",
    actionType: "check",
    declaredText: "Sprint across the slick alley to keep the fleeing miner in reach.",
    skill: "Athletics",
    modifier: 20,
    dc: 12,
    successEffects: [{ type: "position_note", targetId: "thor", note: "Kept pace with the fleeing miner." }],
    failureEffects: [{ type: "position_note", targetId: "thor", note: "Lost ground in the chase." }],
  }, { seed: "combat-chase-seed" });
  assert.equal(chased.actionRecord.rolls[0].label, "Athletics check");
  assert.ok(chased.campaign.party.find((member) => member.id === "thor").positionNotes.includes("Kept pace with the fleeing miner."));

  const reactionCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const readiedReaction = resolveCombatAction(reactionCampaign, {
    turnId: "combat-ready-reaction-turn",
    actorId: "thor",
    actionType: "ready",
    declaredText: "Ready a reaction to block the doorway if the miner bolts.",
    effects: [
      { type: "resource_delta", targetId: "thor", resource: "reaction.used", amount: 1, reason: "Reaction reserved for readied block" },
      { type: "condition_add", targetId: "thor", condition: "readied_reaction", reason: "Ready action declared" },
    ],
  }, { seed: "combat-ready-reaction-seed" });
  const thorAfterReady = readiedReaction.campaign.party.find((member) => member.id === "thor");
  assert.equal(thorAfterReady.resources.reaction.used, 1);
  assert.ok(thorAfterReady.conditions.includes("readied_reaction"));

  const spellCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? {
        ...member,
        ancestryClass: "Dwarf Cleric",
        resources: { spellSlots: { 1: { max: 2, used: 0 } } },
        stats: {
          ...member.stats,
          spellSaveDc: 13,
          abilityScores: { ...member.stats.abilityScores, WIS: 16 },
        },
        spells: [{
          name: "Entangle",
          level: 1,
          roll: {
            save: {
              ability: "STR",
              dc: 30,
              conditionOnFail: "restrained",
            },
          },
        }],
      }
      : member),
  }, {
    enemies: [{
      id: "miner",
      name: "Drunk miner",
      hp: { current: 12, max: 12 },
      armorClass: 10,
      stats: { abilityScores: { STR: 8 } },
    }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const entangled = resolveCombatAction(spellCampaign, {
    turnId: "combat-spell-save-turn",
    actorId: "thor",
    actionType: "spell",
    spellName: "Entangle",
    slotLevel: 1,
    targetIds: ["miner"],
    save: { ability: "STR", dc: 30, conditionOnFail: "restrained" },
    successEffects: [{ type: "condition_add", targetId: "miner", condition: "blessed_by_mistake" }],
  }, { seed: "combat-spell-save-seed" });
  assert.equal(entangled.actionRecord.rolls[0].label, "STR save");
  assert.ok(entangled.campaign.combat.enemies.find((enemy) => enemy.id === "miner").conditions.includes("restrained"));
  assert.equal(entangled.campaign.combat.enemies.find((enemy) => enemy.id === "miner").conditions.includes("blessed_by_mistake"), false);
  const thorAfterSpell = entangled.campaign.party.find((member) => member.id === "thor");
  assert.equal(thorAfterSpell.resources.spellSlots[1].used, 1);
  assert.equal(thorAfterSpell.stats.spellSlots[1].used, 1);
  assert.equal(entangled.campaign.combat.currentTurnId, "sy");

  const concentrationSpellCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? {
        ...member,
        ancestryClass: "Dwarf Cleric",
        resources: { spellSlots: { 1: { max: 2, used: 0 } } },
        stats: { ...member.stats, spellSaveDc: 13 },
      }
      : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const concentrated = resolveCombatAction(concentrationSpellCampaign, {
    turnId: "combat-concentration-spell-turn",
    actorId: "thor",
    actionType: "spell",
    spellName: "Shielding Mist",
    slotLevel: 1,
    targetIds: ["thor"],
    effects: [
      { type: "condition_add", targetId: "thor", condition: "concentrating: Shielding Mist", reason: "Concentration spell active" },
      { type: "condition_add", targetId: "thor", condition: "shielded", reason: "Shielding Mist active" },
    ],
  }, { seed: "combat-concentration-spell-seed" });
  const thorAfterConcentration = concentrated.campaign.party.find((member) => member.id === "thor");
  assert.ok(thorAfterConcentration.conditions.includes("concentrating: Shielding Mist"));
  assert.ok(thorAfterConcentration.conditions.includes("shielded"));
  assert.equal(thorAfterConcentration.resources.spellSlots[1].used, 1);

  const healingCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? {
        ...member,
        stats: { ...member.stats, hp: { current: 4, max: 12 } },
        resources: { spellSlots: { 1: { max: 2, used: 0 } } },
      }
      : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const healed = resolveCombatAction(healingCampaign, {
    turnId: "combat-healing-spell-turn",
    actorId: "thor",
    actionType: "spell",
    spellName: "Cure Wounds",
    slotLevel: 1,
    targetIds: ["thor"],
    healingFormula: "1d4+3",
  }, { seed: "combat-healing-spell-seed" });
  assert.equal(healed.actionRecord.rolls.some((roll) => roll.label === "Cure Wounds healing"), true);
  assert.ok(healed.campaign.party.find((member) => member.id === "thor").stats.hp.current > 4);

  const halfDamageCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 30, max: 30 }, armorClass: 10, stats: { abilityScores: { DEX: 18 } } }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const halfDamaged = resolveCombatAction(halfDamageCampaign, {
    turnId: "combat-half-damage-save-turn",
    actorId: "thor",
    actionType: "spell",
    spellName: "Sacred Flame",
    targetIds: ["miner"],
    save: { ability: "DEX", dc: 1 },
    damageFormula: "2d6",
    halfDamageOnSave: true,
  }, { seed: "combat-half-damage-save-seed" });
  const damageRoll = halfDamaged.actionRecord.rolls.find((roll) => roll.label === "Sacred Flame damage");
  const damageEffect = halfDamaged.actionRecord.effects.find((effect) => effect.type === "hp_delta" && effect.targetId === "miner");
  assert.ok(damageRoll.total > 0);
  assert.ok(damageEffect.amount < 0);
  assert.ok(Math.abs(damageEffect.amount) <= Math.floor(damageRoll.total / 2));

  const enemyTurnCampaign = startCombat(campaignFixture(), {
    enemies: [{
      id: "miner",
      name: "Drunk miner",
      hp: { current: 12, max: 12 },
      armorClass: 10,
      attackBonus: 50,
      damage: "1d4",
    }],
    initiativeRolls: { miner: 20, thor: 12, sy: 7, karl: 6 },
  });
  const enemyResolved = resolveCombatAction(enemyTurnCampaign, {
    turnId: "combat-enemy-turn",
    actorId: "miner",
    actionType: "attack",
    targetIds: ["thor"],
    declaredText: "The miner swings at Thor.",
  }, { seed: "combat-enemy-turn-seed" });
  assert.equal(enemyResolved.actionRecord.actorId, "miner");
  assert.equal(enemyResolved.actionRecord.rolls[0].label, "Attack roll");
  assert.equal(enemyResolved.actionRecord.rolls[1].label, "Damage roll");
  assert.ok(enemyResolved.campaign.party.find((member) => member.id === "thor").stats.hp.current < 12);
  assert.equal(enemyResolved.campaign.combat.currentTurnId, "thor");

  const controllerResolved = resolveEnemyCombatTurn(enemyTurnCampaign, { id: "miner", name: "Drunk miner" }, "1:miner");
  const controllerChange = engineCombatResolutionChange(enemyTurnCampaign, controllerResolved);
  assert.equal(controllerChange.domain, "combat");
  assert.equal(controllerChange.data.actorUpdates[0].actorId, "thor");
  assert.equal(controllerChange.data.combatActionLog[0].actorId, "miner");
  assert.equal(controllerChange.data.diceLog.length >= 1, true);
  assert.equal(controllerChange.data.stateEffectLog.length >= 1, true);
  const controllerMessage = combatResolutionMessage(controllerResolved);
  assert.equal(controllerMessage.role, "dm");
  assert.equal(controllerMessage.data.kind, "combat_engine_resolution");

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

  const fleeCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const fled = resolveCombatAction(fleeCampaign, {
    turnId: "combat-flee-turn",
    actorId: "thor",
    actionType: "improvise",
    declaredText: "The party retreats and escapes into the alley.",
    endsCombat: true,
    summary: "The party escaped the brawl.",
  }, { seed: "flee-seed", now: "2026-01-01T00:00:00.000Z" });
  assert.equal(fled.campaign.combat.inCombat, false);
  assert.equal(fled.campaign.combat.lastOutcome, "enemies_retreat");
  assert.equal(fled.campaign.combat.lastAction, "The party escaped the brawl.");
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
  let campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: 10, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  campaign.party = campaign.party.map((member) => member.id === "thor"
    ? { ...member, conditions: ["dodging"] }
    : member);
  campaign.combat.turnEconomy = {
    ...campaign.combat.turnEconomy,
    thor: { action: "spent", movementRemainingFt: 10 },
  };
  const view = buildCombatTrackerView(campaign, { controlledActorId: "karl" });
  assert.equal(view.inCombat, true);
  assert.equal(view.rows.some((row) => row.name === "Drunk miner" && row.meta === "DM"), true);
  assert.equal(view.rows.find((row) => row.id === "miner").hpLabel, "10/10");
  assert.equal(view.rows.find((row) => row.id === "thor").hpLabel, "12/12");
  assert.match(view.rows.find((row) => row.id === "thor").meta, /Dodging/);
  assert.match(view.rows.find((row) => row.id === "thor").meta, /Action spent/);
  assert.match(view.rows.find((row) => row.id === "thor").meta, /10 ft/);
  assert.equal(view.rows.find((row) => row.id === "karl").controlled, true);

  campaign.combat.enemies = campaign.combat.enemies.map((enemy) => enemy.id === "miner"
    ? { ...enemy, hp: { current: 0, max: 10 }, conditions: ["defeated"] }
    : enemy);
  const defeatedView = buildCombatTrackerView(campaign);
  assert.equal(defeatedView.rows.find((row) => row.id === "miner").defeated, true);
  assert.match(defeatedView.rows.find((row) => row.id === "miner").meta, /Defeated/);

  const guestView = buildCombatTrackerView(campaign, { hideEnemyHp: true });
  assert.equal(guestView.rows.find((row) => row.id === "miner").hpLabel, "HP ?");
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
  campaign.places[0].summary = "A tavern where social fallout travels faster than ale.";
  campaign.relationships[0].notes = ["The barkeep remembers restraint.", "He dislikes broken furniture."];
  campaign.relationships.push({
    id: "rel-tavern-brawl-thread",
    sourceId: "tavern",
    targetId: "quest-1",
    type: "reputation_pressure",
    notes: ["The tavern regulars will carry the story into the street."],
  });
  campaign.timeline = [{
    id: "event-tavern-stool",
    title: "Broken stool was paid for",
    summary: "Thor paid for the broken stool instead of escalating the brawl.",
    relatedIds: ["tavern", "thor", "quest-1"],
  }];
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
  assert.ok(
    request.readonlyContext.relevantRelationships.some((relationship) => relationship.id === "rel-tavern-brawl-thread"),
    "provider retrieval should include current-place/thread relationships",
  );
  assert.match(request.readonlyContext.relevantRelationships[0].notes, /broken furniture/);
  assert.equal(request.readonlyContext.activeThreads[0].id, "quest-1");
  assert.equal(request.readonlyContext.sceneIntent.recentEvents[0].id, "event-tavern-stool");
  assert.equal(request.readonlyContext.party, undefined, "provider request should not include whole campaign dumps");

  const contextPack = buildContextPack(sceneCampaign);
  assert.equal(contextPack.sections[0].kind, "scene_focus");
  assert.match(JSON.stringify(contextPack.sections[0]), /social fallout travels faster than ale/);
  assert.match(JSON.stringify(contextPack.sections[0]), /Broken stool was paid for/);
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
    localTable: { running: true, tableId: "table-karl-campaign", sessionId: "session-test", lanAddress: "192.168.1.24", port: 7347 },
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
  assert.equal(hostProjection.guestLink, "http://192.168.1.24:7347/guest?campaign=campaign-test&table=table-karl-campaign&session=session-test");
  assert.equal(hostProjection.canCopyGuestLink, true);
  assert.match(hostProjection.flowSummary, /queued/i);
  assert.match(hostProjection.pendingInputs[0].statusLabel, /Queued for DM/);

  const liveWaitingProjection = buildMultiplayerSessionProjection({
    campaign: {
      ...campaign,
      multiplayer: {
        ...campaign.multiplayer,
        waitingGuests: [],
      },
    },
    hostSnapshot: {
      ...campaign.multiplayer,
      waitingGuests: [{ id: "wait-1", displayName: "Nora", status: "waiting" }],
    },
    locationPort: "4173",
  });
  assert.equal(liveWaitingProjection.waitingGuests.length, 1);
  assert.equal(liveWaitingProjection.waitingGuests[0].displayName, "Nora");

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
  assert.equal(stoppedProjection.guestLink, "");
  assert.equal(stoppedProjection.canCopyGuestLink, false);
  assert.equal(stoppedProjection.canResolvePartyInputs, false);

  campaign.multiplayer.settings.requireGuestActionApproval = true;
  const approvalProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(approvalProjection.requireGuestActionApproval, true);
  assert.match(approvalProjection.flowSummary, /host approval/i);
  assert.match(approvalProjection.pendingInputs[0].statusLabel, /Waiting for host approval/);

  campaign.multiplayer.settings.requireGuestActionApproval = false;
  campaign.multiplayer.settings.holdGuestActionsForGroupInput = true;
  const holdProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(holdProjection.holdGuestActionsForGroupInput, true);
  assert.equal(holdProjection.resolvePartyInputsLabel, "Resolve Group Turn");
  assert.match(holdProjection.flowSummary, /grouped host turn/i);
  assert.match(holdProjection.pendingInputs[0].statusLabel, /Held for group turn/);

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
  assert.match(guestProjection.flowSummary, /host table first/i);
  assert.match(guestProjection.pendingInputs[0].statusLabel, /Sent to host table/);
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
  assert.match(appJs, /markPendingPlayerTurnRecovering/, "auto-resumed player turns should get a visible recovery lifecycle before replay");
  assert.match(appJs, /turn_recovering[\s\S]*?label:\s*"Recovering"/, "recovering player turns should use table-facing lifecycle wording");
  assert.match(appJs, /markRepairTurnRetrying/, "Try Again should mark the original player action as retrying");
  assert.match(appJs, /findPlayerTurnMessageForRepair/, "Try Again should find the original action by repair turn id");
  assert.match(appJs, /turn_retrying[\s\S]*?label:\s*"Trying again"/, "repair retry bubbles should use table-facing lifecycle wording");
  assert.match(
    appJs,
    /const runResult = await runPromptThroughLocalProvider\(repair\.turn\);[\s\S]*?await updatePlayerTurnEchoLifecycle\(retryMessage\.id/,
    "Try Again should update the original player action after the retry result",
  );
  assert.match(appJs, /renderTableTimelineSummary/, "diagnostics should render a readable table timeline");
  assert.match(appJs, /buildSessionHealthSummary/, "diagnostics should include a plain session health summary");
  assert.match(appJs, /sessionHealth: buildSessionHealthSummary\(\)/, "renderer diagnostics should serialize session health");
  assert.match(appJs, /sessionNextStepLine/, "session health should name the next table action");
  assert.match(appJs, /Next: host presses Resolve Inputs when ready for the DM\./, "host should get a clear next step for queued guest input");
  assert.match(appJs, /Next: wait for .*player to send a combat action/, "remote combat waits should name the controller's next step");
  assert.match(appJs, /Next: host nudges or resolves .*companion turn/, "AI companion combat waits should point back to host approval");
  assert.match(appJs, /function isActiveAiCompanionCombatTurn/, "AI companion combat nudges should be scoped to their active initiative turn");
  assert.match(appJs, /state\.campaign\.combat\.currentTurnId === member\.id/, "AI companion combat nudge must match the current initiative actor");
  assert.match(appJs, /buildAiCompanionCombatNudgePrompt/, "AI companion combat nudges should request a suggestion, not resolution");
  assert.match(appJs, /Do not roll dice, deal damage, spend resources, apply conditions, move initiative, resolve the action/, "AI companion combat suggestion must not resolve mechanics before host approval");
  assert.match(appJs, /if\s*\(!enemies\.length\)\s*{\s*return null;\s*}/, "implicit combat starts must require at least one enemy");
  assert.match(appJs, /stripInlineResponseJsonTail/, "table narration cleanup should remove inline provider JSON tails");
  assert.match(appJs, /choiceAudienceLabel/, "structured choice panels should surface party/character/vote audience metadata");
  assert.match(appJs, /choice-audience/, "choice panels should render the selected audience near the prompt");
  assert.equal(/label:\s*"Play"/.test(appJs), false, "AI companion cards should use Nudge instead of a Play button");
  assert.match(
    appJs,
    /label:\s*"Invite Player"[\s\S]*?label:\s*"Nudge"[\s\S]*?className:\s*"nudge-action"/,
    "AI companion card actions should place Nudge after Invite Player and use nudge styling",
  );
  assert.match(appJs, /Stage For DM/, "AI companion approval should read like staging a table beat");
  assert.match(appJs, /Resolve Now/, "AI companion approval should support immediate DM resolution");
  assert.match(appJs, /resolvePartySuggestionNow/, "AI companion resolve-now flow should be explicit");
  assert.match(appJs, /partySuggestionInputFromMessage/, "AI companion resolve-now should send a structured party input");
  assert.match(appJs, /Pass/, "AI companion approval should allow the host to pass on the beat");
  assert.match(appJs, /Companion beat staged; add host text or press Send Turn when ready\./);
  assert.match(appJs, /markApprovedPartyInputsStillStaged/, "failed DM turns should keep approved party inputs visibly staged");
  assert.match(appJs, /markRemoteInputsStillStaged/, "failed DM turns should keep remote party inputs visibly staged");
  assert.match(appJs, /dm_failed_still_staged[\s\S]*?label:\s*"Still staged"/, "failed staged inputs should use table-facing retry wording");
  assert.match(
    appJs,
    /else if \(inputs\.length && !runResult\?\.imported\) {\s*await markRemoteInputsStillStaged\(inputs, runResult\);/,
    "manual and auto-resolved remote inputs should remain visibly staged after provider failure",
  );
}

async function testNewCampaignPreTableJoinerWiring() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  const appShell = await readFile(path.join("app", "App.jsx"), "utf8");
  const styles = await readFile(path.join("app", "styles.css"), "utf8");
  const electronMain = await readFile(path.join("electron", "main.js"), "utf8");
  assert.match(appShell, /Additional Characters/);
  assert.match(appShell, /add-wizard-party-member/);
  assert.match(appShell, /Remote Invite/);
  assert.match(appShell, /new-character-controller/);
  assert.match(appShell, /Back to previous screen/);
  assert.match(appShell, /data-character-field="controllerKind"/);
  assert.match(appShell, /new-joiner-integration/);
  assert.match(appShell, /new-joiner-host-context/);
  assert.match(appShell, /table-timeline-summary/);
  assert.match(appShell, /session-health-summary/);
  assert.match(appShell, /local-table-guidance/);
  assert.match(appShell, /local-table-guest-link/);
  assert.match(appShell, /copy-guest-link/);
  assert.match(appShell, /seat-waiting-guest/);
  assert.match(appShell, /id="campaign-notes-panel"/);
  assert.match(appShell, /id="player-notes-panel"/);
  assert.match(appShell, /id="player-notes-scratch"/);
  assert.ok(
    appShell.indexOf('id="player-notes-panel"') < appShell.indexOf('className="rail-section table-talk-section"'),
    "table talk should remain at the bottom of the right rail after campaign and player notes",
  );
  assert.match(appShell, /guest-waiting-room-panel/);
  assert.match(appShell, /guest-table-preview/);
  assert.match(appShell, /guest-seat-list/);
  assert.match(appShell, /Ask To Join/);
  assert.match(appShell, /home-campaign-select/);
  assert.match(appShell, /Existing Campaign/);
  assert.match(appShell, /id="waiting-guests"/);
  assert.ok(
    appShell.indexOf('id="provider-activity"') < appShell.indexOf('id="play-log"'),
    "table status strip should live above the play log",
  );
  assert.match(appShell, /Try Again/);
  assert.match(appShell, /Details/);
  assert.match(appShell, /Use Anyway/);
  assert.match(appShell, /Table Diagnostics/);
  assert.match(appShell, /Copy Details/);
  assert.match(appShell, /Review DM Response/);
  assert.doesNotMatch(appShell, /raw provider JSON/);
  assert.match(appShell, /id="show-debug-meta"/);
  assert.match(appJs, /renderRightRailState/);
  assert.match(appJs, /playerNotesStoragePrefix/);
  assert.match(appJs, /apiCampaignPlayerNotesUrl/);
  assert.match(appJs, /playerNotesWithLocalFallback/);
  assert.match(appJs, /persistPlayerNotes/);
  assert.match(appJs, /savePlayerNotesFromUi/);
  assert.match(appJs, /collectWizardAdditionalCharacters/);
  assert.match(appJs, /normalizeWizardJoiner/);
  assert.match(appJs, /seedWizardStartingPartyMember/);
  assert.match(appJs, /Additional starting party members/);
  assert.match(appJs, /wizardControllerSheetFields/);
  assert.match(appJs, /inviteIntent:\s*"remote_player"/);
  assert.match(appJs, /campaign-wizard-mode/);
  assert.match(appJs, /campaignWizardReturnHome/);
  assert.match(appJs, /dismissCampaignWizard/);
  assert.match(appJs, /openSelectedHomeCampaign/);
  assert.match(appJs, /renderHomeCampaignPicker/);
  assert.match(appJs, /guestWaitingRoomMode/);
  assert.match(appJs, /refreshGuestLobbyPreview/);
  assert.match(appJs, /preferredPartyMemberId/);
  assert.match(appJs, /apiMultiplayerWaitingRegisterUrl/);
  assert.match(appJs, /apiMultiplayerChoiceVoteUrl/);
  assert.match(appJs, /apiMultiplayerDisconnectUrl/);
  assert.match(appJs, /submitGuestChoiceVote/);
  assert.match(appJs, /notifyHostGuestLeaving/);
  assert.match(appJs, /choice-vote-count/);
  assert.match(appJs, /choiceVoteSummaryText/);
  assert.match(appJs, /choiceVoteState/);
  assert.match(appJs, /leadingChoiceVoteEntry/);
  assert.match(appJs, /choice-vote-summary/);
  assert.match(appJs, /choice-vote-tied/);
  assert.match(appJs, /choice-vote-action/);
  assert.match(appJs, /Draft leading choice \$\{leadingVote\.label\}/);
  assert.match(appJs, /Selected choice \$\{label\}\$\{voteText\}; edit or send/);
  assert.match(
    appJs,
    /function createImplicitCombatAdvanceChange[\s\S]*!hasResolvedMechanics\(turnResponse\)[\s\S]*return null;/,
    "implicit combat turn advancement must require resolved mechanics, not provider phrasing alone",
  );
  assert.match(appJs, /seatWaitingGuestAtTable/);
  assert.match(appJs, /renderWaitingGuestCue/);
  assert.match(appJs, /announceWaitingGuestsIfNeeded/);
  assert.match(appJs, /effectiveWaitingGuests/);
  assert.match(appJs, /copyGuestLinkFromUi/);
  assert.match(appJs, /currentLocalGuestLink/);
  assert.match(appJs, /partyControllerDetail/);
  assert.match(appJs, /Waiting for an invited player/);
  assert.match(appJs, /renderDebugMetaControl/);
  assert.match(appJs, /DM response needs review\. Try Again, Details, or Use Anyway\./);
  assert.match(appJs, /DM is reconsidering the response/);
  assert.match(appJs, /launchInviteLink/);
  assert.match(appJs, /applyLaunchInviteLink/);
  assert.match(appJs, /clearGuestSession\(\{\s*keepRecent:\s*false\s*\}\)/);
  assert.match(appJs, /Invite loaded\. Enter your name/);
  assert.match(appJs, /Enter the name the host should see at the table/);
  assert.match(electronMain, /findJoinLinkArg\(process\.argv\)/);
  assert.match(electronMain, /setAsDefaultProtocolClient\("lorekeeper"\)/);
  assert.match(electronMain, /query\.inviteLink = pendingJoinLink/);
  assert.match(electronMain, /second-instance", \(_event, argv = \[\]\)/);
  assert.match(styles, /\.left-panel\s*{\s*grid-area:\s*left;\s*min-width:\s*0;/);
  assert.match(styles, /\.panel-rail\s*{\s*min-width:\s*0;/);
  assert.match(styles, /\.title-actions\s*{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(styles, /\.record\s*{\s*min-width:\s*0;/);
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
