import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { importCampaignFolder } from "../src/importers/campaign-folder-importer.js";
import { createCampaignBundle, serializeCampaignBundle } from "../src/storage/campaign-bundle.js";

const folderPath = process.argv[2];

if (!folderPath) {
  console.error("Usage: npm run import:folder -- <campaign-folder-path> [output-path]");
  process.exit(1);
}

const outputPath =
  process.argv[3] ??
  path.join(process.cwd(), "data", "imports", `${slugify(path.basename(folderPath))}.bundle.json`);

const { campaign, importReport } = await importCampaignFolder(folderPath);
const bundle = createCampaignBundle(campaign);
const output = {
  ...bundle,
  importReport,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, serializeCampaignBundle(output), "utf8");

console.log("Imported campaign folder.");
console.log(`Title: ${campaign.title}`);
console.log(`Source documents: ${campaign.sourceDocuments.length}`);
console.log(`Assets: ${campaign.assets.length}`);
console.log(`Party members: ${campaign.party.length}`);
console.log(`People/NPCs: ${campaign.people.length}`);
console.log(`Places: ${campaign.places.length}`);
console.log(`Quests: ${campaign.quests.length}`);
console.log(`Output: ${outputPath}`);

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

