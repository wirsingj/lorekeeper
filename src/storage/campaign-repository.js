import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCampaign } from "../campaign-state/schema.js";
import { createStarterCampaign } from "../campaign-state/starter-campaign.js";
import {
  overwriteCampaignSqliteFile,
  readCampaignFromSqliteFile,
  writeCampaignSqliteFile,
} from "./sqlite-store.js";

export const activeCampaignFileName = "active-campaign.lorekeeper.sqlite";
export const campaignIndexFileName = "campaign-index.json";

export async function loadActiveCampaign(projectRoot) {
  const index = await loadCampaignIndex(projectRoot);
  const selectedPath = index.activeCampaignPath;
  const migratedPath = selectedPath && existsSync(selectedPath)
    ? null
    : await migrateRuntimeCampaignIfNeeded(projectRoot);
  const sqlitePath = selectedPath && existsSync(selectedPath)
    ? selectedPath
    : (migratedPath ?? await findFirstCampaignPath(projectRoot));

  if (existsSync(sqlitePath)) {
    const campaign = await readCampaignFromSqliteFile(sqlitePath);
    await upsertCampaignIndexEntry(projectRoot, {
      campaign,
      sqlitePath,
      makeActive: true,
    });
    return {
      campaign,
      sqlitePath,
      source: "sqlite",
      campaigns: (await listCampaigns(projectRoot)).campaigns,
    };
  }

  const seed = await loadSeedCampaign(projectRoot);
  const seedPath = campaignFilePath(projectRoot, seed.campaign.title);
  await mkdir(path.dirname(seedPath), { recursive: true });
  await writeCampaignSqliteFile(seed.campaign, seedPath);
  await upsertCampaignIndexEntry(projectRoot, {
    campaign: seed.campaign,
    sqlitePath: seedPath,
    makeActive: true,
  });

  return {
    campaign: seed.campaign,
    sqlitePath: seedPath,
    source: seed.source,
    campaigns: (await listCampaigns(projectRoot)).campaigns,
  };
}

export async function listCampaigns(projectRoot) {
  const campaignsDir = getCampaignsDir(projectRoot);
  await mkdir(campaignsDir, { recursive: true });
  const index = await loadCampaignIndex(projectRoot);
  const sqlitePaths = new Set(
    [
      ...index.campaigns.map((entry) => entry.sqlitePath),
      ...(await findCampaignFiles(projectRoot)),
    ].filter(Boolean),
  );

  const campaigns = [];
  for (const sqlitePath of sqlitePaths) {
    if (!existsSync(sqlitePath)) {
      continue;
    }

    try {
      const campaign = await readCampaignFromSqliteFile(sqlitePath);
      campaigns.push({
        id: campaign.id,
        title: campaign.title,
        summary: campaign.summary,
        sqlitePath,
        active: sqlitePath === index.activeCampaignPath,
        updatedAt: campaign.updatedAt,
      });
    } catch {
      // Ignore unreadable pre-release files; schema is still in motion.
    }
  }

  return {
    activeCampaignPath: index.activeCampaignPath,
    campaigns: campaigns.sort((a, b) => a.title.localeCompare(b.title)),
  };
}

export async function selectCampaign(projectRoot, sqlitePath) {
  const resolvedPath = path.resolve(sqlitePath);
  if (!resolvedPath.startsWith(getCampaignsDir(projectRoot))) {
    throw new Error("Campaign must be inside data/campaigns.");
  }

  if (!existsSync(resolvedPath)) {
    throw new Error("Campaign file not found.");
  }

  const campaign = await readCampaignFromSqliteFile(resolvedPath);
  await upsertCampaignIndexEntry(projectRoot, {
    campaign,
    sqlitePath: resolvedPath,
    makeActive: true,
  });

  return {
    campaign,
    sqlitePath: resolvedPath,
    source: "sqlite",
    campaigns: (await listCampaigns(projectRoot)).campaigns,
  };
}

export async function createNewActiveCampaign(projectRoot, options = {}) {
  const campaign = createStarterCampaign({
    title: options.title ?? "New Campaign Binder",
    premise: options.premise ?? "A new D&D 5e-lite campaign ready to grow through play.",
    openingScene: options.openingScene,
    startingLocation: options.startingLocation,
    tone: options.tone,
  });
  const sqlitePath = campaignFilePath(projectRoot, campaign.title);
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  await writeCampaignSqliteFile(campaign, sqlitePath);
  await upsertCampaignIndexEntry(projectRoot, {
    campaign,
    sqlitePath,
    makeActive: true,
  });

  return {
    campaign,
    sqlitePath,
    source: "starter",
    campaigns: (await listCampaigns(projectRoot)).campaigns,
  };
}

export async function saveActiveCampaign(projectRoot, campaign) {
  const index = await loadCampaignIndex(projectRoot);
  const sqlitePath = index.activeCampaignPath && existsSync(index.activeCampaignPath)
    ? index.activeCampaignPath
    : campaignFilePath(projectRoot, campaign.title);
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  const result = await overwriteCampaignSqliteFile(campaign, sqlitePath);
  await upsertCampaignIndexEntry(projectRoot, {
    campaign,
    sqlitePath,
    makeActive: true,
  });

  return {
    sqlitePath,
    bytes: result.bytes,
  };
}

export async function resetActiveCampaign(projectRoot, campaign) {
  return saveActiveCampaign(projectRoot, normalizeCampaign(campaign));
}

export async function loadImportedCampaign(projectRoot) {
  const importedPath = path.join(projectRoot, "data", "imports", "veil-of-the-towers.bundle.json");
  if (!existsSync(importedPath)) {
    throw new Error("No imported campaign bundle found.");
  }

  const bundle = JSON.parse(await readFile(importedPath, "utf8"));
  const campaign = normalizeCampaign(bundle.campaign);
  const sqlitePath = campaignFilePath(projectRoot, campaign.title);
  await mkdir(path.dirname(sqlitePath), { recursive: true });
  await writeCampaignSqliteFile(campaign, sqlitePath);
  await upsertCampaignIndexEntry(projectRoot, {
    campaign,
    sqlitePath,
    makeActive: true,
  });

  return {
    campaign,
    sqlitePath,
    source: "imported_bundle",
    campaigns: (await listCampaigns(projectRoot)).campaigns,
  };
}

async function loadSeedCampaign(projectRoot) {
  return {
    campaign: createStarterCampaign({
      title: "New Campaign Binder",
      premise: "A new D&D 5e-lite campaign ready to grow through play.",
    }),
    source: "starter",
  };
}

async function loadCampaignIndex(projectRoot) {
  const indexPath = getCampaignIndexPath(projectRoot);
  if (!existsSync(indexPath)) {
    return {
      activeCampaignPath: null,
      campaigns: [],
    };
  }

  const index = JSON.parse(await readFile(indexPath, "utf8"));
  return {
    activeCampaignPath: index.activeCampaignPath ?? null,
    campaigns: Array.isArray(index.campaigns) ? index.campaigns : [],
  };
}

async function saveCampaignIndex(projectRoot, index) {
  const indexPath = getCampaignIndexPath(projectRoot);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index, null, 2));
}

async function upsertCampaignIndexEntry(projectRoot, { campaign, sqlitePath, makeActive = false }) {
  const resolvedPath = path.resolve(sqlitePath);
  const index = await loadCampaignIndex(projectRoot);
  const entry = {
    id: campaign.id,
    title: campaign.title,
    summary: campaign.summary,
    sqlitePath: resolvedPath,
    updatedAt: campaign.updatedAt,
  };
  const campaigns = index.campaigns.filter((item) => item.sqlitePath !== resolvedPath && item.id !== campaign.id);
  campaigns.push(entry);
  await saveCampaignIndex(projectRoot, {
    activeCampaignPath: makeActive ? resolvedPath : index.activeCampaignPath,
    campaigns: campaigns.sort((a, b) => a.title.localeCompare(b.title)),
  });
}

async function findFirstCampaignPath(projectRoot) {
  return campaignFilePath(projectRoot, "New Campaign Binder");
}

async function findCampaignFiles(projectRoot) {
  const campaignsDir = getCampaignsDir(projectRoot);
  if (!existsSync(campaignsDir)) {
    return [];
  }

  const entries = await readdir(campaignsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".lorekeeper.sqlite"))
    .map((entry) => path.join(campaignsDir, entry.name));
}

async function uniqueCampaignFilePath(projectRoot, title) {
  const basePath = campaignFilePath(projectRoot, title);
  if (!existsSync(basePath)) {
    return basePath;
  }

  const extension = ".lorekeeper.sqlite";
  const baseName = path.basename(basePath, extension);
  const dir = path.dirname(basePath);
  let counter = 2;
  while (true) {
    const candidate = path.join(dir, `${baseName}-${counter}${extension}`);
    if (!existsSync(candidate)) {
      return candidate;
    }
    counter += 1;
  }
}

function campaignFilePath(projectRoot, title) {
  return path.join(getCampaignsDir(projectRoot), `${slugify(title)}.lorekeeper.sqlite`);
}

function getCampaignsDir(projectRoot) {
  return path.join(projectRoot, "data", "campaigns");
}

async function migrateRuntimeCampaignIfNeeded(projectRoot) {
  const runtimePath = path.join(projectRoot, "data", "runtime", activeCampaignFileName);
  if (!existsSync(runtimePath)) {
    return null;
  }

  try {
    const campaign = await readCampaignFromSqliteFile(runtimePath);
    if (campaign.title === "Veil of the Towers") {
      return null;
    }

    const sqlitePath = existsSync(campaignFilePath(projectRoot, campaign.title))
      ? await uniqueCampaignFilePath(projectRoot, campaign.title)
      : campaignFilePath(projectRoot, campaign.title);
    await mkdir(path.dirname(sqlitePath), { recursive: true });
    await writeCampaignSqliteFile(campaign, sqlitePath);
    await upsertCampaignIndexEntry(projectRoot, {
      campaign,
      sqlitePath,
      makeActive: true,
    });
    return sqlitePath;
  } catch {
    return null;
  }
}

function getCampaignIndexPath(projectRoot) {
  return path.join(getCampaignsDir(projectRoot), campaignIndexFileName);
}

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
