import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = path.join(rootDir, "dist", "portable");
const packageDir = path.join(packageRoot, "LoreKeeper");
const zipPath = path.join(packageRoot, "LoreKeeper.zip");
const extractFirst = path.join(packageRoot, "EXTRACT-FIRST.txt");
const packageExe = path.join(packageDir, "LoreKeeper.exe");
const startHere = path.join(packageDir, "START-HERE.txt");
const toleranceMs = 2000;

const sourcePaths = [
  "index.html",
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "README.md",
  path.join("docs", "REMOTE_TABLE_ACCESS_PLAN.md"),
  path.join("docs", "MAINTAINER_GUIDE.md"),
  path.join("electron"),
  path.join("src"),
  path.join("app"),
  path.join("assets"),
  path.join("public"),
  path.join("scripts", "serve.js"),
  path.join("scripts", "package-portable-host.js"),
];

const legacyArtifacts = [
  path.join(packageRoot, "LoreKeeperJoin"),
  path.join(packageRoot, "LoreKeeperJoin.zip"),
  path.join(packageRoot, "ThinLoreKeeper"),
  path.join(packageRoot, "ThinLoreKeeper.zip"),
];

const requiredArtifacts = [
  zipPath,
  extractFirst,
  packageDir,
  packageExe,
  startHere,
  path.join(packageDir, "Open LoreKeeper.cmd"),
  path.join(packageDir, "resources", "app", "scripts", "serve.js"),
  path.join(packageDir, "resources", "app", "data", "campaigns", ".keep"),
  path.join(packageDir, "resources", "app", "data", "imports", ".keep"),
  path.join(packageDir, "resources", "app", "data", "runtime", ".keep"),
];

const requiredZipEntries = [
  "EXTRACT-FIRST.txt",
  "LoreKeeper/LoreKeeper.exe",
  "LoreKeeper/Open LoreKeeper.cmd",
  "LoreKeeper/START-HERE.txt",
  "LoreKeeper/resources/app/package.json",
  "LoreKeeper/resources/app/scripts/serve.js",
];

const problems = [];
for (const artifact of requiredArtifacts) {
  if (!existsSync(artifact)) {
    problems.push(`Missing portable artifact: ${relative(artifact)}`);
  }
}

if (existsSync(extractFirst)) {
  assertFileContains(extractFirst, "Extract All", "Portable extract-first note must tell friends to extract the zip.");
  assertFileContains(extractFirst, "Temp folder", "Portable extract-first note must explain Temp-folder launch errors.");
}
if (existsSync(startHere)) {
  assertFileContains(startHere, "Do not run LoreKeeper from inside the zip preview", "START-HERE must warn against zip-preview launching.");
  assertFileContains(startHere, "Extract All", "START-HERE must tell friends to extract the zip.");
}
const openCommand = path.join(packageDir, "Open LoreKeeper.cmd");
if (existsSync(openCommand)) {
  assertFileContains(openCommand, "resources\\app\\package.json", "Open LoreKeeper.cmd must verify packaged resources exist.");
  assertFileContains(openCommand, "Extract the whole LoreKeeper folder", "Open LoreKeeper.cmd must explain partial zip extraction failures.");
}
if (existsSync(zipPath)) {
  assertZipContains(zipPath, requiredZipEntries);
}

for (const artifact of legacyArtifacts) {
  if (existsSync(artifact)) {
    problems.push(`Stale split-client artifact remains: ${relative(artifact)}`);
  }
}

const latestSource = latestSourceMtime();
if (existsSync(zipPath) && latestSource.mtimeMs > statSync(zipPath).mtimeMs + toleranceMs) {
  problems.push(`Portable zip is older than ${latestSource.path}.`);
}

if (problems.length) {
  console.error("LoreKeeper portable package is not release-fresh.");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  console.error("");
  console.error("Run `npm run package:portable`, then retry the commit/release.");
  process.exit(1);
}

console.log(`LoreKeeper portable package is fresh: ${relative(zipPath)}`);

function latestSourceMtime() {
  let latest = { path: "(none)", mtimeMs: 0 };
  for (const sourcePath of sourcePaths) {
    const absolute = path.join(rootDir, sourcePath);
    if (!existsSync(absolute)) {
      continue;
    }
    latest = newer(latest, scanPath(absolute));
  }
  return latest;
}

function scanPath(target) {
  const info = statSync(target);
  let latest = { path: relative(target), mtimeMs: info.mtimeMs };
  if (!info.isDirectory()) {
    return latest;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    latest = newer(latest, scanPath(path.join(target, entry.name)));
  }
  return latest;
}

function newer(left, right) {
  return right.mtimeMs > left.mtimeMs ? right : left;
}

function assertFileContains(filePath, expected, message) {
  const content = readFileSync(filePath, "utf8");
  if (!content.includes(expected)) {
    problems.push(`${message} Missing text in ${relative(filePath)}: ${expected}`);
  }
}

function assertZipContains(filePath, expectedEntries) {
  let entries;
  try {
    entries = new Set(readZipEntries(filePath));
  } catch (error) {
    problems.push(`Could not inspect portable zip ${relative(filePath)}: ${error.message}`);
    return;
  }
  for (const expected of expectedEntries) {
    if (!entries.has(expected)) {
      problems.push(`Portable zip is missing required entry: ${expected}`);
    }
  }
}

function readZipEntries(filePath) {
  const data = readFileSync(filePath);
  const eocdOffset = findEndOfCentralDirectory(data);
  if (eocdOffset < 0) {
    throw new Error("end of central directory record was not found");
  }

  const entryCount = data.readUInt16LE(eocdOffset + 10);
  let offset = data.readUInt32LE(eocdOffset + 16);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (data.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`central directory header ${index + 1} was not found`);
    }
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    entries.push(data.toString("utf8", nameStart, nameStart + nameLength).replace(/\\/g, "/").replace(/^\.\//, ""));
    offset = nameStart + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(data) {
  for (let offset = data.length - 22; offset >= 0 && offset >= data.length - 65557; offset -= 1) {
    if (data.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function relative(target) {
  return path.relative(rootDir, target).replace(/\\/g, "/");
}
