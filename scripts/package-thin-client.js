import { cpSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const electronDist = path.join(rootDir, "node_modules", "electron", "dist");
const builtApp = path.join(rootDir, "dist", "app");
const outRoot = path.join(rootDir, "dist", "portable");
const packageDir = path.join(outRoot, "ThinLoreKeeper");
const appDir = path.join(packageDir, "resources", "app");
const zipPath = path.join(outRoot, "ThinLoreKeeper.zip");

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
mkdirSync(outRoot, { recursive: true });

cpSync(electronDist, packageDir, { recursive: true });
const electronExe = path.join(packageDir, "electron.exe");
const thinExe = path.join(packageDir, "ThinLoreKeeper.exe");
if (existsSync(electronExe)) {
  renameSync(electronExe, thinExe);
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(path.join(rootDir, "dist", "app"), path.join(appDir, "dist", "app"), { recursive: true });
cpSync(path.join(rootDir, "electron"), path.join(appDir, "electron"), { recursive: true });
cpSync(path.join(rootDir, "assets"), path.join(appDir, "assets"), { recursive: true });

writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: "thin-lorekeeper",
    productName: "ThinLoreKeeper",
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
    "ThinLoreKeeper",
    "",
    "1. Double-click ThinLoreKeeper.exe.",
    "2. Paste the invite link from the LoreKeeper host.",
    "3. Enter your table name and click Join Table.",
    "4. Wait for the host to approve the seat.",
    "",
    "ThinLoreKeeper does not need Ollama, Node.js, or campaign files.",
    "The host owns campaign state, dice, AI/DM generation, and saves.",
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

console.log(`ThinLoreKeeper portable folder: ${packageDir}`);
console.log(`ThinLoreKeeper zip: ${zipPath}`);

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeZipTimestamps(targetPath) {
  // Electron ships a few files dated before ZIP's supported range. Normalize
  // everything with PowerShell so Compress-Archive stays quiet on Windows.
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
