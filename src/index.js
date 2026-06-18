import { createSampleCampaign } from "./campaign-state/sample-campaign.js";
import { normalizeCampaign, validateCampaign } from "./campaign-state/schema.js";
import { buildContextPack, renderContextPackMarkdown } from "./context-packs/build-context-pack.js";
import { buildTableDmPrompt } from "./prompt-builder/build-prompt.js";
import { createReviewBatch, summarizeReviewBatch } from "./canon-review/proposals.js";
import { createManualWorkflow } from "./provider-bridge/manual-workflow.js";
import { createCampaignBundle, serializeCampaignBundle } from "./storage/campaign-bundle.js";
import { readFileSync, existsSync } from "node:fs";

const importedBundlePath = new URL("../data/imports/veil-of-the-towers.bundle.json", import.meta.url);
const campaign = normalizeCampaign(existsSync(importedBundlePath)
  ? JSON.parse(readFileSync(importedBundlePath, "utf8")).campaign
  : createSampleCampaign());
const errors = validateCampaign(campaign);

if (errors.length > 0) {
  throw new Error(`Sample campaign failed validation: ${errors.join(" ")}`);
}

const contextPack = buildContextPack(campaign, {
  purpose: "demo_next_turn",
});

const prompt = buildTableDmPrompt({
  campaign,
  contextPack,
  userIntent:
    campaign.id === "veil-of-the-towers"
      ? "Continue from the current saved scene and keep canon, relationships, and combat/turn style consistent."
      : "Continue from the Lower Archive entrance and keep Mara's motives ambiguous.",
});

const reviewBatch = createReviewBatch({
  campaignId: campaign.id,
  source: "demo",
  rawResponse: "Demo response placeholder.",
  proposedChanges: [
    {
      operation: "note",
      domain: "quests",
      targetId: "quest-lower-archive",
      summary: "Mara is considering a bargain before granting archive access.",
      data: {
        note: "Mara wants assurance the party will not reveal Lantern Keeper records.",
      },
      confidence: "medium",
      reason: "The next scene is framed around Mara's decision.",
    },
  ],
});

const workflow = createManualWorkflow(prompt);
const bundle = createCampaignBundle(campaign);

console.log("LoreKeeper project check passed.");
console.log(`Campaign: ${campaign.title}`);
console.log(`Context sections: ${contextPack.sections.length}`);
console.log(`Prompt characters: ${prompt.length}`);
console.log(`Manual workflow steps: ${workflow.steps.length}`);
console.log(`Review changes: ${summarizeReviewBatch(reviewBatch).length}`);
console.log(`Bundle characters: ${serializeCampaignBundle(bundle).length}`);
console.log("");
console.log(renderContextPackMarkdown(contextPack).split("\n").slice(0, 18).join("\n"));
