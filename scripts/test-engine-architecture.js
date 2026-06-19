import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { readTextWithFallback, writeTextWithFallback } from "../app/clipboard-utils.js";
import { buildPartyTemplateCharacters, completeCharacterSeed, splitAncestryClass } from "../app/character-autocomplete-controller.js";
import { buildCampaignAdoptionPlan } from "../app/campaign-adoption-controller.js";
import {
  buildChoiceSelectionFromText,
  buildChoiceSelectionMeta,
  choiceAudienceLabel,
  choicePanelKey,
  choiceSelectionInWorldText,
  choiceSelectionActivityText,
  choiceVoteCounts,
  choiceVoteState,
  choiceVoteSummaryText,
  currentChoiceVotesForBlock,
  currentGuestVoteForChoice,
  extractChoiceTokenText,
  leadingChoiceVoteEntry,
  parseChoiceIndexes,
  pendingSelectionMatchesText,
  structuredChoiceBlockFromMessageData,
  structuredChoicesForMessage,
} from "../app/choice-vote-controller.js";
import {
  createImplicitCombatAdvanceChange,
  createImplicitCombatEnemySyncChange,
  createImplicitCombatStartChange,
  hasResolvedMechanics,
  inferCombatEnemies,
  submittedCombatTurnText,
} from "../app/combat-import-controller.js";
import { createImplicitCombatActorPromptChange, latestDmNarration } from "../app/combat-prompt-repair-controller.js";
import { buildCombatTrackerView } from "../app/combat-tracker-view.js";
import { combatResolutionMessage, engineCombatResolutionChange, resolveEnemyCombatTurn } from "../app/combat-resolution-controller.js";
import { randomAdventureSeedPreset } from "../app/adventure-seed-presets.js";
import { buildDmNudgePrompt } from "../app/dm-nudge-controller.js";
import {
  buildGuestAutoResolvePin,
  buildGuestAutoResolvePlan,
  guestAutoResolvePinMatches,
  shouldScheduleGuestAutoResolve,
} from "../app/guest-auto-resolve-controller.js";
import { buildHostResponseReviewProjection, buildManualResponseFallbackProjection } from "../app/host-response-review-controller.js";
import { buildInputComposerProjection } from "../app/input-composer-controller.js";
import { buildJoinPreviewProjection, compactJoinPreviewLine } from "../app/join-preview-controller.js";
import { buildMessageBlocks, latestChoiceBlockFromMessages } from "../app/message-block-controller.js";
import { buildMultiplayerSessionProjection } from "../app/multiplayer-session-panel.js";
import {
  buildPartyApprovalControlsProjection,
  buildPartyApprovalProjection,
  partySuggestionActivityForStatus,
  partySuggestionInputFromMessage,
  partySuggestionStatusMeta,
} from "../app/party-suggestion-controller.js";
import { buildMessageLifecycleProjection, buildPendingInputActionProjection, buildPlayLogProjection, defaultPlayLogVisibleLimit, playLogPageSize } from "../app/play-log-controller.js";
import { buildCampaignChatFallbackPlan, buildCampaignChatProgressSteps, campaignChatFallbackReasons } from "../app/provider-chat-controller.js";
import {
  buildProviderImportOutcome,
  buildProviderImportPlan,
  cleanProviderResponseForPlay,
  decideLatestProviderImport,
  prepareAutoCommitReviewBatch,
  shouldAutoApproveProviderChange,
  splitProviderTableMessages,
} from "../app/provider-import-controller.js";
import {
  buildModelOptionsProjection,
  campaignCreationProviderSettings,
  providerSetupHint,
  providerStatusLabel,
  resolveProviderSettings,
  selectedModelSummaryProjection,
} from "../app/provider-settings-controller.js";
import { contractIssueFromProviderResult, providerResultMeta } from "../app/provider-result-controller.js";
import { buildReviewPanelProjection } from "../app/proposed-changes-panel.js";
import { createImplicitSceneProgressChange } from "../app/scene-import-controller.js";
import { buildSettingsSurfaceProjection } from "../app/settings-surface-controller.js";
import { buildStagedInputRecoveryPlan, providerFailureReason, stagedInputRecoveryActions } from "../app/staged-input-recovery-controller.js";
import { buildAiCompanionNudgeGate, buildNudgeDmCommandGate, buildStartAdventureCommandGate, buildTableActionProjection } from "../app/table-action-controller.js";
import { buildMultiplayerPollingPlan, multiplayerPollingActions } from "../app/table-background-polling-controller.js";
import { buildTableFocusProjection } from "../app/table-focus-controller.js";
import { currentTableTalkMessages, freshestTableTalkMessages } from "../app/table-talk-controller.js";
import { buildAdventureOpeningPrompt, buildStartAdventureOpeningProjection, isCampaignReadyForOpening } from "../app/table-opening-controller.js";
import { tableStatusForActivity, tableTimelineEvent } from "../app/table-status.js";
import { buildTurnContentGate, buildTurnSubmitGate } from "../app/turn-submit-controller.js";
import { createTurnFlowRuntime } from "../app/turn-flow-runtime.js";
import {
  buildTurnRepairActionGate,
  isHardBlockedTurnRepair,
  tableRepairReason,
  turnRepairActivityText,
  turnRepairBlockedMessage,
  turnRepairImportOptions,
  turnRepairStatusText,
  turnRepairUseAnywayDialog,
} from "../app/turn-repair-controller.js";
import { applyCanonicalChanges } from "../src/campaign-state/apply-changes.js";
import { addCampaignRecord } from "../src/campaign-state/direct-records.js";
import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import { createPlayerTurn } from "../src/play-loop/session-turn.js";
import { buildFiveELiteCharacterSeed, classifyCharacterProfile, clampLevel } from "../src/rules/character-seed.js";
import { controllerForActor, canProviderActForActor, requiresHumanInput } from "../src/engine/agency-controller.js";
import { getActiveCombatActor, legalActionsForActor, resolveCombatAction, startCombat } from "../src/engine/combat-engine.js";
import { createCampaignStateStore } from "../src/engine/campaign-state-store.js";
import { addConsequence, resolveConsequence } from "../src/engine/consequence-engine.js";
import { rollD20, rollFormula } from "../src/engine/dice-engine.js";
import { buildGoalHorizon, buildLivingWorldMemory } from "../src/engine/living-world-engine.js";
import { applyRelationshipTransition } from "../src/engine/relationship-engine.js";
import { applyFactionMemory, applyLocationMemory } from "../src/engine/world-memory-engine.js";
import { buildProviderTaskRequest, acceptProviderResponseForTurn, createProviderOrchestrator } from "../src/engine/provider-orchestrator.js";
import { buildSceneIntentPack, buildSceneRetrieval, transitionScene } from "../src/engine/scene-engine.js";
import { applyStateEffects } from "../src/engine/state-effects.js";
import { buildTableSessionProjection, tablePhases } from "../src/engine/table-session-engine.js";
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
import { joinableGuestSeats } from "../src/multiplayer/local-table.js";

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

function testAdventureSeedPreset() {
  const values = [0.1, 0.2, 0.3];
  let index = 0;
  const seed = randomAdventureSeedPreset(() => values[index++ % values.length]);
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
  assert.ok(actions.some((action) => action.id === "hide"), "common combat options should include Hide");
  assert.ok(actions.some((action) => action.id === "ready"), "common combat options should include Ready");
  const greataxeOption = actions.find((action) => action.type === "attack");
  assert.ok(greataxeOption?.id);

  const resolved = resolveCombatAction(campaign, {
    turnId: "combat-turn-1",
    actorId: "thor",
    actionType: "attack",
    legalOptionId: greataxeOption.id,
    targetIds: ["miner"],
    declaredText: "Attack with Greataxe",
  }, { seed: "hit-seed" });

  assert.equal(resolved.actionRecord.actorId, "thor");
  assert.equal(resolved.actionRecord.rolls[0].label, "Attack roll");
  assert.equal(resolved.campaign.combat.currentTurnId, "sy", "combat should advance after app-side resolution");
  assert.equal(resolved.campaign.combat.turnEconomy.thor.action, "spent", "resolved attacks should spend the actor action");
  assert.equal(resolved.campaign.combat.turnEconomy.sy.action, "available", "next actor should begin with a fresh action");
  assert.equal(resolved.actionRecord.turnEconomy.cost.action, 1, "combat action log should record the action economy cost");
  assert.equal(resolved.actionRecord.effects.every((effect) => effect.source === "combat_engine"), true);
  assert.equal(resolved.campaign.combatActionLog.length, 1, "combat action should be logged to campaign state");
  assert.equal(resolved.campaign.diceLog.length >= 1, true, "combat rolls should be logged to campaign state");
  assert.equal(resolved.campaign.stateEffectLog.length, resolved.actionRecord.effects.length, "applied effects should be logged to campaign state");

  const spentActionCampaign = structuredClone(campaign);
  spentActionCampaign.combat.turnEconomy.thor = {
    ...(spentActionCampaign.combat.turnEconomy.thor ?? {}),
    action: "spent",
  };
  assert.throws(() => resolveCombatAction(spentActionCampaign, {
    turnId: "combat-action-already-spent",
    actorId: "thor",
    actionType: "attack",
    targetIds: ["miner"],
    declaredText: "Attack again after already spending an action.",
  }, { seed: "already-spent" }), /action is already spent/);

  assert.throws(() => resolveCombatAction(campaign, {
    turnId: "combat-wrong-option-type",
    actorId: "thor",
    actionType: "spell",
    legalOptionId: greataxeOption.id,
    targetIds: ["miner"],
    declaredText: "Cast the greataxe somehow.",
  }, { seed: "wrong-option-type" }), /cannot resolve as spell/);

  const spentSlotCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor"
      ? {
        ...member,
        ancestryClass: "Dwarf Cleric",
        resources: { spellSlots: { 1: { max: 1, used: 1 } } },
        spells: [{ name: "Entangle", level: 1 }],
      }
      : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  assert.throws(() => resolveCombatAction(spentSlotCampaign, {
    turnId: "combat-unavailable-spell",
    actorId: "thor",
    actionType: "spell",
    legalOptionId: "spell-entangle",
    spellName: "Entangle",
    targetIds: ["miner"],
  }, { seed: "unavailable-spell" }), /no longer available/);

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

  const dashCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const dashed = resolveCombatAction(dashCampaign, {
    turnId: "combat-dash-turn",
    actorId: "thor",
    actionType: "dash",
    legalOptionId: "dash",
    declaredText: "Dash across the bridge.",
  }, { seed: "dash-seed" });
  assert.equal(dashed.actionRecord.rolls.length, 0);
  assert.ok(dashed.campaign.party.find((member) => member.id === "thor").positionNotes.includes("Dashed to cover more ground this turn."));
  assert.equal(dashed.campaign.combat.currentTurnId, "sy");

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

  const defaultHideCampaign = startCombat({
    ...campaignFixture(),
    party: campaignFixture().party.map((member) => member.id === "thor" ? { ...member, skills: ["Stealth"] } : member),
  }, {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const defaultHidden = resolveCombatAction(defaultHideCampaign, {
    turnId: "combat-default-hide-turn",
    actorId: "thor",
    actionType: "hide",
    legalOptionId: "hide",
    declaredText: "Hide behind the overturned bar.",
    modifier: 20,
    dc: 10,
  }, { seed: "combat-default-hide-seed" });
  assert.equal(defaultHidden.actionRecord.rolls[0].label, "Stealth check");
  assert.ok(defaultHidden.campaign.party.find((member) => member.id === "thor").conditions.includes("hidden"));
  assert.equal(defaultHidden.campaign.combat.currentTurnId, "sy");

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
    movementFt: 20,
    successEffects: [{ type: "position_note", targetId: "thor", note: "Kept pace with the fleeing miner." }],
    failureEffects: [{ type: "position_note", targetId: "thor", note: "Lost ground in the chase." }],
  }, { seed: "combat-chase-seed" });
  assert.equal(chased.actionRecord.rolls[0].label, "Athletics check");
  assert.ok(chased.campaign.party.find((member) => member.id === "thor").positionNotes.includes("Kept pace with the fleeing miner."));
  assert.equal(chased.campaign.combat.turnEconomy.thor.movementRemainingFt, 10);
  assert.equal(chased.actionRecord.turnEconomy.cost.movementFt, 20);

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
  assert.equal(readiedReaction.campaign.combat.turnEconomy.thor.action, "spent");

  const consumedReactionCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const reactionConsumed = resolveCombatAction(consumedReactionCampaign, {
    turnId: "combat-consume-reaction-turn",
    actorId: "thor",
    actionType: "ready",
    declaredText: "Ready a shield block that will use Thor's reaction.",
    consumeReaction: true,
  }, { seed: "combat-consume-reaction-seed" });
  assert.equal(reactionConsumed.campaign.combat.turnEconomy.thor.reaction, "spent");
  assert.equal(reactionConsumed.actionRecord.turnEconomy.cost.reaction, 1);

  const defaultReadyCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  const defaultReadied = resolveCombatAction(defaultReadyCampaign, {
    turnId: "combat-default-ready-turn",
    actorId: "thor",
    actionType: "ready",
    legalOptionId: "ready",
    declaredText: "Ready an action if the miner rushes Sy.",
    trigger: "the miner rushes Sy",
  }, { seed: "combat-default-ready-seed" });
  assert.ok(defaultReadied.campaign.party.find((member) => member.id === "thor").conditions.includes("readied_action"));
  assert.equal(defaultReadied.campaign.combat.currentTurnId, "sy");

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
  assert.equal(controllerChange.data.currentTurnId, "thor");
  assert.equal(controllerChange.data.turnResolved, true);
  assert.equal(controllerChange.data.advanceTurn, true);
  assert.equal(controllerChange.data.resolvedActorId, "miner");
  const canonicalEnemyTurn = applyCanonicalChanges(enemyTurnCampaign, [controllerChange]);
  assert.equal(canonicalEnemyTurn.campaign.combat.currentTurnId, "thor", "canonical app-owned enemy turn import should not leave initiative stuck on the enemy");
  const controllerMessage = combatResolutionMessage(controllerResolved);
  assert.equal(controllerMessage.role, "dm");
  assert.equal(controllerMessage.data.kind, "combat_engine_resolution");
  assert.match(controllerMessage.body, /Drunk miner lunges at Thor/);

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

function testCombatPromptRepairController() {
  const campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { miner: 20, thor: 12, sy: 7, karl: 6 },
  });
  assert.equal(campaign.combat.currentTurnId, "miner");

  const choiceRepair = createImplicitCombatActorPromptChange({
    campaign,
    turnResponse: {
      sceneStatus: { mode: "combat" },
      choices: { forActorId: "thor", options: [] },
    },
  });
  assert.equal(choiceRepair.data.promptedActorId, "thor");
  assert.equal(choiceRepair.data.onlyFromNonParty, true);
  assert.equal(choiceRepair.confidence, "high");

  const proseRepair = createImplicitCombatActorPromptChange({
    campaign,
    tableMessages: [
      { role: "dm", body: "Thor's turn. What do you do?" },
    ],
  });
  assert.equal(proseRepair.data.promptedActorId, "thor");

  const blockedByExistingCombatUpdate = createImplicitCombatActorPromptChange({
    campaign,
    turnResponse: { choices: { forActorId: "thor" } },
    proposedChanges: [{ domain: "combat", data: { advanceTurn: true, resolvedActorId: "miner" } }],
  });
  assert.equal(blockedByExistingCombatUpdate, null);

  const partyAlreadyActive = createImplicitCombatActorPromptChange({
    campaign: {
      ...campaign,
      combat: { ...campaign.combat, currentTurnId: "sy" },
    },
    turnResponse: { choices: { forActorId: "thor" } },
  });
  assert.equal(partyAlreadyActive, null);

  assert.equal(latestDmNarration([
    { role: "dm", body: "First prompt." },
    { role: "party", body: "Thor waits." },
    { role: "dm", body: "Latest prompt." },
  ]), "Latest prompt.");
}

function testCombatImportController() {
  const startChange = createImplicitCombatStartChange({
    campaign: campaignFixture(),
    tableMessages: [{ role: "dm", body: "A massive wolf charges from the treeline. Roll initiative." }],
    turnResponse: { sceneStatus: { mode: "combat" } },
  });
  assert.equal(startChange.data.inCombat, true);
  assert.equal(startChange.data.enemies[0].id, "enemy-wolf");
  assert.equal(startChange.confidence, "high");
  assert.equal(createImplicitCombatStartChange({
    campaign: campaignFixture(),
    tableMessages: [{ role: "dm", body: "The tavern keeper asks what you want to drink." }],
  }), null);

  const activeCampaign = startCombat(campaignFixture(), {
    enemies: [{ id: "enemy-wolf", name: "Massive wolf", hp: { current: 12, max: 12 }, armorClass: 12 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, "enemy-wolf": 1 },
  });
  const syncChange = createImplicitCombatEnemySyncChange({
    campaign: activeCampaign,
    tableMessages: [{ role: "dm", body: "A bandit joins the wolf at the treeline." }],
  });
  assert.equal(syncChange.data.enemyUpdates[0].id, "enemy-bandit");
  assert.equal(createImplicitCombatEnemySyncChange({
    campaign: activeCampaign,
    tableMessages: [{ role: "dm", body: "The massive wolf circles closer." }],
  }), null, "known enemies should not be duplicated");

  const ashWolfDeclaredByProvider = createImplicitCombatEnemySyncChange({
    campaign: campaignFixture(),
    proposedChanges: [{
      domain: "combat",
      data: {
        inCombat: true,
        enemies: [{ id: "enemy-ash-wolf", name: "Ash Wolf", type: "beast" }],
        turnOrder: [
          { id: "thor", name: "Thor", type: "party" },
          { id: "enemy-ash-wolf", name: "Ash Wolf", type: "enemy" },
        ],
      },
    }],
    tableMessages: [{ role: "dm", body: "The ash wolf drops from the broken stair and snarls." }],
    turnResponse: { sceneStatus: { mode: "combat" }, flags: { startsCombat: true } },
  });
  assert.equal(ashWolfDeclaredByProvider, null, "generic wolf inference should not duplicate a provider-declared Ash Wolf");

  assert.equal(inferCombatEnemies("A bandit and a hostile miner block the road.").length >= 2, true);

  const campaign = startCombat(campaignFixture(), {
    enemies: [{ id: "miner", name: "Drunk miner", hp: { current: 12, max: 12 }, armorClass: 10 }],
    initiativeRolls: { thor: 20, sy: 7, karl: 6, miner: 1 },
  });
  assert.equal(campaign.combat.currentTurnId, "thor");

  const submittedTurn = {
    playerMessage: "Thor attacks the miner with his axe.",
    playerInputs: [{ characterId: "thor", text: "Thor attacks the miner with his axe." }],
  };
  const resolvedResponse = {
    sceneStatus: { mode: "combat", awaitingPlayer: false },
    mechanics: [{ type: "attack", outcome: "hit", roll: "17", damage: "8 slashing damage" }],
  };
  assert.equal(submittedCombatTurnText(submittedTurn), "Thor attacks the miner with his axe.\nThor attacks the miner with his axe.");
  assert.equal(hasResolvedMechanics(resolvedResponse), true);

  const change = createImplicitCombatAdvanceChange({
    campaign,
    submittedTurn,
    turnResponse: resolvedResponse,
    labelForActor: (_campaign, id) => id === "thor" ? "Thor" : id,
  });
  assert.equal(change.data.advanceTurn, true);
  assert.equal(change.data.resolvedActorId, "thor");
  assert.equal(change.confidence, "high");

  const narrationOnly = createImplicitCombatAdvanceChange({
    campaign,
    submittedTurn,
    turnResponse: { sceneStatus: { mode: "combat" }, mechanics: [] },
  });
  assert.equal(narrationOnly, null, "provider narration alone must not advance initiative");

  const wrongActor = createImplicitCombatAdvanceChange({
    campaign,
    submittedTurn: {
      playerMessage: "Sy attacks.",
      playerInputs: [{ characterId: "sy", text: "Sy attacks." }],
    },
    turnResponse: resolvedResponse,
  });
  assert.equal(wrongActor, null, "submitted action must belong to the active combat actor");

  const existingCombatAdvance = createImplicitCombatAdvanceChange({
    campaign,
    proposedChanges: [{ domain: "combat", data: { advanceTurn: true, resolvedActorId: "thor" } }],
    submittedTurn,
    turnResponse: resolvedResponse,
  });
  assert.equal(existingCombatAdvance, null, "implicit advance should not duplicate an explicit combat change");
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
  const view = buildCombatTrackerView(campaign, { controlledActorId: "karl", isHostView: true });
  assert.equal(view.inCombat, true);
  assert.equal(view.activeCue.actorName, "Thor");
  assert.equal(view.activeCue.controllerLabel, "Your turn");
  assert.match(view.activeCue.instruction, /Choose an action/i);
  const observerView = buildCombatTrackerView(campaign, { controlledActorId: "karl" });
  assert.equal(observerView.activeCue.controllerLabel, "Host turn");
  assert.ok(view.activeCue.actions.some((action) => action.id === "move"), "active combat cue should respect spent action economy and show legal options");
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

  campaign.combat.currentTurnId = "karl";
  const controlledGuestView = buildCombatTrackerView(campaign, { controlledActorId: "karl" });
  assert.equal(controlledGuestView.activeCue.controllerLabel, "Your turn");
  assert.match(controlledGuestView.activeCue.instruction, /send it to the host table/i);

  campaign.combat.currentTurnId = "miner";
  const enemyTurnView = buildCombatTrackerView(campaign);
  assert.equal(enemyTurnView.activeCue.controllerLabel, "DM turn");
  assert.match(enemyTurnView.activeCue.instruction, /app resolves enemy mechanics/i);

  campaign.party = campaign.party.map((member) => member.id === "karl"
    ? {
      ...member,
      attacks: [{ name: { label: "Warhammer" }, attackBonus: 4, damage: "1d8+2" }],
      spells: [{ name: { label: "Shield" }, level: 1 }],
      resources: { spellSlots: { 1: { max: 1, used: 0 } } },
    }
    : member);
  campaign.combat.currentTurnId = "karl";
  campaign.combat.turnEconomy.karl = { action: "available", bonusAction: "available", movementRemainingFt: 30 };
  const objectNamedActionView = buildCombatTrackerView(campaign);
  const actionLabels = objectNamedActionView.activeCue.actions.map((action) => action.label).join(" / ");
  assert.doesNotMatch(actionLabels, /\[object Object\]/);
  assert.match(actionLabels, /Warhammer|Attack/);

  campaign.combat.enemies = campaign.combat.enemies.map((enemy) => enemy.id === "miner"
    ? { ...enemy, hp: { current: 7, max: 10 }, conditions: [] }
    : enemy);
  campaign.combat.inCombat = true;
  const combatContextText = buildContextPack(campaign, { includeCombatDetail: true }).sections
    .filter((section) => section.kind === "combat_state")
    .flatMap((section) => section.entries)
    .join("\n");
  assert.doesNotMatch(combatContextText, /\[object Object\]/);
  assert.match(combatContextText, /Warhammer|Attack/);
  assert.match(combatContextText, /Drunk miner \(HP 7\/10\)/);
}

function testSceneImportController() {
  const change = createImplicitSceneProgressChange({
    now: () => "2026-06-16T00:00:00.000Z",
    tableMessages: [
      { role: "dm", body: "Old situation." },
      { role: "party", body: "Thor checks the door." },
      { role: "dm", body: "The door opens onto a rain-slick alley.\nA. Charge ahead\nB. Wait" },
    ],
  });
  assert.equal(change.domain, "scene");
  assert.equal(change.data.status, "in_progress");
  assert.equal(change.data.lastBeatAt, "2026-06-16T00:00:00.000Z");
  assert.equal(change.data.immediateSituation, "The door opens onto a rain-slick alley.");

  const explicitScene = createImplicitSceneProgressChange({
    tableMessages: [{ role: "dm", body: "The alley changes." }],
    proposedChanges: [{ domain: "scene", data: { immediateSituation: "Already structured." } }],
  });
  assert.equal(explicitScene, null);

  const choiceOnly = createImplicitSceneProgressChange({
    tableMessages: [{ role: "dm", body: "What do you do?\nA. Run\nB. Hide" }],
  });
  assert.equal(choiceOnly, null);
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

function testSceneRetrievalRanksFocusUnderLongCampaignNoise() {
  const base = campaignFixture();
  base.relationships = Array.from({ length: 40 }, (_, index) => ({
    id: `rel-noise-${index}`,
    sourceId: "tavern",
    targetId: `patron-${index}`,
    type: "ambient_room_color",
    notes: [`Noise relationship ${index}`],
  }));
  base.relationships.push({
    id: "rel-tavern-quest-thor",
    sourceId: "tavern",
    targetId: "quest-1",
    type: "active_thread_pressure",
    notes: ["This tavern thread should survive noisy relationship history."],
  });
  base.timeline = [
    {
      id: "event-threaded-stool",
      title: "Threaded stool clue",
      summary: "Thor paid for a stool and the quest thread shifted.",
      relatedIds: ["tavern", "thor", "quest-1"],
    },
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `event-noise-${index}`,
      title: `Tavern noise ${index}`,
      summary: "A regular ordered another drink.",
      relatedIds: ["tavern"],
    })),
  ];

  const campaign = transitionScene(base, {
    id: "scene-long-noise",
    title: "Long campaign tavern return",
    type: "social",
    locationId: "tavern",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["barkeep"],
    activeQuestIds: ["quest-1"],
    tensions: ["The room remembers Thor's last choice."],
  });

  const retrieval = buildSceneRetrieval(campaign, { relationshipLimit: 4, eventLimit: 4 });
  assert.equal(retrieval.relevantRelationships[0].id, "rel-tavern-quest-thor");
  assert.equal(retrieval.relevantRecentEvents[0].id, "event-threaded-stool");
}

function testLivingWorldMemoryAndGoalHorizonsSurviveLongCampaignNoise() {
  const base = campaignFixture();
  base.people.push({
    id: "merchant-osric",
    name: "Osric",
    role: "merchant the party escorted",
    memory: ["Thor saved Osric from bandits and refused extra coin.", "Osric will vouch for Thor in trade towns."],
  });
  base.factions = [{
    id: "river-guild",
    name: "River Guild",
    memory: ["Guild factors heard the party protected Osric without extorting him."],
    goalIds: ["quest-escort"],
  }];
  base.places.push({
    id: "ford-market",
    name: "Ford Market",
    summary: "A market town where caravan gossip moves quickly.",
    scars: ["A collapsed bridge still slows trade after last session's flood."],
    goalIds: ["quest-escort"],
  });
  base.quests = [
    ...base.quests,
    {
      id: "quest-lich-return",
      title: "Stop the Lich King's return",
      status: "active",
      horizon: "long",
      stakes: "A distant cult is buying river relics.",
    },
    {
      id: "quest-escort",
      title: "Discover who is funding the river raids",
      status: "active",
      horizon: "mid",
      stakes: "Merchant testimony points toward the River Guild.",
      linkedIds: ["merchant-osric", "river-guild", "ford-market"],
    },
  ];
  base.relationships.push({
    id: "rel-osric-thor",
    sourceId: "merchant-osric",
    targetId: "thor",
    type: "grateful_debt",
    notes: ["Osric remembers the rescue and trusts Thor with sensitive trade rumors."],
    goalIds: ["quest-escort"],
  });
  base.timeline = Array.from({ length: 80 }, (_, index) => ({
    id: `old-event-${index}`,
    title: `Old unrelated beat ${index}`,
    summary: "Noise from many sessions ago.",
    relatedIds: index % 2 ? ["tavern"] : ["barkeep"],
  }));
  base.sessionLog.messages = Array.from({ length: 55 }, (_, index) => ({
    role: index % 2 ? "player" : "dm",
    title: index % 2 ? "Player" : "DM",
    text: `Long campaign noise message ${index}.`,
  }));

  let campaign = transitionScene(base, {
    id: "scene-ford-market-return",
    title: "Return to Ford Market",
    type: "social",
    locationId: "ford-market",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["merchant-osric"],
    activeQuestIds: ["quest-escort"],
    goals: ["Ask Osric who is buying river relics."],
    immediateSituation: "Ten sessions later, Osric spots Thor near the flood-damaged bridge.",
  });
  campaign = addConsequence(campaign, {
    id: "consequence-osric-debt",
    title: "Osric owes Thor a favor",
    description: "Osric will offer a useful rumor because Thor protected him during the bandit ambush.",
    sourceSceneId: "scene-bandit-ambush",
    participantIds: ["merchant-osric", "thor"],
    linkedGoalId: "quest-escort",
    importance: "high",
    scope: "person",
  });

  const goals = buildGoalHorizon(campaign);
  assert.equal(goals.longTerm[0].id, "quest-lich-return");
  assert.equal(goals.mediumTerm[0].id, "quest-escort");
  assert.match(goals.shortTerm[0].title, /Ask Osric/);

  const memory = buildLivingWorldMemory(campaign, { scene: buildSceneRetrieval(campaign).scene, goalHorizon: goals });
  assert.equal(memory.score.verdict, "world_memory_present");
  assert.equal(memory.people[0].id, "merchant-osric");
  assert.equal(memory.factions[0].id, "river-guild");
  assert.equal(memory.places[0].id, "ford-market");
  assert.equal(memory.consequences[0].id, "consequence-osric-debt");

  const retrieval = buildSceneRetrieval(campaign, { relationshipLimit: 4, eventLimit: 4 });
  assert.equal(retrieval.activeConsequences[0].id, "consequence-osric-debt");
  assert.equal(retrieval.relevantRelationships[0].id, "rel-osric-thor");
  assert.equal(retrieval.livingWorld.people[0].id, "merchant-osric");

  const contextPack = buildContextPack(campaign);
  const goalSection = contextPack.sections.find((section) => section.kind === "goal_horizon");
  const memorySection = contextPack.sections.find((section) => section.kind === "world_memory");
  assert.match(goalSection.entries.join(" "), /Discover who is funding the river raids|Ask Osric/);
  assert.match(memorySection.entries.join(" "), /Osric owes Thor a favor|River Guild|collapsed bridge/);
}

function testRelationshipEvolutionEngine() {
  const base = {
    ...campaignFixture(),
    relationships: [{
      id: "rel-barkeep-thor",
      sourceId: "barkeep",
      targetId: "thor",
      state: "neutral",
      notes: ["The barkeep knows Thor by sight."],
    }],
  };

  const improved = applyRelationshipTransition(base, {
    id: "rel-barkeep-thor",
    shift: "improve",
    reason: "Thor protected the tavern without breaking furniture.",
    linkedGoalId: "quest-1",
    relatedIds: ["tavern"],
  }, { now: "2026-01-01T00:00:00.000Z" });
  assert.equal(improved.previousState, "neutral");
  assert.equal(improved.nextState, "respectful");
  assert.equal(improved.relationship.state, "respectful");
  assert.ok(improved.relationship.notes.includes("Thor protected the tavern without breaking furniture."));
  assert.ok(improved.relationship.goalIds.includes("quest-1"));
  assert.ok(improved.relationship.relatedIds.includes("tavern"));

  const canonical = applyCanonicalChanges(base, [{
    id: "change-relationship-shift",
    operation: "update",
    domain: "relationships",
    targetId: "rel-barkeep-thor",
    summary: "The barkeep now trusts Thor after the restraint shown in the brawl.",
    data: {
      shift: "major_improve",
      linkedGoalId: "quest-1",
      relatedIds: ["tavern"],
    },
  }]);
  const canonicalRelationship = canonical.campaign.relationships.find((relationship) => relationship.id === "rel-barkeep-thor");
  assert.equal(canonical.applied.length, 1);
  assert.equal(canonicalRelationship.state, "friendly");
  assert.ok(canonicalRelationship.memory.includes("The barkeep now trusts Thor after the restraint shown in the brawl."));

  const newlyCreated = applyCanonicalChanges(base, [{
    id: "change-new-relationship",
    operation: "add",
    domain: "relationship",
    summary: "The River Guild becomes suspicious of Thor.",
    data: {
      sourceId: "river-guild",
      targetId: "thor",
      state: "distrustful",
      factionIds: ["river-guild"],
    },
  }]);
  const newRelationship = newlyCreated.campaign.relationships.find((relationship) => relationship.sourceId === "river-guild");
  assert.equal(newRelationship.state, "distrustful");
  assert.ok(newRelationship.relatedIds.includes("river-guild"));
}

function testFactionAndLocationMemoryEngine() {
  const base = {
    ...campaignFixture(),
    factions: [{
      id: "river-guild",
      name: "River Guild",
      memory: ["The guild knows Thor helped Osric."],
    }],
    places: [{
      id: "ford-market",
      name: "Ford Market",
      memory: ["A flood damaged the lower dock."],
    }],
  };

  const factionMemory = applyFactionMemory(base, {
    id: "river-guild",
    memory: "The guild suspects someone in Thor's party knows about relic smuggling.",
    beliefs: ["Thor is useful but disruptive."],
    linkedGoalId: "quest-escort",
    placeIds: ["ford-market"],
  }, { now: "2026-01-01T00:00:00.000Z" });
  assert.ok(factionMemory.faction.memory.includes("The guild suspects someone in Thor's party knows about relic smuggling."));
  assert.ok(factionMemory.faction.beliefs.includes("Thor is useful but disruptive."));
  assert.ok(factionMemory.faction.goalIds.includes("quest-escort"));
  assert.ok(factionMemory.faction.relatedIds.includes("ford-market"));

  const locationMemory = applyLocationMemory(base, {
    id: "ford-market",
    memory: "The broken dock has become a visible reminder of the failed crossing.",
    scars: ["Half the lower stairs are still missing."],
    factionIds: ["river-guild"],
  }, { now: "2026-01-01T00:00:00.000Z" });
  assert.ok(locationMemory.place.memory.includes("The broken dock has become a visible reminder of the failed crossing."));
  assert.ok(locationMemory.place.scars.includes("Half the lower stairs are still missing."));
  assert.ok(locationMemory.place.relatedIds.includes("river-guild"));

  const canonical = applyCanonicalChanges(base, [
    {
      id: "change-faction-memory",
      operation: "update",
      domain: "factions",
      targetId: "river-guild",
      summary: "The River Guild starts watching Thor's party.",
      data: {
        memory: "The River Guild starts watching Thor's party.",
        beliefs: ["Thor may expose their smuggling route."],
        linkedGoalId: "quest-escort",
      },
    },
    {
      id: "change-location-scar",
      operation: "update",
      domain: "places",
      targetId: "ford-market",
      summary: "The ferry landing is scarred by the flood.",
      data: {
        scars: ["The ferry landing stairs are cracked and slick."],
        factionIds: ["river-guild"],
      },
    },
  ]);
  assert.equal(canonical.applied.length, 2);
  assert.ok(canonical.campaign.factions.find((faction) => faction.id === "river-guild").beliefs.includes("Thor may expose their smuggling route."));
  assert.ok(canonical.campaign.places.find((place) => place.id === "ford-market").scars.includes("The ferry landing stairs are cracked and slick."));
}

function testLargeCampaignContextPackStaysBounded() {
  const campaign = transitionScene({
    ...campaignFixture(),
    people: [
      ...campaignFixture().people,
      ...Array.from({ length: 800 }, (_, index) => ({
        id: `person-${index}`,
        name: `Person ${index}`,
        role: index % 2 ? "market contact" : "old road witness",
        notes: [`Long campaign person note ${index}`],
      })),
    ],
    places: [
      ...campaignFixture().places,
      ...Array.from({ length: 400 }, (_, index) => ({
        id: `place-${index}`,
        name: `Place ${index}`,
        summary: `A remembered location from earlier play ${index}.`,
      })),
    ],
    quests: [
      ...campaignFixture().quests,
      ...Array.from({ length: 300 }, (_, index) => ({
        id: `quest-${index}`,
        title: `Old thread ${index}`,
        status: index % 5 === 0 ? "completed" : "active",
        stakes: `Historical campaign pressure ${index}.`,
      })),
    ],
    relationships: [
      ...Array.from({ length: 1200 }, (_, index) => ({
        id: `rel-large-${index}`,
        sourceId: index % 3 === 0 ? "tavern" : `person-${index % 800}`,
        targetId: index % 7 === 0 ? "quest-1" : `place-${index % 400}`,
        type: "history",
        notes: [`Relationship history ${index}`],
      })),
      {
        id: "rel-large-current",
        sourceId: "thor",
        targetId: "quest-1",
        type: "current_pressure",
        notes: ["Thor's current choice matters to the active quest."],
      },
    ],
    timeline: [
      ...Array.from({ length: 1200 }, (_, index) => ({
        id: `event-large-${index}`,
        title: `Old event ${index}`,
        summary: `A long-ago event ${index}.`,
        relatedIds: index % 9 === 0 ? ["tavern"] : [`person-${index % 800}`],
      })),
      {
        id: "event-large-current",
        title: "Current thread pressure",
        summary: "Thor's current tavern choice points at the active quest.",
        relatedIds: ["thor", "tavern", "quest-1"],
      },
    ],
  }, {
    id: "scene-large-context",
    title: "Large campaign focused scene",
    type: "social",
    locationId: "tavern",
    presentPartyMemberIds: ["thor"],
    presentPeopleIds: ["barkeep"],
    activeQuestIds: ["quest-1"],
    tensions: ["The current table beat must not drown in old campaign history."],
  });

  const started = performance.now();
  const contextPack = buildContextPack(campaign);
  const durationMs = performance.now() - started;
  const serialized = JSON.stringify(contextPack);
  const sceneFocus = contextPack.sections.find((section) => section.kind === "scene_focus");

  assert.ok(durationMs < 1000, `large context pack should build under 1000ms, got ${Math.round(durationMs)}ms`);
  assert.ok(serialized.length < 70000, `context pack should stay bounded, got ${serialized.length} chars`);
  assert.ok(sceneFocus, "large context pack should include Scene Focus");
  assert.match(sceneFocus.entries.join(" "), /Thor's current choice matters|Current thread pressure/);
  assert.equal(contextPack.sections.some((section) => section.entries.length > 20), false, "sections should remain bounded");
}

function testContextPackFormatsStructuredSheetDetails() {
  const campaign = campaignFixture();
  campaign.party[0] = {
    ...campaign.party[0],
    ancestryClass: "Dwarf Cleric",
    spells: [
      { name: "Guidance", level: 0, effect: "Help on an ability check." },
      { name: "Healing Word", level: 1, castingTime: "bonus_action", effect: "Ranged healing." },
    ],
    equipment: {
      armor: "Scale mail",
      weapons: ["Mace", "Shield"],
    },
    inventory: ["Holy symbol", "Healer's kit"],
  };
  const contextPack = buildContextPack(campaign);
  const partyText = contextPack.sections
    .filter((section) => section.kind === "active_party")
    .flatMap((section) => section.entries)
    .join("\n");
  assert.match(partyText, /Guidance/);
  assert.match(partyText, /Healing Word/);
  assert.doesNotMatch(partyText, /\[object Object\]/);
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
  assert.equal(turnFlow.getProjection().hasActiveGeneration, false);
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
  const snapshotConnectedGuest = buildInputComposerProjection({
    clientMode: true,
    campaign,
    guestSession: null,
    guestSnapshot: {
      connection: { status: "connected", partyMemberId: "thor" },
      assignedCharacter: { name: "Thor" },
    },
  });
  assert.equal(snapshotConnectedGuest.inputDisabled, false);
  assert.equal(snapshotConnectedGuest.sendDisabled, true);
  assert.match(snapshotConnectedGuest.placeholder, /Type as Thor/);
  assert.equal(buildInputComposerProjection({
    clientMode: true,
    campaign,
    guestSession: null,
    guestSnapshot: {
      connection: { status: "connected", partyMemberId: "thor" },
      assignedCharacter: { name: "Thor" },
    },
    hasDraftText: true,
  }).sendDisabled, false);

  const guestPendingInput = buildInputComposerProjection({
    clientMode: true,
    campaign,
    guestSession: null,
    guestSnapshot: {
      connection: { status: "connected", partyMemberId: "thor" },
      assignedCharacter: { name: "Thor" },
      pendingInput: { text: "Thor watches the road." },
    },
    tableSession: { phase: tablePhases.WAITING_FOR_DM },
  });
  assert.equal(guestPendingInput.inputDisabled, true);
  assert.equal(guestPendingInput.sendDisabled, true);
  assert.match(guestPendingInput.placeholder, /sent to the host table/i);

  const defaultHostProjection = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
  });
  assert.equal(defaultHostProjection.inputDisabled, false);
  assert.equal(defaultHostProjection.sendDisabled, true);
  assert.equal(defaultHostProjection.placeholder, "Describe what your character does, says, or asks.");
  assert.doesNotMatch(defaultHostProjection.placeholder, /heist|alley/i);
  assert.equal(buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    hasDraftText: true,
    hasSubmitContent: true,
  }).sendDisabled, false);

  const openingCampaign = {
    ...campaign,
    scene: { status: "campaign_start" },
    sessionLog: { messages: [] },
  };
  const openingCampaignHostProjection = buildInputComposerProjection({
    campaign: openingCampaign,
    turnProjection: { canSubmit: true },
  });
  assert.equal(openingCampaignHostProjection.inputDisabled, true);
  assert.equal(openingCampaignHostProjection.sendDisabled, true);
  assert.match(openingCampaignHostProjection.placeholder, /Start Adventure/);

  const openingHostProjection = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    tableSession: { phase: tablePhases.OPENING_READY },
  });
  assert.equal(openingHostProjection.inputDisabled, true);
  assert.equal(openingHostProjection.sendDisabled, true);
  assert.match(openingHostProjection.placeholder, /Start Adventure/);

  const openingCampaignGuestProjection = buildInputComposerProjection({
    clientMode: true,
    campaign: openingCampaign,
    guestSnapshot: {
      connection: { status: "connected", partyMemberId: "thor" },
      assignedCharacter: { name: "Thor" },
    },
  });
  assert.equal(openingCampaignGuestProjection.inputDisabled, true);
  assert.equal(openingCampaignGuestProjection.sendDisabled, true);
  assert.match(openingCampaignGuestProjection.placeholder, /opening scene/);

  const hostWaitingForDm = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    tableSession: { phase: tablePhases.WAITING_FOR_DM },
  });
  assert.equal(hostWaitingForDm.inputDisabled, true);
  assert.equal(hostWaitingForDm.sendDisabled, true);
  assert.match(hostWaitingForDm.placeholder, /DM is thinking/i);

  const hostRecovery = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    tableSession: { phase: tablePhases.RECOVERY },
  });
  assert.equal(hostRecovery.inputDisabled, true);
  assert.equal(hostRecovery.sendDisabled, true);
  assert.match(hostRecovery.placeholder, /Review the DM response/i);

  const hostPartyVote = buildInputComposerProjection({
    campaign,
    turnProjection: { canSubmit: true },
    tableSession: { phase: tablePhases.PARTY_VOTE },
  });
  assert.equal(hostPartyVote.inputDisabled, false);
  assert.equal(hostPartyVote.sendDisabled, true);
  assert.match(hostPartyVote.placeholder, /party vote/i);

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
  assert.match(hostProjection.placeholder, /Choose Thor's action/);

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
    hasSubmitContent: true,
    collectStagedRemoteInputs: () => [{ characterId: "karl", text: "Karl fires." }],
    findPartyMember: (id) => campaign.party.find((member) => member.id === id),
    isHostControlledPartyRecord: (member) => member.controllerKind === controllerKinds.HOST,
    labelById: (id) => campaign.party.find((member) => member.id === id)?.name ?? id,
  });
  assert.equal(remoteStaged.inputDisabled, true);
  assert.equal(remoteStaged.sendDisabled, false);
  assert.match(remoteStaged.placeholder, /remote action is staged/i);
}

function testGuestAutoResolveController() {
  const campaign = {
    id: "campaign-1",
    multiplayer: {
      localTable: { running: true, tableId: "table-1", sessionId: "session-1" },
      settings: {
        requireGuestActionApproval: false,
        holdGuestActionsForGroupInput: false,
      },
    },
  };
  const stagedInputs = [{ id: "input-1", characterName: "Renn", text: "Renn checks the road.", ready: true }];

  assert.equal(shouldScheduleGuestAutoResolve(), true);
  assert.equal(shouldScheduleGuestAutoResolve({ clientMode: true }), false);
  assert.equal(shouldScheduleGuestAutoResolve({ hasGuestHostBaseUrl: true }), false);
  assert.equal(shouldScheduleGuestAutoResolve({ campaignWizardCreating: true }), false);

  const ready = buildGuestAutoResolvePlan({ campaign, stagedInputs });
  assert.equal(ready.shouldResolve, true);
  assert.equal(ready.reason, "ready");
  assert.match(ready.activityText, /Renn sent an action/);
  assert.deepEqual(ready.inputs, stagedInputs);
  assert.deepEqual(buildGuestAutoResolvePin(campaign), {
    campaignId: "campaign-1",
    tableId: "table-1",
    sessionId: "session-1",
  });
  assert.equal(guestAutoResolvePinMatches(campaign, buildGuestAutoResolvePin(campaign)), true);
  assert.equal(guestAutoResolvePinMatches(campaign, {
    campaignId: "campaign-2",
    tableId: "table-1",
    sessionId: "session-1",
  }), false);
  assert.equal(buildGuestAutoResolvePlan({
    campaign,
    expectedPin: { campaignId: "campaign-2", tableId: "table-1", sessionId: "session-1" },
    stagedInputs,
  }).reason, "stale_table_session");

  assert.equal(buildGuestAutoResolvePlan({ campaign: null, stagedInputs }).reason, "local_table_not_running");
  assert.equal(buildGuestAutoResolvePlan({ campaign, campaignWizardCreating: true, stagedInputs }).reason, "campaign_wizard_creating");
  assert.equal(buildGuestAutoResolvePlan({
    campaign: { multiplayer: { localTable: { running: true }, settings: { requireGuestActionApproval: true } } },
    stagedInputs,
  }).reason, "approval_required");
  assert.equal(buildGuestAutoResolvePlan({
    campaign: { multiplayer: { localTable: { running: true }, settings: { holdGuestActionsForGroupInput: true } } },
    stagedInputs,
  }).reason, "group_input_hold");
  assert.equal(buildGuestAutoResolvePlan({ campaign, autoResolvingGuestInputs: true, stagedInputs }).reason, "already_resolving");
  assert.equal(buildGuestAutoResolvePlan({ campaign, turnFlowBlocksNewTurn: true, stagedInputs }).reason, "turn_flow_busy");
  assert.equal(buildGuestAutoResolvePlan({ campaign, hostDraftText: "Host is typing", stagedInputs }).reason, "host_draft_present");
  assert.equal(buildGuestAutoResolvePlan({ campaign, stagedInputs: [] }).reason, "no_staged_inputs");

  const group = buildGuestAutoResolvePlan({
    campaign,
    stagedInputs: [
      { id: "input-1", characterName: "Renn", text: "Renn checks the road." },
      { id: "input-2", characterName: "Mira", text: "Mira keeps watch." },
    ],
  });
  assert.equal(group.shouldResolve, true);
  assert.match(group.activityText, /Guest actions received/);
}

function testCampaignAdoptionController() {
  const initial = buildCampaignAdoptionPlan({ previousCampaignId: null, nextCampaignId: "campaign-1" });
  assert.equal(initial.initialLoad, true);
  assert.equal(initial.campaignChanged, false);
  assert.equal(initial.resetTurnCarryover, true);
  assert.equal(initial.resetTurnFlow, false);
  assert.equal(initial.resetPlayLogLimit, false);

  const same = buildCampaignAdoptionPlan({ previousCampaignId: "campaign-1", nextCampaignId: "campaign-1" });
  assert.equal(same.initialLoad, false);
  assert.equal(same.campaignChanged, false);
  assert.equal(same.resetTurnCarryover, false);
  assert.equal(same.resetTurnFlow, false);
  assert.equal(same.resetPlayLogLimit, false);

  const changed = buildCampaignAdoptionPlan({ previousCampaignId: "campaign-1", nextCampaignId: "campaign-2" });
  assert.equal(changed.initialLoad, false);
  assert.equal(changed.campaignChanged, true);
  assert.equal(changed.resetTurnCarryover, true);
  assert.equal(changed.resetTurnFlow, true);
  assert.equal(changed.resetPlayLogLimit, true);
  assert.equal(changed.turnFlowResetReason, "campaign_changed");

  const empty = buildCampaignAdoptionPlan({ previousCampaignId: null, nextCampaignId: null });
  assert.equal(empty.resetTurnCarryover, false);
  assert.equal(empty.resetTurnFlow, false);
}

function testMultiplayerPollingController() {
  assert.equal(buildMultiplayerPollingPlan({
    activeGeneration: true,
    localTableRunning: true,
  }).action, multiplayerPollingActions.REFRESH_HOST_SNAPSHOT_DURING_GENERATION);

  assert.equal(buildMultiplayerPollingPlan({
    activeGeneration: true,
    guestWaitingRoomMode: true,
    localTableRunning: true,
    waitingRoomGuestId: "waiting-1",
  }).action, multiplayerPollingActions.IDLE_DURING_GENERATION);

  assert.equal(buildMultiplayerPollingPlan({
    guestHostBaseUrl: "http://127.0.0.1:4173",
    guestConnectionId: "conn-1",
  }).action, multiplayerPollingActions.REFRESH_GUEST_SNAPSHOT);

  assert.equal(buildMultiplayerPollingPlan({
    guestWaitingRoomMode: true,
    waitingRoomGuestId: "waiting-1",
  }).action, multiplayerPollingActions.REFRESH_WAITING_ROOM_STATUS);

  assert.equal(buildMultiplayerPollingPlan({
    guestWaitingRoomMode: true,
  }).action, multiplayerPollingActions.REFRESH_GUEST_LOBBY_PREVIEW);

  assert.equal(buildMultiplayerPollingPlan({
    campaignWizardCreating: true,
    localTableRunning: true,
  }).action, multiplayerPollingActions.IDLE_CAMPAIGN_WIZARD_CREATING);

  assert.equal(buildMultiplayerPollingPlan({
    localTableRunning: true,
  }).action, multiplayerPollingActions.POLL_LOCAL_TABLE);

  assert.equal(buildMultiplayerPollingPlan().action, multiplayerPollingActions.IDLE);
}

function testTurnSubmitGates() {
  const busyGate = buildTurnSubmitGate({
    turnProjection: { hasActiveGeneration: true },
  });
  assert.equal(busyGate.blocked, true);
  assert.equal(busyGate.reason, "busy");
  assert.match(busyGate.activityText, /current DM response/i);

  const repairGate = buildTurnSubmitGate({
    turnProjection: { hasActiveGeneration: false },
    repair: { reason: "needs review" },
  });
  assert.equal(repairGate.blocked, true);
  assert.equal(repairGate.reason, "repair_required");

  const allowedDuringRepair = buildTurnSubmitGate({
    repair: { reason: "needs review" },
    allowDuringRepair: true,
  });
  assert.equal(allowedDuringRepair.blocked, false);

  const preOpeningGate = buildTurnSubmitGate({
    turnProjection: { hasActiveGeneration: false },
    readyForOpening: true,
  });
  assert.equal(preOpeningGate.blocked, true);
  assert.equal(preOpeningGate.reason, "opening_not_started");
  assert.match(preOpeningGate.activityText, /Start Adventure/);
  assert.equal(buildTurnSubmitGate({
    turnProjection: { hasActiveGeneration: false },
    readyForOpening: true,
    allowBeforeOpening: true,
  }).blocked, false);

  const emptyGate = buildTurnContentGate({ playerMessage: "   ", playerInputs: [] });
  assert.equal(emptyGate.blocked, true);
  assert.equal(emptyGate.reason, "empty");

  assert.equal(buildTurnContentGate({
    playerInputs: [{ characterId: "thor", text: "Thor watches the road." }],
  }).blocked, false);
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

function testTableSessionEnginePhases() {
  const campaign = campaignFixture();
  const roleplay = buildTableSessionProjection({ campaign });
  assert.equal(roleplay.phase, tablePhases.ROLEPLAY);
  assert.equal(roleplay.headline, "Roleplay");

  const openingReady = buildTableSessionProjection({
    campaign: {
      ...campaign,
      scene: { status: "campaign_start" },
      sessionLog: { messages: [] },
    },
    turnProjection: { state: "awaiting_input", canSubmit: true },
  });
  assert.equal(openingReady.phase, tablePhases.OPENING_READY);
  assert.equal(openingReady.headline, "Ready To Start");
  assert.match(openingReady.nextStep, /Start Adventure/);

  const waitingForPlayer = buildTableSessionProjection({
    campaign,
    turnProjection: { state: "awaiting_input", canSubmit: true },
  });
  assert.equal(waitingForPlayer.phase, tablePhases.WAITING_FOR_PLAYER);
  assert.equal(waitingForPlayer.expectedActor.kind, "player");

  const waitingForDm = buildTableSessionProjection({
    campaign,
    providerActivity: { state: "working", phase: "dm_thinking", text: "DM is thinking..." },
  });
  assert.equal(waitingForDm.phase, tablePhases.WAITING_FOR_DM);
  assert.equal(waitingForDm.expectedActor.kind, "dm");

  const partyVote = buildTableSessionProjection({
    campaign: {
      ...campaign,
      multiplayer: {
        ...campaign.multiplayer,
        choiceVotes: [{ id: "vote-1", playerId: "p1", optionId: "choice-a" }],
      },
    },
  });
  assert.equal(partyVote.phase, tablePhases.PARTY_VOTE);
  assert.match(partyVote.nextStep, /host makes the final/i);

  const guestWaiting = buildTableSessionProjection({
    campaign: {
      ...campaign,
      multiplayer: {
        ...campaign.multiplayer,
        waitingGuests: [{ id: "guest-1", displayName: "Mira", status: "waiting" }],
      },
    },
  });
  assert.equal(guestWaiting.phase, tablePhases.WAITING_FOR_GUEST);
  assert.equal(guestWaiting.multiplayer.waitingGuestCount, 1);

  const review = buildTableSessionProjection({
    campaign,
    reviewBatch: { proposedChanges: [{ id: "change-1", status: "pending" }] },
  });
  assert.equal(review.phase, tablePhases.HOST_REVIEW);
  assert.equal(review.review.count, 1);

  const recovery = buildTableSessionProjection({
    campaign,
    repair: { reason: "invalid response" },
  });
  assert.equal(recovery.phase, tablePhases.RECOVERY);
  assert.equal(recovery.recovery.active, true);

  const cancelledGeneration = buildTableSessionProjection({
    campaign,
    providerActivity: {
      state: "idle",
      phase: "dm_cancelled",
      text: "DM response canceled.",
      raw: "Local generation canceled",
    },
    turnProjection: { state: "awaiting_input", canSubmit: true },
  });
  assert.equal(cancelledGeneration.phase, tablePhases.WAITING_FOR_PLAYER);
  assert.equal(cancelledGeneration.recovery.active, false);

  const combatCampaign = startCombat(campaign, {
    reroll: false,
    initiativeRolls: [
      { actorId: "thor", total: 18 },
      { actorId: "sy", total: 14 },
      { actorId: "karl", total: 10 },
    ],
  });
  const combat = buildTableSessionProjection({ campaign: combatCampaign });
  assert.equal(combat.phase, tablePhases.COMBAT);
  assert.equal(combat.combat.active, true);
  assert.equal(combat.expectedActor.kind, "combat_actor");

  const guestSent = buildTableSessionProjection({
    campaign,
    clientMode: true,
    guestSession: { connectionId: "conn-1" },
    guestSnapshot: { pendingInput: { id: "input-1", text: "I help." } },
  });
  assert.equal(guestSent.phase, tablePhases.WAITING_FOR_DM);
  assert.match(guestSent.nextStep, /host table/i);
}

function testTableFocusProjection() {
  const empty = buildTableFocusProjection();
  assert.equal(empty.phase, "idle");
  assert.equal(empty.focusRail, "none");
  assert.equal(empty.surfaces.party, "supporting");
  assert.equal(empty.surfaces.notebook, "supporting");
  assert.equal(empty.nowText, "Now: Table Ready");
  assert.equal(empty.nextText, "Next: Continue the scene.");

  const combat = buildTableFocusProjection({
    phase: tablePhases.COMBAT,
    tone: "waiting",
    headline: "Combat Round 2: Mira",
    nextStep: "Mira takes the active combat turn.",
  });
  assert.equal(combat.focusRail, "combat");
  assert.equal(combat.surfaces.combat, "primary");
  assert.equal(combat.surfaces.notebook, "quiet");
  assert.equal(combat.surfaces.tableTalk, "quiet");
  assert.equal(combat.label, "Combat");
  assert.equal(combat.nowText, "Now: Combat Round 2: Mira");
  assert.equal(combat.nextText, "Next: Mira takes the active combat turn.");

  const recovery = buildTableFocusProjection({
    phase: tablePhases.RECOVERY,
    tone: "attention",
    headline: "Recovery Needed",
    nextStep: "Host chooses Try Again, Details, or Use Anyway.",
  });
  assert.equal(recovery.focusRail, "review");
  assert.equal(recovery.surfaces.campaign, "primary");
  assert.equal(recovery.surfaces.party, "quiet");
  assert.equal(recovery.tone, "attention");

  const waitingForGuest = buildTableFocusProjection({
    phase: tablePhases.WAITING_FOR_GUEST,
    headline: "Guest Waiting",
    nextStep: "Host seats Mira.",
  });
  assert.equal(waitingForGuest.focusRail, "party");
  assert.equal(waitingForGuest.surfaces.party, "primary");
  assert.equal(waitingForGuest.surfaces.tableTalk, "supporting");

  const waitingForDm = buildTableFocusProjection({
    phase: tablePhases.WAITING_FOR_DM,
    headline: "DM Thinking",
    nextStep: "Wait for the DM response.",
  });
  assert.equal(waitingForDm.focusRail, "story");
  assert.equal(waitingForDm.surfaces.party, "quiet");
  assert.equal(waitingForDm.surfaces.notebook, "quiet");
}

function testTableOpeningController() {
  const readyCampaign = {
    scene: { status: "campaign_start" },
    sessionLog: { messages: [] },
  };
  assert.equal(isCampaignReadyForOpening(readyCampaign), true);
  assert.equal(isCampaignReadyForOpening(readyCampaign, { isHost: false }), false);
  assert.equal(isCampaignReadyForOpening({
    ...readyCampaign,
    sessionLog: { messages: [{ role: "system", body: "Ready table note." }] },
  }), true);
  assert.equal(isCampaignReadyForOpening({
    ...readyCampaign,
    sessionLog: { messages: [{ role: "dm", body: "The adventure starts." }] },
  }), false);
  assert.equal(isCampaignReadyForOpening({
    ...readyCampaign,
    scene: { status: "active" },
  }), false);

  const visible = buildStartAdventureOpeningProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: false },
  });
  assert.equal(visible.visible, true);
  assert.equal(visible.disabled, false);

  const requested = buildStartAdventureOpeningProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: false },
    openingRequested: true,
  });
  assert.equal(requested.visible, false);
  assert.equal(requested.disabled, true);

  const repairing = buildStartAdventureOpeningProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: true, hasActiveGeneration: false },
  });
  assert.equal(repairing.visible, false);
  assert.equal(repairing.disabled, true);

  const busy = buildStartAdventureOpeningProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: true },
  });
  assert.equal(busy.visible, true);
  assert.equal(busy.disabled, true);
  assert.match(busy.title, /already starting/i);

  const prompt = buildAdventureOpeningPrompt();
  assert.match(prompt, /Begin the first session/);
  assert.match(prompt, /Do not invent a player choice/);
  assert.match(prompt, /Do not speak, think, move, scan, ready weapons, or make tactical choices/);
  assert.match(prompt, /neutral presence only/);
  assert.match(prompt, /Bad: 'Rowan watches/);
  assert.match(prompt, /Prefer choices\.options: \[\]/);
}

function testTableActionProjection() {
  const readyCampaign = {
    scene: { status: "campaign_start" },
    sessionLog: { messages: [] },
  };
  const freshTable = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: false },
    isHost: true,
  });
  assert.equal(freshTable.startAdventure.visible, true);
  assert.equal(freshTable.startAdventure.disabled, false);
  assert.equal(freshTable.seatGuest.visible, false);
  assert.equal(freshTable.cancelGeneration.visible, false);
  assert.equal(freshTable.nudgeDm.disabled, true);
  assert.match(freshTable.nudgeDm.title, /Start Adventure/);

  const guestsWaiting = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: false },
    waitingGuests: [{ id: "guest-1", displayName: "Remotie" }],
    isHost: true,
  });
  assert.equal(guestsWaiting.seatGuest.visible, true);
  assert.equal(guestsWaiting.seatGuest.text, "Seat Remotie");
  assert.match(guestsWaiting.seatGuest.title, /waiting for a character seat/i);

  const recovery = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: true, hasActiveGeneration: false },
    repair: { reason: "needs review" },
    preferredProvider: "bridge",
    isHost: true,
  });
  assert.equal(recovery.repairRetry.visible, true);
  assert.equal(recovery.repairUseAnyway.visible, true);
  assert.equal(recovery.repairUseAnyway.disabled, false);
  assert.equal(recovery.readLatest.visible, false);
  assert.equal(recovery.startAdventure.visible, false);

  const hardBlocked = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: true, hasActiveGeneration: false },
    repair: { reason: "controlled character agency" },
    repairHardBlocked: true,
    isHost: true,
  });
  assert.equal(hardBlocked.repairUseAnyway.disabled, true);
  assert.match(hardBlocked.repairUseAnyway.title, /Try Again/);

  const bridge = buildTableActionProjection({
    campaign: { scene: { status: "active" }, sessionLog: { messages: [{ role: "dm" }] } },
    turnProjection: { hasRepair: false, hasActiveGeneration: false, canNudge: true },
    preferredProvider: "bridge",
    isHost: true,
  });
  assert.equal(bridge.readLatest.visible, true);
  assert.equal(bridge.nudgeDm.disabled, false);

  const generating = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: true },
    isHost: true,
  });
  assert.equal(generating.cancelGeneration.visible, true);
  assert.equal(generating.cancelGeneration.disabled, false);
  assert.equal(generating.nudgeDm.disabled, true);

  const requestedOpening = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: false },
    isHost: true,
    openingRequested: true,
  });
  assert.equal(requestedOpening.startAdventure.visible, false);

  const guestClient = buildTableActionProjection({
    campaign: readyCampaign,
    turnProjection: { hasRepair: false, hasActiveGeneration: true },
    waitingGuests: [{ id: "guest-1", displayName: "Remotie" }],
    preferredProvider: "bridge",
    isHost: false,
  });
  assert.equal(guestClient.startAdventure.visible, false);
  assert.equal(guestClient.seatGuest.visible, false);
  assert.equal(guestClient.cancelGeneration.visible, false);
  assert.equal(guestClient.readLatest.visible, false);
  assert.equal(guestClient.nudgeDm.disabled, true);
  assert.match(guestClient.nudgeDm.title, /Only the host/);

  assert.equal(buildNudgeDmCommandGate({ isHost: true, readyForOpening: false, turnProjection: { hasActiveGeneration: false } }).blocked, false);
  const guestNudgeGate = buildNudgeDmCommandGate({ isHost: false });
  assert.equal(guestNudgeGate.blocked, true);
  assert.equal(guestNudgeGate.reason, "guest_mode");
  assert.match(guestNudgeGate.activityText, /Only the host/);
  const preOpeningDmNudgeGate = buildNudgeDmCommandGate({
    isHost: true,
    readyForOpening: true,
    turnProjection: { hasActiveGeneration: false },
  });
  assert.equal(preOpeningDmNudgeGate.blocked, true);
  assert.equal(preOpeningDmNudgeGate.reason, "opening_not_started");
  assert.match(preOpeningDmNudgeGate.activityText, /Start Adventure/);
  const busyNudgeGate = buildNudgeDmCommandGate({ isHost: true, turnProjection: { hasActiveGeneration: true } });
  assert.equal(busyNudgeGate.blocked, true);
  assert.equal(busyNudgeGate.reason, "busy");
  const preOpeningCompanionNudgeGate = buildAiCompanionNudgeGate({
    isHost: true,
    readyForOpening: true,
    companionName: "Mira",
  });
  assert.equal(preOpeningCompanionNudgeGate.blocked, true);
  assert.equal(preOpeningCompanionNudgeGate.reason, "opening_not_started");
  assert.match(preOpeningCompanionNudgeGate.activityText, /Start Adventure/);
  const wrongCombatCompanionNudgeGate = buildAiCompanionNudgeGate({
    isHost: true,
    readyForOpening: false,
    inCombat: true,
    isActiveCombatTurn: false,
    companionName: "Mira",
  });
  assert.equal(wrongCombatCompanionNudgeGate.blocked, true);
  assert.equal(wrongCombatCompanionNudgeGate.reason, "combat_wrong_turn");
  const readyCompanionNudgeGate = buildAiCompanionNudgeGate({
    isHost: true,
    readyForOpening: false,
  });
  assert.equal(readyCompanionNudgeGate.blocked, false);

  assert.equal(buildStartAdventureCommandGate({
    isHost: true,
    readyForOpening: true,
    turnProjection: { hasActiveGeneration: false },
  }).blocked, false);
  const guestStartGate = buildStartAdventureCommandGate({ isHost: false, readyForOpening: true });
  assert.equal(guestStartGate.blocked, true);
  assert.equal(guestStartGate.reason, "guest_mode");
  const startedGate = buildStartAdventureCommandGate({ isHost: true, readyForOpening: false });
  assert.equal(startedGate.blocked, true);
  assert.equal(startedGate.reason, "already_started");
  const busyStartGate = buildStartAdventureCommandGate({
    isHost: true,
    readyForOpening: true,
    turnProjection: { hasActiveGeneration: true },
  });
  assert.equal(busyStartGate.blocked, true);
  assert.equal(busyStartGate.reason, "busy");
  const requestedStartGate = buildStartAdventureCommandGate({
    isHost: true,
    readyForOpening: true,
    openingRequested: true,
  });
  assert.equal(requestedStartGate.blocked, true);
  assert.equal(requestedStartGate.reason, "requested_this_session");
}

function testDmNudgeController() {
  const prompt = buildDmNudgePrompt();
  assert.match(prompt, /without inventing a player action/);
  assert.match(prompt, /Prefer choices\.options: \[\]/);
  assert.match(prompt, /do not roll, deal damage, move them, speak for them, choose their tactic, or advance initiative/i);
  assert.match(prompt, /LoreKeeper resolves enemy mechanics before narration/);
  assert.doesNotMatch(prompt, /bar fight simulator/i);
}

function testPlayLogProjectionBoundsLongSessions() {
  const messages = Array.from({ length: defaultPlayLogVisibleLimit + 75 }, (_, index) => ({
    id: `msg-${index + 1}`,
    body: `Message ${index + 1}`,
  }));
  const projection = buildPlayLogProjection(messages);
  assert.equal(projection.visibleMessages.length, defaultPlayLogVisibleLimit);
  assert.equal(projection.visibleMessages[0].id, "msg-76");
  assert.equal(projection.hiddenCount, 75);
  assert.equal(projection.hasEarlierMessages, true);
  assert.equal(projection.nextVisibleLimit, defaultPlayLogVisibleLimit + playLogPageSize);

  const expanded = buildPlayLogProjection(messages, { visibleLimit: projection.nextVisibleLimit });
  assert.equal(expanded.hiddenCount, 0);
  assert.equal(expanded.visibleMessages[0].id, "msg-1");
}

function testMessageLifecycleProjection() {
  assert.deepEqual(
    buildMessageLifecycleProjection({ role: "player", data: { lifecycle: "turn_waiting_for_dm" } }),
    {
      label: "Waiting for DM",
      title: "This action is submitted. The table is waiting for the DM response.",
      tone: "waiting",
    },
  );
  assert.deepEqual(
    buildMessageLifecycleProjection({ role: "party", data: { status: "pending_model_submit", hostStaged: true, holdForGroup: true } }),
    {
      label: "Waiting for group turn",
      title: "This guest action reached the host table and is waiting for the grouped table turn.",
      tone: "waiting",
    },
  );
  assert.equal(
    buildMessageLifecycleProjection({ role: "party", data: { status: "guest_input_dropped" } })?.label,
    "Dropped",
  );
  assert.deepEqual(
    buildMessageLifecycleProjection({ role: "player", data: { lifecycle: "turn_failed", failureReason: "Ollama exploded" } }),
    {
      label: "DM failed",
      title: "Ollama exploded",
      tone: "error",
    },
  );
  assert.equal(buildMessageLifecycleProjection({ role: "dm", data: { lifecycle: "turn_waiting_for_dm" } }), null);
}

function testPendingInputActionProjection() {
  const pendingInputs = [
    { id: "pending-1", ready: true, passed: false, text: "I check the door." },
    { id: "passed-1", ready: true, passed: true, text: "I wait." },
    { id: "empty-1", ready: true, passed: false, text: "" },
  ];
  assert.deepEqual(
    buildPendingInputActionProjection({
      role: "party",
      data: { status: "pending_model_submit", pendingInputId: "pending-1" },
    }, pendingInputs),
    {
      id: "pending-1",
      kind: "stage",
      buttonLabel: "Stage",
      title: "Stage this character action for the next Send Turn",
    },
  );
  assert.deepEqual(
    buildPendingInputActionProjection({
      role: "party",
      data: { status: "pending_model_submit", pendingInputId: "pending-1", hostStaged: true, holdForGroup: true },
    }, pendingInputs),
    {
      id: "pending-1",
      kind: "drop",
      status: "Holding for group turn",
      buttonLabel: "Drop",
      title: "Remove this staged guest action without sending it to the DM",
    },
  );
  assert.equal(buildPendingInputActionProjection({
    role: "party",
    data: { status: "pending_model_submit", pendingInputId: "passed-1" },
  }, pendingInputs), null);
  assert.equal(buildPendingInputActionProjection({
    role: "party",
    data: { status: "submitted_to_model", pendingInputId: "pending-1" },
  }, pendingInputs), null);
}

function testPartySuggestionController() {
  const message = {
    id: "beat-1",
    role: "party",
    title: "Mira",
    body: "Mira checks the ridge.",
    data: { characterId: "mira", suggestedByProvider: true },
  };
  assert.deepEqual(
    buildPartyApprovalProjection(message, { providerAuthored: true }),
    { status: "pending_party_approval" },
  );
  assert.equal(buildPartyApprovalProjection(message, { providerAuthored: false }), null);
  assert.equal(buildPartyApprovalProjection(message, { providerAuthored: true, hidden: true }), null);
  assert.equal(
    buildPartyApprovalProjection({ ...message, data: { status: "unknown_status" } }, { providerAuthored: true }),
    null,
  );

  const pendingControls = buildPartyApprovalControlsProjection(
    { status: "pending_party_approval" },
    { resolveGate: { blocked: true, activityText: "Start Adventure first" } },
  );
  assert.deepEqual(pendingControls.actions.map((action) => action.label), ["Stage For DM", "Resolve Now", "Pass"]);
  assert.equal(pendingControls.actions[1].disabled, true);
  assert.equal(pendingControls.actions[1].title, "Start Adventure first");

  const approvedControls = buildPartyApprovalControlsProjection({ status: "approved_party_input" });
  assert.equal(approvedControls.statusLabel, "Staged for next Send Turn");
  assert.equal(approvedControls.canUndo, true);
  assert.equal(partySuggestionStatusMeta("rejected_party_input"), "Passed by host");
  assert.deepEqual(partySuggestionActivityForStatus("approved_party_input"), {
    text: "Companion beat staged; add host text or press Send Turn when ready.",
    state: "waiting",
  });
  assert.deepEqual(partySuggestionInputFromMessage(message), {
    type: "approved_party_contribution",
    id: "beat-1",
    characterId: "mira",
    characterName: "Mira",
    text: "Mira checks the ridge.",
    ready: true,
  });
}

function testChoiceVoteController() {
  const block = {
    type: "choices",
    prompt: "Which road?",
    scope: "vote",
    items: ["Take the ridge", "Circle the ravine", "Wait for dawn"],
    options: [
      { id: "ridge", text: "Take the ridge" },
      { id: "ravine", text: "Circle the ravine" },
      { id: "dawn", text: "Wait for dawn" },
    ],
  };
  const key = choicePanelKey(block);
  const votes = [
    { choiceKey: key, optionId: "ridge", playerId: "p1", characterId: "c1" },
    { choiceKey: key, optionId: "ridge", playerId: "p2", characterId: "c2" },
    { choiceKey: key, optionId: "ravine", playerId: "p3", characterId: "c3" },
    { choiceKey: "old", optionId: "dawn", playerId: "p4" },
  ];
  assert.equal(currentChoiceVotesForBlock(block, votes).length, 3);
  assert.equal(choiceVoteCounts(block, votes).get("ridge"), 2);
  const state = choiceVoteState(block, votes);
  assert.equal(state.leader.label, "A");
  assert.equal(state.tied, false);
  assert.match(choiceVoteSummaryText(block, votes), /Table leaning - A: 2, B: 1\. Leading: A\./);
  assert.deepEqual(leadingChoiceVoteEntry(block, { choiceVotes: votes, isHost: true }), state.leader);
  assert.equal(leadingChoiceVoteEntry(block, { choiceVotes: votes, isHost: false }), null);
  assert.equal(currentGuestVoteForChoice(block, { choiceVotes: votes, playerId: "p3" })?.optionId, "ravine");
  assert.equal(choiceSelectionActivityText("A", 2), "Selected choice A with 2 votes; edit or send");

  const tiedVotes = [
    { choiceKey: key, optionId: "ridge", playerId: "p1" },
    { choiceKey: key, optionId: "ravine", playerId: "p2" },
  ];
  assert.equal(choiceVoteState(block, tiedVotes).tied, true);
  assert.match(choiceVoteSummaryText(block, tiedVotes), /Tie at the table/);
  assert.equal(leadingChoiceVoteEntry(block, { choiceVotes: tiedVotes, isHost: true }), null);

  assert.equal(extractChoiceTokenText("I choose A and 3."), "A and 3");
  assert.deepEqual(parseChoiceIndexes("A and 3 and A", 3), [0, 2]);
  const selection = buildChoiceSelectionFromText({ text: "choose A + C", panel: block });
  assert.deepEqual(selection.labels, ["A", "C"]);
  assert.deepEqual(selection.selectedOptionIds, ["ridge", "dawn"]);
  assert.equal(selection.inWorldText, "I choose A + C: Take the ridge Also, Wait for dawn");
  assert.equal(choiceSelectionInWorldText(selection, "A + C"), selection.inWorldText);
  assert.equal(
    choiceSelectionInWorldText(selection, "I choose A + C and point Mira toward the safest ridge approach."),
    "I choose A + C and point Mira toward the safest ridge approach.",
  );
  assert.equal(pendingSelectionMatchesText(selection, "I choose ridge because the high ground matters"), true);
  assert.match(buildChoiceSelectionMeta(selection, { actualAction: selection.inWorldText }), /Resolve the selected choice text/);
  assert.match(
    buildChoiceSelectionMeta(selection, { actualAction: "I choose A, but quietly scout first.", inCombat: true }),
    /combat action for the active initiative actor/,
  );
  assert.equal(choiceAudienceLabel({ scope: "combat_actor", forActor: "Vessa" }), "Combat turn: Vessa");
  assert.equal(choiceAudienceLabel({ allowVote: true }), "Party vote - host breaks ties");
  assert.deepEqual(structuredChoicesForMessage({
    choices: {
      prompt: "How does Vessa press the advantage?",
      scope: "combat_actor",
      forActor: "Vessa",
      options: [
        { id: "strike", text: "Strike with the spear", legalOptionId: "attack" },
        { label: "Hold the line" },
      ],
    },
  })?.options.map((option) => [option.id, option.text]), [
    ["strike", "Strike with the spear"],
    ["B", "Hold the line"],
  ]);
  const structuredBlock = structuredChoiceBlockFromMessageData({
    choiceOwner: true,
    choices: {
      prompt: "Who takes point?",
      scope: "party",
      options: [
        { id: "vessa", actor: "Vessa", text: "Lead from the front" },
      ],
    },
  });
  assert.equal(structuredBlock.audienceLabel, "For the party");
  assert.deepEqual(structuredBlock.items, ["Vessa: Lead from the front"]);
}

function testMessageBlockController() {
  const parsedChoices = buildMessageBlocks(
    "The road narrows. What do you do?\n\nA) Take the ridge\nB) Circle the ravine",
    "dm",
  );
  assert.equal(parsedChoices.at(-1).type, "choices");
  assert.equal(parsedChoices.at(-1).prompt, "What do you do?");
  assert.deepEqual(parsedChoices.at(-1).items, ["Take the ridge", "Circle the ravine"]);

  const structuredChoices = buildMessageBlocks(
    "Visible prose.\n\n1. stale parsed choice\n2. another stale parsed choice",
    "dm",
    {
      choiceOwner: true,
      choices: {
        prompt: "How does Vessa press?",
        scope: "combat_actor",
        forActor: "Vessa",
        options: [
          { id: "strike", text: "Strike with the spear" },
          { id: "guard", text: "Guard Mira" },
        ],
      },
    },
  );
  assert.equal(structuredChoices.filter((block) => block.type === "choices").length, 1);
  assert.equal(structuredChoices.at(-1).audienceLabel, "Combat turn: Vessa");
  assert.deepEqual(structuredChoices.at(-1).items, ["Strike with the spear", "Guard Mira"]);
  assert.deepEqual(structuredChoices.at(-1).options.map((option) => option.id), ["strike", "guard"]);

  const mechanics = buildMessageBlocks(
    "The beast lunges, but Vessa keeps her shield high.\n\nAttack Roll: d20+4 = 13 vs AC 16. Damage: 1d6+2 = 5 slashing.",
    "dm",
  );
  assert.equal(mechanics.some((block) => block.type === "paragraph" && /shield high/.test(block.text)), true);
  const mechanicsBlock = mechanics.find((block) => block.type === "mechanics");
  assert.ok(mechanicsBlock, "mechanics rows should render as a table-facing roll panel");
  assert.deepEqual(mechanicsBlock.rows.map((row) => row.label), ["Attack Roll", "Damage"]);

  const latest = latestChoiceBlockFromMessages([
    { role: "player", body: "I look around." },
    { role: "dm", body: "The trail forks. What do you do?\n\n1. Follow the torchlight\n2. Stay hidden" },
  ]);
  assert.equal(latest.prompt, "What do you do?");
  assert.deepEqual(latest.items, ["Follow the torchlight", "Stay hidden"]);
}

function testTurnRepairController() {
  const technicalRepair = {
    reason: "sceneStatus.awaitingPlayer must be boolean.",
    source: "ollama",
    meta: "Ollama qwen3; 12s",
    turn: { turnId: "turn-1" },
    providerResult: { model: "qwen3" },
  };
  assert.equal(tableRepairReason(technicalRepair.reason), "the DM response did not pass LoreKeeper's table checks");
  assert.equal(turnRepairStatusText(technicalRepair), "DM response needs review: the DM response did not pass LoreKeeper's table checks");
  assert.match(turnRepairActivityText(technicalRepair), /Try Again, Details, or Use Anyway/);
  assert.equal(tableRepairReason("The DM contradicted the last seated guest."), "The DM contradicted the last seated guest.");
  assert.equal(isHardBlockedTurnRepair(technicalRepair), false);
  assert.equal(buildTurnRepairActionGate({
    repair: technicalRepair,
    action: "retry",
    activeGeneration: true,
  }).reason, "busy");
  assert.equal(buildTurnRepairActionGate({
    repair: {},
    action: "retry",
  }).reason, "no_repair_turn");

  const agencyRepair = {
    reason: "table[1] appears to speak, decide, or act for controlled party member Thora without submitted controller input",
    responseText: "Thora speaks without player input.",
    validationErrors: [
      "proposedChanges[0].operation must be one of: add, update, remove, note",
      "table[1] appears to speak, decide, or act for controlled party member Thora without submitted controller input",
    ],
  };
  assert.equal(tableRepairReason(agencyRepair.reason), "the DM response tried to speak or act for Thora");
  assert.equal(isHardBlockedTurnRepair(agencyRepair), true);
  assert.match(turnRepairActivityText(agencyRepair), /blocked it because it spoke or acted for a controlled character/);
  assert.match(turnRepairBlockedMessage(agencyRepair), /controlled party member/);
  assert.doesNotMatch(turnRepairActivityText(agencyRepair), /Use Anyway/);
  assert.equal(buildTurnRepairActionGate({
    repair: {},
    action: "use_anyway",
  }).reason, "no_reviewed_response");
  const agencyGate = buildTurnRepairActionGate({
    repair: agencyRepair,
    action: "use_anyway",
  });
  assert.equal(agencyGate.reason, "hard_blocked");
  assert.equal(agencyGate.inspect, true);

  const dialog = turnRepairUseAnywayDialog();
  assert.equal(dialog.title, "Use This DM Response?");
  assert.doesNotMatch(dialog.message, /JSON|contract|import/i);

  const options = turnRepairImportOptions(technicalRepair);
  assert.equal(options.source, "ollama");
  assert.equal(options.autoCommit, false);
  assert.match(options.meta, /used after review warning/);
  assert.equal(options.data.contractWarning, technicalRepair.reason);
}

function testStagedInputRecoveryController() {
  const imported = buildStagedInputRecoveryPlan({
    runResult: { imported: true },
    approvedPartyInputs: [{ id: "approved-1" }],
    stagedRemoteInputs: [{ id: "remote-1" }],
    pendingInputs: [{ id: "pending-1" }],
  });
  assert.equal(imported.approvedParty.action, stagedInputRecoveryActions.MARK_SUBMITTED);
  assert.equal(imported.stagedRemote.action, stagedInputRecoveryActions.CLEAR_PENDING);
  assert.equal(imported.pendingRemote.action, stagedInputRecoveryActions.CLEAR_PENDING);
  assert.equal(imported.pendingRemote.inputs[0].id, "pending-1");

  const failed = buildStagedInputRecoveryPlan({
    runResult: { imported: false, needsRepair: true },
    approvedPartyInputs: [{ id: "approved-1" }],
    stagedRemoteInputs: [{ id: "remote-1" }],
    pendingInputs: [{ id: "pending-1" }],
  });
  assert.equal(failed.approvedParty.action, stagedInputRecoveryActions.KEEP_STAGED);
  assert.equal(failed.stagedRemote.action, stagedInputRecoveryActions.KEEP_STAGED);
  assert.equal(failed.pendingRemote.action, stagedInputRecoveryActions.KEEP_STAGED);

  assert.equal(providerFailureReason({ error: new Error("model exploded") }), "model exploded");
  assert.equal(providerFailureReason({ error: "bad json" }), "bad json");
  assert.equal(providerFailureReason({ timedOut: true }), "The DM response timed out.");
  assert.equal(providerFailureReason({ canceled: true }), "The DM response was canceled.");
  assert.equal(providerFailureReason({ needsRepair: true }), "The DM response needs review before it can resolve this input.");
  assert.equal(providerFailureReason({}), "The DM did not resolve this staged input.");
}

function testHostResponseReviewProjection() {
  const idle = buildHostResponseReviewProjection();
  assert.equal(idle.state, "idle");
  assert.match(idle.nextStep, /Return to the table/i);
  assert.doesNotMatch(idle.nextStep, /paste box/i);

  const idleFallback = buildManualResponseFallbackProjection();
  assert.equal(idleFallback.state, "idle");
  assert.equal(idleFallback.visible, false);
  assert.equal(idleFallback.open, false);
  assert.match(idleFallback.hint, /Rare fallback/i);
  assert.doesNotMatch(`${idleFallback.summary} ${idleFallback.hint}`, /JSON|contract|import|paste box/i);

  const repair = buildHostResponseReviewProjection({
    repair: {
      reason: "choices.options[0] must be string",
      responseText: "The scene continues.",
    },
  });
  assert.equal(repair.state, "repair");
  assert.match(repair.title, /Table Check/);
  assert.match(repair.body, /table checks/);
  assert.doesNotMatch(`${repair.title} ${repair.body} ${repair.nextStep}`, /JSON|contract|import/i);
  assert.match(repair.nextStep, /Try Again/);
  assert.match(repair.nextStep, /Use Anyway/);
  const repairFallback = buildManualResponseFallbackProjection({
    repair: { reason: "choices.options[0] must be string", responseText: "The scene continues." },
  });
  assert.equal(repairFallback.state, "repair");
  assert.equal(repairFallback.visible, false);
  assert.equal(repairFallback.open, false);
  assert.match(repairFallback.hint, /Optional fallback/i);
  assert.doesNotMatch(repairFallback.hint, /JSON|contract|import|paste box/i);

  const copiedRepairFallback = buildManualResponseFallbackProjection({
    repair: { reason: "choices.options[0] must be string", responseText: "The scene continues." },
    copiedResponseAvailable: true,
  });
  assert.equal(copiedRepairFallback.visible, true);
  assert.equal(copiedRepairFallback.open, false);

  const draftFallback = buildManualResponseFallbackProjection({
    repair: { reason: "choices.options[0] must be string", responseText: "The scene continues." },
    hasDraftText: true,
  });
  assert.equal(draftFallback.visible, true);
  assert.equal(draftFallback.open, true);
  assert.match(draftFallback.summary, /Ready/);

  const agencyRepair = buildHostResponseReviewProjection({
    repair: {
      reason: "table[2] appears to speak, decide, or act for controlled party member Rowan without submitted controller input",
      responseText: "Rowan decides for the party.",
    },
  });
  assert.equal(agencyRepair.state, "repair");
  assert.match(agencyRepair.body, /tried to speak or act for Rowan/);
  assert.doesNotMatch(agencyRepair.body, /table\[2\]/);
  assert.match(agencyRepair.nextStep, /without taking over a controlled character/);
  assert.doesNotMatch(agencyRepair.nextStep, /Use Anyway/);

  const changes = buildHostResponseReviewProjection({
    reviewBatch: {
      proposedChanges: [{ status: "pending" }, { status: "committed" }],
    },
  });
  assert.equal(changes.state, "changes");
  assert.equal(changes.pendingChanges, 1);
  assert.match(changes.body, /1 proposed state change/);
  const changesFallback = buildManualResponseFallbackProjection({ reviewBatch: { proposedChanges: [{ status: "pending" }] } });
  assert.equal(changesFallback.visible, false);
  assert.match(changesFallback.hint, /review the waiting table changes/i);
}

function testProviderImportOutcomeProjection() {
  const warning = buildProviderImportOutcome({ extractionError: "missing state block" });
  assert.equal(warning.state, "imported_with_warning");
  assert.match(warning.bridgeStatus, /missing state block/);
  assert.equal(warning.activityState, "waiting");

  const saved = buildProviderImportOutcome({ autoCommitAppliedCount: 2, source: "local" });
  assert.equal(saved.state, "state_saved");
  assert.match(saved.bridgeStatus, /2 table changes saved/);
  assert.equal(saved.activityText, "Table updated from local response");

  const review = buildProviderImportOutcome({ proposedChangesCount: 1 });
  assert.equal(review.state, "review_pending");
  assert.match(review.bridgeStatus, /1 proposed table change awaiting review/);

  const imported = buildProviderImportOutcome();
  assert.equal(imported.state, "imported");
  assert.equal(imported.activityState, "idle");

  const emptyLatest = decideLatestProviderImport({ latestText: "   " });
  assert.equal(emptyLatest.action, "skip");
  assert.equal(emptyLatest.reason, "empty");
  assert.match(emptyLatest.bridgeStatus, /No DM response/);

  const unchangedLatest = decideLatestProviderImport({
    latestText: "same answer",
    newerThanText: " same answer ",
  });
  assert.equal(unchangedLatest.action, "skip");
  assert.equal(unchangedLatest.reason, "unchanged");

  const duplicateLatest = decideLatestProviderImport({
    latestText: "already imported",
    lastImportedProviderText: "already imported",
    requireNewerThanLastImport: true,
  });
  assert.equal(duplicateLatest.action, "skip");
  assert.equal(duplicateLatest.reason, "duplicate");

  const newLatest = decideLatestProviderImport({
    latestText: "  new answer  ",
    newerThanText: "old answer",
    lastImportedProviderText: "old imported answer",
    requireNewerThanLastImport: true,
  });
  assert.equal(newLatest.action, "import");
  assert.equal(newLatest.text, "new answer");
  assert.equal(newLatest.activityState, "working");

  const cleanedProviderText = cleanProviderResponseForPlay(`**DM:** The ridge goes quiet.

What do you do? 1. Follow the tracks 2. Hold position

sceneStatus: {"mode":"exploration"}`);
  assert.doesNotMatch(cleanedProviderText, /sceneStatus/);
  assert.doesNotMatch(cleanedProviderText, /\*\*DM:\*\*/);
  assert.match(cleanedProviderText, /1\. Follow the tracks/);

  const suppressed = [];
  const splitMessages = splitProviderTableMessages(
    "Mira: I draw my sword.\n\nRenn: I can scout ahead.\n\nThe road waits.",
    {
      party: [
        { id: "mira", name: "Mira", controllerKind: "host" },
        { id: "renn", name: "Renn", controllerKind: "ai_companion" },
      ],
    },
    [],
    {
      isHostControlledPartyRecord: (member) => member?.controllerKind === "host",
      partyControllerKind: (member) => member?.controllerKind || "ai_companion",
      onHostCharacterSuppressed: (entry) => suppressed.push(entry),
    },
  );
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].name, "Mira");
  assert.equal(splitMessages.some((message) => message.title === "Mira"), false);
  assert.equal(splitMessages.some((message) => message.title === "Renn" && message.data.controllerKind === "ai_companion"), true);

  const choicePlan = buildProviderImportPlan({
    campaign: { id: "campaign-1", party: [] },
    responseText: "DM text",
    cleanedText: "DM text",
    extraction: { proposedChanges: [] },
    tableMessages: [
      { role: "dm", title: "DM", body: "What do you do?", source: "provider_response" },
      { role: "party", title: "Companion", body: "I can scout.", source: "provider_response" },
    ],
    options: {
      data: {
        choices: { prompt: "Choose", options: ["Scout", "Wait"] },
        turnResponse: { requestId: "turn-response-1" },
        providerResult: { requestId: "provider-1" },
      },
    },
  });
  assert.equal(choicePlan.proposedChanges.length, 0);
  assert.equal(choicePlan.reviewBatch.campaignId, "campaign-1");
  assert.equal(choicePlan.messagePlans[0].data.choiceOwner, true);
  assert.equal(choicePlan.messagePlans[0].data.providerRunId, "provider-1");
  assert.equal(choicePlan.messagePlans[1].data.choiceOwner, undefined);
  assert.equal(choicePlan.messagePlans[0].data.import.proposedChanges, 0);

  const combatStartPlan = buildProviderImportPlan({
    campaign: {
      id: "campaign-2",
      scene: { mode: "exploration", summary: "A road ambush begins." },
      party: [{ id: "mira", name: "Mira", hp: { current: 12, max: 12 }, armorClass: 15 }],
      combat: { inCombat: false, turnOrder: [], initiative: [], currentTurnId: null },
    },
    responseText: "A wolf lunges from the brush. Roll initiative.",
    cleanedText: "A wolf lunges from the brush. Roll initiative.",
    extraction: { proposedChanges: [] },
    tableMessages: [{ role: "dm", title: "DM", body: "A wolf lunges from the brush. Roll initiative.", source: "provider_response" }],
    options: { autoCommit: true, data: { turnResponse: { flags: { startsCombat: true } } } },
  });
  assert.ok(combatStartPlan.proposedChanges.some((change) => change.domain === "scene"));
  assert.ok(combatStartPlan.proposedChanges.some((change) => change.domain === "combat"));

  assert.equal(shouldAutoApproveProviderChange({ importance: "minor", visibility: "player_visible" }), true);
  assert.equal(shouldAutoApproveProviderChange({ importance: "major", visibility: "player_visible" }), false);
  assert.equal(shouldAutoApproveProviderChange({ status: "rejected", importance: "minor" }), false);
  assert.equal(shouldAutoApproveProviderChange({ validation: { valid: false }, importance: "minor" }), false);
  assert.equal(shouldAutoApproveProviderChange({
    domain: "quests",
    visibility: "dm_only",
    data: { threadType: "story_arc" },
  }), true);
  const safeBatch = prepareAutoCommitReviewBatch({
    id: "review-1",
    proposedChanges: [
      { id: "minor", importance: "minor", visibility: "player_visible", status: "pending" },
      { id: "major", importance: "major", visibility: "player_visible", status: "pending" },
    ],
  });
  assert.equal(safeBatch.proposedChanges.find((change) => change.id === "minor").status, "approved");
  assert.equal(safeBatch.proposedChanges.find((change) => change.id === "major").status, "pending");
  assert.equal(prepareAutoCommitReviewBatch({ proposedChanges: [{ importance: "major" }] }), null);
}

function testProviderResultController() {
  assert.equal(providerResultMeta(null), "");
  assert.equal(
    providerResultMeta({ model: "qwen3:14b", durationMs: 2450, contextSize: 12000 }),
    "Ollama qwen3:14b; 2s; context 12000 chars",
  );
  assert.equal(contractIssueFromProviderResult(null), "missing provider result");
  assert.equal(contractIssueFromProviderResult({ ok: true }), "");
  assert.equal(contractIssueFromProviderResult({ parseError: "Bad JSON" }), "Bad JSON");
  assert.equal(contractIssueFromProviderResult({ validationErrors: ["table[0].text required"] }), "table[0].text required");
}

function testProviderSettingsController() {
  assert.deepEqual(
    resolveProviderSettings({ preferredProvider: "chatgpt", outputLimit: 120 }, { selectedModel: "qwen3:8b" }),
    {
      preferredProvider: "bridge",
      selectedModel: "qwen3:8b",
      generationTimeoutMs: 120000,
      outputLimit: 1800,
      fastMode: false,
      ollamaBaseUrl: "http://127.0.0.1:11434",
    },
  );

  const ollama = {
    state: "selected_model_missing",
    selectedModel: "qwen3:14b",
    models: [{ name: "qwen3:4b" }, { model: "llama3.1:8b" }],
    recommendedModels: [{ id: "qwen3:14b" }, { id: "qwen3:4b" }],
  };
  const options = buildModelOptionsProjection({ selectedModel: "qwen3:14b", ollama });
  assert.equal(options[0].value, "qwen3:14b");
  assert.equal(options[0].selected, true);
  assert.match(options[0].label, /download needed/);
  assert.ok(options.some((option) => option.value === "qwen3:4b" && /installed/.test(option.label)));

  const missingSummary = selectedModelSummaryProjection({ selectedModel: "qwen3:14b", ollama });
  assert.equal(missingSummary.installed, false);
  assert.equal(missingSummary.pullHidden, false);
  assert.equal(missingSummary.pullDisabled, false);
  assert.ok(missingSummary.chips.includes("Not Downloaded"));

  const installedSettings = campaignCreationProviderSettings(
    { preferredProvider: "ollama", selectedModel: "qwen3:14b" },
    { selectedControlModel: "qwen3:4b", installedModels: ["qwen3:4b"] },
  );
  assert.equal(installedSettings.selectedModel, "qwen3:4b");
  assert.equal(
    campaignCreationProviderSettings({ preferredProvider: "bridge", selectedModel: "qwen3:14b" }).selectedModel,
    "qwen3:14b",
  );

  assert.equal(providerStatusLabel({ state: "ready", selectedModel: "qwen3:14b" }), "Ollama ready: Qwen3 14B");
  assert.match(providerSetupHint({ state: "ollama_not_running" }, "qwen3:14b"), /Start Ollama/);
}

function testJoinPreviewProjection() {
  const setupLine = "The table is set at Old South Road. Mira, Renn are at the table. Premise: A caravan road bends toward an old watchtower before sunset. Next: invite anyone else.";
  assert.equal(
    compactJoinPreviewLine(setupLine),
    "A caravan road bends toward an old watchtower before sunset.",
  );

  const projection = buildJoinPreviewProjection({
    campaignTitle: "Audit Table Road",
    campaignSummary: "A fallback campaign premise.",
    scene: {
      currentPlaceId: "place-starting-location",
      immediateSituation: setupLine,
    },
    places: [
      { id: "place-starting-location", name: "Old South Road" },
      { id: "draft-starting-place", name: "draft-starting-place" },
    ],
    party: [{ name: "Mira" }, { name: "Renn" }],
    quests: [{ title: "Open the first thread" }, { title: "Find the missing courier" }],
  });
  assert.equal(projection.title, "Audit Table Road");
  assert.equal(projection.summary, "A caravan road bends toward an old watchtower before sunset.");
  assert.deepEqual(projection.facts, [
    "Scene: Old South Road",
    "Party: Mira, Renn",
    "Threads: Find the missing courier",
  ]);
  assert.match(projection.hint, /Mira/);

  const hiddenRecordIdPlace = buildJoinPreviewProjection({
    scene: { currentPlaceId: "place-abcd1234", immediateSituation: "Fog gathers near the ford." },
    places: [],
  });
  assert.deepEqual(hiddenRecordIdPlace.facts, []);
}

function testProviderChatProjection() {
  const unavailable = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.EXTENSION_UNAVAILABLE);
  assert.equal(unavailable.bridgeMode, "manual");
  assert.match(unavailable.copy.successMessage, /ChatGPT helper not connected/);
  assert.match(unavailable.activityText, /handoff/);

  const login = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.LOGIN_REQUIRED);
  assert.equal(login.bridgeMode, "extension");
  assert.match(login.copy.failureMessage, /DM Instructions/);
  assert.equal(login.activityState, "error");

  const noResponse = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.NO_RESPONSE);
  assert.match(noResponse.copy.successMessage, /ChatGPT DM did not return/);
  assert.match(noResponse.activityText, /No DM response/);

  const failed = buildCampaignChatFallbackPlan(campaignChatFallbackReasons.RUN_FAILED);
  assert.equal(failed.bridgeMode, "manual");
  assert.match(failed.copy.failureMessage, /ChatGPT DM failed/);

  const progress = buildCampaignChatProgressSteps();
  assert.deepEqual(progress.map((step) => step.delayMs), [8000, 30000, 65000]);
  assert.ok(progress.every((step) => step.activityState === "waiting"));
  assert.match(progress[2].bridgeStatus, /keep waiting or start a new DM chat/);
  assert.doesNotMatch(progress[2].bridgeStatus, /fallback/i);
}

function testTableTalkProjection() {
  const olderCampaignTalk = [
    { id: "c1", text: "old host note", createdAt: "2026-06-18T10:00:00.000Z" },
    { id: "c2", text: "older host note", createdAt: "2026-06-18T10:01:00.000Z" },
  ];
  const fresherSnapshotTalk = [
    { id: "s1", text: "guest lands now", createdAt: "2026-06-18T10:02:00.000Z" },
  ];
  assert.equal(
    freshestTableTalkMessages(fresherSnapshotTalk, olderCampaignTalk),
    fresherSnapshotTalk,
    "route-side table talk with a newer timestamp should win even if the local campaign snapshot has more old rows",
  );

  const longerCampaignTalk = [
    { id: "c1", text: "same latest one", createdAt: "2026-06-18T10:02:00.000Z" },
    { id: "c2", text: "same latest two", createdAt: "2026-06-18T10:02:00.000Z" },
  ];
  assert.equal(
    freshestTableTalkMessages(fresherSnapshotTalk, longerCampaignTalk),
    longerCampaignTalk,
    "when latest timestamps match, the fuller table-talk history should win",
  );

  assert.equal(
    currentTableTalkMessages({
      guestSnapshot: {
        tableState: { tableTalk: [{ id: "guest-table-state", createdAt: "2026-06-18T10:03:00.000Z" }] },
        tableTalk: [{ id: "legacy-guest-field", createdAt: "2026-06-18T10:04:00.000Z" }],
      },
    })[0].id,
    "guest-table-state",
    "guest snapshots should prefer the public tableState table-talk feed",
  );

  assert.deepEqual(currentTableTalkMessages({ campaign: { multiplayer: { tableTalk: "bad data" } } }), []);
}

function testCharacterAutocompleteProjection() {
  assert.deepEqual(splitAncestryClass("Dwarf Soldier"), { ancestry: "Dwarf", characterClass: "Soldier" });

  const preserved = completeCharacterSeed({
    name: "Thor",
    ancestry: "Dwarf",
    characterClass: "Scout",
    concept: "Keeps watch for the company.",
  }, {
    campaign: {
      summary: "A dwarf soldier company guards a dangerous road.",
      party: [{ id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 2 }],
    },
  });
  assert.equal(preserved.name, "Thor");
  assert.equal(preserved.ancestry, "Dwarf");
  assert.equal(preserved.characterClass, "Scout");
  assert.equal(preserved.concept, "Keeps watch for the company.");
  assert.match(preserved.integrationPrompt, /Oskar/);

  const regenerated = completeCharacterSeed({
    name: "Thor",
    ancestry: "Dwarf",
    characterClass: "Scout",
    concept: "Old generated pitch that should be replaced.",
    integrationPrompt: "Old generated party glue.",
    hostIntegrationPrompt: "Old generated DM note.",
  }, {
    campaign: {
      summary: "A dwarf soldier company guards a dangerous road.",
      party: [{ id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 2 }],
    },
    regenerate: true,
  });
  assert.equal(regenerated.name, "Thor");
  assert.equal(regenerated.ancestry, "Dwarf");
  assert.equal(regenerated.characterClass, "Scout");
  assert.notEqual(regenerated.concept, "Old generated pitch that should be replaced.");
  assert.notEqual(regenerated.integrationPrompt, "Old generated party glue.");
  assert.notEqual(regenerated.hostIntegrationPrompt, "Old generated DM note.");
  assert.match(regenerated.concept, /Thor/);
  assert.match(regenerated.integrationPrompt, /Oskar/);

  const rerolled = completeCharacterSeed({
    name: "Thor",
    ancestry: "Dwarf",
    characterClass: "Scout",
    concept: regenerated.concept,
    integrationPrompt: regenerated.integrationPrompt,
    hostIntegrationPrompt: regenerated.hostIntegrationPrompt,
  }, {
    campaign: {
      summary: "A dwarf soldier company guards a dangerous road.",
      party: [{ id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 2 }],
    },
    regenerate: true,
    regenerateNonce: 2,
  });
  assert.notEqual(rerolled.concept, regenerated.concept);
  assert.notEqual(rerolled.integrationPrompt, regenerated.integrationPrompt);
  assert.notEqual(rerolled.hostIntegrationPrompt, regenerated.hostIntegrationPrompt);
  assert.equal(rerolled.name, "Thor");
  assert.equal(rerolled.ancestry, "Dwarf");
  assert.equal(rerolled.characterClass, "Scout");

  const themed = completeCharacterSeed({
    ancestry: "Dwarf",
  }, {
    campaign: {
      summary: "A small dwarf soldier party keeps the pass open.",
      party: [
        { id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 3 },
        { id: "ingrid", name: "Ingrid", ancestry: "Dwarf", characterClass: "Soldier", level: 3 },
      ],
    },
  });
  assert.equal(themed.ancestry, "Dwarf");
  assert.equal(themed.characterClass, "Soldier");
  assert.equal(themed.level, 3);
  assert.match(themed.backstory, /dwarf soldier theme/i);
  assert.match(themed.integrationPrompt, /Oskar, Ingrid/);

  const partySet = buildPartyTemplateCharacters({
    name: "Oskar",
    ancestry: "Dwarf",
    characterClass: "Soldier",
    level: 2,
  }, {
    campaign: {
      summary: "A dwarf soldier company opens a mountain road.",
      party: [{ id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 2 }],
    },
    count: 3,
  });
  assert.equal(partySet.length, 3);
  assert.ok(partySet.every((member) => member.ancestry === "Dwarf"));
  assert.ok(partySet.every((member) => member.characterClass === "Soldier"));
  assert.ok(partySet.every((member) => member.controllerKind === "ai_companion"));
  assert.equal(new Set(partySet.map((member) => member.name)).size, 3);
  assert.match(partySet[0].integrationPrompt, /Oskar/);

  const secondPartySet = buildPartyTemplateCharacters({
    name: "Oskar",
    ancestry: "Dwarf",
    characterClass: "Soldier",
    level: 2,
  }, {
    campaign: {
      summary: "A dwarf soldier company opens a mountain road.",
      party: [{ id: "oskar", name: "Oskar", ancestry: "Dwarf", characterClass: "Soldier", level: 2 }],
    },
    startingPartyMembers: partySet,
    count: 3,
  });
  const allCrewNames = [...partySet, ...secondPartySet].map((member) => member.name);
  assert.equal(new Set(allCrewNames).size, allCrewNames.length, "repeated Add Crew should not clone existing crew names");
  assert.ok(secondPartySet.every((member) => !partySet.some((existing) => existing.name === member.name)));

  const manyCrew = buildPartyTemplateCharacters({
    ancestry: "Dwarf",
    characterClass: "Soldier",
  }, {
    startingPartyMembers: [
      { name: "Oskar" },
      { name: "Bram" },
      { name: "Tilli" },
      { name: "Ingrid" },
      { name: "Bren" },
      { name: "Thora" },
      { name: "Dagna" },
      { name: "Kelda" },
      { name: "Marn" },
      { name: "Hilda" },
      { name: "Rurik" },
      { name: "Sella" },
    ],
    count: 2,
  });
  assert.equal(new Set(manyCrew.map((member) => member.name)).size, manyCrew.length, "exhausted name pools should still produce unique fallback names");
}

function testCharacterSeedRules() {
  assert.equal(clampLevel("bad"), 1);
  assert.equal(clampLevel(99), 20);
  assert.equal(classifyCharacterProfile("frost druid with a wolf companion").key, "druid");

  const ranger = buildFiveELiteCharacterSeed({
    name: "Renn",
    ancestry: "Human",
    characterClass: "Ranger",
    concept: "A scout who reads the ridge line.",
    level: 3,
  });
  assert.equal(ranger.id, "party-renn");
  assert.equal(ranger.level, 3);
  assert.equal(ranger.proficiencyBonus, 2);
  assert.equal(ranger.stats.abilityScores.DEX, 15);
  assert.equal(ranger.attacks.some((attack) => attack.name === "Longbow"), true);
  assert.equal(ranger.equipment.inventory.includes("Quiver of arrows"), true);
  assert.equal(ranger.resources.spellSlots[1].max, 3);

  const frostDruid = buildFiveELiteCharacterSeed({
    name: "Ilyra",
    ancestry: "Elf",
    characterClass: "Druid",
    concept: "A frost-touched wanderer with wolf signs.",
    level: 2,
  });
  assert.equal(frostDruid.spells.some((spell) => spell.name === "Frostbite"), true);
  assert.equal(frostDruid.abilities.includes("Wolf companion bond"), true);
  assert.equal(frostDruid.resources.uses.wildShape.max, 2);
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
  assert.equal(hostProjection.guestLink, "http://192.168.1.24:7347/guest");
  assert.equal(hostProjection.canCopyGuestLink, true);
  assert.match(hostProjection.flowSummary, /queued/i);
  assert.match(hostProjection.pendingInputs[0].statusLabel, /queued for the DM/i);

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
  assert.match(approvalProjection.flowSummary, /your review/i);
  assert.match(approvalProjection.pendingInputs[0].statusLabel, /Waiting for host review/);

  campaign.multiplayer.settings.requireGuestActionApproval = false;
  campaign.multiplayer.settings.holdGuestActionsForGroupInput = true;
  const holdProjection = buildMultiplayerSessionProjection({ campaign, locationPort: "4173" });
  assert.equal(holdProjection.holdGuestActionsForGroupInput, true);
  assert.equal(holdProjection.resolvePartyInputsLabel, "Send Group Turn");
  assert.match(holdProjection.flowSummary, /group turn/i);
  assert.match(holdProjection.pendingInputs[0].statusLabel, /Held for the group turn/);

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
  assert.match(guestProjection.flowSummary, /table first/i);
  assert.match(guestProjection.pendingInputs[0].statusLabel, /Sent to the table/);
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

function testSettingsSurfaceProjection() {
  const appSurface = buildSettingsSurfaceProjection({ tab: "app", mode: "app" });
  assert.deepEqual(appSurface.allowedTabs, ["app"]);
  assert.equal(appSurface.activeTab, "app");
  assert.equal(appSurface.copy.title, "App Preferences");

  const aiSurface = buildSettingsSurfaceProjection({ tab: "ai", mode: "ai" });
  assert.deepEqual(aiSurface.allowedTabs, ["ai"]);
  assert.equal(aiSurface.activeTab, "ai");
  assert.equal(aiSurface.copy.title, "DM Voice");

  const tableSurface = buildSettingsSurfaceProjection({ tab: "friends", mode: "table" });
  assert.deepEqual(tableSurface.allowedTabs, ["friends"]);
  assert.equal(tableSurface.activeTab, "friends");
  assert.equal(tableSurface.copy.title, "Friends And Seats");

  const coerced = buildSettingsSurfaceProjection({ tab: "app", mode: "table" });
  assert.equal(coerced.activeTab, "friends");
  assert.equal(coerced.mode, "table");

  const diagnosticsSurface = buildSettingsSurfaceProjection({ tab: "troubleshooting", mode: "troubleshooting" });
  assert.deepEqual(diagnosticsSurface.allowedTabs, ["troubleshooting"]);
  assert.equal(diagnosticsSurface.surfaceTarget, "diagnostics");
  assert.equal(diagnosticsSurface.copy.title, "Table Diagnostics");

  const recoverySurface = buildSettingsSurfaceProjection({ tab: "troubleshooting", mode: "recovery" });
  assert.deepEqual(recoverySurface.allowedTabs, ["troubleshooting"]);
  assert.equal(recoverySurface.activeTab, "troubleshooting");
  assert.equal(recoverySurface.visibleTabCount, 1);
  assert.equal(recoverySurface.surfaceTarget, "recovery");
  assert.equal(recoverySurface.copy.title, "Review DM Response");
}

async function testAppJsNoLongerOwnsExtractedStateMachines() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  const combatImportController = await readFile(path.join("app", "combat-import-controller.js"), "utf8");
  const combatPromptRepairController = await readFile(path.join("app", "combat-prompt-repair-controller.js"), "utf8");
  const providerImportController = await readFile(path.join("app", "provider-import-controller.js"), "utf8");
  const providerSettingsController = await readFile(path.join("app", "provider-settings-controller.js"), "utf8");
  const providerResultController = await readFile(path.join("app", "provider-result-controller.js"), "utf8");
  const sceneImportController = await readFile(path.join("app", "scene-import-controller.js"), "utf8");
  const tableFocusController = await readFile(path.join("app", "table-focus-controller.js"), "utf8");
  const playLogController = await readFile(path.join("app", "play-log-controller.js"), "utf8");
  const messageBlockController = await readFile(path.join("app", "message-block-controller.js"), "utf8");
  const partySuggestionController = await readFile(path.join("app", "party-suggestion-controller.js"), "utf8");
  const choiceVoteController = await readFile(path.join("app", "choice-vote-controller.js"), "utf8");
  const tableSessionEngine = await readFile(path.join("src", "engine", "table-session-engine.js"), "utf8");
  assert.equal(/function hostCombatInputGate/.test(appJs), false);
  assert.equal(/function renderConnectedGuests/.test(appJs), false);
  assert.equal(/function latestCommittedReviewBatch/.test(appJs), false);
  assert.match(
    appJs,
    /!turn\?\.playerMessage\?\.trim\(\)\s*&&\s*!turn\?\.playerInputs\?\.length/,
    "local provider runner must accept remote-only structured player inputs",
  );
  assert.match(appJs, /tableTimeline: state\.tableTimeline\.slice\(-80\)/, "renderer diagnostics should include the table-facing timeline");
  assert.match(appJs, /buildPlayLogProjection/, "play log rendering should use a bounded projection for long sessions");
  assert.match(appJs, /renderLoadEarlierMessages/, "older play log entries should remain reachable on demand");
  assert.match(appJs, /buildMessageBlocks/, "play-message body parsing should be projected outside the renderer");
  assert.match(appJs, /latestChoiceBlockFromMessages/, "latest choice lookup should be projected outside the renderer");
  assert.match(messageBlockController, /function normalizeMessageBlocks/, "message block parsing should live in message-block-controller");
  assert.match(messageBlockController, /structuredChoiceBlockFromMessageData/, "structured choices should merge outside app.js");
  assert.doesNotMatch(appJs, /function normalizeMessageBlocks/, "renderer should not own play-message block parsing");
  assert.doesNotMatch(appJs, /function extractChoicePanel/, "renderer should not own choice panel parsing");
  assert.doesNotMatch(appJs, /function textBlockToRenderableBlock/, "renderer should not own message block type parsing");
  assert.match(appJs, /buildMessageLifecycleProjection/, "play bubbles should consume projected lifecycle state");
  assert.doesNotMatch(appJs, /function messageLifecycleForMessage/, "renderer should not own play-message lifecycle wording");
  assert.match(playLogController, /function buildMessageLifecycleProjection/, "play-message lifecycle wording should live in play-log-controller");
  assert.match(appJs, /turn_waiting_for_dm/, "submitted turns should be visibly marked while waiting for the DM");
  assert.match(appJs, /updatePlayerTurnEchoLifecycle/, "submitted turn bubbles should update after provider completion or failure");
  assert.match(appJs, /markPendingPlayerTurnRecovering/, "auto-resumed player turns should get a visible recovery lifecycle before replay");
  assert.match(playLogController, /turn_recovering[\s\S]*?label:\s*"Recovering"/, "recovering player turns should use table-facing lifecycle wording");
  assert.match(appJs, /markRepairTurnRetrying/, "Try Again should mark the original player action as retrying");
  assert.match(appJs, /findPlayerTurnMessageForRepair/, "Try Again should find the original action by repair turn id");
  assert.match(playLogController, /turn_retrying[\s\S]*?label:\s*"Trying again"/, "repair retry bubbles should use table-facing lifecycle wording");
  assert.match(
    appJs,
    /const runResult = await runPromptThroughLocalProvider\(repair\.turn\);[\s\S]*?await updatePlayerTurnEchoLifecycle\(retryMessage\.id/,
    "Try Again should update the original player action after the retry result",
  );
  assert.match(appJs, /renderTableTimelineSummary/, "diagnostics should render a readable table timeline");
  assert.match(appJs, /buildSessionHealthSummary/, "diagnostics should include a plain session health summary");
  assert.match(appJs, /sessionHealth: buildSessionHealthSummary\(\)/, "renderer diagnostics should serialize session health");
  assert.match(tableSessionEngine, /phaseNextStep/, "table session projection should name the next table action");
  assert.match(tableSessionEngine, /Host resolves the staged table input when ready/, "host should get a clear next step for queued guest input");
  assert.match(tableSessionEngine, /takes the active combat turn/, "combat waits should name the active turn");
  assert.match(appJs, /function isActiveAiCompanionCombatTurn/, "AI companion combat nudges should be scoped to their active initiative turn");
  assert.match(appJs, /state\.campaign\.combat\.currentTurnId === member\.id/, "AI companion combat nudge must match the current initiative actor");
  assert.match(appJs, /buildAiCompanionCombatNudgePrompt/, "AI companion combat nudges should request a suggestion, not resolution");
  assert.match(appJs, /Do not roll dice, deal damage, spend resources, apply conditions, move initiative, resolve the action/, "AI companion combat suggestion must not resolve mechanics before host approval");
  assert.match(combatImportController, /if\s*\(!enemies\.length\)\s*{\s*return null;\s*}/, "implicit combat starts must require at least one enemy");
  assert.match(providerImportController, /stripInlineResponseJsonTail/, "provider import cleanup should remove inline provider JSON tails outside the renderer");
  assert.match(choiceVoteController, /function choiceAudienceLabel/, "structured choice panels should project party/character/vote audience metadata outside the renderer");
  assert.doesNotMatch(appJs, /function choiceAudienceLabel/, "renderer should not own structured choice audience labels");
  assert.match(appJs, /choice-audience/, "choice panels should render the selected audience near the prompt");
  assert.equal(/label:\s*"Play"/.test(appJs), false, "AI companion cards should use Nudge instead of a Play button");
  assert.match(
    appJs,
    /label:\s*"Invite"[\s\S]*?label:\s*"Nudge"[\s\S]*?className:\s*"nudge-action"/,
    "AI companion card actions should place Nudge after Invite and use nudge styling",
  );
  assert.match(partySuggestionController, /Stage For DM/, "AI companion approval should read like staging a table beat");
  assert.match(partySuggestionController, /Resolve Now/, "AI companion approval should support immediate DM resolution");
  assert.match(appJs, /resolvePartySuggestionNow/, "AI companion resolve-now flow should be explicit");
  assert.match(partySuggestionController, /partySuggestionInputFromMessage/, "AI companion resolve-now should send a structured party input");
  assert.match(partySuggestionController, /Pass/, "AI companion approval should allow the host to pass on the beat");
  assert.match(partySuggestionController, /Companion beat staged; add host text or press Send Turn when ready\./);
  assert.doesNotMatch(appJs, /Stage this companion beat for the next Send Turn/, "AI companion approval wording should not live in app.js");
  assert.match(appJs, /markApprovedPartyInputsStillStaged/, "failed DM turns should keep approved party inputs visibly staged");
  assert.match(appJs, /markRemoteInputsStillStaged/, "failed DM turns should keep remote party inputs visibly staged");
  assert.match(playLogController, /dm_failed_still_staged[\s\S]*?label:\s*"Still staged"/, "failed staged inputs should use table-facing retry wording");
  assert.match(appJs, /dropPendingRemoteInput/, "host should be able to drop a stale staged guest action");
  assert.match(playLogController, /label:\s*"Dropped"/, "dropped staged guest actions should not read as DM-resolved");
  assert.match(playLogController, /Remove this staged guest action without sending it to the DM/);
  assert.match(appJs, /buildPendingInputActionProjection/, "renderer should consume projected staged-input actions");
  assert.doesNotMatch(appJs, /function pendingInputActionForMessage/, "renderer should not own staged-input action policy");
  assert.match(appJs, /buildStagedInputRecoveryPlan/, "staged input recovery policy should be outside the renderer turn body");
  assert.match(appJs, /applyStagedInputRecoveryPlan/, "renderer should execute the staged input recovery plan");
  assert.doesNotMatch(appJs, /function providerFailureReason/, "staged input failure wording should live outside app.js");
  assert.doesNotMatch(appJs, /else if \(inputs\.length && !runResult\?\.imported\)/, "pending input recovery branching should live in staged-input-recovery-controller");
  assert.match(appJs, /provider-import-controller\.js/, "provider import status policy should live outside the main app renderer");
  assert.match(appJs, /buildProviderImportOutcome/, "renderer should use provider import outcome projection");
  assert.match(appJs, /prepareAutoCommitReviewBatch/, "provider auto-commit policy should live outside the main app renderer");
  assert.match(appJs, /provider-settings-controller\.js/, "DM Voice settings projection should live outside the main app renderer");
  assert.match(providerSettingsController, /function providerStatusLabel/, "DM Voice status labels should live in provider-settings-controller");
  assert.match(providerSettingsController, /function buildModelOptionsProjection/, "DM Voice model option projection should live in provider-settings-controller");
  assert.doesNotMatch(appJs, /function providerStatusLabel/, "renderer should not own DM Voice status labels");
  assert.doesNotMatch(appJs, /function dedupeModelOptions/, "renderer should not own local model option policy");
  assert.doesNotMatch(appJs, /recommendedOllamaModels/, "renderer should not import recommended model policy directly");
  assert.match(appJs, /provider-result-controller\.js/, "provider result validation summary policy should live outside the renderer");
  assert.match(providerResultController, /function contractIssueFromProviderResult/);
  assert.doesNotMatch(appJs, /function contractIssueFromProviderResult/, "renderer should not own provider result contract issue selection");
  assert.doesNotMatch(appJs, /function providerResultMeta/, "renderer should not own provider result metadata copy");
  assert.match(providerImportController, /function parseSpeakerLine/, "provider import speaker splitting should live in the provider import controller");
  assert.doesNotMatch(appJs, /function parseSpeakerLine/, "renderer should not keep stale provider speaker-splitting helpers");
  assert.match(appJs, /provider-chat-controller\.js/, "campaign chat fallback policy should live outside the main app renderer");
  assert.match(appJs, /buildCampaignChatFallbackPlan/, "renderer should execute campaign chat fallback projections");
  assert.match(appJs, /buildCampaignChatProgressSteps/, "campaign chat progress timing copy should be projected outside app.js");
  assert.doesNotMatch(appJs, /Campaign chat failed; prompt copied/, "campaign chat failure copy should not be owned by app.js");
  assert.doesNotMatch(appJs, /Campaign chat did not return a response; prompt copied/, "campaign chat no-response copy should not be owned by app.js");
  assert.doesNotMatch(appJs, /function shouldAutoApproveChange/, "renderer should not own provider auto-approval policy");
  assert.match(appJs, /buildTableSessionProjection/, "renderer should consume the table session projection");
  assert.match(appJs, /dataset\.tablePhase/, "status strip should expose the unified table phase");
  assert.match(appJs, /table-focus-controller\.js/, "table focus UI policy should live outside the main app renderer");
  assert.match(tableFocusController, /function buildTableFocusProjection/, "table focus controller should own phase-to-surface projection");
  assert.match(tableFocusController, /focusRail/, "table focus controller should name the table surface that deserves attention");
  assert.doesNotMatch(appJs, /function renderCommandContext/, "renderer should not own command context wording");
  assert.match(appJs, /combat-prompt-repair-controller\.js/, "combat prompt repair policy should live outside the main app renderer");
  assert.match(combatPromptRepairController, /promptedCombatActorIdFromTurnResponse/, "combat prompt repair controller should own actor prompt detection");
  assert.doesNotMatch(appJs, /function promptedCombatActorIdFromTurnResponse/, "renderer should not own combat prompt actor detection");
  assert.match(appJs, /buildProviderImportPlan/, "renderer should execute provider import plans instead of assembling implicit changes");
  assert.match(providerImportController, /combat-import-controller\.js/, "provider import planning should call combat import policy outside the renderer");
  assert.match(combatImportController, /function createImplicitCombatAdvanceChange/, "combat import controller should own implicit initiative advancement");
  assert.match(combatImportController, /!hasResolvedMechanics\(turnResponse\)[\s\S]*return null;/, "implicit combat advancement must require resolved mechanics");
  assert.doesNotMatch(appJs, /function createImplicitCombatAdvanceChange/, "renderer should not own implicit combat advancement policy");
  assert.match(providerImportController, /scene-import-controller\.js/, "provider import planning should call scene import policy outside the renderer");
  assert.match(sceneImportController, /function createImplicitSceneProgressChange/, "scene import controller should own implicit scene progress fallback");
  assert.doesNotMatch(appJs, /function createImplicitSceneProgressChange/, "renderer should not own implicit scene progress policy");
}

async function testNewCampaignPreTableJoinerWiring() {
  const appJs = await readFile(path.join("app", "app.js"), "utf8");
  const dmNudgeController = await readFile(path.join("app", "dm-nudge-controller.js"), "utf8");
  const tableActionController = await readFile(path.join("app", "table-action-controller.js"), "utf8");
  const turnRepairController = await readFile(path.join("app", "turn-repair-controller.js"), "utf8");
  const turnSubmitController = await readFile(path.join("app", "turn-submit-controller.js"), "utf8");
  const settingsSurfaceController = await readFile(path.join("app", "settings-surface-controller.js"), "utf8");
  const tableOpeningController = await readFile(path.join("app", "table-opening-controller.js"), "utf8");
  const playLogController = await readFile(path.join("app", "play-log-controller.js"), "utf8");
  const choiceVoteController = await readFile(path.join("app", "choice-vote-controller.js"), "utf8");
  const characterSeedRules = await readFile(path.join("src", "rules", "character-seed.js"), "utf8");
  const appShell = await readFile(path.join("app", "App.jsx"), "utf8");
  const styles = await readFile(path.join("app", "styles.css"), "utf8");
  const electronMain = await readFile(path.join("electron", "main.js"), "utf8");
  const localTable = await readFile(path.join("src", "multiplayer", "local-table.js"), "utf8");
  const server = await readFile(path.join("scripts", "serve.js"), "utf8");
  assert.doesNotMatch(localTable, /ThinLoreKeeper/, "multiplayer-created character notes should use the unified LoreKeeper Join identity");
  assert.match(appShell, /Party/);
  assert.match(appShell, /Add Crew/);
  assert.match(appShell, /add-party-template/);
  assert.match(appShell, /add-wizard-party-member/);
  assert.match(appShell, /Invite Friend/);
  assert.match(appShell, /new-character-controller/);
  assert.match(appShell, /campaign-wizard-status/, "adventure creation should show progress and errors inside the wizard");
  assert.match(appShell, /start-campaign-submit/, "adventure creation submit should be addressable for busy/disabled state");
  assert.match(appShell, /Back to previous screen/);
  assert.match(appShell, /data-character-field="controllerKind"/);
  assert.match(appShell, /new-joiner-integration/);
  assert.match(appShell, /new-joiner-host-context/);
  assert.match(appShell, /table-timeline-summary/);
  assert.match(appShell, /session-health-summary/);
  assert.match(appShell, /local-table-guidance/);
  assert.match(appShell, /local-table-guest-link/);
  assert.match(appShell, /copy-guest-link/);
  assert.match(appShell, /Open Guest Lobby/);
  assert.match(appShell, /Send Friend Actions/);
  assert.match(appShell, /className="friend-share-card"/, "Friends tab should lead with a simple guest-link share card");
  assert.match(appShell, /className="advanced-table-settings"/, "less common table controls should live behind Table Options");
  assert.match(styles, /\.friend-share-card/);
  assert.match(styles, /\.advanced-table-settings/);
  assert.ok(
    appShell.indexOf('className="friend-share-card"') < appShell.indexOf('className="advanced-table-settings"'),
    "Friends tab should show the normal invite/share path before advanced table controls",
  );
  assert.match(appShell, /id="open-setup"[\s\S]*Friends and seats/, "the in-table setup entry should read as friend seating, not generic settings");
  assert.doesNotMatch(appShell, /title="Table options"/);
  assert.doesNotMatch(appShell, />Resync</);
  assert.doesNotMatch(appJs, /Guest resync/i);
  assert.match(appJs, /Guest table refresh/);
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
  assert.match(appShell, /home-delete-campaign/);
  assert.match(appShell, /home-flow-card-new/, "New Adventure should be its own front-door card, not a secondary continue action");
  assert.match(appShell, /Set Up Table/);
  assert.match(appShell, />Delete</, "front door should allow deleting saved adventures");
  assert.match(styles, /\.home-flow-card-new/);
  assert.match(appShell, /Saved adventure/);
  assert.ok(
    appShell.indexOf('id="home-host-flow"') < appShell.indexOf('id="home-new-campaign"')
      && appShell.indexOf('id="home-new-campaign"') < appShell.indexOf('id="home-join-flow"'),
    "front door should read as Continue, New Adventure, then Join",
  );
  assert.ok(
    appShell.indexOf('className="home-library-strip"') < appShell.indexOf('id="home-provider-setup"'),
    "DM Voice readiness should live in the lower utility strip, not as a primary front-door mode",
  );
  assert.doesNotMatch(appShell, /home-flow-card-setup/);
  assert.doesNotMatch(styles, /home-flow-card-setup/);
  assert.match(appShell, /id="waiting-guests"/);
  assert.ok(
    appShell.indexOf('id="provider-activity"') < appShell.indexOf('id="play-log"'),
    "table status strip should live above the play log",
  );
  assert.match(appShell, /id="command-context"/, "command deck should show the current table phase");
  assert.match(appShell, /id="command-context-phase"/);
  assert.match(appShell, /id="command-context-next"/);
  assert.match(appShell, /id="host-response-review"/, "DM recovery should lead with a host-facing response summary");
  assert.match(appShell, /id="manual-response-fallback"/, "manual copied-response controls should be a named fallback surface");
  assert.match(appShell, /Replacement DM Response/);
  assert.doesNotMatch(appShell, /Use Pasted Response|paste box/i);
  assert.ok(
    appShell.indexOf('id="host-response-review"') < appShell.indexOf('id="manual-response-fallback"')
      && appShell.indexOf('id="manual-response-fallback"') < appShell.indexOf('id="response-import"')
      && appShell.indexOf('id="response-import"') < appShell.indexOf('id="review-list"'),
    "DM recovery should show guided review before the tucked-away copied-response fallback",
  );
  assert.match(appShell, /id="start-adventure-opening"/, "ready tables should expose an explicit Start Adventure action");
  assert.ok(
    appShell.indexOf('id="command-context"') < appShell.indexOf('id="start-adventure-opening"')
      && appShell.indexOf('id="start-adventure-opening"') < appShell.indexOf('id="player-form"'),
    "Start Adventure should live in the command deck next-step area, not in the status-strip action pile",
  );
  assert.ok(
    appShell.indexOf('id="command-context"') < appShell.indexOf('id="seat-waiting-guest"')
      && appShell.indexOf('id="seat-waiting-guest"') < appShell.indexOf('id="player-form"'),
    "Seat Guest should live with the table's current action surface",
  );
  assert.ok(
    appShell.indexOf('id="command-context"') < appShell.indexOf('id="repair-retry"')
      && appShell.indexOf('id="repair-import-anyway"') < appShell.indexOf('id="player-form"'),
    "Recovery actions should live with the table's current action surface",
  );
  assert.match(appJs, /renderTableFocus\(state\.tableSession\)/, "table session refresh should update the table focus cue");
  assert.match(appJs, /applyTableFocusProjection/, "command deck phase copy should be rendered through a focused projection");
  assert.match(appJs, /buildTableFocusProjection/, "renderer should consume a tested table focus projection");
  assert.match(
    appJs,
    /function setProviderActivity[\s\S]*?refreshTableSessionProjection\(\);[\s\S]*?renderTableActions\(\);[\s\S]*?renderInputComposer\(state\.tableSession\);/,
    "provider status changes should repaint phase-aware actions and composer together",
  );
  assert.match(appJs, /renderTableActions/, "renderer should consume the table action projection");
  assert.match(tableActionController, /function buildTableActionProjection/, "table action visibility policy should live outside app.js");
  assert.match(tableActionController, /buildStartAdventureOpeningProjection/, "Start Adventure action should flow through the unified table action projection");
  assert.match(tableActionController, /nudgeDm/, "Nudge availability should flow through the unified table action projection");
  assert.match(tableActionController, /cancelGeneration/, "Cancel generation availability should flow through the unified table action projection");
  assert.doesNotMatch(appJs, /function renderWaitingGuestCue/, "guest seating CTA policy should not be a standalone app.js function");
  assert.doesNotMatch(appJs, /function updateTurnRepairControls/, "repair CTA policy should not be a standalone app.js function");
  assert.doesNotMatch(appJs, /function updateStartAdventureOpeningControl/, "opening CTA policy should not be a standalone app.js function");
  assert.doesNotMatch(appJs, /function updateNudgeAvailability/, "Nudge CTA policy should not be a standalone app.js function");
  assert.match(dmNudgeController, /function buildDmNudgePrompt/, "DM nudge prompt policy should live outside app.js");
  assert.doesNotMatch(appJs, /function buildDmNudgePrompt/, "app.js should not own the normal DM nudge prompt policy");
  assert.match(styles, /\.command-context/);
  assert.match(styles, /\.command-context \.start-adventure-action/);
  assert.match(styles, /\.command-context \.table-current-action/);
  assert.match(styles, /\.command-context #repair-retry/);
  assert.match(styles, /\[data-table-phase="combat"\] \.command-deck/);
  assert.match(styles, /\.rail-section\[data-table-focus="primary"\]/);
  assert.match(styles, /\.combat-tracker-section\[data-table-focus="primary"\]/);
  assert.match(styles, /\.combat-active-cue/);
  assert.match(styles, /\.rail-section\[data-table-focus="quiet"\]/);
  assert.match(appShell, /id="party-rail-section"/);
  assert.match(appShell, /id="table-talk-section"/);
  assert.match(appShell, /id="combat-active-cue"/);
  assert.match(appShell, /Try Again/);
  assert.match(appShell, /Details/);
  assert.match(appShell, /Use Anyway/);
  assert.match(appShell, /Troubleshooting/);
  assert.match(appShell, /id="settings-tabs" className="settings-tabs"/, "settings should be grouped into top-level tabs instead of one dense panel");
  assert.match(appShell, /id="setup-dialog-title"/);
  assert.match(appShell, /id="setup-dialog-subtitle"/);
  assert.match(appShell, /data-settings-tab="app"/);
  assert.match(appShell, /data-settings-tab="ai"/);
  assert.match(appShell, /data-settings-tab="friends"/);
  assert.match(appShell, /data-settings-tab="troubleshooting"/);
  assert.match(appShell, /data-settings-panel="app"/);
  assert.match(appShell, /data-settings-panel="ai" hidden/);
  assert.match(appShell, /data-settings-panel="friends" hidden/);
  assert.match(appShell, /data-settings-panel="troubleshooting"/);
  assert.match(appShell, /data-settings-surface-target="diagnostics"/);
  assert.match(appShell, /id="dm-recovery-section"[\s\S]*data-settings-surface-target="recovery"/);
  assert.doesNotMatch(appShell, /id="new-campaign"/, "adventure creation belongs on the front door, not inside Preferences");
  assert.doesNotMatch(appShell, /id="load-imported"/, "saved adventure loading belongs on the front door, not inside Preferences");
  assert.match(appJs, /settings-surface-controller\.js/, "settings surface policy should live outside the main app renderer");
  assert.match(settingsSurfaceController, /settingsSurfaceModes = Object\.freeze/, "settings surfaces should declare allowed tab groups");
  assert.match(settingsSurfaceController, /app: \["app"\]/, "app preferences should open as a single-purpose surface");
  assert.match(settingsSurfaceController, /ai: \["ai"\]/, "DM Voice should open as a single-purpose surface");
  assert.match(settingsSurfaceController, /table: \["friends"\]/, "Friends And Seats should open as a single-purpose surface");
  assert.match(settingsSurfaceController, /troubleshooting: \["troubleshooting"\]/, "diagnostics should remain a separate troubleshooting surface");
  assert.match(settingsSurfaceController, /recovery: \["troubleshooting"\]/, "DM response review should be able to open as a focused recovery surface");
  assert.match(settingsSurfaceController, /validMode === "recovery"[\s\S]*\? "recovery"[\s\S]*validMode === "troubleshooting"[\s\S]*\? "diagnostics"/, "diagnostics and recovery should target separate troubleshooting panels");
  assert.match(settingsSurfaceController, /elements\.settingsTabsNav\.hidden = projection\.visibleTabCount <= 1/, "single-purpose settings surfaces should hide the tab rail");
  assert.match(settingsSurfaceController, /button\.hidden = !projection\.allowedTabs\.includes/, "irrelevant settings tabs should be hidden by surface mode");
  assert.match(settingsSurfaceController, /panel\.dataset\.settingsSurfaceTarget === projection\.surfaceTarget/, "focused settings surfaces should hide unrelated panels");
  assert.match(styles, /\.settings-tabs\[data-visible-tabs="2"\]/, "settings tab grid should collapse when only two tabs are visible");
  assert.match(styles, /\.settings-tabs\[data-visible-tabs="1"\]/, "settings tab grid should collapse when only one recovery tab is visible");
  assert.match(appJs, /function setSettingsTab\(tab = "app", \{ mode = state\.settingsMode/, "settings tab state should be explicit renderer state");
  assert.doesNotMatch(
    appJs,
    /function applyHostModeChrome\(\) \{[\s\S]*?hideSetupSection\(elements\.providerMode, false\)/,
    "host chrome refreshes must not unhide the DM Voice settings panel inside table-scoped Friends And Seats",
  );
  assert.match(appJs, /elements\.openSetup\.addEventListener\("click", \(\) => \{\s*openSetupDialog\(\{ tab: "friends", mode: "table" \}\);/s, "in-table gear should open friend/table settings, not app preferences");
  assert.match(appJs, /function openLocalTableSeating\(\) \{[\s\S]*openSetupDialog\(\{ tab: "friends", mode: "table" \}\)/, "Seat Guest should land on Friends And Seats");
  assert.match(appJs, /applySettingsSurfaceProjection\(elements, projection\)/);
  assert.match(appJs, /openSetupDialog\(\{ tab: "troubleshooting", mode: "recovery" \}\)/, "DM response details should open the focused recovery surface");
  assert.doesNotMatch(appJs, /DM response details are open in Troubleshooting/);
  assert.match(styles, /\.settings-tabs/);
  assert.match(styles, /\.settings-tab\.active/);
  assert.match(appShell, /Copy Details/);
  assert.match(appShell, /DM Recovery/);
  assert.match(appShell, /host-response-review/);
  assert.match(appShell, /No DM Response Waiting/);
  assert.match(appShell, /raw-diagnostics-details/);
  assert.match(appShell, /Developer Details/);
  assert.doesNotMatch(appShell, /raw provider JSON/);
  assert.match(appShell, /id="show-debug-meta"/);
  assert.match(appShell, /id="scene-note-list"/, "notebook should include a current-scene section");
  assert.match(appShell, /id="scene-note-count"/);
  assert.match(appJs, /function renderSceneNotebook/, "scene notebook projection should be explicit renderer behavior");
  assert.match(appJs, /buildSceneRetrieval\(campaign\)/, "scene notebook should use the same scene retrieval as DM context");
  assert.match(appJs, /relevantRelationships\.slice\(0, 2\)/, "scene notebook should surface relationship context without flooding the rail");
  assert.match(styles, /\.scene-notes-section/);
  assert.match(appJs, /renderRightRailState/);
  assert.match(appJs, /playerNotesStoragePrefix/);
  assert.match(appJs, /apiCampaignPlayerNotesUrl/);
  assert.match(appJs, /playerNotesWithLocalFallback/);
  assert.match(appJs, /persistPlayerNotes/);
  assert.match(appJs, /savePlayerNotesFromUi/);
  assert.match(appJs, /collectWizardAdditionalCharacters/);
  assert.match(appJs, /addPartyTemplateCharactersToWizard/);
  assert.match(appJs, /buildPartyTemplateCharacters/);
  assert.match(appJs, /normalizeWizardJoiner/);
  assert.match(appJs, /openRemoteInviteLobbyForNewCampaign/);
  assert.match(appJs, /apiPreTableLobbySeatUrl/);
  assert.match(appJs, /seatPreTableWaitingGuest/);
  assert.match(appJs, /pretable-seat-actions/);
  assert.match(appJs, /joinableSeats\.length/);
  assert.match(appJs, /Seat as \$\{seat\.name \|\| "Friend"\}/);
  assert.match(appJs, /Seat reserved\$\{status\.reservedSeat\?\.name/);
  assert.match(appJs, /function saveGuestSession\(session\) \{\s*state\.guestSession = session/s);
  assert.match(appJs, /tableId:\s*status\.localTable\?\.tableId/);
  assert.match(appJs, /sessionId:\s*status\.localTable\?\.sessionId/);
  assert.match(appJs, /buildFiveELiteCharacterSeed/);
  assert.doesNotMatch(appJs, /function equipmentForProfile/, "5E-lite equipment policy should live outside app.js");
  assert.doesNotMatch(appJs, /function spell\(name, level/, "5E-lite spell seed policy should live outside app.js");
  assert.match(characterSeedRules, /function equipmentForProfile/);
  assert.match(characterSeedRules, /inventory:\s*equipment\.inventory/);
  assert.match(characterSeedRules, /function spell\(name, level/);
  assert.match(appJs, /seedWizardStartingPartyMember/);
  assert.match(appJs, /startingPartyMembers:\s*joinerSeeds/);
  assert.match(appJs, /startAdventureOpening/);
  assert.match(appJs, /buildAdventureOpeningPrompt/);
  assert.match(appJs, /isCampaignReadyForOpening/);
  assert.match(tableOpeningController, /function buildStartAdventureOpeningProjection/, "Start Adventure button policy should live outside app.js");
  assert.match(tableOpeningController, /function buildAdventureOpeningPrompt/, "opening DM prompt policy should live outside app.js");
  assert.doesNotMatch(appJs, /function buildAdventureOpeningPrompt/, "app.js should not own the opening DM prompt policy");
  assert.doesNotMatch(appJs, /elements\.cancelGeneration\.hidden\s*=\s*(?:true|false)/, "app.js should not manually hide/show cancel generation");
  assert.doesNotMatch(appJs, /elements\.cancelGeneration\.disabled\s*=\s*(?:true|false)/, "app.js should not manually enable/disable cancel generation");
  assert.match(appJs, /Start Adventure for the opening narration/);
  assert.doesNotMatch(appJs, /Next: click Nudge to ask the DM for the opening moment/);
  assert.doesNotMatch(appJs, /await startNewCampaignOpening/, "new tables should not auto-run the first DM turn; Start Adventure must remain host-controlled");
  assert.doesNotMatch(appJs, /function buildCampaignOpeningPrompt/, "opening prompt construction should not leave a dead auto-DM-start path");
  assert.match(appJs, /const multiplayerPollIntervalMs = 1000/, "host guest-request polling should feel live");
  assert.match(appJs, /hasActiveGeneration\(\)[\s\S]*refreshMultiplayerSnapshot\(\{ quiet: true \}\)[\s\S]*renderTableTalk\(\)[\s\S]*renderTableActions\(\)/, "waiting guest cues and table talk should refresh even while the DM is generating");
  assert.match(appJs, /projectCurrentTableTalkMessages/, "table talk rendering should use the tested freshness projection");
  assert.doesNotMatch(appJs, /snapshotTalk\.length > campaignTalk\.length/, "table talk source freshness should not live as inline renderer branching");
  assert.match(appJs, /activeAfterCommit[\s\S]*activeAfterCommit !== current\.id/, "enemy auto-turns should only be marked handled after initiative leaves that enemy");
  assert.doesNotMatch(appJs, /Player character: \$\{formatCharacterBasics\(character\)\}/);
  assert.match(appJs, /wizardControllerSheetFields/);
  assert.match(appJs, /inviteIntent:\s*"remote_player"/);
  assert.match(appJs, /campaign-wizard-mode/);
  assert.match(appJs, /campaignWizardReturnHome/);
  assert.match(appJs, /campaignWizardCreating/);
  assert.match(appJs, /setCampaignWizardStatus/);
  assert.match(appJs, /setCampaignWizardBusy/);
  assert.doesNotMatch(appJs, /newCampaignDialog/, "campaign wizard helpers should reference the real campaign dialog element");
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
  assert.match(choiceVoteController, /function choiceVoteSummaryText/);
  assert.match(choiceVoteController, /function choiceVoteState/);
  assert.match(choiceVoteController, /function leadingChoiceVoteEntry/);
  assert.match(appJs, /choice-vote-summary/);
  assert.match(appJs, /choice-vote-tied/);
  assert.match(appJs, /choice-vote-action/);
  assert.match(appJs, /Draft leading choice \$\{leadingVote\.label\}/);
  assert.match(choiceVoteController, /Selected choice \$\{label\}\$\{voteText\}; edit or send/);
  assert.match(choiceVoteController, /function buildChoiceSelectionFromText/);
  assert.match(choiceVoteController, /function extractChoiceTokenText/);
  assert.match(choiceVoteController, /function buildChoiceSelectionMeta/);
  assert.doesNotMatch(appJs, /function extractChoiceTokenText/, "renderer should not own choice token parsing");
  assert.doesNotMatch(appJs, /function choiceSelectionMeta/, "renderer should not own provider choice-selection meta copy");
  assert.match(appJs, /buildProviderImportPlan\(\{[\s\S]*campaign: state\.campaign/, "renderer should pass explicit campaign context into provider import planning");
  assert.match(appJs, /seatWaitingGuestAtTable/);
  assert.match(appJs, /renderTableActions/);
  assert.match(appJs, /announceWaitingGuestsIfNeeded/);
  assert.match(appJs, /effectiveWaitingGuests/);
  assert.match(appJs, /copyGuestLinkFromUi/);
  assert.match(appJs, /currentLocalGuestLink/);
  assert.match(appJs, /partyControllerDetail/);
  assert.match(appJs, /Waiting for an invited friend/);
  assert.match(appJs, /renderDebugMetaControl/);
  assert.match(turnSubmitController, /DM response needs review\. Try Again, Details, or Use Anyway\./);
  assert.doesNotMatch(appJs, /DM response needs review\. Try Again, Details, or Use Anyway\./, "send-turn blocking copy should live outside app.js");
  assert.match(appJs, /DM is reconsidering the response/);
  assert.match(appJs, /turn-repair-controller\.js/, "repair display policy should live outside the main app renderer");
  assert.match(appJs, /turnRepairStatusText/, "repair status should come from the repair controller");
  assert.match(appJs, /turnRepairImportOptions/, "Use Anyway import packaging should come from the repair controller");
  assert.match(appJs, /host-response-review-controller\.js/, "host response review guidance should live outside the main app renderer");
  assert.match(appJs, /buildHostResponseReviewProjection/, "review summary should come from a small projection");
  assert.match(appJs, /buildManualResponseFallbackProjection/, "copied-response fallback copy should come from the review controller");
  assert.match(appJs, /applyManualResponseFallbackProjection/, "copied-response fallback rendering should stay behind a small projection");
  assert.match(styles, /\.host-response-review/);
  assert.match(styles, /\.manual-response-fallback/);
  assert.match(styles, /\.raw-diagnostics-details/);
  assert.match(turnRepairController, /the DM response did not pass LoreKeeper's table checks/, "technical repair reasons should be softened for live play");
  assert.doesNotMatch(appJs, /Opening scene needs JSON repair/);
  assert.doesNotMatch(turnRepairController, /imported despite contract failure/);
  assert.match(appJs, /DM response review is open/);
  assert.match(playLogController, /The DM response was received, but the table has not applied it yet\./);
  assert.match(playLogController, /The DM responded, but LoreKeeper needs the host to review it before play continues\./);
  assert.match(appJs, /launchInviteLink/);
  assert.match(appJs, /applyLaunchInviteLink/);
  assert.match(appJs, /clearGuestSession\(\{\s*keepRecent:\s*false\s*\}\)/);
  assert.match(appJs, /Invite loaded\. Enter your name/);
  assert.match(appJs, /Enter the name the host should see at the table/);
  assert.match(localTable, /disposition === "dropped"/);
  assert.match(localTable, /guest_input_dropped/);
  assert.match(server, /disposition: body\.disposition/);
  assert.match(electronMain, /findJoinLinkArg\(process\.argv\)/);
  assert.match(electronMain, /setAsDefaultProtocolClient\("lorekeeper"\)/);
  assert.match(electronMain, /query\.inviteLink = pendingJoinLink/);
  assert.match(electronMain, /second-instance", \(_event, argv = \[\]\)/);
  assert.match(styles, /\.left-panel\s*{\s*grid-area:\s*left;\s*min-width:\s*0;/);
  assert.match(styles, /\.panel-rail\s*{\s*min-width:\s*0;/);
  assert.match(styles, /\.title-actions\s*{[\s\S]*?flex-wrap:\s*wrap;/);
  assert.match(styles, /\.record\s*{\s*min-width:\s*0;/);
}

function testRemoteInviteWizardSeatPersistsAsJoinable() {
  const result = addCampaignRecord(campaignFixture(), {
    domain: "party",
    id: "party-oskar",
    name: "Oskar",
    type: "player_character",
    playerRole: "Remote invite seat",
    ancestryClass: "Dwarf Fighter",
    controllerKind: "unassigned",
    controllerId: null,
    fallbackControllerKind: "ai_companion",
    inviteIntent: "remote_player",
    integrationPrompt: "Oskar has a reason to travel with the party.",
    hostIntegrationPrompt: "Let a guest claim Oskar before the first scene if possible.",
  });
  const oskar = result.campaign.party.find((member) => member.id === "party-oskar");
  assert.equal(oskar.controllerKind, "unassigned");
  assert.equal(oskar.controllerId, null);
  assert.equal(oskar.fallbackControllerKind, "ai_companion");
  assert.equal(oskar.inviteIntent, "remote_player");
  assert.equal(oskar.integrationPrompt, "Oskar has a reason to travel with the party.");
  assert.equal(joinableGuestSeats(result.campaign).some((seat) => seat.id === "party-oskar"), true);
}

testDiceEngine();
await testClipboardFallback();
testAdventureSeedPreset();
testAgencyController();
testTurnEngine();
testStateEffects();
testCombatEngine();
testCombatEndsWhenSideDrops();
testCombatPromptRepairController();
testCombatImportController();
testCombatTrackerView();
testSceneImportController();
testSceneAndConsequenceEngines();
testSceneRetrievalFindsParticipantConsequencesWithoutProjectionIds();
testSceneRetrievalRanksFocusUnderLongCampaignNoise();
testLivingWorldMemoryAndGoalHorizonsSurviveLongCampaignNoise();
testRelationshipEvolutionEngine();
testFactionAndLocationMemoryEngine();
testLargeCampaignContextPackStaysBounded();
testContextPackFormatsStructuredSheetDetails();
testSceneIntentDiscouragesRandomEscalationAfterSmallFight();
testProviderBoundary();
testStructuredInputsDoNotMergeIntoHostMessage();
testTurnRepairController();
testStagedInputRecoveryController();
testHostResponseReviewProjection();
testProviderImportOutcomeProjection();
testProviderResultController();
testProviderSettingsController();
testProviderChatProjection();
testTableTalkProjection();
testCharacterAutocompleteProjection();
testCharacterSeedRules();
testCampaignStateStore();
testInputComposerProjection();
testJoinPreviewProjection();
testGuestAutoResolveController();
testCampaignAdoptionController();
testMultiplayerPollingController();
testTurnSubmitGates();
testTableStatusVocabulary();
testTableSessionEnginePhases();
testTableFocusProjection();
testTableOpeningController();
testTableActionProjection();
testDmNudgeController();
testPlayLogProjectionBoundsLongSessions();
testMessageLifecycleProjection();
testPendingInputActionProjection();
testPartySuggestionController();
testChoiceVoteController();
testMessageBlockController();
testMultiplayerSessionProjection();
testReviewPanelProjection();
testSettingsSurfaceProjection();

await testProviderExecutionLifecycle();
await testInvalidProviderOutputIsRecoverable();
await testCancelAndStaleCompletion();
testCancelWithoutProviderAbortEventRecoversImmediately();
testTurnFlowResetCancelsAndIgnoresStaleEvents();
await testAppJsNoLongerOwnsExtractedStateMachines();
await testNewCampaignPreTableJoinerWiring();
testRemoteInviteWizardSeatPersistsAsJoinable();

console.log("engine architecture tests passed");
