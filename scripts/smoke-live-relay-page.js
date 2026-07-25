import path from "node:path";
import { mkdir } from "node:fs/promises";

const defaultBaseUrl = "https://lorekeeper-friend-relay.wirsingj.workers.dev";
const baseUrl = (process.env.LOREKEEPER_RELAY_SMOKE_URL || process.argv[2] || defaultBaseUrl).replace(/\/+$/, "");
const smokeCode = process.env.LOREKEEPER_RELAY_SMOKE_CODE || "X5Y2-Z98L";
const pageUrl = `${baseUrl}/host/demo-table/table-code/${encodeURIComponent(smokeCode)}`;
const artifactDir = path.resolve(
  "data/runtime/ui-flow-artifacts",
  `live-relay-page-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);

const health = await fetchJson(`${baseUrl}/health`);
assert(health.ok && health.service === "lorekeeper-friend-relay", "Relay health check did not identify LoreKeeper relay.");

const response = await fetch(pageUrl);
assert(response.status === 200, `Relay guest page returned ${response.status}.`);
const csp = response.headers.get("content-security-policy") || "";
const body = await response.text();
assert(/script-src 'self' 'nonce-[a-f0-9]{32}'/.test(csp), "Relay page CSP should use a script nonce.");
assert(/style-src 'self' 'nonce-[a-f0-9]{32}'/.test(csp), "Relay page CSP should use a style nonce.");
assert(!/unsafe-inline/i.test(csp), "Relay page CSP must not use unsafe-inline.");
assert(/<script nonce="[a-f0-9]{32}">/.test(body), "Relay page script tag should include the CSP nonce.");
assert(/<style nonce="[a-f0-9]{32}">/.test(body), "Relay page style tag should include the CSP nonce.");
assert(body.includes("LoreKeeper"), "Relay page should render LoreKeeper brand copy.");
assert(body.includes("Ask To Join"), "Relay page should render the browser guest join action.");

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (error) {
  throw new Error(`Playwright is required for relay page visual smoke. ${error.message}`);
}

await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  })) {
    const page = await browser.newPage({ viewport });
    await page.goto(pageUrl, { waitUntil: "networkidle" });
    assert(await page.locator("#join").isVisible(), `${name} relay page should show Ask To Join.`);
    assert(await page.locator("#code").inputValue() === smokeCode, `${name} relay page should preload the friend code.`);
    await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`LoreKeeper live relay page smoke passed: ${pageUrl}`);
console.log(`Screenshots: ${artifactDir}`);

async function fetchJson(url) {
  const result = await fetch(url);
  assert(result.ok, `Fetch failed ${result.status}: ${url}`);
  return result.json();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
