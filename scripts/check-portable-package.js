import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageRoot = path.join(rootDir, "dist", "portable");
const packageDir = path.join(packageRoot, "LoreKeeper");
const zipPath = path.join(packageRoot, "LoreKeeper.zip");
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
  packageDir,
  packageExe,
  startHere,
  path.join(packageDir, "Open LoreKeeper.cmd"),
  path.join(packageDir, "resources", "app", "scripts", "serve.js"),
  path.join(packageDir, "resources", "app", "data", "campaigns", ".keep"),
  path.join(packageDir, "resources", "app", "data", "imports", ".keep"),
  path.join(packageDir, "resources", "app", "data", "runtime", ".keep"),
];

const problems = [];
for (const artifact of requiredArtifacts) {
  if (!existsSync(artifact)) {
    problems.push(`Missing portable artifact: ${relative(artifact)}`);
  }
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

function relative(target) {
  return path.relative(rootDir, target).replace(/\\/g, "/");
}
