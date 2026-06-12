import assert from "node:assert/strict";
import { extractLorekeeperUpdates, stripLorekeeperUpdates } from "../src/canon-review/extract-updates.js";
import { createReviewBatch, getCommittableChanges } from "../src/canon-review/proposals.js";

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

console.log("Lorekeeper JSON contract tests passed.");
