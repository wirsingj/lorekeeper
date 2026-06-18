import assert from "node:assert/strict";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createReviewBatch, getCommittableChanges } from "../src/canon-review/proposals.js";
import { OllamaProvider } from "../src/ai/ollama-provider.js";
import { dedupeMechanicsRows, splitMechanicsFromBlock } from "../app/mechanics-formatting.js";
import { normalizeProviderRuntimeSettings } from "../src/ai/provider-settings.js";
import { buildOllamaTurnGenerationConfig } from "../src/ai/provider-service.js";
import {
  findOllamaContextForCampaign,
  updateCampaignOllamaContext,
} from "../src/ai/ollama-context-cache.js";
import { applyCanonicalChanges } from "../src/campaign-state/apply-changes.js";
import { createEmptyCampaign, normalizeCampaign } from "../src/campaign-state/schema.js";
import { buildContextPack } from "../src/context-packs/build-context-pack.js";
import {
  buildTurnJsonPrompt,
  buildTurnRequestEnvelope,
  parseTurnJsonResponse,
  renderTurnResponseForImport,
  validateTurnRequest,
  validateTurnResponse,
} from "../src/model-contract/turn-json-contract.js";
import { buildRulesLedger } from "../src/rules/dnd5e-lite-ledger.js";

const validResponse = [
  "The room goes quiet.",
  "",
  "```json lorekeeper_updates",
  JSON.stringify({
    proposedChanges: [
      {
        operation: "add",
        domain: "people",
        targetId: null,
        summary: "A wary informant entered the tavern.",
        data: { name: "Wary Informant", role: "informant" },
        confidence: "high",
        reason: "Direct scene introduction.",
      },
    ],
  }),
  "```",
].join("\n");

const valid = extractLorekeeperUpdates(validResponse);
assert.equal(valid.error, null);
assert.equal(valid.proposedChanges.length, 1);
assert.equal(valid.proposedChanges[0].data.name, "Wary Informant");
assert.equal(stripLorekeeperUpdates(validResponse), "The room goes quiet.");

const missing = extractLorekeeperUpdates("Only narration, no update block.");
assert.equal(missing.proposedChanges.length, 0);
assert.match(missing.error, /No LoreKeeper update JSON/);

const malformed = extractLorekeeperUpdates('Narration\n{"proposedChanges":[{"operation":"add","domain":"party","summary":"Sevrin joins.","data":{"name":"Sevrin"}}');
assert.equal(malformed.proposedChanges.length, 1);
assert.match(malformed.error, /Recovered 1 complete update/);

const invalid = createReviewBatch({
  campaignId: "test",
  source: "test",
  rawResponse: "bad",
  proposedChanges: [
    {
      operation: "teleport",
      domain: "planets",
      targetId: null,
      summary: "Invalid update.",
      data: {},
      confidence: "high",
      reason: "Nope.",
    },
  ],
});
assert.equal(invalid.proposedChanges[0].status, "rejected");
assert.equal(getCommittableChanges(invalid).length, 0);

const streamed = [
  "The bell rings.",
  '{"proposedChanges":[{"operation":"note","domain":"scene","summary":"The bell rang.","data":{"immediateSituation":"A bell rings downstairs."},"confidence":"high","reason":"Scene beat."}]}',
].join("\n");
const streamedParsed = extractLorekeeperUpdates(streamed);
assert.equal(streamedParsed.proposedChanges.length, 1);
assert.equal(streamedParsed.proposedChanges[0].domain, "scene");

const requestEnvelope = buildTurnRequestEnvelope({
  campaign: testCampaign(),
  contextPack: testContextPack(),
  playerTurn: "I roll d20+3 perception to spot the other trainee. (Keep it tense.)",
  parsedMessage: {
    raw: "I roll d20+3 perception to spot the other trainee. (Keep it tense.)",
    inWorldText: "I roll d20+3 perception to spot the other trainee.",
    metaInstructions: ["Keep it tense."],
  },
  options: {
    playerInputs: [
      {
        playerId: "guest-kevric",
        playerName: "Jess",
        characterId: "kevric",
        characterName: "Kevric",
        text: "Kevric keeps running but watches Jarin's flank.",
        ready: true,
      },
    ],
  },
});
assert.equal(requestEnvelope.type, "lorekeeper.turn.request");
assert.equal(requestEnvelope.schemaVersion, 1);
assert.equal(requestEnvelope.user.actionIntent, "skill_or_scene_check");
assert.equal(requestEnvelope.generation.responseMode, "resolve_check");
assert.equal(requestEnvelope.user.requestedRolls.length, 2);
assert.equal(requestEnvelope.user.playerInputs[0].characterName, "Kevric");
assert.equal(requestEnvelope.user.playerInputs[0].text, "Kevric keeps running but watches Jarin's flank.");
assert.equal(requestEnvelope.generation.choicePolicy.default, "narration_first");
assert.equal(requestEnvelope.generation.choicePolicy.choicesAllowed, false);
assert.match(requestEnvelope.generation.choicePolicy.structuredChoiceInstruction, /Do not include structured choices\.options/);
assert.equal(requestEnvelope.generation.narrationTarget.style, "immersive_tabletop");
assert.equal(requestEnvelope.generation.narrationTarget.paragraphs, "3-6");
assert.equal(requestEnvelope.generation.narrationTarget.words, "320-700");
assert.match(requestEnvelope.generation.dmQuality.philosophy, /skilled long-running tabletop DM/);
assert.ok(requestEnvelope.generation.dmQuality.avoid.includes("random encounter generation"));
assert.ok(requestEnvelope.generation.dmQuality.beforeAddingNewContent.some((rule) => /Prefer existing people/.test(rule)));
assert.ok(requestEnvelope.generation.dmQuality.beforeAddingNewContent.some((rule) => /short, medium, or long-term goal/.test(rule)));
assert.equal(requestEnvelope.context.tableVoices[0].name, "Jarin");
assert.equal(requestEnvelope.context.goalHorizon.longTerm.length, 1);
assert.equal(requestEnvelope.context.goalHorizon.mediumTerm.length, 1);
assert.equal(requestEnvelope.context.goalHorizon.shortTerm.length, 1);
assert.equal(requestEnvelope.context.livingWorld.retrievalPriority[0], "current scene");
assert.equal(requestEnvelope.context.hiddenDmStory.length, 3);
assert.equal(requestEnvelope.context.hiddenDmStory[0].horizon, "long");
assert.equal(validateTurnRequest(requestEnvelope).valid, true);

const nudgeWithObjectMemory = buildTurnRequestEnvelope({
  campaign: {
    ...testCampaign(),
    scene: {
      ...testCampaign().scene,
      presentPeopleIds: ["merchant"],
      currentPlaceId: "mining-road",
    },
    people: [{
      id: "merchant",
      name: "Garren",
      memory: [
        { title: "Road debt", summary: "Owes the mining road locals money and hides it behind bravado." },
        { label: "Knows Thora", text: "Recognizes Thora as the steady shield-hand in the group." },
      ],
    }],
    factions: [{
      id: "rough-locals",
      name: "Rough Locals",
      beliefs: { debt: { summary: "The merchant wagon should not leave until the debt is answered." } },
    }],
    places: [{
      id: "mining-road",
      name: "Mining road",
      scars: [{ title: "Blocked wagon", summary: "Rutted road churned by a tense standoff." }],
    }],
  },
  contextPack: testContextPack(),
  playerTurn: "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.)",
  parsedMessage: {
    raw: "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.)",
    inWorldText: "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.)",
    metaInstructions: [],
  },
});
assert.match(nudgeWithObjectMemory.context.livingWorld.people[0].memory, /Road debt/);
assert.doesNotMatch(nudgeWithObjectMemory.context.livingWorld.people[0].memory, /\[object Object\]/);
assert.equal(validateTurnRequest(nudgeWithObjectMemory).valid, true);

const narrationFirstPrompt = buildTurnJsonPrompt({
  campaign: testCampaign(),
  contextPack: testContextPack(),
  playerTurn: "I ask the ferryman why the line stopped moving.",
  parsedMessage: {
    raw: "I ask the ferryman why the line stopped moving.",
    inWorldText: "I ask the ferryman why the line stopped moving.",
    metaInstructions: [],
  },
});
assert.match(narrationFirstPrompt, /If generation\.choicePolicy\.choicesAllowed is false, leave choices\.options empty/);
assert.match(narrationFirstPrompt, /choices\.options must be \[\]/);
assert.match(narrationFirstPrompt, /serves a short, medium, or long-term goal/);

const combatChoiceEnvelope = buildTurnRequestEnvelope({
  campaign: {
    ...testCampaign(),
    combat: {
      inCombat: true,
      currentTurnId: "jarin",
      turnOrder: ["jarin", "wolf-1"],
      enemies: [{ id: "wolf-1", name: "Wolf" }],
    },
  },
  contextPack: testContextPack(),
  playerTurn: "What are my combat options?",
  parsedMessage: {
    raw: "What are my combat options?",
    inWorldText: "What are my combat options?",
    metaInstructions: [],
  },
});
assert.equal(combatChoiceEnvelope.generation.choicePolicy.choicesAllowed, true);
assert.match(combatChoiceEnvelope.generation.choicePolicy.structuredChoiceInstruction, /Choices may be offered/);

const hiddenStoryCampaign = createEmptyCampaign({
  title: "Hidden Story Test",
  quests: [
    {
      id: "public-thread",
      title: "Find the bridge",
      status: "active",
      stakes: "The road is washed out.",
      openQuestions: [],
    },
    {
      id: "secret-arc",
      title: "The baron is funding the raids",
      status: "active",
      visibility: "dm_only",
      threadType: "story_arc",
      horizon: "long",
      stakes: "A hidden patron turns random raids into a campaign problem.",
      openQuestions: ["Who notices the coin trail?"],
    },
  ],
});
const hiddenStoryContext = buildContextPack(hiddenStoryCampaign);
const visibleThreadSection = hiddenStoryContext.sections.find((section) => section.kind === "unresolved_threads");
assert.match(visibleThreadSection.entries.join(" "), /Find the bridge/);
assert.doesNotMatch(visibleThreadSection.entries.join(" "), /baron is funding/);
const hiddenStoryEnvelope = buildTurnRequestEnvelope({
  campaign: hiddenStoryCampaign,
  contextPack: hiddenStoryContext,
  playerTurn: "I keep watch.",
  parsedMessage: { raw: "I keep watch.", inWorldText: "I keep watch.", metaInstructions: [] },
});
assert.equal(hiddenStoryEnvelope.context.hiddenDmStory[0].title, "The baron is funding the raids");
assert.equal(validateTurnRequest(hiddenStoryEnvelope).valid, true);

const hiddenStoryVisibleLeak = validateTurnResponse(validTurnResponse({
  table: [
    {
      speaker: "DM",
      speakerId: null,
      role: "dm",
      kind: "narration",
      visibility: "table",
      text: "You realize the truth: The baron is funding the raids.",
    },
  ],
}), { request: hiddenStoryEnvelope });
assert.equal(hiddenStoryVisibleLeak.valid, false);
assert.match(hiddenStoryVisibleLeak.errors.join(" "), /hidden DM story phrase/);

const hiddenStoryChoiceLeak = validateTurnResponse(validTurnResponse({
  choices: {
    prompt: "What do you do?",
    scope: "party",
    options: [
      {
        id: "A",
        legalOptionId: "investigate",
        text: "Ask around about Who notices the coin trail?",
      },
    ],
    allowOther: true,
  },
}), { request: hiddenStoryEnvelope });
assert.equal(hiddenStoryChoiceLeak.valid, false);
assert.match(hiddenStoryChoiceLeak.errors.join(" "), /hidden DM story phrase/);

const hiddenStorySubtleClue = validateTurnResponse(validTurnResponse({
  table: [
    {
      speaker: "DM",
      speakerId: null,
      role: "dm",
      kind: "narration",
      visibility: "table",
      text: "A stamped coin glints in the mud, too clean for the road and too deliberate to be lost.",
    },
  ],
  proposedChanges: [
    {
      ...validChange(),
      domain: "quests",
      visibility: "dm_only",
      summary: "The baron is funding the raids",
      data: {
        threadType: "story_arc",
        horizon: "long",
        nextBeat: "Who notices the coin trail?",
      },
    },
  ],
}), { request: hiddenStoryEnvelope });
assert.equal(hiddenStorySubtleClue.valid, true);

const editedChoiceText = "I choose B: Try to hide Rowan behind some crates. I throw a blanket over the shopkeeper, balance a small box on top, and loudly bluff that I am looking for the shopkeep.";
const editedChoiceEnvelope = buildTurnRequestEnvelope({
  campaign: testCampaign(),
  contextPack: testContextPack(),
  playerTurn: [
    editedChoiceText,
    "",
    "(meta: The player selected B from the latest visible choice panel. The player edited/expanded the selected option; user.inWorld is the authoritative action and overrides the original option wording. Preserve concrete player details, props, positioning, dialogue, and intent from user.inWorld.)",
  ].join("\n"),
  parsedMessage: {
    raw: [
      editedChoiceText,
      "",
      "(meta: The player selected B from the latest visible choice panel. The player edited/expanded the selected option; user.inWorld is the authoritative action and overrides the original option wording. Preserve concrete player details, props, positioning, dialogue, and intent from user.inWorld.)",
    ].join("\n"),
    inWorldText: editedChoiceText,
    metaInstructions: [
      "meta: The player selected B from the latest visible choice panel. The player edited/expanded the selected option; user.inWorld is the authoritative action and overrides the original option wording. Preserve concrete player details, props, positioning, dialogue, and intent from user.inWorld.",
    ],
  },
});
assert.match(editedChoiceEnvelope.user.inWorld, /blanket/);
assert.match(editedChoiceEnvelope.user.inWorld, /small box/);
assert.match(editedChoiceEnvelope.user.inWorld, /shopkeep/);
assert.ok(editedChoiceEnvelope.meta.instructionPriority.some((rule) => /edited user\.inWorld/.test(rule)));
assert.equal(validateTurnRequest(editedChoiceEnvelope).valid, true);
const editedChoicePrompt = buildTurnJsonPrompt({
  campaign: testCampaign(),
  contextPack: testContextPack(),
  playerTurn: editedChoiceText,
  parsedMessage: {
    raw: editedChoiceText,
    inWorldText: editedChoiceText,
    metaInstructions: [],
  },
});
assert.match(editedChoicePrompt, /extra details are authoritative/);
assert.match(editedChoicePrompt, /blanket/);

const fastEnvelope = buildTurnRequestEnvelope({
  campaign: testCampaign(),
  contextPack: testContextPack(),
  playerTurn: "I keep running.",
  parsedMessage: { raw: "I keep running.", inWorldText: "I keep running.", metaInstructions: [] },
  options: { mode: "fast" },
});
assert.equal(fastEnvelope.generation.mode, "fast");
assert.equal(fastEnvelope.generation.responseMode, "turn");
assert.ok(fastEnvelope.context.sections[0].entries.length <= 4);

const combatEnvelope = buildTurnRequestEnvelope({
  campaign: { ...testCampaign(), combat: { inCombat: true } },
  contextPack: testContextPack("combat_state"),
  playerTurn: "I attack with my bow.",
  parsedMessage: { raw: "I attack with my bow.", inWorldText: "I attack with my bow.", metaInstructions: [] },
});
assert.equal(combatEnvelope.generation.mode, "combat");
assert.equal(combatEnvelope.generation.responseMode, "resolve_combat");
assert.equal(combatEnvelope.context.scene.mode, "combat");
assert.equal(combatEnvelope.context.party[0].hp, null);

const inferredCombatEnvelope = buildTurnRequestEnvelope({
  campaign: testCampaign(),
  contextPack: testContextPack("combat_state"),
  playerTurn: "Garin steadies the crossbow and fires at the wolf.",
  parsedMessage: {
    raw: "Garin steadies the crossbow and fires at the wolf.",
    inWorldText: "Garin steadies the crossbow and fires at the wolf.",
    metaInstructions: [],
  },
});
assert.equal(inferredCombatEnvelope.user.actionIntent, "combat_action");
assert.equal(inferredCombatEnvelope.generation.mode, "combat");
assert.equal(inferredCombatEnvelope.generation.responseMode, "resolve_combat");
assert.equal(inferredCombatEnvelope.generation.narrationTarget.words, "220-480");

const rulesCampaignData = rulesCampaign();
const rulesLedger = buildRulesLedger(rulesCampaignData, { mode: "combat" });
assert.equal(rulesLedger.actors[0].name, "Mira");
assert.equal(rulesLedger.actors[0].legalOptions[0].letter, "A");
assert.ok(rulesLedger.actors[0].legalOptions.some((option) => option.id === "spell-entangle"));
assert.ok(rulesLedger.actors[0].legalOptions.some((option) => option.id === "feature-wild-shape"));
assert.ok(rulesLedger.actors[0].legalOptions.some((option) => option.id === "move"));

const objectAttackCampaign = rulesCampaign();
objectAttackCampaign.party[0].attacks = [
  { name: { name: "Warhammer" }, attackBonus: 5, damage: { dice: "1d8+3" } },
];
const objectAttackLedger = buildRulesLedger(objectAttackCampaign, { mode: "combat" });
const objectAttackOption = objectAttackLedger.actors[0].legalOptions.find((option) => option.id === "attack-warhammer");
assert.equal(objectAttackOption.label, "Attack with Warhammer");
assert.doesNotMatch(objectAttackOption.label, /\[object Object\]/);

const ledgerContextPack = buildContextPack(rulesCampaignData, { includeCombatDetail: true });
const ledgerEnvelope = buildTurnRequestEnvelope({
  campaign: rulesCampaignData,
  contextPack: ledgerContextPack,
  playerTurn: "Mira sizes up the fight.",
  parsedMessage: { raw: "Mira sizes up the fight.", inWorldText: "Mira sizes up the fight.", metaInstructions: [] },
});
assert.equal(ledgerEnvelope.context.rulesLedger.actors[0].legalOptions[0].letter, "A");
assert.ok(ledgerEnvelope.context.rulesLedger.actors[0].legalOptions.some((option) => option.id === "spell-entangle"));
assert.equal(validateTurnRequest(ledgerEnvelope).valid, true);

const consequenceCampaign = testCampaign();
consequenceCampaign.scene.activeSceneId = "scene-market";
consequenceCampaign.scene.currentPlaceId = "place-market";
consequenceCampaign.scene.presentPeopleIds = ["npc-merchant"];
consequenceCampaign.scenes = [{
  id: "scene-market",
  type: "social",
  title: "Market aftermath",
  locationId: "place-market",
  peopleIds: ["npc-merchant"],
  participantIds: ["npc-merchant"],
  consequenceIds: ["consequence-merchant-trust"],
  tensions: ["The merchant is deciding whether to trust the party."],
  unresolvedQuestions: [],
  goals: [],
  immediateSituation: "The merchant is safe and waiting for a response.",
  whyHere: "The party protected the merchant.",
  status: "active",
}];
consequenceCampaign.consequences = [{
  id: "consequence-merchant-trust",
  title: "Merchant trusts the party",
  description: "The merchant may vouch for the party if they treat him well.",
  scope: "person",
  state: "active",
  importance: "high",
  sourceSceneId: "scene-market",
  relatedSceneIds: [],
  participantIds: ["npc-merchant"],
  relationshipIds: [],
  threadIds: [],
  tags: [],
}];
const consequenceContextPack = buildContextPack(consequenceCampaign);
assert.ok(consequenceContextPack.sections.some((section) => section.kind === "active_consequences"));
const consequenceEnvelope = buildTurnRequestEnvelope({
  campaign: consequenceCampaign,
  contextPack: consequenceContextPack,
  playerTurn: "I ask if he is alright.",
  parsedMessage: { raw: "I ask if he is alright.", inWorldText: "I ask if he is alright.", metaInstructions: [] },
});
assert.equal(validateTurnRequest(consequenceEnvelope).valid, true);

const emptyCombatDefaults = createEmptyCampaign({ title: "Combat Defaults" }).combat;
assert.deepEqual(emptyCombatDefaults.turnEconomy, {});
assert.equal(emptyCombatDefaults.currentTurnId, null);

const ollamaMemorySettings = normalizeProviderRuntimeSettings({
  preferredProvider: "ollama",
  selectedModel: "mistral-nemo",
  fastMode: false,
});
const ollamaMemoryCampaign = normalizeCampaign(updateCampaignOllamaContext(createEmptyCampaign({
  id: "campaign-ollama-memory",
  title: "Ollama Memory",
}), {
  settings: ollamaMemorySettings,
  context: [1, "2", -3, 4.5, 5],
  tokenCounts: { prompt: 12, completion: 4 },
}));
assert.deepEqual(findOllamaContextForCampaign(ollamaMemoryCampaign, ollamaMemorySettings), [1, 2, 5]);
assert.equal(
  findOllamaContextForCampaign(ollamaMemoryCampaign, { ...ollamaMemorySettings, selectedModel: "qwen3:14b" }),
  null,
);
assert.equal(
  findOllamaContextForCampaign(ollamaMemoryCampaign, { ...ollamaMemorySettings, fastMode: true }),
  null,
);
const mistralGenerationConfig = buildOllamaTurnGenerationConfig(ollamaMemorySettings);
assert.equal(mistralGenerationConfig.options.format, "json");
assert.equal(mistralGenerationConfig.promptPrefix, "");
const qwenGenerationConfig = buildOllamaTurnGenerationConfig({
  ...ollamaMemorySettings,
  selectedModel: "qwen3:14b",
});
assert.equal(qwenGenerationConfig.options.format, undefined);
assert.match(qwenGenerationConfig.promptPrefix, /\/no_think/);

const partialJoinCampaign = createEmptyCampaign({
  title: "Partial Join Snapshot",
  scene: {},
  sessionLog: { messages: [] },
  people: null,
  party: undefined,
});
assert.deepEqual(partialJoinCampaign.scene.presentPeopleIds, []);
assert.deepEqual(partialJoinCampaign.scene.presentPartyMemberIds, []);
assert.deepEqual(partialJoinCampaign.scene.localNotes, []);
assert.deepEqual(partialJoinCampaign.people, []);
assert.deepEqual(partialJoinCampaign.party, []);
assert.doesNotThrow(() => buildContextPack(partialJoinCampaign, { purpose: "partial_join_snapshot" }));

const hiddenStoryApplied = applyCanonicalChanges(createEmptyCampaign({ title: "Hidden Canon" }), [
  {
    id: "hidden-story-add",
    operation: "add",
    domain: "quests",
    targetId: null,
    importance: "normal",
    visibility: "dm_only",
    summary: "Create a private long-term story thread.",
    data: {
      title: "The old road was closed for a reason",
      threadType: "story_arc",
      horizon: "long",
      stakes: "The road trouble points toward a buried regional secret.",
      openQuestions: ["Who benefits from keeping travelers away?"],
      nextBeat: "Seed a small clue in the next grounded scene.",
    },
    confidence: "high",
    reason: "DM needs private campaign direction.",
  },
]);
const hiddenQuest = hiddenStoryApplied.campaign.quests.find((quest) => quest.threadType === "story_arc");
assert.equal(hiddenQuest.visibility, "dm_only");
assert.equal(hiddenQuest.horizon, "long");
assert.equal(hiddenQuest.nextBeat, "Seed a small clue in the next grounded scene.");
assert.equal(hiddenStoryApplied.campaign.scene.activeQuestIds.includes(hiddenQuest.id), false);

const combatApplied = applyCanonicalChanges(rulesCampaignData, [
  {
    id: "combat-update-1",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Mira spends power and is wounded.",
    data: {
      inCombat: true,
      round: 2,
      currentTurnId: "mira",
      initiative: ["mira", "wolf-1"],
      turnEconomy: {
        mira: { action: "spent", bonusAction: "available", movementRemainingFt: 10 },
      },
      enemyUpdates: [
        { id: "wolf-1", name: "Ash Wolf", hp: { current: 7, max: 13 }, addConditions: ["marked"] },
      ],
      actorUpdates: [
        {
          actorId: "mira",
          damage: 6,
          addConditions: ["bloodied"],
          resourceDeltas: {
            "spellSlots.1.used": 1,
            "uses.wildShape.used": 1,
          },
          turnEconomy: { action: "spent", movementRemainingFt: 10 },
        },
      ],
      lastAction: "Mira casts Entangle and takes a hit.",
      lastOutcome: "The wolf is marked; Mira is bloodied.",
    },
    confidence: "high",
    reason: "Combat resolution.",
  },
]);
const updatedMira = combatApplied.campaign.party.find((member) => member.id === "mira");
assert.equal(updatedMira.stats.hp.current, 12);
assert.equal(updatedMira.resources.spellSlots[1].used, 2);
assert.equal(updatedMira.resources.uses.wildShape.used, 1);
assert.ok(updatedMira.conditions.includes("bloodied"));
assert.equal(combatApplied.campaign.combat.round, 2);
assert.equal(combatApplied.campaign.combat.turnEconomy.mira.action, "spent");
assert.equal(combatApplied.campaign.combat.enemies[0].name, "Ash Wolf");
assert.ok(combatApplied.campaign.combat.enemies[0].conditions.includes("marked"));

const inferredEnemyCombat = applyCanonicalChanges(rulesCampaignData, [
  {
    id: "combat-inferred-drunk-miner",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "A drunk miner is added to the brawl.",
    data: {
      inCombat: true,
      enemyUpdates: [{ id: "enemy-drunk-miner", name: "Drunk miner", hp: null, type: "humanoid" }],
    },
    confidence: "medium",
    reason: "Hostile NPC inferred from DM narration.",
  },
]);
assert.ok(inferredEnemyCombat.campaign.combat.enemies.some((enemy) => enemy.name === "Drunk miner"));
assert.ok(inferredEnemyCombat.campaign.combat.turnOrder.some((entry) => entry.id === "enemy-drunk-miner"));

const startedCombat = applyCanonicalChanges(rulesCampaignData, [
  {
    id: "combat-start-rolls-initiative",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Combat starts and initiative is rolled.",
    data: {
      inCombat: true,
      round: 1,
      enemies: [{ id: "wolf-1", name: "Ash Wolf", hp: 18, dexMod: 2 }],
    },
    confidence: "high",
    reason: "Combat start.",
  },
]);
assert.equal(startedCombat.campaign.combat.inCombat, true);
assert.ok(startedCombat.campaign.combat.turnOrder.length >= 2);
assert.ok(startedCombat.campaign.combat.currentTurnId);
assert.deepEqual(
  startedCombat.campaign.combat.initiative,
  startedCombat.campaign.combat.turnOrder.map((entry) => entry.id),
);

const groupedEnemyCombat = applyCanonicalChanges(rulesCampaignData, [
  {
    id: "combat-starts-with-bandits",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Five bandits block the road.",
    data: {
      inCombat: true,
      enemies: [{ id: "bandit", name: "Bandit", count: 5, hp: 7, dexMod: 1 }],
    },
    confidence: "high",
    reason: "Grouped enemy count should become separate combatants.",
  },
]);
assert.equal(groupedEnemyCombat.campaign.combat.enemies.length, 5);
assert.equal(groupedEnemyCombat.campaign.combat.enemies[0].name, "Bandit 1");
assert.equal(groupedEnemyCombat.campaign.combat.turnOrder.filter((entry) => entry.type === "enemy").length, 5);

const resolvedActorId = startedCombat.campaign.combat.currentTurnId;
const advancedCombat = applyCanonicalChanges(startedCombat.campaign, [
  {
    id: "combat-turn-advance",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "The active actor completes a combat turn.",
    data: {
      inCombat: true,
      turnResolved: true,
      advanceTurn: true,
      resolvedActorId,
    },
    confidence: "high",
    reason: "Turn resolved.",
  },
]);
assert.notEqual(advancedCombat.campaign.combat.currentTurnId, resolvedActorId);

const loggedCombat = applyCanonicalChanges(startedCombat.campaign, [
  {
    id: "combat-engine-logged-turn",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "LoreKeeper resolved a combat action.",
    data: {
      inCombat: true,
      currentTurnId: startedCombat.campaign.combat.currentTurnId,
      combatActionLog: [{ id: "combat-action-log-test", actorId: resolvedActorId, actionType: "attack" }],
      diceLog: [{ id: "dice-log-test", label: "Attack roll", total: 17 }],
      stateEffectLog: [{ id: "effect-log-test", type: "hp_delta", targetId: "enemy-wolf", amount: -3 }],
    },
    confidence: "high",
    reason: "Engine-owned combat turns should keep an audit trail.",
  },
]);
assert.equal(loggedCombat.campaign.combatActionLog.some((entry) => entry.id === "combat-action-log-test"), true);
assert.equal(loggedCombat.campaign.diceLog.some((entry) => entry.id === "dice-log-test"), true);
assert.equal(loggedCombat.campaign.stateEffectLog.some((entry) => entry.id === "effect-log-test"), true);
assert.equal(loggedCombat.campaign.combat.combatActionLog, undefined);
assert.equal(loggedCombat.campaign.combat.diceLog, undefined);
assert.equal(loggedCombat.campaign.combat.stateEffectLog, undefined);

const repairedPromptedCombat = applyCanonicalChanges({
  ...rulesCampaignData,
  combat: {
    inCombat: true,
    round: 1,
    currentTurnId: "enemy-drunk-miner",
    turnOrder: [
      { id: "enemy-drunk-miner", name: "Drunk miner", type: "enemy", initiativeScore: 12 },
      { id: "mira", name: "Mira", type: "party", initiativeScore: 10 },
    ],
    initiative: ["enemy-drunk-miner", "mira"],
    enemies: [{ id: "enemy-drunk-miner", name: "Drunk miner", hp: 8 }],
  },
}, [
  {
    id: "combat-prompted-actor-repair",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "The DM prompt is clearly asking Mira to act.",
    data: {
      inCombat: true,
      promptedActorId: "mira",
      onlyFromNonParty: true,
    },
    confidence: "high",
    reason: "Repair stale combat turn owner.",
  },
]);
assert.equal(repairedPromptedCombat.campaign.combat.currentTurnId, "mira");
assert.equal(repairedPromptedCombat.campaign.combat.promptedActorId, undefined);

const defeatedLastEnemyCombat = applyCanonicalChanges({
  ...rulesCampaignData,
  combat: {
    inCombat: true,
    round: 3,
    currentTurnId: "mira",
    turnOrder: [
      { id: "mira", name: "Mira", type: "party", initiativeScore: 14 },
      { id: "enemy-wolf", name: "Wolf", type: "enemy", initiativeScore: 9 },
    ],
    initiative: ["mira", "enemy-wolf"],
    enemies: [{ id: "enemy-wolf", name: "Wolf", hp: { current: 5, max: 5 } }],
  },
}, [
  {
    id: "combat-last-enemy-defeated",
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Mira drops the last wolf.",
    data: {
      inCombat: true,
      turnResolved: true,
      advanceTurn: true,
      resolvedActorId: "mira",
      enemyUpdates: [{ id: "enemy-wolf", hp: { current: 0, max: 5 } }],
    },
    confidence: "high",
    reason: "The final enemy was defeated.",
  },
]);
assert.equal(defeatedLastEnemyCombat.campaign.combat.inCombat, false);
assert.deepEqual(defeatedLastEnemyCombat.campaign.combat.turnOrder, []);
assert.deepEqual(defeatedLastEnemyCombat.campaign.combat.initiative, []);

const normalizedDefeatedCombat = normalizeCampaign({
  ...rulesCampaignData,
  combat: {
    inCombat: true,
    round: 5,
    currentTurnId: "enemy-hostile-miner",
    turnOrder: [
      { id: "enemy-hostile-miner", name: "Hostile miner", type: "enemy", initiativeScore: 12 },
      { id: "mira", name: "Mira", type: "party", initiativeScore: 10 },
    ],
    initiative: ["enemy-hostile-miner", "mira"],
    enemies: [{ id: "enemy-hostile-miner", name: "Hostile miner", hp: { current: 0, max: 0 } }],
  },
});
assert.equal(normalizedDefeatedCombat.combat.inCombat, false);
assert.deepEqual(normalizedDefeatedCombat.combat.turnOrder, []);

const normalizedPartyOnlyCombat = normalizeCampaign({
  ...rulesCampaignData,
  combat: {
    inCombat: true,
    round: 1,
    currentTurnId: "mira",
    turnOrder: [
      { id: "mira", name: "Mira", type: "party", initiativeScore: 14 },
      { id: "bram", name: "Bram", type: "party", initiativeScore: 11 },
    ],
    initiative: ["mira", "bram"],
    enemies: [],
    turnEconomy: { mira: { action: true } },
  },
});
assert.equal(normalizedPartyOnlyCombat.combat.inCombat, false);
assert.deepEqual(normalizedPartyOnlyCombat.combat.turnOrder, []);
assert.deepEqual(normalizedPartyOnlyCombat.combat.initiative, []);
assert.equal(normalizedPartyOnlyCombat.combat.currentTurnId, null);

assert.equal(
  normalizeProviderRuntimeSettings({ ollamaBaseUrl: "https://example.com/ollama" }).ollamaBaseUrl,
  "http://127.0.0.1:11434",
);
assert.equal(
  normalizeProviderRuntimeSettings({ ollamaBaseUrl: "http://192.168.1.50:11434/" }).ollamaBaseUrl,
  "http://192.168.1.50:11434",
);
assert.equal(new OllamaProvider({ baseUrl: "https://example.com/ollama" }).baseUrl, "http://127.0.0.1:11434");

const structured = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ requestId: requestEnvelope.requestId })), {
  requestId: requestEnvelope.requestId,
});
assert.equal(structured.error, null);
const renderedStructured = renderTurnResponseForImport(structured.response);
assert.match(renderedStructured, /A branch snaps ahead/);
assert.match(renderedStructured, /Perception: Roll if Jarin pauses/);
assert.match(renderedStructured, /Jarin: Drop low and listen/);
assert.match(renderedStructured, /B\. Something else\./);
assert.match(renderedStructured, /```json lorekeeper_updates/);

const echoedChoiceResponse = validTurnResponse({
  table: [{
    speaker: "DM",
    speakerId: null,
    role: "dm",
    kind: "narration",
    visibility: "table",
    text: "The miner lifts his pickaxe and squares up. What do you do, Garren? A. Throw sand in his eyes. B. Ready your stance.",
  }],
  choices: {
    prompt: "What do you do, Garren?",
    scope: "character",
    forActorId: "garren",
    forActor: "Garren",
    options: [
      { id: "A", actorId: "garren", actor: "Garren", legalOptionId: null, text: "Throw sand in his eyes." },
      { id: "B", actorId: "garren", actor: "Garren", legalOptionId: null, text: "Ready your stance." },
    ],
    allowOther: true,
  },
});
const renderedWithoutChoiceEcho = renderTurnResponseForImport(echoedChoiceResponse, { includeChoices: false });
assert.match(renderedWithoutChoiceEcho, /The miner lifts his pickaxe and squares up\./);
assert.doesNotMatch(renderedWithoutChoiceEcho, /What do you do, Garren/);
assert.doesNotMatch(renderedWithoutChoiceEcho, /A\. Throw sand/);
assert.doesNotMatch(renderedWithoutChoiceEcho, /Ready your stance/);

const renderedWithSingleChoiceBlock = renderTurnResponseForImport(echoedChoiceResponse);
assert.match(renderedWithSingleChoiceBlock, /The miner lifts his pickaxe and squares up\./);
assert.equal((renderedWithSingleChoiceBlock.match(/A\. Garren: Throw sand in his eyes\./g) ?? []).length, 1);
assert.equal((renderedWithSingleChoiceBlock.match(/B\. Garren: Ready your stance\./g) ?? []).length, 1);

const targetedChoiceResponse = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  choices: {
    prompt: "Corin, what do you do?",
    scope: "targeted",
    forActorId: "party-corin",
    forActor: "Corin",
    options: [
      { id: "A", targetActorId: "party-corin", targetActor: "Corin", text: "Study the rune before anyone touches the offering." },
      { id: "B", targetActorId: "party-corin", targetActor: "Corin", text: "Warn Garren away from the shrine." },
    ],
    allowOther: true,
  },
})));
assert.equal(targetedChoiceResponse.error, null);
assert.equal(targetedChoiceResponse.response.choices.scope, "character");
assert.equal(targetedChoiceResponse.response.choices.forActorId, "party-corin");
assert.equal(targetedChoiceResponse.response.choices.forActor, "Corin");
assert.equal(targetedChoiceResponse.response.choices.options[0].targetActorId, "party-corin");

const voteChoiceResponse = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  choices: {
    prompt: "How does the party approach the shrine?",
    scope: "vote",
    allowVote: true,
    voteTieBreaker: "host",
    options: [
      { id: "A", text: "Leave the offering untouched and watch from cover." },
      { id: "B", text: "Examine the offering with tools instead of bare hands." },
    ],
    allowOther: true,
  },
})));
assert.equal(voteChoiceResponse.error, null);
assert.equal(voteChoiceResponse.response.choices.scope, "vote");
assert.equal(voteChoiceResponse.response.choices.allowVote, true);
assert.equal(voteChoiceResponse.response.choices.voteTieBreaker, "host");

const noChanges = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ proposedChanges: [] })));
assert.equal(noChanges.response.proposedChanges.length, 0);

const missingFlags = validTurnResponse({ proposedChanges: [] });
delete missingFlags.flags;
const normalizedMissingFlags = parseTurnJsonResponse(JSON.stringify(missingFlags));
assert.equal(normalizedMissingFlags.ok, true);
assert.deepEqual(normalizedMissingFlags.response.flags, {
  requiresReview: false,
  startsCombat: false,
  endsScene: false,
  containsSecretInfo: false,
});

const schemaPlaceholderRole = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm|player|party|npc|system", kind: "narration|dialogue|action|mechanics|status|aside", visibility: "table|dm_only|party", text: "The watchtower bell rings once." }],
})));
assert.equal(schemaPlaceholderRole.ok, true);
assert.equal(schemaPlaceholderRole.response.table[0].role, "dm");
assert.equal(schemaPlaceholderRole.response.table[0].kind, "narration");
assert.equal(schemaPlaceholderRole.response.table[0].visibility, "table");

const schemaPlaceholderSceneStatus = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  sceneStatus: {
    mode: "social|exploration|combat|downtime|travel",
    danger: "none|tense|immediate|combat",
    awaitingPlayer: "true|false",
  },
})));
assert.equal(schemaPlaceholderSceneStatus.ok, true);
assert.equal(schemaPlaceholderSceneStatus.response.sceneStatus.mode, "exploration");
assert.equal(schemaPlaceholderSceneStatus.response.sceneStatus.danger, "none");
assert.equal(schemaPlaceholderSceneStatus.response.sceneStatus.awaitingPlayer, true);

const paragraphNarration = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The bell keeps ringing over the gate.\n\nBelow, boots scrape stone as guards scramble awake." }],
})));
assert.equal(paragraphNarration.ok, true);
assert.match(paragraphNarration.response.table[0].text, /gate\.\n\nBelow/);

const mismatchedPartySpeakerRole = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "Tilli", speakerId: "tilli", role: "dm", kind: "dialogue", visibility: "table", text: "I signal Mira and keep talking." }],
})));
const renderedMismatchedPartySpeaker = renderTurnResponseForImport(mismatchedPartySpeakerRole.response);
assert.match(renderedMismatchedPartySpeaker, /^Tilli: I signal Mira/m);

const remoteAgencyCampaign = {
  ...testCampaign(),
  scene: {
    ...testCampaign().scene,
    presentPartyMemberIds: ["jarin", "mira"],
  },
  party: [
    {
      id: "jarin",
      name: "Jarin",
      type: "player_character",
      controllerKind: "host",
      role: "Player character ranger",
    },
    {
      id: "mira",
      name: "Mira",
      type: "player_character",
      controllerKind: "remote_player",
      role: "Remote player fighter",
    },
  ],
};
const remoteAgencyContext = buildContextPack(remoteAgencyCampaign);
const remoteAgencyRequest = buildTurnRequestEnvelope({
  campaign: remoteAgencyCampaign,
  contextPack: remoteAgencyContext,
  playerTurn: "Jarin asks the guard what is happening on the road.",
  parsedMessage: {
    raw: "Jarin asks the guard what is happening on the road.",
    inWorldText: "Jarin asks the guard what is happening on the road.",
    metaInstructions: [],
  },
});
const pilotedRemoteNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The guard spits in the dust. Mira draws her blade and steps between Jarin and the guard." }],
});
assert.equal(validateTurnResponse(pilotedRemoteNarration, { request: remoteAgencyRequest }).valid, false);
assert.match(validateTurnResponse(pilotedRemoteNarration, { request: remoteAgencyRequest }).errors.join(" "), /Mira/);

const neutralRemotePresenceNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The guard spits in the dust. Mira is beside Jarin in the road, close enough to hear the exchange." }],
});
assert.equal(validateTurnResponse(neutralRemotePresenceNarration, { request: remoteAgencyRequest }).valid, true);

const remoteBodyLanguageOverreach = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The guard spits in the dust. Mira's grip tightens on her spear and she leans forward, ready to spring." }],
});
assert.equal(validateTurnResponse(remoteBodyLanguageOverreach, { request: remoteAgencyRequest }).valid, false);
assert.match(validateTurnResponse(remoteBodyLanguageOverreach, { request: remoteAgencyRequest }).errors.join(" "), /Mira/);

const hostileFocusOnRemoteCharacter = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The guard's eyes flick to Mira before returning to Jarin. The threat is aimed at the whole group, but nobody has committed to violence yet." }],
});
assert.equal(validateTurnResponse(hostileFocusOnRemoteCharacter, { request: remoteAgencyRequest }).valid, true);

const remoteResolveOverreach = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "The guard leans closer. Mira doesn't back down, her eyes locked on his as her hand tightens around the spear." }],
});
assert.equal(validateTurnResponse(remoteResolveOverreach, { request: remoteAgencyRequest }).valid, false);
assert.match(validateTurnResponse(remoteResolveOverreach, { request: remoteAgencyRequest }).errors.join(" "), /Mira/);

const remoteSpeakerWithoutInput = validTurnResponse({
  table: [{ speaker: "Mira", speakerId: "mira", role: "party", kind: "dialogue", visibility: "table", text: "Back away from him." }],
});
assert.equal(validateTurnResponse(remoteSpeakerWithoutInput, { request: remoteAgencyRequest }).valid, false);
assert.match(validateTurnResponse(remoteSpeakerWithoutInput, { request: remoteAgencyRequest }).errors.join(" "), /without submitted controller input/);

const remoteDmRoleMixup = validTurnResponse({
  table: [{ speaker: "Mira", speakerId: "mira", role: "dm", kind: "dialogue", visibility: "table", text: "Back away from him." }],
});
assert.equal(validateTurnResponse(remoteDmRoleMixup, { request: remoteAgencyRequest }).valid, false);
assert.match(validateTurnResponse(remoteDmRoleMixup, { request: remoteAgencyRequest }).errors.join(" "), /uses DM role for controlled party member Mira/);

const hostAgencyRequest = buildTurnRequestEnvelope({
  campaign: remoteAgencyCampaign,
  contextPack: remoteAgencyContext,
  playerTurn: "I wait and watch the guard.",
  parsedMessage: {
    raw: "I wait and watch the guard.",
    inWorldText: "I wait and watch the guard.",
    metaInstructions: [],
  },
});
const pilotedHostNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Jarin steps forward, draws his bow, and decides the guard is lying." }],
});
assert.equal(validateTurnResponse(pilotedHostNarration, { request: hostAgencyRequest }).valid, false);
assert.match(validateTurnResponse(pilotedHostNarration, { request: hostAgencyRequest }).errors.join(" "), /Jarin/);

const hostMentionAsObjectRequest = buildTurnRequestEnvelope({
  campaign: remoteAgencyCampaign,
  contextPack: remoteAgencyContext,
  playerTurn: "I look at Jarin to see whether he agrees.",
  parsedMessage: {
    raw: "I look at Jarin to see whether he agrees.",
    inWorldText: "I look at Jarin to see whether he agrees.",
    metaInstructions: [],
  },
});
const hostMentionObjectPilotedNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Jarin steps forward and decides to challenge the guard." }],
});
assert.equal(validateTurnResponse(hostMentionObjectPilotedNarration, { request: hostMentionAsObjectRequest }).valid, false);
assert.match(validateTurnResponse(hostMentionObjectPilotedNarration, { request: hostMentionAsObjectRequest }).errors.join(" "), /Jarin/);

const namedHostActionRequest = buildTurnRequestEnvelope({
  campaign: remoteAgencyCampaign,
  contextPack: remoteAgencyContext,
  playerTurn: "Jarin asks the guard who ordered the road closed.",
  parsedMessage: {
    raw: "Jarin asks the guard who ordered the road closed.",
    inWorldText: "Jarin asks the guard who ordered the road closed.",
    metaInstructions: [],
  },
});
const namedHostActionNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Jarin asks his question clearly, and the guard's jaw tightens before he answers." }],
});
assert.equal(validateTurnResponse(namedHostActionNarration, { request: namedHostActionRequest }).valid, true);

const unassignedAgencyCampaign = {
  ...remoteAgencyCampaign,
  scene: {
    ...remoteAgencyCampaign.scene,
    presentPartyMemberIds: ["jarin", "mira", "orrin"],
  },
  party: [
    ...remoteAgencyCampaign.party,
    {
      id: "orrin",
      name: "Orrin",
      type: "player_character",
      controllerKind: "unassigned",
      role: "Unassigned scholar",
    },
  ],
};
const unassignedAgencyContext = buildContextPack(unassignedAgencyCampaign);
const unassignedAgencyRequest = buildTurnRequestEnvelope({
  campaign: unassignedAgencyCampaign,
  contextPack: unassignedAgencyContext,
  playerTurn: "I wait and watch the guard.",
  parsedMessage: {
    raw: "I wait and watch the guard.",
    inWorldText: "I wait and watch the guard.",
    metaInstructions: [],
  },
});
const pilotedUnassignedNarration = validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Orrin notices a hidden sigil and whispers the answer before anyone asks him." }],
});
assert.equal(validateTurnResponse(pilotedUnassignedNarration, { request: unassignedAgencyRequest }).valid, false);
assert.match(validateTurnResponse(pilotedUnassignedNarration, { request: unassignedAgencyRequest }).errors.join(" "), /Orrin/);

const aiCompanionAgencyCampaign = {
  ...remoteAgencyCampaign,
  party: [
    ...remoteAgencyCampaign.party,
    {
      id: "sy",
      name: "Sy",
      type: "player_character",
      controllerKind: "ai_companion",
      role: "AI companion scout",
    },
  ],
};
const aiCompanionAgencyContext = buildContextPack(aiCompanionAgencyCampaign);
const aiCompanionAgencyRequest = buildTurnRequestEnvelope({
  campaign: aiCompanionAgencyCampaign,
  contextPack: aiCompanionAgencyContext,
  playerTurn: "I wait and watch the guard.",
  parsedMessage: {
    raw: "I wait and watch the guard.",
    inWorldText: "I wait and watch the guard.",
    metaInstructions: [],
  },
});
const lowStakesAiCompanionVoice = validTurnResponse({
  table: [{ speaker: "Sy", speakerId: "sy", role: "party", kind: "dialogue", visibility: "table", text: "Maybe ask who ordered the road closed before we draw blades." }],
});
assert.equal(validateTurnResponse(lowStakesAiCompanionVoice, { request: aiCompanionAgencyRequest }).valid, true);
assert.equal(aiCompanionAgencyRequest.generation.companionInterjectionPolicy.enabled, true);
assert.equal(aiCompanionAgencyRequest.generation.companionInterjectionPolicy.allowedThisTurn, false);
assert.equal(aiCompanionAgencyRequest.generation.companionInterjectionPolicy.reason, "rarity_gate_closed");

const idleCompanionCampaign = {
  ...aiCompanionAgencyCampaign,
  combat: { inCombat: false },
  sessionLog: {
    messages: [
      { role: "dm", speaker: "DM", body: "The road grows quiet." },
      { role: "player", speaker: "Host", body: "Jarin waits." },
      { role: "dm", speaker: "DM", body: "The guard watches back." },
      { role: "player", speaker: "Host", body: "Jarin keeps his hands visible." },
    ],
  },
};
const idleCompanionRequest = buildTurnRequestEnvelope({
  campaign: idleCompanionCampaign,
  contextPack: buildContextPack(idleCompanionCampaign),
  playerTurn: "I wait to see what the guard does.",
  parsedMessage: {
    raw: "I wait to see what the guard does.",
    inWorldText: "I wait to see what the guard does.",
    metaInstructions: [],
  },
});
assert.equal(idleCompanionRequest.generation.companionInterjectionPolicy.allowedThisTurn, true);
assert.equal(idleCompanionRequest.generation.companionInterjectionPolicy.reason, "idle_table_color_beat_allowed");
assert.ok(idleCompanionRequest.generation.companionInterjectionPolicy.constraints.some((rule) => /low-stakes/.test(rule)));

const cooldownCompanionRequest = buildTurnRequestEnvelope({
  campaign: {
    ...idleCompanionCampaign,
    sessionLog: {
      messages: [
        ...idleCompanionCampaign.sessionLog.messages,
        { role: "party", speaker: "Sy", speakerId: "sy", body: "Something about this road feels staged." },
      ],
    },
  },
  contextPack: buildContextPack(idleCompanionCampaign),
  playerTurn: "I wait another moment.",
  parsedMessage: {
    raw: "I wait another moment.",
    inWorldText: "I wait another moment.",
    metaInstructions: [],
  },
});
assert.equal(cooldownCompanionRequest.generation.companionInterjectionPolicy.allowedThisTurn, false);
assert.equal(cooldownCompanionRequest.generation.companionInterjectionPolicy.reason, "cooldown_recent_companion_post");

const nudgedCompanionRequest = buildTurnRequestEnvelope({
  campaign: aiCompanionAgencyCampaign,
  contextPack: aiCompanionAgencyContext,
  playerTurn: "(AI companion nudge: Sy may offer a brief low-stakes reaction.)",
  parsedMessage: {
    raw: "(AI companion nudge: Sy may offer a brief low-stakes reaction.)",
    inWorldText: "(AI companion nudge: Sy may offer a brief low-stakes reaction.)",
    metaInstructions: [],
  },
});
assert.equal(nudgedCompanionRequest.generation.companionInterjectionPolicy.allowedThisTurn, true);
assert.equal(nudgedCompanionRequest.generation.companionInterjectionPolicy.reason, "explicit_companion_nudge");

const remoteAgencySubmittedRequest = buildTurnRequestEnvelope({
  campaign: remoteAgencyCampaign,
  contextPack: remoteAgencyContext,
  playerTurn: "Jarin waits for Mira's signal.",
  parsedMessage: {
    raw: "Jarin waits for Mira's signal.",
    inWorldText: "Jarin waits for Mira's signal.",
    metaInstructions: [],
  },
  options: {
    playerInputs: [
      {
        playerId: "guest-mira",
        playerName: "Jess",
        characterId: "mira",
        characterName: "Mira",
        text: "Mira draws her blade and steps between Jarin and the guard.",
        ready: true,
      },
    ],
  },
});
assert.equal(validateTurnResponse(pilotedRemoteNarration, { request: remoteAgencySubmittedRequest }).valid, true);

const narrationFirstChoiceSpam = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Garin continues his patrol. The night air hangs cool and quiet over the wall." }],
  mechanics: [],
  flags: { requiresReview: false, startsCombat: false, endsScene: false, containsSecretInfo: false },
  proposedChanges: [],
})), {
  choicePolicy: { choicesAllowed: false, default: "narration_first" },
});
assert.equal(narrationFirstChoiceSpam.ok, true);
assert.equal(narrationFirstChoiceSpam.response.choices.options.length, 0);
assert.match(narrationFirstChoiceSpam.response.warnings.join(" "), /Structured choices suppressed/);

const ordinarySceneChoiceSpamFixtures = [
  {
    mode: "social",
    text: "The merchant exhales slowly. The coins remain on the counter, but her hand no longer covers them.",
  },
  {
    mode: "travel",
    text: "Rain tracks down the cart canvas while the old road bends toward a line of distant watchfires.",
  },
  {
    mode: "exploration",
    text: "Dust shifts under the shrine stones, revealing a clean groove where someone recently dragged a narrow box.",
  },
  {
    mode: "downtime",
    text: "By morning, the innkeeper has set aside a private room and a bowl of ink-stained keys.",
  },
  {
    mode: "recovery",
    text: "The table beat settles. The last action is still intact, and the DM is ready to continue from the same moment.",
  },
];
for (const fixture of ordinarySceneChoiceSpamFixtures) {
  const parsed = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
    table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: fixture.text }],
    sceneStatus: { mode: fixture.mode, danger: "none", awaitingPlayer: false },
    mechanics: [],
    flags: { requiresReview: false, startsCombat: false, endsScene: false, containsSecretInfo: false },
    proposedChanges: [],
  })), {
    choicePolicy: { choicesAllowed: false, default: "narration_first" },
  });
  assert.equal(parsed.ok, true, `${fixture.mode} fixture should parse`);
  assert.equal(parsed.response.choices.options.length, 0, `${fixture.mode} narration should not keep structured choices`);
  assert.match(parsed.response.warnings.join(" "), /Structured choices suppressed/, `${fixture.mode} fixture should explain choice suppression`);
}

const richFullTurnFixtures = [
  {
    name: "social negotiation",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "The toll keeper's bravado thins when Jarin names the burned wagon. He glances once toward the shuttered counting house, then lowers his voice. 'Not here,' he says. 'If the captain sees me talking, my family loses their place on the ferry.'",
      }],
      sceneStatus: { mode: "social", danger: "tense", awaitingPlayer: false },
      proposedChanges: [{
        operation: "note",
        domain: "people",
        targetId: "toll-keeper",
        summary: "The toll keeper fears the ferry captain and has family leverage over him.",
        data: { relationship: "afraid_of_ferry_captain", leverage: "family place on ferry" },
        confidence: "high",
        reason: "Established through dialogue.",
      }],
    }),
    expected: /toll keeper's bravado thins/,
  },
  {
    name: "travel consequence",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "By dusk the road has become a ribbon of black mud. The cart wheels keep to the high ridge, but the party loses the clean tracks they were following. Far behind, a horn answers another horn, both softened by rain.",
      }],
      sceneStatus: { mode: "travel", danger: "tense", awaitingPlayer: false },
      proposedChanges: [{
        operation: "note",
        domain: "scene",
        targetId: null,
        summary: "Rain erased the clean trail, but distant horns suggest organized pursuit.",
        data: { immediateSituation: "Rainy road travel with distant horns behind the party." },
        confidence: "high",
        reason: "Travel consequence from the current scene.",
      }],
    }),
    expected: /ribbon of black mud/,
  },
  {
    name: "mystery clue",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "The shrine dust breaks in a pattern too clean for wind. Under the offering bowl is a crescent scratch, repeated three times, each mark cut from the same angle as if someone used the bowl itself as a guide.",
      }],
      sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: false },
      proposedChanges: [{
        operation: "add",
        domain: "items",
        targetId: null,
        summary: "Crescent guide-marks found beneath the shrine offering bowl.",
        data: { name: "Crescent guide-marks", type: "clue", description: "Three repeated crescent scratches under the offering bowl." },
        confidence: "high",
        reason: "Directly discovered investigation clue.",
      }],
    }),
    expected: /crescent scratch/,
  },
  {
    name: "downtime fallout",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "By morning, the taproom has decided the party is either cursed or useful. The innkeeper does not charge for breakfast, but the bowl of porridge arrives with a folded note tucked beneath it: Meet me where the old bell fell.",
      }],
      sceneStatus: { mode: "downtime", danger: "none", awaitingPlayer: false },
      proposedChanges: [{
        operation: "add",
        domain: "quests",
        targetId: null,
        summary: "A folded note asks the party to meet where the old bell fell.",
        data: { title: "Where the old bell fell", status: "active", stakes: "Someone local wants a private meeting after last night's events." },
        confidence: "medium",
        reason: "Downtime consequence introduced a follow-up thread.",
      }],
    }),
    expected: /old bell fell/,
  },
  {
    name: "combat resolution",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "Mira's spear catches the wolf as it lunges, turning its charge into a skidding crash through wet leaves. The creature snaps once at empty air, then scrambles back with blood darkening its shoulder.",
      }],
      sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
      mechanics: [{ type: "attack", actor: "Mira", target: "Massive wolf", roll: "d20+5 = 18 vs AC 14", damage: "1d8+3 = 9 piercing", outcome: "success", text: "Mira hits the Massive wolf for 9 piercing damage." }],
      proposedChanges: [{
        operation: "update",
        domain: "combat",
        targetId: null,
        summary: "Mira's spear attack resolves and initiative advances.",
        data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "mira" },
        confidence: "high",
        reason: "Submitted combat action resolved with visible mechanics.",
      }],
    }),
    expected: /spear catches the wolf/,
  },
  {
    name: "recovery continuation",
    response: fullTurnResponse({
      table: [{
        speaker: "DM",
        speakerId: null,
        role: "dm",
        kind: "narration",
        visibility: "table",
        text: "The moment settles back into place. The sheriff still waits in the rain with one hand on the ferry rail, and the crowd has not moved; whatever confusion crossed the table, the scene is intact.",
      }],
      sceneStatus: { mode: "social", danger: "tense", awaitingPlayer: false },
      flags: { requiresReview: false, startsCombat: false, endsScene: false, containsSecretInfo: false },
      proposedChanges: [],
    }),
    expected: /scene is intact/,
  },
];
for (const fixture of richFullTurnFixtures) {
  const parsed = parseTurnJsonResponse(JSON.stringify(fixture.response), {
    choicePolicy: { choicesAllowed: false, default: "narration_first" },
  });
  assert.equal(parsed.ok, true, `${fixture.name} full-turn fixture should parse`);
  assert.equal(parsed.response.choices.options.length, 0, `${fixture.name} should not force options`);
  assert.match(renderTurnResponseForImport(parsed.response), fixture.expected, `${fixture.name} should render narration`);
}

const markdownWrapped = parseTurnJsonResponse(`\`\`\`json\n${JSON.stringify(validTurnResponse())}\n\`\`\``);
assert.equal(markdownWrapped.ok, true);
assert.equal(markdownWrapped.recovery, "markdown_stripped");

const textWrapped = parseTurnJsonResponse(`Here is JSON:\n${JSON.stringify(validTurnResponse())}\nthanks`);
assert.equal(textWrapped.ok, true);
assert.equal(textWrapped.recovery, "extracted_json_object");

const qwenThinkingWrapped = parseTurnJsonResponse(`<think>{"table":[{"text":"ignore this private reasoning object"}]}</think>
${JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", content: "Qwen content alias becomes table narration." }],
}))}`);
assert.equal(qwenThinkingWrapped.ok, true);
assert.match(renderTurnResponseForImport(qwenThinkingWrapped.response), /Qwen content alias becomes table narration/);
assert.doesNotMatch(renderTurnResponseForImport(qwenThinkingWrapped.response), /private reasoning/);

const qwenNestedNarrative = parseTurnJsonResponse(JSON.stringify({
  requestId: requestEnvelope.requestId,
  response: {
    narrative: "The shrine stones hum softly as the untouched offering glints in the dusk.",
    sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
    proposedChanges: [],
  },
}), {
  requestId: requestEnvelope.requestId,
});
assert.equal(qwenNestedNarrative.ok, true);
assert.match(renderTurnResponseForImport(qwenNestedNarrative.response), /shrine stones hum softly/);
assert.doesNotMatch(renderTurnResponseForImport(qwenNestedNarrative.response), /empty table response/);

const emptyObjectResponse = parseTurnJsonResponse("{}", {
  requestId: requestEnvelope.requestId,
});
assert.equal(emptyObjectResponse.ok, false);
assert.match(emptyObjectResponse.error, /table must contain at least one entry/);
assert.equal(emptyObjectResponse.response.table.length, 0);

const partialStructured = parseTurnJsonResponse('{"type":"lorekeeper.turn.response","schemaVersion":1,"requestId":"oops"');
assert.equal(partialStructured.ok, false);
assert.equal(partialStructured.response.proposedChanges.length, 0);

const aliasedRole = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "narrator", kind: "narration", visibility: "table", text: "Good role alias." }],
})));
assert.equal(aliasedRole.ok, true);
assert.equal(aliasedRole.response.table[0].role, "dm");

const aliasedKind = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "scene", visibility: "table", text: "Good kind alias." }],
})));
assert.equal(aliasedKind.ok, true);
assert.equal(aliasedKind.response.table[0].kind, "narration");

const aliasedTableVisibility = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "public", text: "Good visibility alias." }],
})));
assert.equal(aliasedTableVisibility.ok, true);
assert.equal(aliasedTableVisibility.response.table[0].visibility, "table");

const aliasedSceneStatus = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  sceneStatus: { mode: "danger", danger: "urgent", awaitingPlayer: "true" },
})));
assert.equal(aliasedSceneStatus.ok, true);
assert.equal(aliasedSceneStatus.response.sceneStatus.mode, "exploration");
assert.equal(aliasedSceneStatus.response.sceneStatus.danger, "immediate");

const aliasedMechanics = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  mechanics: [{ type: "skill_check", actor: "Jarin", outcome: "needs_roll", reason: "Listen for movement." }],
})));
assert.equal(aliasedMechanics.ok, true);
assert.equal(aliasedMechanics.response.mechanics[0].type, "check");
assert.equal(aliasedMechanics.response.mechanics[0].outcome, "pending");

const nestedMechanicRender = renderTurnResponseForImport(validTurnResponse({
  mechanics: [{
    type: "attack",
    actor: "Mira",
    target: "Wolf",
    roll: { formula: "d20+4", natural: 15, bonus: 4, total: 19 },
    damage: "1d8+2 = 7 piercing",
    outcome: "success",
  }],
}));
assert.doesNotMatch(nestedMechanicRender, /\[object Object\]/);
assert.match(nestedMechanicRender, /Roll d20\+4, natural 15, bonus \+4, total 19/);

const combatValidationRequest = {
  ...combatEnvelope,
  requestId: "combat-validation",
  generation: { ...combatEnvelope.generation, responseMode: "resolve_combat" },
  context: {
    ...combatEnvelope.context,
    combat: { ...combatEnvelope.context.combat, inCombat: true, currentTurnId: "mira" },
  },
  user: { ...combatEnvelope.user, inWorld: "Mira attacks the wolf." },
};
const combatMissingMechanics = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [],
  proposedChanges: [],
})), {
  requestId: "combat-validation",
  request: combatValidationRequest,
});
assert.equal(combatMissingMechanics.ok, false);
assert.match(combatMissingMechanics.error, /resolved combat must include visible mechanics/);

const combatVagueMechanics = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Mira", outcome: "success", text: "Mira hits the wolf and hurts it." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Mira's combat turn resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "mira" },
    confidence: "high",
    reason: "Combat action resolved.",
  }],
})), {
  requestId: "combat-validation",
  request: combatValidationRequest,
});
assert.equal(combatVagueMechanics.ok, false);
assert.match(combatVagueMechanics.error, /resolved combat must include visible mechanics/);

const combatNudgeWithoutMechanics = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: true },
  mechanics: [],
  proposedChanges: [],
})), {
  requestId: "combat-validation",
  request: {
    ...combatValidationRequest,
    user: {
      ...combatValidationRequest.user,
      inWorld: "(DM nudge: Continue from the current SQLite campaign state without inventing a player action.)",
    },
  },
});
assert.equal(combatNudgeWithoutMechanics.ok, true);

const combatMissingAdvanceRepaired = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Mira", roll: "d20+1 = 16", outcome: "success", text: "Attack roll 16 hits AC 14." }],
  proposedChanges: [],
})), {
  requestId: "combat-validation",
  request: combatValidationRequest,
});
assert.equal(combatMissingAdvanceRepaired.ok, true);
assert.ok(combatMissingAdvanceRepaired.response.proposedChanges.some((change) =>
  change.domain === "combat" &&
  change.data.turnResolved === true &&
  change.data.advanceTurn === true &&
  change.data.resolvedActorId === "mira"
));
assert.match(combatMissingAdvanceRepaired.response.warnings.join(" "), /inferred turnResolved/);

const combatStructuredInputAdvanceRepaired = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Mira", roll: "d20+1 = 16", damage: "1d6+2 = 6", outcome: "success", text: "Mira's dagger hits the wolf." }],
  proposedChanges: [],
})), {
  requestId: "combat-validation",
  request: {
    ...combatValidationRequest,
    user: {
      ...combatValidationRequest.user,
      inWorld: "",
      playerInputs: [{
        playerId: "guest-am",
        playerName: "Am",
        characterId: "mira",
        characterName: "Mira",
        text: "Mira stabs the wolf.",
        ready: true,
      }],
    },
  },
});
assert.equal(combatStructuredInputAdvanceRepaired.ok, true);
assert.ok(combatStructuredInputAdvanceRepaired.response.proposedChanges.some((change) =>
  change.domain === "combat" &&
  change.data.turnResolved === true &&
  change.data.advanceTurn === true &&
  change.data.resolvedActorId === "mira"
));

const combatNextActorOverreach = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  table: [{
    speaker: "DM",
    speakerId: null,
    role: "dm",
    kind: "narration",
    visibility: "table",
    text: "Mira's blade bites into the wolf. The Massive wolf attacks Garren with its powerful jaws.",
  }],
  mechanics: [{ type: "attack", actor: "Mira", roll: "d20+1 = 16", damage: "1d6+2 = 6", outcome: "success", text: "Mira hits the wolf." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Mira's combat turn resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "mira" },
    confidence: "high",
    reason: "Combat action resolved.",
  }],
})), {
  requestId: "combat-validation",
  request: {
    ...combatValidationRequest,
    context: {
      ...combatValidationRequest.context,
      combat: {
        ...combatValidationRequest.context.combat,
        turnOrder: [
          { id: "massive-wolf", name: "Massive wolf", type: "enemy", initiativeScore: 18 },
          { id: "garren", name: "Garren", type: "party", initiativeScore: 15 },
          { id: "mira", name: "Mira", type: "party", initiativeScore: 11 },
        ],
        currentTurnId: "mira",
      },
    },
    user: { ...combatValidationRequest.user, inWorld: "Mira stabs the wolf." },
  },
});
assert.equal(combatNextActorOverreach.ok, false);
assert.match(combatNextActorOverreach.error, /must not narrate or resolve another combatant/);

const combatResolvedActorMismatch = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Mira", roll: "d20+1 = 16", damage: "1d6+2 = 6", outcome: "success", text: "Mira hits the wolf." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Wrong combat actor resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "massive-wolf" },
    confidence: "high",
    reason: "This should not be accepted for Mira's turn.",
  }],
})), {
  requestId: "combat-validation",
  request: {
    ...combatValidationRequest,
    context: {
      ...combatValidationRequest.context,
      combat: {
        ...combatValidationRequest.context.combat,
        turnOrder: [
          { id: "massive-wolf", name: "Massive wolf", type: "enemy", initiativeScore: 18 },
          { id: "mira", name: "Mira", type: "party", initiativeScore: 11 },
        ],
        currentTurnId: "mira",
      },
    },
    user: { ...combatValidationRequest.user, inWorld: "Mira stabs the wolf." },
  },
});
assert.equal(combatResolvedActorMismatch.ok, false);
assert.match(combatResolvedActorMismatch.error, /must resolve the active actor mira/);

const enemyCombatValidationRequest = {
  ...combatValidationRequest,
  context: {
    ...combatValidationRequest.context,
    combat: {
      ...combatValidationRequest.context.combat,
      turnOrder: [
        { id: "massive-wolf", name: "Massive wolf", type: "enemy", initiativeScore: 18 },
        { id: "mira", name: "Mira", type: "party", initiativeScore: 11 },
      ],
      currentTurnId: "massive-wolf",
    },
  },
  user: { ...combatValidationRequest.user, inWorld: "The app has resolved the Massive wolf's attack." },
};
const enemyCombatSingleActor = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  table: [{
    speaker: "DM",
    speakerId: null,
    role: "dm",
    kind: "narration",
    visibility: "table",
    text: "The Massive wolf snaps at Mira, forcing her back through the ferns.",
  }],
  mechanics: [{ type: "attack", actor: "Massive wolf", target: "Mira", roll: "d20+5 = 17", damage: "1d8+3 = 8", outcome: "success", text: "The wolf hits Mira for 8 piercing damage." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Massive wolf's combat turn resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "massive-wolf" },
    confidence: "high",
    reason: "Enemy combat action resolved.",
  }],
})), {
  requestId: "combat-validation",
  request: enemyCombatValidationRequest,
});
assert.equal(enemyCombatSingleActor.ok, true);

const enemyCombatNextActorOverreach = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  table: [{
    speaker: "DM",
    speakerId: null,
    role: "dm",
    kind: "narration",
    visibility: "table",
    text: "The Massive wolf snaps at Mira. Mira immediately stabs the wolf back before it can recover.",
  }],
  mechanics: [{ type: "attack", actor: "Massive wolf", target: "Mira", roll: "d20+5 = 17", damage: "1d8+3 = 8", outcome: "success", text: "The wolf hits Mira." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Massive wolf's combat turn resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "massive-wolf" },
    confidence: "high",
    reason: "Enemy combat action resolved.",
  }],
})), {
  requestId: "combat-validation",
  request: enemyCombatValidationRequest,
});
assert.equal(enemyCombatNextActorOverreach.ok, false);
assert.match(enemyCombatNextActorOverreach.error, /must not narrate or resolve another combatant/);

const enemyCombatResolvedActorMismatch = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Massive wolf", target: "Mira", roll: "d20+5 = 17", damage: "1d8+3 = 8", outcome: "success", text: "The wolf hits Mira." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Wrong enemy combat actor resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "mira" },
    confidence: "high",
    reason: "This should not be accepted for the wolf's turn.",
  }],
})), {
  requestId: "combat-validation",
  request: enemyCombatValidationRequest,
});
assert.equal(enemyCombatResolvedActorMismatch.ok, false);
assert.match(enemyCombatResolvedActorMismatch.error, /must resolve the active actor massive-wolf/);

const combatWithAdvance = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  requestId: "combat-validation",
  sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
  mechanics: [{ type: "attack", actor: "Mira", roll: "d20+1 = 16", outcome: "success", text: "Attack roll 16 hits AC 14." }],
  proposedChanges: [{
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "Mira's combat turn resolves.",
    data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "mira" },
    confidence: "high",
    reason: "Combat action resolved.",
  }],
})), {
  requestId: "combat-validation",
  request: combatValidationRequest,
});
assert.equal(combatWithAdvance.ok, true);

const aliasedChange = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), operation: "create", domain: "npc", importance: "low", visibility: "public" }],
})));
assert.equal(aliasedChange.ok, true);
assert.equal(aliasedChange.response.proposedChanges[0].operation, "add");
assert.equal(aliasedChange.response.proposedChanges[0].domain, "people");
assert.equal(aliasedChange.response.proposedChanges[0].importance, "minor");
assert.equal(aliasedChange.response.proposedChanges[0].visibility, "player_visible");

const invalidOperation = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), operation: "teleport" }],
})));
assert.equal(invalidOperation.ok, true);
assert.equal(invalidOperation.response.proposedChanges.length, 0);
assert.match(invalidOperation.response.warnings.join(" "), /Dropped invalid proposedChange/);

const invalidDomain = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), domain: "planets" }],
})));
assert.equal(invalidDomain.ok, true);
assert.equal(invalidDomain.response.proposedChanges.length, 0);
assert.match(invalidDomain.response.warnings.join(" "), /Dropped invalid proposedChange/);

const malformedOptionalChange = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), operation: "set", domain: "memories" }],
})));
assert.equal(malformedOptionalChange.ok, true);
assert.equal(malformedOptionalChange.error, null);
assert.equal(malformedOptionalChange.response.proposedChanges.length, 0);

const mismatch = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ requestId: "wrong-id" })), {
  requestId: "right-id",
});
assert.equal(mismatch.ok, false);
assert.match(mismatch.error, /requestId mismatch/);

const repairedMismatch = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ requestId: "wrong-id" })), {
  requestId: "right-id",
  repairRequestIdMismatch: true,
});
assert.equal(repairedMismatch.ok, true);
assert.equal(repairedMismatch.response.requestId, "right-id");
assert.match(repairedMismatch.response.warnings.join(" "), /Repaired model requestId mismatch/);

const objectChoice = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  choices: {
    prompt: "What does Thor do?",
    options: [{ id: "A", actor: "Thor", text: { name: "Counterpunch" } }],
    allowOther: true,
  },
})));
assert.equal(objectChoice.ok, true);
assert.equal(objectChoice.response.choices.options[0].text, "Counterpunch");
assert.doesNotMatch(renderTurnResponseForImport(objectChoice.response), /\[object Object\]/);

const awaitingWithoutChoices = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "Garin patrols the wall as the city settles into a tense quiet." }],
  choices: { prompt: "What now?", options: [], allowOther: true },
})));
assert.equal(awaitingWithoutChoices.ok, true);

const narrationOnlyRender = renderTurnResponseForImport(awaitingWithoutChoices.response);
assert.match(narrationOnlyRender, /Garin patrols the wall/);
assert.doesNotMatch(narrationOnlyRender, /What now\?/);

const majorWithoutReview = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  flags: { requiresReview: false, startsCombat: false, endsScene: false, containsSecretInfo: false },
  proposedChanges: [{ ...validChange(), importance: "major" }],
})));
assert.equal(majorWithoutReview.ok, false);
assert.match(majorWithoutReview.error, /importance major/);

const dmOnlyTable = renderTurnResponseForImport(validTurnResponse({
  table: [
    { speaker: "DM", speakerId: null, role: "dm", kind: "aside", text: "Secret.", visibility: "dm_only" },
    { speaker: "DM", speakerId: null, role: "dm", kind: "narration", text: "Visible.", visibility: "table" },
  ],
}));
assert.doesNotMatch(dmOnlyTable, /Secret/);
assert.match(dmOnlyTable, /Visible/);

const splitMechanics = splitMechanicsFromBlock(
  "Garren's blade slices through the air. Damage: Garren's attack hits! Damage: 1d8 + 4 = 12. The miner takes 12 damage (Hostile Miner HP: 0 -> -12).",
);
assert.equal(splitMechanics[0].type, "text");
assert.match(splitMechanics[0].text, /Garren's blade slices/);
assert.equal(splitMechanics[1].type, "mechanics");
assert.equal(splitMechanics[1].rows.length, 1);
assert.equal(splitMechanics[1].rows[0].label, "Damage");
assert.match(splitMechanics[1].rows[0].detail, /1d8 \+ 4 = 12/);
assert.match(splitMechanics[1].rows[0].detail, /HP: 0 -> -12/);

const duplicatedMechanics = dedupeMechanicsRows([
  ...splitMechanics[1].rows,
  ...splitMechanicsFromBlock("Damage: 1d8 + 4 = 12. The miner takes 12 damage (Hostile Miner HP: 0 -> -12).")[0].rows,
]);
assert.equal(duplicatedMechanics.length, 1);

const attackMechanics = splitMechanicsFromBlock(
  "The hostile miner lunges. Hostile Miner's Attack: d20 + 5 = 18 vs AC 14; Hit. Damage: 2d6 + 3 = 15.",
);
assert.equal(attackMechanics[1].rows.length, 2);
assert.equal(attackMechanics[1].rows[0].label, "Hostile Miner's Attack");
assert.match(attackMechanics[1].rows[0].detail, /18 vs AC 14/);
assert.equal(attackMechanics[1].rows[1].label, "Damage");

assert.equal(validateTurnResponse(validTurnResponse()).valid, true);

console.log("LoreKeeper JSON contract tests passed.");

function testCampaign() {
  return {
    id: "test-campaign",
    title: "Test Campaign",
    summary: "A compact test campaign.",
    style: { tone: "tense scout adventure" },
    scene: {
      status: "active",
      currentPlaceId: "forest",
      presentPeopleIds: ["trainer"],
      presentPartyMemberIds: ["jarin"],
      activeQuestIds: ["flag-test"],
      immediateSituation: "Jarin and Kevric are sprinting through the forest.",
    },
    combat: { inCombat: false },
    party: [
      {
        id: "jarin",
        name: "Jarin",
        role: "Player character ranger",
        skills: ["Perception", "Stealth"],
        notes: ["Training scout."],
      },
    ],
  };
}

function testContextPack(kind = "current_scene") {
  return {
    sections: [
      {
        kind,
        title: "Current Scene",
        entries: [
          "Jarin and Kevric are running through the forest toward a training camp.",
          "A rival trainee may be nearby.",
          "The test is to steal the flag without being caught.",
          "The mood is tense but not lethal.",
          "Kevric is slower than Jarin.",
        ],
      },
    ],
  };
}

function rulesCampaign() {
  return {
    id: "rules-campaign",
    title: "Rules Campaign",
    summary: "A rules ledger test campaign.",
    style: {
      tone: "tactical fantasy",
      pacing: "clean turns",
      narrationRules: ["Keep agency explicit."],
      formattingRules: ["End with lettered choices."],
    },
    scene: {
      status: "active",
      currentPlaceId: "ruins",
      presentPeopleIds: [],
      presentPartyMemberIds: ["mira"],
      activeQuestIds: [],
      immediateSituation: "Mira is facing a threat in old ruins.",
      localNotes: [],
      nearbyPlaceIds: [],
    },
    combat: {
      inCombat: true,
      round: 1,
      initiative: ["mira"],
      enemies: [],
      conditions: [],
      turnEconomy: {
        mira: {
          action: "available",
          bonusAction: "available",
          reaction: "available",
          movementRemainingFt: 25,
        },
      },
      turnFormat: "Actor, options, chosen, rolls, updates, narration.",
      preferences: [],
    },
    rulesProfile: {
      name: "D&D 5e Lite",
      purpose: "Test rules.",
      coreStats: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
      diceConventions: { defaultCheck: "d20 + modifier" },
      combatLoop: [],
      providerGuardRails: [],
    },
    places: [{ id: "ruins", name: "Old Ruins", summary: "Broken stone and thorny cover." }],
    people: [],
    quests: [],
    inventory: [],
    items: [],
    relationships: [],
    lore: [],
    party: [
      {
        id: "mira",
        name: "Mira",
        type: "player_character",
        playerRole: "Player character",
        ancestryClass: "Wood elf druid",
        level: 3,
        proficiencyBonus: 2,
        speedFt: 30,
        stats: {
          hp: { current: 18, max: 24 },
          armorClass: 14,
          abilityScores: { STR: 8, DEX: 14, CON: 13, INT: 12, WIS: 16, CHA: 10 },
        },
        skills: [{ name: "Perception" }, "Survival"],
        abilities: [{ name: "Wild Shape" }, "Primal spellcasting"],
        spells: ["Druidcraft", "Entangle", "Goodberry"],
        resources: {
          spellSlots: {
            1: { max: 4, used: 1 },
            2: { max: 2, used: 0 },
          },
          uses: {
            wildShape: { max: 2, used: 0 },
          },
        },
        attacks: [
          { name: "Quarterstaff", attackBonus: 1, damage: "1d6-1", range: "5 ft" },
        ],
        conditions: [],
        notes: ["Rules ledger fixture."],
      },
    ],
  };
}

function validTurnResponse(overrides = {}) {
  return {
    type: "lorekeeper.turn.response",
    schemaVersion: 1,
    requestId: "turn-test",
    table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "A branch snaps ahead." }],
    sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
    choices: {
      prompt: "What does Jarin do?",
      scope: "character",
      forActorId: "jarin",
      forActor: "Jarin",
      options: [{ id: "A", actorId: "jarin", actor: "Jarin", legalOptionId: "move", text: "Drop low and listen." }],
      allowOther: true,
    },
    mechanics: [
      {
        type: "suggested_check",
        actorId: "jarin",
        actor: "Jarin",
        ability: "WIS",
        skill: "Perception",
        roll: "d20+3",
        dc: 12,
        reason: "Spot the other trainee.",
        outcome: "pending",
        label: "Perception",
        text: "Roll if Jarin pauses to locate the sound.",
      },
    ],
    flags: { requiresReview: true, startsCombat: false, endsScene: false, containsSecretInfo: false },
    proposedChanges: [validChange()],
    warnings: [],
    ...overrides,
  };
}

function fullTurnResponse(overrides = {}) {
  return validTurnResponse({
    mechanics: [],
    choices: { prompt: "", options: [], allowOther: true },
    ...overrides,
  });
}

function validChange() {
  return {
    operation: "note",
    domain: "scene",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary: "A branch snapped nearby.",
    data: { immediateSituation: "Someone may be nearby in the forest." },
    confidence: "high",
    reason: "Direct scene event.",
  };
}
