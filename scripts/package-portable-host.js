import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const electronDist = path.join(rootDir, "node_modules", "electron", "dist");
const builtApp = path.join(rootDir, "dist", "app");
const outRoot = path.join(rootDir, "dist", "portable");
const packageDir = path.join(outRoot, "LoreKeeper");
const appDir = path.join(packageDir, "resources", "app");
const zipPath = path.join(outRoot, "LoreKeeper.zip");
const legacyJoinDir = path.join(outRoot, "LoreKeeperJoin");
const legacyJoinZipPath = path.join(outRoot, "LoreKeeperJoin.zip");
const legacyThinDir = path.join(outRoot, "ThinLoreKeeper");
const legacyThinZipPath = path.join(outRoot, "ThinLoreKeeper.zip");

if (!isInside(path.join(rootDir, "dist"), packageDir)) {
  throw new Error(`Refusing to remove package directory outside dist: ${packageDir}`);
}

if (!existsSync(electronDist)) {
  throw new Error("Electron runtime is missing. Run npm install first.");
}

if (!existsSync(builtApp)) {
  throw new Error("Built app is missing. Run npm run build first.");
}

rmSync(packageDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
rmSync(legacyJoinDir, { recursive: true, force: true });
rmSync(legacyJoinZipPath, { force: true });
rmSync(legacyThinDir, { recursive: true, force: true });
rmSync(legacyThinZipPath, { force: true });
mkdirSync(outRoot, { recursive: true });

cpSync(electronDist, packageDir, { recursive: true });
const electronExe = path.join(packageDir, "electron.exe");
const lorekeeperExe = path.join(packageDir, "LoreKeeper.exe");
if (existsSync(electronExe)) {
  renameSync(electronExe, lorekeeperExe);
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });

copyDir("dist/app", "dist/app");
copyDir("electron", "electron");
copyFile("scripts/serve.js", "scripts/serve.js");
copyDir("src", "src");
copyDir("app", "app");
copyDir("assets", "assets");
copyDir("public", "public", { optional: true });
copyDir("node_modules/sql.js", "node_modules/sql.js");
copyFile("README.md", "README.md");
copyFile("docs/REMOTE_TABLE_ACCESS_PLAN.md", "docs/REMOTE_TABLE_ACCESS_PLAN.md", { optional: true });
copyFile("docs/MAINTAINER_GUIDE.md", "docs/MAINTAINER_GUIDE.md", { optional: true });

mkdirSync(path.join(appDir, "data", "campaigns"), { recursive: true });
mkdirSync(path.join(appDir, "data", "imports"), { recursive: true });
mkdirSync(path.join(appDir, "data", "runtime"), { recursive: true });
writeFileSync(path.join(appDir, "data", "campaigns", ".keep"), "", "utf8");
writeFileSync(path.join(appDir, "data", "imports", ".keep"), "", "utf8");
writeFileSync(path.join(appDir, "data", "runtime", ".keep"), "", "utf8");

writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: "lorekeeper",
    productName: "LoreKeeper",
    version: "0.0.0",
    private: true,
    type: "module",
    main: "electron/main.js",
  }, null, 2),
  "utf8",
);

writeFileSync(
  path.join(packageDir, "START-HERE.txt"),
  [
    "LoreKeeper Portable",
    "",
    "This is the full LoreKeeper host app for Windows.",
    "",
    "Start:",
    "1. Unzip the whole LoreKeeper folder.",
    "2. Double-click LoreKeeper.exe or Open LoreKeeper.cmd.",
    "3. If Windows Defender Firewall asks, allow LoreKeeper on private networks so LAN guests can join.",
    "4. Create or open a table.",
    "5. Friends on the same Wi-Fi/LAN can join from the Guest Link shown in Friends And Seats.",
    "",
    "Ollama:",
    "- Ollama is still an outside install.",
    "- Install Ollama before using a local model.",
    "- LoreKeeper will talk to Ollama at http://127.0.0.1:11434 by default.",
    "",
    "What is bundled:",
    "- The Electron desktop runtime.",
    "- The LoreKeeper app and local API server code.",
    "- Runtime dependency sql.js for local campaign files.",
    "- A clean empty data folder.",
    "- Everything needed to launch LoreKeeper without installing Node.js.",
    "",
    "What is not bundled:",
    "- Node.js/npm command-line setup; friends do not need it for this portable build.",
    "- Ollama or model files.",
    "- The developer git repo.",
    "- The maintainer's campaigns, logs, runtime artifacts, or old guest-package artifacts.",
    "",
    "If the app cannot start:",
    "- Keep the folder together after unzipping.",
    "- Move it to a normal folder such as Desktop or Documents.",
    "- Make sure antivirus did not quarantine LoreKeeper.exe.",
    "- Install or start Ollama if local model setup is unavailable.",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  path.join(packageDir, "Open LoreKeeper.cmd"),
  [
    "@echo off",
    "cd /d \"%~dp0\"",
    "start \"\" \"%~dp0LoreKeeper.exe\"",
  ].join("\r\n"),
  "utf8",
);

normalizeZipTimestamps(packageDir);

const zipResult = spawnSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -LiteralPath ${quotePowerShell(packageDir)} -DestinationPath ${quotePowerShell(zipPath)} -Force`,
], {
  cwd: rootDir,
  stdio: "inherit",
  windowsHide: true,
});

if (zipResult.status !== 0) {
  throw new Error(`Portable folder created, but zip failed with status ${zipResult.status ?? "unknown"}.`);
}

console.log(`LoreKeeper portable folder: ${packageDir}`);
console.log(`LoreKeeper portable zip: ${zipPath}`);

function copyDir(sourceRelative, targetRelative, options = {}) {
  const source = path.join(rootDir, sourceRelative);
  if (!existsSync(source)) {
    if (options.optional) {
      return;
    }
    throw new Error(`Required package source is missing: ${source}`);
  }
  cpSync(source, path.join(appDir, targetRelative), { recursive: true });
}

function copyFile(sourceRelative, targetRelative, options = {}) {
  const source = path.join(rootDir, sourceRelative);
  if (!existsSync(source)) {
    if (options.optional) {
      return;
    }
    throw new Error(`Required package source is missing: ${source}`);
  }
  const target = path.join(appDir, targetRelative);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(source, target);
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeZipTimestamps(targetPath) {
  const timestampResult = spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    [
      "$safeDate = [datetime]'2020-01-01T00:00:00'",
      `$root = ${quotePowerShell(targetPath)}`,
      "Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object { $_.LastWriteTime = $safeDate }",
      "(Get-Item -LiteralPath $root).LastWriteTime = $safeDate",
    ].join("; "),
  ], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true,
  });

  if (timestampResult.status !== 0) {
    throw new Error(`Failed to normalize portable package timestamps: ${timestampResult.status ?? "unknown"}.`);
  }
}
