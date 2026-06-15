import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCampaign } from "../campaign-state/schema.js";
import { createStarterCampaign } from "../campaign-state/starter-campaign.js";
import { ensureInferredPlayerCharacter } from "../campaign-state/player-character-inference.js";
import {
  appendCampaignErrorToSqliteFile,
  overwriteCampaignSqliteFile,
  readCampaignFromSqliteFile,
  writeCampaignSqliteFile,
} from "./sqlite-store.js";

export const campaignIndexFileName = "campaign-index.json";
export const campaignIndexVersion = "2.0.0";
const writeQueues = new Map();

export async function loadActiveCampaign(projectRoot) {
  const index = await loadCampaignIndex(projectRoot);
  const selectedPath = index.activeCampaignPath;
  const hiddenPaths = hiddenPathSet(index);
  const selectedPathAvailable = selectedPath
    && existsSync(selectedPath)
    && !hiddenPaths.has(path.resolve(selectedPath))
    && !(await isCampaignHidden(selectedPath));
  const sqlitePath = selectedPathAvailable
    ? selectedPath
    : await findFirstVisibleCampaignPath(projectRoot, hiddenPaths);

  if (sqlitePath && existsSync(sqlitePath)) {
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

  let seed = await loadSeedCampaign(projectRoot);
  const seedTitle = await uniqueCampaignTitle(projectRoot, seed.campaign.title);
  if (seedTitle !== seed.campaign.title) {
    seed = {
      ...seed,
      campaign: createStarterCampaign({
        title: seedTitle,
        premise: seed.campaign.summary,
      }),
    };
  }
  const seedPath = await uniqueCampaignFilePath(projectRoot, seed.campaign.title);
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
  const hiddenPaths = hiddenPathSet(index);
  const sqlitePaths = new Set(
    [
      ...index.campaigns.map((entry) => entry.sqlitePath),
      ...(await findCampaignFiles(projectRoot)),
    ].filter(Boolean),
  );

  const campaigns = [];
  for (const sqlitePath of sqlitePaths) {
    const resolvedPath = path.resolve(sqlitePath);
    if (!existsSync(resolvedPath) || hiddenPaths.has(resolvedPath)) {
      continue;
    }

    try {
      const campaign = await readCampaignFromSqliteFile(resolvedPath);
      if (campaign.hidden) {
        continue;
      }
      campaigns.push({
        id: campaign.id,
        title: campaign.title,
        summary: campaign.summary,
        sqlitePath: resolvedPath,
        active: resolvedPath === index.activeCampaignPath,
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
  if (!isPathInside(resolvedPath, getCampaignsDir(projectRoot))) {
    throw new Error("Campaign must be inside data/campaigns.");
  }

  if (!existsSync(resolvedPath)) {
    throw new Error("Campaign file not found.");
  }
  if (hiddenPathSet(await loadCampaignIndex(projectRoot)).has(resolvedPath)) {
    throw new Error("Campaign is hidden.");
  }

  const campaign = await readCampaignFromSqliteFile(resolvedPath);
  if (campaign.hidden) {
    throw new Error("Campaign is hidden.");
  }
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
  const title = cleanCampaignTitle(options.title);
  await assertUniqueCampaignTitle(projectRoot, title);
  const starterCampaign = createStarterCampaign({
    title,
    premise: options.premise ?? "A new D&D 5e-lite campaign ready to grow through play.",
    openingScene: options.openingScene,
    startingLocation: options.startingLocation,
    tone: options.tone,
    providerSettings: options.providerSettings,
  });
  const { campaign } = ensureInferredPlayerCharacter(starterCampaign);
  const sqlitePath = await uniqueCampaignFilePath(projectRoot, campaign.title);
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

export async function hideCampaign(projectRoot, { sqlitePath, campaignTitle }) {
  return deleteCampaign(projectRoot, { sqlitePath, campaignTitle });
}

export async function deleteCampaign(projectRoot, { sqlitePath }) {
  const resolvedPath = path.resolve(sqlitePath ?? "");
  if (!isPathInside(resolvedPath, getCampaignsDir(projectRoot))) {
    throw new Error("Campaign must be inside data/campaigns.");
  }

  if (!existsSync(resolvedPath)) {
    throw new Error("Campaign file not found.");
  }

  const campaign = await readCampaignFromSqliteFile(resolvedPath);
  const index = await loadCampaignIndex(projectRoot);
  await deleteSqliteStoreFiles(resolvedPath);
  const nextCampaigns = index.campaigns.filter((entry) =>
    path.resolve(entry.sqlitePath) !== resolvedPath &&
    entry.id !== campaign.id
  );
  const nextHiddenPaths = index.hiddenCampaignPaths.filter((hiddenPath) => path.resolve(hiddenPath) !== resolvedPath);
  await saveCampaignIndex(projectRoot, {
    activeCampaignPath: index.activeCampaignPath === resolvedPath ? null : index.activeCampaignPath,
    campaigns: nextCampaigns,
    hiddenCampaignPaths: nextHiddenPaths,
  });

  return loadActiveCampaign(projectRoot);
}

async function deleteSqliteStoreFiles(sqlitePath) {
  await rm(sqlitePath, { force: true });
  await rm(`${sqlitePath}-wal`, { force: true });
  await rm(`${sqlitePath}-shm`, { force: true });
}

export async function saveActiveCampaign(projectRoot, campaign) {
  return enqueueCampaignWrite(projectRoot, () => saveActiveCampaignNow(projectRoot, campaign));
}

async function saveActiveCampaignNow(projectRoot, campaign) {
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

export async function updateActiveCampaign(projectRoot, updater) {
  return enqueueCampaignWrite(projectRoot, async () => {
    const { campaign } = await loadActiveCampaign(projectRoot);
    const result = await updater(campaign);
    const nextCampaign = normalizeCampaign(result.campaign ?? result);
    const saveResult = await saveActiveCampaignNow(projectRoot, nextCampaign);

    return {
      ...result,
      campaign: nextCampaign,
      sqlitePath: saveResult.sqlitePath,
      bytes: saveResult.bytes,
      campaigns: (await listCampaigns(projectRoot)).campaigns,
    };
  });
}

export async function appendActiveCampaignError(projectRoot, errorEvent) {
  return enqueueCampaignWrite(projectRoot, async () => {
    const index = await loadCampaignIndex(projectRoot);
    const sqlitePath = index.activeCampaignPath && existsSync(index.activeCampaignPath)
      ? index.activeCampaignPath
      : null;
    if (!sqlitePath) {
      return { logged: false, reason: "No active campaign SQLite file." };
    }
    await appendCampaignErrorToSqliteFile(sqlitePath, errorEvent);
    return { logged: true, sqlitePath };
  });
}

export async function resetActiveCampaign(projectRoot, campaign) {
  return saveActiveCampaign(projectRoot, normalizeCampaign(campaign));
}

function enqueueCampaignWrite(projectRoot, operation) {
  const key = path.resolve(projectRoot);
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const cleanup = next.finally(() => {
    if (writeQueues.get(key) === cleanup) {
      writeQueues.delete(key);
    }
  });
  cleanup.catch(() => {});
  writeQueues.set(key, cleanup);
  return next;
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
      title: await uniqueCampaignTitle(projectRoot, "Untitled Campaign"),
      premise: "A new D&D 5e-lite campaign ready to grow through play.",
    }),
    source: "starter",
  };
}

function cleanCampaignTitle(title) {
  const trimmed = String(title ?? "").trim();
  return trimmed || "Untitled Campaign";
}

async function loadCampaignIndex(projectRoot) {
  const indexPath = getCampaignIndexPath(projectRoot);
  if (!existsSync(indexPath)) {
    return {
      indexVersion: campaignIndexVersion,
      activeCampaignPath: null,
      campaigns: [],
      hiddenCampaignPaths: [],
    };
  }

  const index = JSON.parse(await readFile(indexPath, "utf8"));
  return {
    indexVersion: index.indexVersion ?? null,
    activeCampaignPath: index.activeCampaignPath ?? null,
    campaigns: Array.isArray(index.campaigns) ? index.campaigns : [],
    hiddenCampaignPaths: Array.isArray(index.hiddenCampaignPaths)
      ? index.hiddenCampaignPaths.map((item) => path.resolve(item))
      : [],
  };
}

async function saveCampaignIndex(projectRoot, index) {
  const indexPath = getCampaignIndexPath(projectRoot);
  await mkdir(path.dirname(indexPath), { recursive: true });
  await writeFile(indexPath, JSON.stringify({
    indexVersion: campaignIndexVersion,
    activeCampaignPath: index.activeCampaignPath ?? null,
    campaigns: Array.isArray(index.campaigns) ? index.campaigns : [],
    hiddenCampaignPaths: Array.isArray(index.hiddenCampaignPaths) ? index.hiddenCampaignPaths : [],
  }, null, 2));
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
    hiddenCampaignPaths: makeActive
      ? index.hiddenCampaignPaths.filter((sqlitePath) => path.resolve(sqlitePath) !== resolvedPath)
      : index.hiddenCampaignPaths,
  });
}

async function findFirstVisibleCampaignPath(projectRoot, hiddenPaths = new Set()) {
  for (const sqlitePath of await findCampaignFiles(projectRoot)) {
    const resolvedPath = path.resolve(sqlitePath);
    if (hiddenPaths.has(resolvedPath) || await isCampaignHidden(resolvedPath)) {
      continue;
    }
    return resolvedPath;
  }

  return null;
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

async function assertUniqueCampaignTitle(projectRoot, title) {
  const normalizedTitle = normalizeTitle(title);
  const sqlitePaths = await findCampaignFiles(projectRoot);

  for (const sqlitePath of sqlitePaths) {
    try {
      const campaign = await readCampaignFromSqliteFile(sqlitePath);
      if (normalizeTitle(campaign.title) === normalizedTitle) {
        throw new Error(`Campaign name already exists: ${campaign.title}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Campaign name already exists")) {
        throw error;
      }
    }
  }
}

async function uniqueCampaignTitle(projectRoot, title) {
  const existingTitles = new Set();
  for (const sqlitePath of await findCampaignFiles(projectRoot)) {
    try {
      const campaign = await readCampaignFromSqliteFile(sqlitePath);
      existingTitles.add(normalizeTitle(campaign.title));
    } catch {
      // Ignore unreadable pre-release files.
    }
  }

  if (!existingTitles.has(normalizeTitle(title))) {
    return title;
  }

  let counter = 2;
  while (existingTitles.has(normalizeTitle(`${title} ${counter}`))) {
    counter += 1;
  }
  return `${title} ${counter}`;
}

function hiddenPathSet(index) {
  return new Set((index.hiddenCampaignPaths ?? []).map((sqlitePath) => path.resolve(sqlitePath)));
}

async function isCampaignHidden(sqlitePath) {
  try {
    const campaign = await readCampaignFromSqliteFile(sqlitePath);
    return Boolean(campaign.hidden);
  } catch {
    return false;
  }
}

function normalizeTitle(title) {
  return String(title || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function campaignFilePath(projectRoot, title) {
  return path.join(getCampaignsDir(projectRoot), `${slugify(title)}.lorekeeper.sqlite`);
}

function getCampaignsDir(projectRoot) {
  return path.join(projectRoot, "data", "campaigns");
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

function isPathInside(childPath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
