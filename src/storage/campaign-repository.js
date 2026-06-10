import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createSampleCampaign } from "../campaign-state/sample-campaign.js";
import { normalizeCampaign } from "../campaign-state/schema.js";
import {
  overwriteCampaignSqliteFile,
  readCampaignFromSqliteFile,
  writeCampaignSqliteFile,
} from "./sqlite-store.js";

export const activeCampaignFileName = "active-campaign.lorekeeper.sqlite";

export async function loadActiveCampaign(projectRoot) {
  const sqlitePath = getActiveCampaignPath(projectRoot);

  if (existsSync(sqlitePath)) {
    return {
      campaign: await readCampaignFromSqliteFile(sqlitePath),
      sqlitePath,
      source: "sqlite",
    };
  }

  const seed = await loadSeedCampaign(projectRoot);
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  await writeCampaignSqliteFile(seed.campaign, sqlitePath);

  return {
    campaign: seed.campaign,
    sqlitePath,
    source: seed.source,
  };
}

export async function saveActiveCampaign(projectRoot, campaign) {
  const sqlitePath = getActiveCampaignPath(projectRoot);
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  const result = await overwriteCampaignSqliteFile(campaign, sqlitePath);

  return {
    sqlitePath,
    bytes: result.bytes,
  };
}

function getActiveCampaignPath(projectRoot) {
  return path.join(projectRoot, "data", "runtime", activeCampaignFileName);
}

async function loadSeedCampaign(projectRoot) {
  const importedPath = path.join(projectRoot, "data", "imports", "veil-of-the-towers.bundle.json");

  if (existsSync(importedPath)) {
    const bundle = JSON.parse(await readFile(importedPath, "utf8"));
    return {
      campaign: normalizeCampaign(bundle.campaign),
      source: "imported_bundle",
    };
  }

  return {
    campaign: createSampleCampaign(),
    source: "sample",
  };
}

