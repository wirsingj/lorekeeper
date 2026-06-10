import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createStarterCampaign } from "../src/campaign-state/starter-campaign.js";
import {
  defaultCampaignSqlitePath,
  readCampaignSqliteSummary,
  writeCampaignSqliteFile,
} from "../src/storage/sqlite-store.js";

const title = process.argv[2] ?? "New Lorekeeper Campaign";
const premise =
  process.argv[3] ??
  "A new fantasy campaign ready to grow through play, with canon captured by Lorekeeper.";
const outputPath = process.argv[4] ?? defaultCampaignSqlitePath(title);

const campaign = createStarterCampaign({
  title,
  premise,
});

await mkdir(path.dirname(outputPath), { recursive: true });
const writeResult = await writeCampaignSqliteFile(campaign, outputPath);
const summary = await readCampaignSqliteSummary(outputPath);

console.log("Created local SQLite campaign file.");
console.log(`Title: ${summary.campaign.title}`);
console.log(`Path: ${writeResult.path}`);
console.log(`Bytes: ${writeResult.bytes}`);
console.log(`Record domains: ${Object.keys(summary.counts).join(", ")}`);

