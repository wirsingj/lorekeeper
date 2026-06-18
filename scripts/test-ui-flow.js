import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("Playwright is not installed. Run `npm install` to enable UI flow tests.");
  process.exit(0);
}

const args = parseArgs(process.argv.slice(2));
const selectedScenario = args.scenario || "";
const token = "ui-flow-secret";
const artifactsRoot = path.resolve("data/runtime/ui-flow-artifacts", timestampForPath(new Date()));
const scenarios = [
  {
    name: "home-baseline",
    run: async (harness) => {
      await harness.gotoHome();
      await expectVisibleText(harness.page, "Start Playing");
      await expectVisibleText(harness.page, "New Adventure");
      await assertRendererHarness(harness.page);
      await assertTraceRecords(harness, "/api/diagnostics");
    },
  },
  {
    name: "wizard-prelobby-party-permutations",
    run: async (harness) => {
      await harness.gotoHome();
      await openCampaignWizard(harness.page);
      await fillCampaignSeed(harness.page, {
        title: "Harness Prelobby",
        premise: "A caravan stops at a broken shrine while watchfires appear on the ridge.",
        startingLocation: "Broken shrine road",
        tone: "tense roadside fantasy",
        primary: {
          name: "Ilyra",
          ancestry: "Half-elf",
          characterClass: "Bard",
          concept: "A sharp-eyed musician who notices patterns in old road songs.",
        },
      });
      await fillWizardPartyCard(harness.page.locator("[data-wizard-character-card]").first(), {
        name: "Mira",
        ancestry: "Half-elf",
        characterClass: "Soldier",
        concept: "A practical guard who knows how ambushes feel before they happen.",
        integrationPrompt: "Mira was hired to keep Ilyra alive on dangerous roads.",
        controllerKind: "remote_invite",
      });

      await harness.page.click("#add-party-template");
      await harness.page.click("#add-party-template");
      await assertNoDuplicateWizardCardNames(harness.page);
      const snapshot = await waitForPreTableParty(harness, { minSeats: 1 });
      assertUniqueNames(snapshot.joinableSeats, "name", "pre-table joinable seats");
      assertUniqueIds(snapshot.joinableSeats, "pre-table joinable seats");
      assert.equal(new Set(snapshot.joinableSeats.map((seat) => seat.name)).size, snapshot.joinableSeats.length);
    },
  },
  {
    name: "create-campaign-and-hide-start-adventure-after-use",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Opening",
        premise: "A bell rings from a sealed watchtower and the villagers refuse to look at it.",
        startingLocation: "Mossbridge",
        tone: "eerie heroic fantasy",
        primary: {
          name: "Rowan",
          ancestry: "Human",
          characterClass: "Fighter",
          concept: "A steady sword hand trying to make one decent choice at a time.",
        },
        companions: [{
          name: "Tilli",
          ancestry: "Halfling",
          characterClass: "Scout",
          concept: "A courier with more courage than patience.",
          integrationPrompt: "Tilli knows the road to Mossbridge and trusts Rowan.",
        }],
      });
      const campaign = await harness.fetchJson("/api/campaign");
      assert.equal(campaign.campaign.title, "Harness Opening");
      assertUniqueNames(campaign.campaign.party, "name", "campaign party");
      assert.equal(campaign.campaign.party.length, 2);

      await harness.mockProviderTurn("The watchtower bell rings once, then every candle in Mossbridge bends toward the hill.");
      await harness.page.locator("#start-adventure-opening").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.click("#start-adventure-opening");
      await harness.page.waitForFunction(() => {
        const button = document.querySelector("#start-adventure-opening");
        return !button || button.hidden || getComputedStyle(button).display === "none";
      }, null, { timeout: 10000 });
      await harness.page.waitForFunction(() => {
        return window.__lorekeeperDebug?.stateSummary?.().activeGeneration === false;
      }, null, { timeout: 10000 });
      const summary = await harness.page.evaluate(() => window.__lorekeeperDebug.stateSummary());
      assert.equal(summary.activeGeneration, false);
      await expectVisibleText(harness.page, "watchtower bell rings");
    },
  },
  {
    name: "table-talk-posts-immediately",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Table Talk",
        premise: "Two friends compare maps beside a dim tavern hearth.",
        startingLocation: "The Stag Lamp",
        tone: "calm table banter",
        primary: {
          name: "Nessa",
          ancestry: "Human",
          characterClass: "Ranger",
          concept: "A patient tracker who notices when a room goes quiet.",
        },
      });
      await harness.fetchJson("/api/multiplayer/start", { method: "POST", body: {} });
      await harness.gotoHome();
      await harness.page.click("#home-host-flow");
      await harness.page.waitForFunction(() => {
        return window.__lorekeeperDebug?.stateSummary?.().campaignTitle === "Harness Table Talk";
      }, null, { timeout: 10000 });
      await harness.page.locator("#table-talk-input").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.fill("#table-talk-input", "Harness side chat lands now.");
      await harness.page.click("#table-talk-send");
      await expectVisibleText(harness.page, "Harness side chat lands now.");
      const trace = await harness.fetchJson("/api/diagnostics/trace?full=1");
      assert.ok(
        trace.events.some((event) => event.type === "api.request" && event.detail?.path === "/api/multiplayer/table-talk"),
        "expected table-talk request in trace",
      );
    },
  },
];

const runnableScenarios = selectedScenario
  ? scenarios.filter((scenario) => scenario.name === selectedScenario)
  : scenarios;

if (selectedScenario && runnableScenarios.length === 0) {
  throw new Error(`Unknown UI scenario "${selectedScenario}". Available: ${scenarios.map((scenario) => scenario.name).join(", ")}`);
}

let browser;
try {
  browser = await playwright.chromium.launch({ headless: true });
} catch (error) {
  console.log("Playwright Chromium is not installed. Run `npx playwright install chromium` to enable UI flow tests.");
  console.log(error instanceof Error ? error.message.split("\n")[0] : String(error));
  process.exit(0);
}

let passed = 0;
try {
  for (const scenario of runnableScenarios) {
    await runScenario(browser, scenario);
    passed += 1;
  }
  console.log(`UI flow scenarios passed (${passed}/${runnableScenarios.length})`);
} finally {
  await browser.close();
}

async function runScenario(browserInstance, scenario) {
  const tempDir = await mkdtemp(path.join(tmpdir(), `lorekeeper-ui-flow-${scenario.name}-`));
  const child = spawn(process.execPath, ["./scripts/serve.js", "0"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      LOREKEEPER_PROJECT_ROOT: tempDir,
      LOREKEEPER_API_TOKEN: token,
      LOREKEEPER_BIND_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const childExit = new Promise((resolve) => child.once("exit", resolve));
  let context;
  let page;
  const browserErrors = [];

  try {
    const port = await waitForServerPort(child);
    const baseUrl = `http://127.0.0.1:${port}`;
    context = await browserInstance.newContext({
      viewport: scenario.viewport ?? { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(`[console] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`[pageerror] ${error.message}`);
    });

    const harness = {
      baseUrl,
      page,
      async gotoHome() {
        await page.goto(`${baseUrl}/?lkToken=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#root", { timeout: 10000 });
        await page.waitForFunction(() => Boolean(window.__lorekeeperDebug), null, { timeout: 10000 });
      },
      async fetchJson(pathname, options = {}) {
        return fetchJson(`${baseUrl}${pathname}`, options);
      },
      async mockProviderTurn(text) {
        await page.route("**/api/provider/generate-turn", (route) => {
          const response = {
            table: [{
              speaker: "DM",
              speakerId: null,
              role: "dm",
              kind: "narration",
              visibility: "table",
              text,
            }],
            choices: [],
            mechanics: [],
            stateChanges: [],
          };
          const body = [
            { type: "start", model: "ui-harness" },
            {
              type: "done",
              result: {
                ok: true,
                providerId: "ui-harness",
                model: "ui-harness",
                durationMs: 5,
                text: JSON.stringify(response),
                rawText: JSON.stringify(response),
                structured: response,
                validationErrors: [],
              },
            },
          ].map((event) => JSON.stringify(event)).join("\n") + "\n";
          route.fulfill({
            status: 200,
            contentType: "application/x-ndjson; charset=utf-8",
            body,
          });
        });
      },
    };

    await scenario.run(harness);
    await assertRendererHarness(page);
    assert.deepEqual(browserErrors, [], `${scenario.name} browser errors`);
    console.log(`✓ ${scenario.name}`);
  } catch (error) {
    if (page) {
      await writeFailureArtifacts({ scenarioName: scenario.name, page, baseUrl: page.url(), error });
    }
    throw error;
  } finally {
    await context?.close().catch(() => {});
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await childExit;
    }
    if (!args.keepTemp) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function openCampaignWizard(page) {
  await page.click("#home-new-campaign");
  await page.waitForFunction(() => document.querySelector("#campaign-dialog")?.open === true, null, { timeout: 10000 });
  await page.locator("#campaign-dialog").waitFor({ state: "visible", timeout: 10000 });
}

async function createCampaignFromWizard(harness, input) {
  await openCampaignWizard(harness.page);
  await fillCampaignSeed(harness.page, input);
  const companions = input.companions ?? [];
  for (let index = 0; index < companions.length; index += 1) {
    const card = await ensureWizardPartyCard(harness.page, index);
    await fillWizardPartyCard(card, companions[index]);
  }
  await harness.page.click("#start-campaign-submit");
  await harness.page.waitForFunction(() => document.querySelector("#campaign-dialog")?.open !== true, null, { timeout: 15000 });
  await harness.page.waitForFunction((title) => {
    return window.__lorekeeperDebug?.stateSummary?.().campaignTitle === title;
  }, input.title, { timeout: 10000 });
}

async function fillCampaignSeed(page, input) {
  await page.fill("#new-campaign-title", input.title);
  await page.fill("#new-campaign-premise", input.premise);
  await page.fill("#new-campaign-starting-location", input.startingLocation ?? "");
  await page.fill("#new-campaign-tone", input.tone ?? "");
  await page.fill("#new-character-name", input.primary.name);
  await page.fill("#new-character-ancestry", input.primary.ancestry ?? "");
  await page.fill("#new-character-class", input.primary.characterClass ?? "");
  await page.fill("#new-character-level", String(input.primary.level ?? 1));
  await page.fill("#new-character-concept", input.primary.concept ?? "");
  if (input.primary.controllerKind) {
    await page.check(`input[name="new-character-controller"][value="${input.primary.controllerKind}"]`);
  }
}

async function ensureWizardPartyCard(page, index) {
  while (await page.locator("[data-wizard-character-card]").count() <= index) {
    await page.click("#add-wizard-party-member");
  }
  return page.locator("[data-wizard-character-card]").nth(index);
}

async function fillWizardPartyCard(card, input) {
  await card.locator("[data-character-field='name'], #new-joiner-name").first().fill(input.name ?? "");
  await card.locator("[data-character-field='ancestry'], #new-joiner-ancestry").first().fill(input.ancestry ?? "");
  await card.locator("[data-character-field='class'], #new-joiner-class").first().fill(input.characterClass ?? "");
  await card.locator("[data-character-field='level'], #new-joiner-level").first().fill(String(input.level ?? 1));
  await card.locator("[data-character-field='concept'], #new-joiner-concept").first().fill(input.concept ?? "");
  const integration = card.locator("[data-character-field='integration'], #new-joiner-integration").first();
  if (await integration.count()) {
    await integration.fill(input.integrationPrompt ?? "");
  }
  const hostContext = card.locator("[data-character-field='hostContext'], #new-joiner-host-context").first();
  if (await hostContext.count()) {
    await hostContext.fill(input.hostIntegrationPrompt ?? "");
  }
  if (input.controllerKind) {
    await card.locator(`input[data-character-field='controllerKind'][value='${input.controllerKind}'], input[type='radio'][value='${input.controllerKind}']`).first().check();
  }
}

async function waitForPreTableParty(harness, { minSeats }) {
  return waitForAsync(async () => {
    const snapshot = await harness.fetchJson("/api/pretable-lobby/host-snapshot");
    const seats = snapshot.joinableSeats ?? [];
    return snapshot.open && seats.length >= minSeats ? snapshot : null;
  }, {
    timeoutMs: 10000,
    description: `pre-table lobby with ${minSeats} seats`,
  });
}

async function assertNoDuplicateWizardCardNames(page) {
  const names = await page.locator("[data-wizard-character-card]").evaluateAll((cards) => cards
    .map((card) => card.querySelector("[data-character-field='name'], #new-joiner-name")?.value?.trim())
    .filter(Boolean));
  assertUniqueStrings(names, "wizard character card names");
}

async function assertRendererHarness(page) {
  const summary = await page.evaluate(() => window.__lorekeeperDebug?.stateSummary?.());
  assert.ok(summary, "internal renderer debug harness should be installed");
  assert.notEqual(await page.locator("#provider-activity").getAttribute("data-state"), "error");
}

async function assertTraceRecords(harness, path) {
  await harness.fetchJson("/api/diagnostics?full=1");
  const trace = await harness.fetchJson("/api/diagnostics/trace?full=1");
  assert.ok(trace.events?.some((event) => event.type === "api.request" && event.detail?.path === path), `expected ${path} in server trace`);
}

async function expectVisibleText(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 10000 });
}

async function fetchJson(url, options = {}) {
  const headers = {
    "x-lorekeeper-api-token": token,
    ...(options.body ? { "content-type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function waitForServerPort(child) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error(`Server did not start.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
      if (match && !settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("exit", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

async function waitForAsync(fn, { timeoutMs = 5000, intervalMs = 120, description = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await fn();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`);
}

function assertUniqueNames(records, field, label) {
  assertUniqueStrings(records.map((record) => record?.[field]).filter(Boolean), label);
}

function assertUniqueIds(records, label) {
  assertUniqueStrings(records.map((record) => record?.id).filter(Boolean), `${label} ids`);
}

function assertUniqueStrings(values, label) {
  const normalized = values.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  assert.deepEqual([...new Set(duplicates)], [], `duplicate ${label}: ${[...new Set(duplicates)].join(", ")}`);
}

async function writeFailureArtifacts({ scenarioName, page, baseUrl, error }) {
  await mkdir(artifactsRoot, { recursive: true });
  const prefix = path.join(artifactsRoot, scenarioName);
  await page.screenshot({ path: `${prefix}.png`, fullPage: true }).catch(() => {});
  await writeFile(`${prefix}.html`, await page.content()).catch(() => {});
  await writeFile(`${prefix}.error.txt`, error instanceof Error ? `${error.stack ?? error.message}\nURL: ${baseUrl}\n` : String(error)).catch(() => {});
  const diagnostics = await page.evaluate(() => ({
    renderer: window.__lorekeeperDebug?.renderer?.(),
    stateSummary: window.__lorekeeperDebug?.stateSummary?.(),
    turnProjection: window.__lorekeeperDebug?.turnProjection?.(),
  })).catch((diagnosticError) => ({ error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError) }));
  await writeFile(`${prefix}.renderer.json`, JSON.stringify(diagnostics, null, 2)).catch(() => {});
  console.error(`UI scenario "${scenarioName}" failed. Artifacts: ${artifactsRoot}`);
}

function parseArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--scenario") output.scenario = argv[++index];
    else if (item === "--keep-temp") output.keepTemp = true;
  }
  return output;
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
