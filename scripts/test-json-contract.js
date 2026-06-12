import assert from "node:assert/strict";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createReviewBatch, getCommittableChanges } from "../src/canon-review/proposals.js";
import {
  buildTurnRequestEnvelope,
  parseTurnJsonResponse,
  renderTurnResponseForImport,
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
  campaign: {
    id: "test-campaign",
    title: "Test Campaign",
    summary: "A compact test campaign.",
    scene: {
      status: "active",
      currentPlaceId: "forest",
      presentPeopleIds: ["trainer"],
      presentPartyMemberIds: ["jarin"],
      activeQuestIds: ["flag-test"],
    },
    party: [
      {
        id: "jarin",
        name: "Jarin",
        role: "Player character ranger",
        skills: ["Perception", "Stealth"],
        notes: ["Training scout."],
      },
    ],
  },
  contextPack: {
    sections: [
      {
        kind: "current_scene",
        title: "Current Scene",
        entries: ["Jarin and Kevric are running through the forest toward a training camp."],
      },
    ],
  },
  playerTurn: "I roll d20+3 perception to spot the other trainee. (Keep it tense.)",
  parsedMessage: {
    raw: "I roll d20+3 perception to spot the other trainee. (Keep it tense.)",
    inWorldText: "I roll d20+3 perception to spot the other trainee.",
    metaInstructions: ["Keep it tense."],
  },
});
assert.equal(requestEnvelope.lorekeeperRequest, "turn-json-v1");
assert.equal(requestEnvelope.user.actionIntent, "skill_or_scene_check");
assert.equal(requestEnvelope.user.requestedRolls.length, 2);
assert.equal(requestEnvelope.context.tableVoices[0].name, "Jarin");

const structured = parseTurnJsonResponse(JSON.stringify({
  lorekeeperResponse: "turn-json-v1",
  table: [{ speaker: "DM", role: "dm", text: "A branch snaps ahead." }],
  choices: {
    prompt: "What does Jarin do?",
    options: [{ id: "1", text: "Drop low and listen." }],
    allowOther: true,
  },
  mechanics: [{ type: "check", actor: "Jarin", roll: "d20+3", dc: 12, outcome: "pending", label: "Perception", text: "Roll if Jarin pauses to locate the sound." }],
  proposedChanges: [],
}));
assert.equal(structured.error, null);
const renderedStructured = renderTurnResponseForImport(structured.response);
assert.match(renderedStructured, /A branch snaps ahead/);
assert.match(renderedStructured, /Perception: Roll if Jarin pauses/);
assert.match(renderedStructured, /```json lorekeeper_updates/);

console.log("Lorekeeper JSON contract tests passed.");
