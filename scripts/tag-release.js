import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tagName = process.argv[2];
const message = process.argv.slice(3).join(" ").trim() || `LoreKeeper ${tagName}`;

if (!tagName || tagName.startsWith("-")) {
  console.error("Usage: npm run release:tag -- <tag-name> [message]");
  process.exit(1);
}

execFileSync(process.execPath, ["./scripts/check-portable-package.js"], {
  cwd: rootDir,
  stdio: "inherit",
});

execFileSync(process.execPath, ["./scripts/smoke-portable-package.js"], {
  cwd: rootDir,
  stdio: "inherit",
});

execFileSync("git", ["tag", "-a", tagName, "-m", message], {
  cwd: rootDir,
  stdio: "inherit",
});

console.log(`Created release tag ${tagName}.`);
