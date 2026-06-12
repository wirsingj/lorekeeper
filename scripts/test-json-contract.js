import assert from "node:assert/strict";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createReviewBatch, getCommittableChanges } from "../src/canon-review/proposals.js";
import {
  buildTurnRequestEnvelope,
  parseTurnJsonResponse,
  renderTurnResponseForImport,
  validateTurnRequest,
  validateTurnResponse,
} from "../src/model-contract/turn-json-contract.js";

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
assert.match(missing.error, /No Lorekeeper update JSON/);

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
});
assert.equal(requestEnvelope.type, "lorekeeper.turn.request");
assert.equal(requestEnvelope.schemaVersion, 1);
assert.equal(requestEnvelope.user.actionIntent, "skill_or_scene_check");
assert.equal(requestEnvelope.generation.responseMode, "resolve_check");
assert.equal(requestEnvelope.user.requestedRolls.length, 2);
assert.equal(requestEnvelope.context.tableVoices[0].name, "Jarin");
assert.equal(validateTurnRequest(requestEnvelope).valid, true);

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

const structured = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ requestId: requestEnvelope.requestId })), {
  requestId: requestEnvelope.requestId,
});
assert.equal(structured.error, null);
const renderedStructured = renderTurnResponseForImport(structured.response);
assert.match(renderedStructured, /A branch snaps ahead/);
assert.match(renderedStructured, /Perception: Roll if Jarin pauses/);
assert.match(renderedStructured, /```json lorekeeper_updates/);

const noChanges = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ proposedChanges: [] })));
assert.equal(noChanges.response.proposedChanges.length, 0);

const markdownWrapped = parseTurnJsonResponse(`\`\`\`json\n${JSON.stringify(validTurnResponse())}\n\`\`\``);
assert.equal(markdownWrapped.ok, true);
assert.equal(markdownWrapped.recovery, "markdown_stripped");

const textWrapped = parseTurnJsonResponse(`Here is JSON:\n${JSON.stringify(validTurnResponse())}\nthanks`);
assert.equal(textWrapped.ok, true);
assert.equal(textWrapped.recovery, "extracted_json_object");

const partialStructured = parseTurnJsonResponse('{"type":"lorekeeper.turn.response","schemaVersion":1,"requestId":"oops"');
assert.equal(partialStructured.ok, false);
assert.equal(partialStructured.response.proposedChanges.length, 0);

const invalidRole = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "wizard", kind: "narration", visibility: "table", text: "Bad role." }],
})));
assert.equal(invalidRole.ok, false);
assert.match(invalidRole.error, /table\[0\]\.role/);

const invalidKind = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "cutscene", visibility: "table", text: "Bad kind." }],
})));
assert.equal(invalidKind.ok, false);
assert.match(invalidKind.error, /table\[0\]\.kind/);

const invalidTableVisibility = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "secret_player", text: "Bad visibility." }],
})));
assert.equal(invalidTableVisibility.ok, false);
assert.match(invalidTableVisibility.error, /table\[0\]\.visibility/);

const invalidOperation = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), operation: "teleport" }],
})));
assert.equal(invalidOperation.ok, false);
assert.equal(invalidOperation.response.proposedChanges.length, 0);

const invalidDomain = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  proposedChanges: [{ ...validChange(), domain: "planets" }],
})));
assert.equal(invalidDomain.ok, false);
assert.equal(invalidDomain.response.proposedChanges.length, 0);

const mismatch = parseTurnJsonResponse(JSON.stringify(validTurnResponse({ requestId: "wrong-id" })), {
  requestId: "right-id",
});
assert.equal(mismatch.ok, false);
assert.match(mismatch.error, /requestId mismatch/);

const missingChoices = parseTurnJsonResponse(JSON.stringify(validTurnResponse({
  choices: { prompt: "What now?", options: [], allowOther: true },
})));
assert.equal(missingChoices.ok, false);
assert.match(missingChoices.error, /choices\.options/);

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

assert.equal(validateTurnResponse(validTurnResponse()).valid, true);

console.log("Lorekeeper JSON contract tests passed.");

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

function validTurnResponse(overrides = {}) {
  return {
    type: "lorekeeper.turn.response",
    schemaVersion: 1,
    requestId: "turn-test",
    table: [{ speaker: "DM", speakerId: null, role: "dm", kind: "narration", visibility: "table", text: "A branch snaps ahead." }],
    sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
    choices: {
      prompt: "What does Jarin do?",
      options: [{ id: "1", text: "Drop low and listen." }],
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
