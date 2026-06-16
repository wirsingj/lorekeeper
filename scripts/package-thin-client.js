import { cpSync, existsSync, mkdirSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const electronDist = path.join(rootDir, "node_modules", "electron", "dist");
const builtApp = path.join(rootDir, "dist", "app");
const outRoot = path.join(rootDir, "dist", "portable");
const packageDir = path.join(outRoot, "LoreKeeperJoin");
const appDir = path.join(packageDir, "resources", "app");
const zipPath = path.join(outRoot, "LoreKeeperJoin.zip");

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
const joinExe = path.join(packageDir, "LoreKeeperJoin.exe");
if (existsSync(electronExe)) {
  renameSync(electronExe, joinExe);
}

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
cpSync(path.join(rootDir, "dist", "app"), path.join(appDir, "dist", "app"), { recursive: true });
cpSync(path.join(rootDir, "electron"), path.join(appDir, "electron"), { recursive: true });
cpSync(path.join(rootDir, "assets"), path.join(appDir, "assets"), { recursive: true });

writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: "lorekeeper-join",
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
    "LoreKeeper Join",
    "",
    "This is the lightweight guest app for joining a LoreKeeper host on the same Wi-Fi.",
    "",
    "Guest steps:",
    "1. Keep this whole folder together after unzipping it.",
    "2. Double-click LoreKeeperJoin.exe or Open LoreKeeper Join.cmd.",
    "3. Paste the invite link from the host into the big Join A Hosted Table panel.",
    "4. If the host sent a Join-As link, fill in your character name, class, and backstory.",
    "5. Click Join Table and wait for the host to approve the seat/character.",
    "",
    "Host steps:",
    "1. Open LoreKeeper on the host computer.",
    "2. Start or open the campaign.",
    "3. Click Invite Player on an existing party member, or Invite New / Copy Join-As Link for a new character.",
    "4. Send the copied invite link to the guest.",
    "5. Approve the join request in LoreKeeper. New-character requests become party members when approved.",
    "",
    "LoreKeeper Join does not need Ollama, Node.js, or campaign files.",
    "The host owns campaign state, dice, AI/DM generation, and saves.",
    "",
    "If it cannot connect:",
    "- Make sure both computers are on the same Wi-Fi/LAN.",
    "- Let Windows Defender Firewall allow LoreKeeper on the host if prompted.",
    "- Create a fresh invite link after restarting the host app.",
  ].join("\r\n"),
  "utf8",
);

writeFileSync(
  path.join(packageDir, "Open LoreKeeper Join.cmd"),
  [
    "@echo off",
    "cd /d \"%~dp0\"",
    "start \"\" \"%~dp0LoreKeeperJoin.exe\"",
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

console.log(`LoreKeeper Join portable folder: ${packageDir}`);
console.log(`LoreKeeper Join zip: ${zipPath}`);

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
