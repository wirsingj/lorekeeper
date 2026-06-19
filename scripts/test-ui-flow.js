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
const chaosSeed = args.seed ?? "424242";
const chaosRuns = Number.isInteger(args.chaosRuns) && args.chaosRuns > 0 ? args.chaosRuns : 3;
const wantsChaos = Boolean(args.chaos || args.chaosOnly);
const desktopChaosViewports = [
  { width: 1440, height: 1000 },
  { width: 1366, height: 900 },
  { width: 1180, height: 820 },
];
const narrowChaosViewport = { width: 390, height: 844 };
const token = "ui-flow-secret";
const artifactsRoot = path.resolve("data/runtime/ui-flow-artifacts", timestampForPath(new Date()));
const auditScreenshotsRoot = path.join(artifactsRoot, "visual-audit");
if (!args.skipBuild) {
  await runNpmScript("build");
}
const scenarios = [
  {
    name: "home-baseline",
    run: async (harness) => {
      await harness.gotoHome();
      await expectVisibleText(harness.page, "Start Playing");
      await expectVisibleText(harness.page, "New Adventure");
      await expectHomeLibraryText(harness.page, "No saved adventures yet");
      await assertNoVisibleText(harness.page, "Untitled Campaign");
      assert.equal(await harness.page.locator("#home-host-flow").isDisabled(), true);
      assert.equal(await harness.page.locator("#home-delete-campaign").isDisabled(), true);
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
    name: "visual-audit-screenshots",
    run: async (harness) => {
      const page = harness.page;
      await harness.gotoHome();
      await page.waitForTimeout(600);
      await captureAuditScreenshot(page, "01-home");

      await page.click("#home-settings");
      await page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      await captureAuditScreenshot(page, "02-app-preferences");
      await page.click("#close-setup");
      await page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });

      await openCampaignWizard(page);
      await page.waitForTimeout(400);
      await captureAuditScreenshot(page, "03-new-adventure");

      await fillCampaignSeed(page, {
        title: "Audit Table Road",
        premise: "A caravan road bends toward an old watchtower as villagers argue about whether to turn back before sunset.",
        startingLocation: "Old South Road",
        tone: "dark hopeful roadside fantasy",
        primary: {
          name: "Mira",
          ancestry: "Half-elf",
          characterClass: "Soldier",
          concept: "A careful caravan guard who notices danger in old road signs.",
        },
      });
      const remoteCard = await ensureWizardPartyCard(page, 0);
      await fillWizardPartyCard(remoteCard, {
        name: "Renn",
        ancestry: "Human",
        characterClass: "Ranger",
        concept: "A practical scout who reads danger in road dust.",
        integrationPrompt: "Renn has been watching the caravan road ahead.",
        controllerKind: "remote_invite",
      });
      await page.click("#start-campaign-submit");
      await page.waitForFunction(() => document.querySelector("#campaign-dialog")?.open !== true, null, { timeout: 15000 });
      await page.waitForTimeout(900);
      await captureAuditScreenshot(page, "04-table-ready");

      await page.click("#open-setup");
      await page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(400);
      await captureAuditScreenshot(page, "05-friends-and-seats");
      await page.click("#close-setup");
      await page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });

      await harness.fetchJson("/api/multiplayer/start", { method: "POST", body: {} });
      await harness.gotoHome();
      await page.click("#home-host-flow");
      await page.waitForFunction(() => window.__lorekeeperDebug?.stateSummary?.().campaignTitle === "Audit Table Road", null, { timeout: 10000 });
      const guestPage = await harness.newGuestPage("guest-audit");
      await guestPage.waitForTimeout(900);
      await captureAuditScreenshot(guestPage, "06-guest-lobby");

      await startAdventureOpeningForHarness(harness, "The tower road scene opens with the caravan paused under a hard grey sky.");
      await harness.mockProviderTurn(combatStartResponse());
      await submitPlayerTurn(page, "Mira signals Renn to watch the brush while she steps toward the tower road.");
      await page.waitForFunction(() => window.__lorekeeperDebug?.renderer?.().tableSession?.combat?.active === true, null, { timeout: 10000 });
      await page.waitForTimeout(700);
      await captureAuditScreenshot(page, "07-combat");
      const activeCombatActor = await page.evaluate(() =>
        window.__lorekeeperDebug?.renderer?.().tableSession?.combat?.activeActorName || "the active hero"
      );

      await harness.mockProviderTurn({
        __rawText: "The tower road answers with a shape in the dust, but the table pauses before accepting the DM response.",
        __parseError: "Audit capture: malformed DM response for recovery screenshot.",
        __validationErrors: ["Audit capture: malformed DM response for recovery screenshot."],
      });
      await submitPlayerTurn(page, `${activeCombatActor} studies the dust before moving closer.`);
      await page.locator("#repair-inspect").waitFor({ state: "visible", timeout: 10000 });
      await page.click("#repair-inspect");
      await page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
      await page.waitForTimeout(500);
      await captureAuditScreenshot(page, "08-recovery");

      console.log(`Visual audit screenshots: ${auditScreenshotsRoot}`);
    },
  },
  {
    name: "settings-navigation-and-diagnostics",
    run: async (harness) => {
      await harness.gotoHome();
      await harness.page.click("#home-settings");
      await harness.page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.locator("[data-settings-panel='app']").first().waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await harness.page.locator("#settings-tabs").isHidden(), true, "App Preferences should open as its own surface");
      await harness.page.click("#close-setup");
      await harness.page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });
      await harness.page.click("#home-provider-setup");
      await harness.page.locator("[data-settings-panel='ai']").first().waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await harness.page.locator("#settings-tabs").isHidden(), true, "DM Voice should open as its own surface");
      await harness.page.click("#close-setup");
      await harness.page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });

      await createCampaignFromWizard(harness, {
        title: "Harness Settings",
        premise: "A group gathers in a rain-warm inn before choosing the next road.",
        startingLocation: "The Copper Eave",
        tone: "quiet table setup",
        primary: {
          name: "Perrin",
          ancestry: "Human",
          characterClass: "Bard",
          concept: "A calm host who keeps everyone at the same table.",
        },
      });
      await harness.page.click("#open-setup");
      await harness.page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.locator("[data-settings-panel='friends']").first().waitFor({ state: "visible", timeout: 10000 });
      assert.equal(await harness.page.locator("#settings-tabs").isHidden(), true, "Friends And Seats should open as its own surface");
      assert.equal(
        await harness.page.locator("#provider-setup-section").isHidden(),
        true,
        "DM Voice panel should stay hidden inside Friends And Seats",
      );
      assert.equal(
        await harness.page.locator("[data-settings-panel='troubleshooting']").first().isHidden(),
        true,
        "Troubleshooting should not be a normal neighbor of Friends And Seats",
      );
      await harness.page.evaluate(() => window.__lorekeeperDebug?.openSurface?.("troubleshooting"));
      await harness.page.locator(".diagnostics-section").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.click("#refresh-diagnostics");
      await expectVisibleText(harness.page, "Ready To Start");
      await harness.page.click("#close-setup");
      await harness.page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });
    },
  },
  {
    name: "record-dialog-add-party-member",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Binder Party",
        premise: "A dockside crew prepares to search a lighthouse that answers questions in thunder.",
        startingLocation: "Saltglass Docks",
        tone: "stormy pulp fantasy",
        primary: {
          name: "Cass",
          ancestry: "Human",
          characterClass: "Rogue",
          concept: "A lockpicker with a conscience and a bad history with lighthouses.",
        },
      });
      await harness.page.click("[data-add-domain='party']");
      await harness.page.locator("#record-dialog").waitFor({ state: "visible", timeout: 10000 });
      await harness.page.fill("#record-name", "Orrin");
      await harness.page.fill("#record-role", "Dwarf Cleric");
      await harness.page.fill("#record-notes", "Orrin keeps the crew patched up and distrusts talking architecture.");
      await harness.page.click("#save-record");
      await harness.page.waitForFunction(() => document.querySelector("#record-dialog")?.open !== true, null, { timeout: 10000 });
      await expectVisibleText(harness.page, "Orrin");
      const campaign = await harness.fetchJson("/api/campaign");
      assert.ok(campaign.campaign.party.some((member) => member.name === "Orrin"), "new party member should persist");
    },
  },
  {
    name: "home-delete-campaign",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Delete From Home",
        premise: "A short-lived table created only to prove library deletion.",
        startingLocation: "Temporary Camp",
        tone: "brief practical fantasy",
        primary: {
          name: "Dara",
          ancestry: "Human",
          characterClass: "Fighter",
          concept: "A steady adventurer who knows when a test is over.",
        },
      });
      await harness.page.click("#return-main-menu");
      await expectHomeCampaignOption(harness.page, "Harness Delete From Home");
      assert.equal(await harness.page.locator("#home-delete-campaign").isDisabled(), false);
      await harness.page.click("#home-delete-campaign");
      await harness.page.locator("#delete-campaign-dialog").waitFor({ state: "visible", timeout: 10000 });
      await expectVisibleText(harness.page, "Delete Harness Delete From Home");
      await harness.page.click("#confirm-delete-campaign");
      await harness.page.waitForFunction(() => document.querySelector("#delete-campaign-dialog")?.open !== true, null, { timeout: 10000 });
      await expectHomeLibraryText(harness.page, "No saved adventures yet");
      await assertNoVisibleText(harness.page, "Harness Delete From Home");
      await assertNoVisibleText(harness.page, "Untitled Campaign");
      assert.equal(await harness.page.locator("#home-host-flow").isDisabled(), true);
      assert.equal(await harness.page.locator("#home-delete-campaign").isDisabled(), true);
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

      await harness.mockProviderTurn(turnResponse({
        text: "The watchtower bell rings once, then every candle in Mossbridge bends toward the hill.",
        sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
      }));
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
    name: "pre-opening-ai-companion-nudge-disabled",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Pre Opening Nudge",
        premise: "A half-buried shrine waits beside an empty road before the first scene begins.",
        startingLocation: "Old Shrine Road",
        tone: "quiet roadside mystery",
        primary: {
          name: "Rowan",
          ancestry: "Elf",
          characterClass: "Ranger",
          concept: "A host-controlled archer who watches the road.",
        },
        companions: [{
          name: "Mira",
          ancestry: "Elf",
          characterClass: "Ranger",
          concept: "An AI companion scout who waits for the table to begin.",
          controllerKind: "ai_companion",
        }],
      });
      await assertPreOpeningDmNudgeDisabled(harness);
      await assertPreOpeningAiCompanionNudgeDisabled(harness, "Mira");
    },
  },
  {
    name: "rp-post-narration-import",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness RP Post",
        premise: "A shrine market goes silent whenever anyone says the missing saint's name.",
        startingLocation: "Saint Orra's Market",
        tone: "curious folkloric fantasy",
        primary: {
          name: "Vey",
          ancestry: "Tiefling",
          characterClass: "Warlock",
          concept: "A careful occultist who asks polite questions of dangerous things.",
        },
      });
      await startAdventureOpeningForHarness(harness, "Saint Orra's Market waits in a hush as the first table beat begins.");
      await harness.mockProviderTurn(turnResponse({
        text: "The spice seller lowers her voice. Around Vey, the market keeps moving, but every bell charm above the stalls turns inward as if listening.",
        sceneStatus: { mode: "social", danger: "tense", awaitingPlayer: true },
      }));
      await submitPlayerTurn(harness.page, "I ask the spice seller who last spoke the saint's name.");
      await expectVisibleText(harness.page, "spice seller lowers her voice");
      await expectVisibleText(harness.page, "I ask the spice seller");
      await assertNoActiveGeneration(harness.page);
    },
  },
  {
    name: "rp-choice-option-drafts-input",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness RP Choices",
        premise: "A river gate will open for one promise and close forever for another.",
        startingLocation: "The River Gate",
        tone: "mythic negotiation",
        primary: {
          name: "Elian",
          ancestry: "Elf",
          characterClass: "Paladin",
          concept: "A patient oathkeeper who listens before drawing steel.",
        },
      });
      await startAdventureOpeningForHarness(harness, "The River Gate wakes as Elian and the party arrive at its carved bank.");
      await harness.mockProviderTurn(turnResponse({
        text: "The gate's carved face asks what Elian will promise before it lets the party through.",
        sceneStatus: { mode: "social", danger: "tense", awaitingPlayer: true },
        choices: {
          prompt: "What promise does Elian offer?",
          scope: "character",
          forActorId: "party-elian",
          forActor: "Elian",
          options: [
            { id: "A", actorId: "party-elian", actor: "Elian", text: "Promise to return with the river's stolen bell." },
            { id: "B", actorId: "party-elian", actor: "Elian", text: "Promise to guard the crossing for one night." },
          ],
          allowOther: true,
        },
      }));
      await submitPlayerTurn(harness.page, "I ask what price the gate demands.");
      await harness.page.locator(".choice-option").first().waitFor({ state: "visible", timeout: 10000 });
      await harness.page.locator(".choice-option").first().click();
      await harness.page.waitForFunction(() => document.querySelector("#player-input")?.value.includes("stolen bell"), null, { timeout: 10000 });
    },
  },
  {
    name: "ollama-provider-contract-smoke",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Ollama Contract",
        premise: "A lantern keeper hears one knock from inside an empty tower.",
        startingLocation: "Hollow Lantern Tower",
        tone: "concise eerie fantasy",
        primary: {
          name: "Lio",
          ancestry: "Human",
          characterClass: "Ranger",
          concept: "A quiet scout who tests danger with careful questions.",
        },
      });
      const status = await harness.fetchJson("/api/provider/status");
      const model = chooseFastOllamaModel(status);
      if (!model) {
        console.log("SKIP ollama-provider-contract-smoke (no running Ollama quick model found)");
        return;
      }
      await harness.fetchJson("/api/provider/settings", {
        method: "POST",
        body: {
          preferredProvider: "ollama",
          selectedModel: model,
          fastMode: true,
          outputLimit: 700,
          generationTimeoutMs: 60_000,
        },
      });
      const rpResult = await runProviderContractTurn(harness, {
        playerMessage: "I listen at the empty tower door.",
      });
      assert.equal(rpResult.parseError || "", "", "real Ollama RP result should parse");
      assert.ok(rpResult.structured?.table?.length, "real Ollama RP result should include table narration");

      const combatResult = await runProviderContractTurn(harness, {
        playerMessage: "I draw my bow and prepare for the thing behind the door.",
      });
      assert.equal(combatResult.parseError || "", "", "real Ollama combat-ish result should parse");
      assert.ok(combatResult.structured?.table?.length, "real Ollama combat-ish result should include table narration");
    },
  },
  {
    name: "combat-player-and-enemy-turns",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Combat Turns",
        premise: "Ash wolves test the edge of a lantern-lit bridge.",
        startingLocation: "Lantern Bridge",
        tone: "fast tactical fantasy",
        primary: {
          name: "Mira",
          ancestry: "Human",
          characterClass: "Fighter",
          concept: "A spear fighter who keeps danger pointed at herself.",
        },
      });
      await startAdventureOpeningForHarness(harness, "Lantern Bridge flares to life as the ash wolves begin testing the light.");
      await harness.mockProviderTurns([
        combatStartResponse(),
        turnResponse({
          text: "Mira's spear snaps forward and drives the ash wolf back from the bridge rail.",
          sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
          mechanics: [{ type: "attack", actor: "Mira", target: "Ash Wolf", roll: "d20+5 = 18 vs AC 13", damage: "1d8+3 = 8 piercing", outcome: "success", text: "Mira hits the Ash Wolf for 8 piercing damage." }],
          proposedChanges: [combatChange({
            id: "combat-mira-advance",
            summary: "Mira's attack resolves and initiative advances.",
            data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "party-mira" },
          })],
        }),
        turnResponse({
          text: "The ash wolf lunges low, jaws snapping against Mira's greave before it skids past her guard.",
          sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
          mechanics: [{ type: "attack", actor: "Ash Wolf", target: "Mira", roll: "d20+4 = 11 vs AC 16", outcome: "failure", text: "Ash Wolf attacks Mira. Attack 11 vs AC 16: miss." }],
          proposedChanges: [combatChange({
            id: "combat-wolf-advance",
            summary: "The Ash Wolf attack misses and initiative returns to Mira.",
            data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: "enemy-ash-wolf" },
          })],
        }),
      ]);
      await submitPlayerTurn(harness.page, "I step between the courier and the ash wolf.");
      await expectCombatActor(harness.page, "Mira");
      await submitPlayerTurn(harness.page, "Mira attacks the ash wolf with her spear.");
      await expectVisibleText(harness.page, "Mira hits the Ash Wolf");
      await expectCombatActor(harness.page, "Ash Wolf");
      await harness.page.click("#nudge-dm");
      await expectVisibleText(harness.page, "Attack 11 vs AC 16: miss");
      await expectCombatActor(harness.page, "Mira");
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
  {
    name: "remote-guest-prelobby-joins-and-plays",
    run: async (harness) => {
      await harness.gotoHome();
      await openCampaignWizard(harness.page);
      await fillCampaignSeed(harness.page, {
        title: "Harness Prelobby Remote",
        premise: "A river watch gathers before a suspicious ferry crossing.",
        startingLocation: "Greyford Ferry",
        tone: "warm, tense road fantasy",
        primary: {
          name: "Ilyra",
          ancestry: "Half-elf",
          characterClass: "Bard",
          concept: "A watchful singer who reads a crowd before speaking.",
        },
      });
      const remoteCard = await ensureWizardPartyCard(harness.page, 0);
      await fillWizardPartyCard(remoteCard, {
        name: "Renn",
        ancestry: "Human",
        characterClass: "Ranger",
        concept: "A river scout who knows when ferrymen are lying.",
        integrationPrompt: "Renn arrives with news from the far bank.",
        controllerKind: "remote_invite",
      });
      const preTableSnapshot = await waitForPreTableParty(harness, { minSeats: 1 });
      assert.ok(preTableSnapshot.joinableSeats.some((seat) => seat.name === "Renn"), "Renn should be joinable before campaign launch");

      const guestPage = await harness.newGuestPage("guest-prelobby");
      await requestGuestSeat(guestPage, { playerName: "Remote Jess", seatName: "Renn" });
      await seatPreTableGuest(harness, { playerName: "Remote Jess", seatName: "Renn" });
      await expectVisibleText(guestPage, "Seat reserved");

      await harness.page.click("#start-campaign-submit");
      await harness.page.waitForFunction(() => document.querySelector("#campaign-dialog")?.open !== true, null, { timeout: 15000 });
      await harness.page.waitForFunction((title) => {
        return window.__lorekeeperDebug?.stateSummary?.().campaignTitle === title;
      }, "Harness Prelobby Remote", { timeout: 10000 });

      const connected = await waitForGuestConnected(guestPage, { characterName: "Renn", campaignTitle: "Harness Prelobby Remote" });
      assert.equal(connected.assignedCharacter.name, "Renn");
      await sendTableTalk(guestPage, "Remote Jess is ready from the pre-lobby.");
      await expectVisibleText(harness.page, "Remote Jess is ready from the pre-lobby.");
      await assertRemoteController(harness, "Renn");
    },
  },
  {
    name: "remote-guest-active-table-leave-rejoin-new-game",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Remote Active A",
        premise: "A road camp watches torchlight move against the wind.",
        startingLocation: "Lantern Road Camp",
        tone: "alert cooperative fantasy",
        primary: {
          name: "Ilyra",
          ancestry: "Half-elf",
          characterClass: "Bard",
          concept: "A steady traveler keeping the group from panic.",
        },
        companions: [{
          name: "Renn",
          ancestry: "Human",
          characterClass: "Ranger",
          concept: "A scout who reads tracks and trouble.",
          integrationPrompt: "Renn has been watching the road ahead.",
          controllerKind: "remote_invite",
        }],
      });
      await waitForActiveJoinableSeat(harness, "Renn");

      const guestPage = await harness.newGuestPage("guest-active");
      await requestGuestSeat(guestPage, { playerName: "Remote Jess", seatName: "Renn" });
      await seatActiveWaitingGuest(harness, { playerName: "Remote Jess", seatName: "Renn" });
      const firstSession = await waitForGuestConnected(guestPage, { characterName: "Renn", campaignTitle: "Harness Remote Active A" });
      assert.equal(firstSession.assignedCharacter.name, "Renn");
      await expectGuestActionRejected(
        harness,
        await guestDebugSession(guestPage),
        "Renn tries to act before the host starts the adventure.",
      );

      await sendTableTalk(guestPage, "Remote Jess says hello from the guest tab.");
      await expectVisibleText(harness.page, "Remote Jess says hello from the guest tab.");
      await sendTableTalk(harness.page, "Host sees the remote tab clearly.");
      await expectVisibleText(guestPage, "Host sees the remote tab clearly.");

      await startAdventureOpeningForHarness(harness, "Lantern Road Camp opens with torchlight moving against the wind.");
      await submitGuestTurn(guestPage, "Renn checks the road dust for a second set of tracks.");
      await waitForHostStagedGuestInput(harness.page, "Renn checks the road dust");
      await harness.mockProviderTurn(turnResponse({
        text: "Renn finds a second set of tracks cutting through the camp perimeter, and Ilyra spots the lantern that tried to hide them.",
        sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
      }));
      await submitPlayerTurn(harness.page, "Ilyra keeps the camp quiet while Renn points out the tracks.");
      await expectVisibleText(guestPage, "second set of tracks");

      const staleSession = await guestDebugSession(guestPage);
      await guestPage.click("#return-main-menu");
      await waitForProviderActivityText(guestPage, /Left the hosted table/i);
      await expectGuestActionRejected(harness, staleSession, "Renn tries to act after leaving.");
      await waitForActiveJoinableSeat(harness, "Renn");

      await requestGuestSeat(guestPage, { playerName: "Remote Jess", seatName: "Renn" });
      await seatActiveWaitingGuest(harness, { playerName: "Remote Jess", seatName: "Renn" });
      const rejoined = await waitForGuestConnected(guestPage, { characterName: "Renn", campaignTitle: "Harness Remote Active A" });
      assert.notEqual(rejoined.connection.id, staleSession.connectionId, "rejoin should create a fresh active connection");
      const oldGameSession = await guestDebugSession(guestPage);

      await harness.page.click("#return-main-menu");
      await createCampaignFromWizard(harness, {
        title: "Harness Remote Active B",
        premise: "A city gate opens for a new table with a different scout.",
        startingLocation: "Southgate Arch",
        tone: "clean fresh-start fantasy",
        primary: {
          name: "Mira",
          ancestry: "Human",
          characterClass: "Fighter",
          concept: "A calm guard captain starting a fresh job.",
        },
        companions: [{
          name: "Tavi",
          ancestry: "Halfling",
          characterClass: "Rogue",
          concept: "A bright-eyed courier with quick hands.",
          integrationPrompt: "Tavi knows who hired the party at Southgate.",
          controllerKind: "remote_invite",
        }],
      });
      await waitForActiveJoinableSeat(harness, "Tavi");
      await expectGuestActionRejected(harness, oldGameSession, "Renn tries to act in the old game after host starts a new one.");

      await guestPage.click("#return-main-menu");
      await requestGuestSeat(guestPage, { playerName: "Remote Jess", seatName: "Tavi" });
      await seatActiveWaitingGuest(harness, { playerName: "Remote Jess", seatName: "Tavi" });
      const newGameSession = await waitForGuestConnected(guestPage, { characterName: "Tavi", campaignTitle: "Harness Remote Active B" });
      assert.equal(newGameSession.campaignTitle, "Harness Remote Active B");
      assert.equal(newGameSession.assignedCharacter.name, "Tavi");
    },
  },
  {
    name: "remote-guest-party-vote-drafts-host-choice",
    run: async (harness) => {
      await harness.gotoHome();
      await createCampaignFromWizard(harness, {
        title: "Harness Remote Vote",
        premise: "A dusk road offers three bad promises and one honest silence.",
        startingLocation: "Dusk Road Shrine",
        tone: "quiet table dilemma",
        primary: {
          name: "Ilyra",
          ancestry: "Half-elf",
          characterClass: "Bard",
          concept: "A careful traveler who asks the table before choosing.",
        },
        companions: [{
          name: "Renn",
          ancestry: "Human",
          characterClass: "Ranger",
          concept: "A scout with practical instincts about road danger.",
          integrationPrompt: "Renn knows the old road signs.",
          controllerKind: "remote_invite",
        }],
      });
      await waitForActiveJoinableSeat(harness, "Renn");
      const guestPage = await harness.newGuestPage("guest-vote");
      await requestGuestSeat(guestPage, { playerName: "Remote Jess", seatName: "Renn" });
      await seatActiveWaitingGuest(harness, { playerName: "Remote Jess", seatName: "Renn" });
      await waitForGuestConnected(guestPage, { characterName: "Renn", campaignTitle: "Harness Remote Vote" });

      await startAdventureOpeningForHarness(harness, "The Dusk Road Shrine asks the table to choose how it will pass.");
      await harness.mockProviderTurn(turnResponse({
        text: "The shrine's stones warm as the road waits for the party to choose its promise.",
        sceneStatus: { mode: "social", danger: "tense", awaitingPlayer: true },
        choices: {
          prompt: "Which promise does the party make?",
          scope: "vote",
          options: [
            { id: "oath", text: "Promise to return the stolen mile marker." },
            { id: "watch", text: "Promise to keep watch until dawn." },
            { id: "silence", text: "Promise nothing and leave an offering." },
          ],
          allowVote: true,
          allowOther: true,
        },
      }));
      await submitPlayerTurn(harness.page, "Ilyra asks the table which promise feels honest.");
      await guestPage.locator(".choice-option").first().waitFor({ state: "visible", timeout: 15000 });
      await guestPage.locator(".choice-option").first().click();
      await harness.page.waitForFunction(() => {
        return [...document.querySelectorAll(".choice-vote-count")]
          .some((node) => node.textContent?.trim() === "1");
      }, null, { timeout: 15000 });
      await expectVisibleText(harness.page, "Table leaning");
      await expectVisibleText(harness.page, "Draft leading choice A");
      await harness.page.click(".choice-vote-action");
      await harness.page.waitForFunction(() => {
        return /stolen mile marker/i.test(document.querySelector("#player-input")?.value ?? "");
      }, null, { timeout: 10000 });
    },
  },
];
const chaosScenarios = wantsChaos ? buildChaosScenarios({ seed: chaosSeed, runs: chaosRuns }) : [];
const allScenarios = [...scenarios, ...chaosScenarios];

const runnableScenarios = selectedScenario
  ? allScenarios.filter((scenario) => scenario.name === selectedScenario)
  : args.chaosOnly ? chaosScenarios : allScenarios;

if (selectedScenario && runnableScenarios.length === 0) {
  throw new Error(`Unknown UI scenario "${selectedScenario}". Available: ${allScenarios.map((scenario) => scenario.name).join(", ")}`);
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
  if (wantsChaos) {
    console.log(`UI chaos mode enabled: seed=${chaosSeed}, runs=${chaosRuns}${args.chaosOnly ? ", chaos-only=true" : ""}`);
  }
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
  const pages = [];
  const browserErrors = [];
  const responseChecks = [];
  let serverOutput = "";
  child.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    const port = await waitForServerPort(child);
    const baseUrl = `http://127.0.0.1:${port}`;
    context = await browserInstance.newContext({
      viewport: scenario.viewport ?? { width: 1440, height: 1000 },
    });
    const trackPage = async (trackedPage, label = "page") => {
      pages.push({ page: trackedPage, label });
      trackedPage.on("console", (message) => {
        if (message.type() === "error") {
          if (/Failed to load resource: the server responded with a status of/i.test(message.text())) {
            return;
          }
          browserErrors.push(`[${label} console] ${message.text()}`);
        }
      });
      trackedPage.on("pageerror", (error) => {
        browserErrors.push(`[${label} pageerror] ${error.message}`);
      });
      trackedPage.on("response", (response) => {
        responseChecks.push((async () => {
          const status = response.status();
          const url = response.url();
          if (status === 404 && url.includes("/api/campaign/message/update")) {
            return;
          }
          if (status >= 500) {
            const body = await response.text().catch(() => "");
            browserErrors.push(`[${label} response ${status}] ${url}${body ? `: ${body.slice(0, 300)}` : ""}`);
          }
        })());
      });
      return trackedPage;
    };

    page = await trackPage(await context.newPage(), "host");

    const providerQueue = [];
    let providerRouteInstalled = false;
    const installProviderRoute = async () => {
      if (providerRouteInstalled) {
        return;
      }
      providerRouteInstalled = true;
      await page.route("**/api/provider/generate-turn", async (route) => {
        const response = providerQueue.shift();
        if (!response) {
          await fulfillProviderRoute(route, {
            status: 500,
            contentType: "text/plain",
            body: "UI harness provider queue exhausted.",
          });
          return;
        }
        if (response.__delayMs) {
          await new Promise((resolve) => setTimeout(resolve, response.__delayMs));
        }
        if (response.__error) {
          await fulfillProviderRoute(route, {
            status: response.__error.status ?? 500,
            contentType: "text/plain",
            body: response.__error.body ?? "UI harness provider error.",
          });
          return;
        }
        if (response.__rawText) {
          const body = [
            { type: "start", model: "ui-harness" },
            {
              type: "done",
              result: {
                ok: false,
                providerId: "ui-harness",
                model: "ui-harness",
                durationMs: 5,
                text: response.__rawText,
                rawText: response.__rawText,
                structured: null,
                parseError: response.__parseError ?? "UI harness provider response did not match the turn contract.",
                validationErrors: response.__validationErrors ?? [],
              },
            },
          ].map((event) => JSON.stringify(event)).join("\n") + "\n";
          await fulfillProviderRoute(route, {
            status: 200,
            contentType: "application/x-ndjson; charset=utf-8",
            body,
          });
          return;
        }
        const structured = stripHarnessResponseMeta(response);
        const body = [
          { type: "start", model: "ui-harness" },
          {
            type: "done",
            result: {
              ok: true,
              providerId: "ui-harness",
              model: "ui-harness",
              durationMs: 5,
              text: JSON.stringify(structured),
              rawText: JSON.stringify(structured),
              structured,
              validationErrors: response.__validationErrors ?? [],
            },
          },
        ].map((event) => JSON.stringify(event)).join("\n") + "\n";
        await fulfillProviderRoute(route, {
          status: 200,
          contentType: "application/x-ndjson; charset=utf-8",
          body,
        });
      });
    };

    const harness = {
      baseUrl,
      page,
      async newGuestPage(label = "guest") {
        const guestPage = await trackPage(await context.newPage(), label);
        await guestPage.goto(`${baseUrl}/guest`, { waitUntil: "domcontentloaded" });
        await guestPage.waitForSelector("#root", { timeout: 10000 });
        await guestPage.waitForFunction(() => Boolean(window.__lorekeeperDebug), null, { timeout: 10000 });
        return guestPage;
      },
      async gotoHome() {
        await page.goto(`${baseUrl}/?lkToken=${encodeURIComponent(token)}`, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#root", { timeout: 10000 });
        await page.waitForFunction(() => Boolean(window.__lorekeeperDebug), null, { timeout: 10000 });
      },
      async fetchJson(pathname, options = {}) {
        return fetchJson(`${baseUrl}${pathname}`, options);
      },
      async mockProviderTurn(response) {
        await this.mockProviderTurns([response]);
      },
      async mockProviderTurns(responses) {
        providerQueue.splice(0, providerQueue.length, ...responses);
        await installProviderRoute();
      },
    };

    await scenario.run(harness);
    await Promise.allSettled(responseChecks);
    await assertRendererHarness(page);
    assert.deepEqual(browserErrors, [], `${scenario.name} browser errors`);
    console.log(`PASS ${scenario.name}`);
  } catch (error) {
    if (page) {
      await writeFailureArtifacts({ scenarioName: scenario.name, page, baseUrl: page.url(), error });
      for (const { page: extraPage, label } of pages.filter((entry) => entry.page !== page)) {
        await writeFailureArtifacts({ scenarioName: `${scenario.name}-${label}`, page: extraPage, baseUrl: extraPage.url(), error }).catch(() => {});
      }
      await writeFile(path.join(artifactsRoot, `${scenario.name}.server.txt`), serverOutput).catch(() => {});
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

async function runNpmScript(scriptName) {
  const npmCommand = process.platform === "win32" ? "npm" : "npm";
  const child = spawn(npmCommand, ["run", scriptName], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  const exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
  if (exitCode !== 0) {
    throw new Error(`npm run ${scriptName} failed before UI flow tests:\n${output}`);
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

async function requestGuestSeat(guestPage, { playerName, seatName }) {
  if (!await guestPage.locator("#guest-waiting-room-panel").isVisible().catch(() => false)) {
    await clickIfVisible(guestPage, "#home-join-flow");
  }
  if (!await guestPage.locator("#guest-waiting-room-panel").isVisible().catch(() => false)) {
    await guestPage.waitForTimeout(300);
  }
  if (!await guestPage.locator("#guest-waiting-room-panel").isVisible().catch(() => false)) {
    const origin = new URL(guestPage.url()).origin;
    await guestPage.goto(`${origin}/guest`, { waitUntil: "domcontentloaded" });
    await guestPage.waitForFunction(() => Boolean(window.__lorekeeperDebug), null, { timeout: 10000 });
  }
  await guestPage.locator("#guest-waiting-room-panel").waitFor({ state: "visible", timeout: 10000 });
  await guestPage.waitForFunction((name) => {
    const buttons = [...document.querySelectorAll("[data-guest-seat-id]")];
    return buttons.some((button) => !name || button.textContent?.includes(name));
  }, seatName ?? "", { timeout: 15000 });
  if (seatName) {
    await guestPage.locator("[data-guest-seat-id]").filter({ hasText: seatName }).first().click();
  } else {
    await guestPage.locator("[data-guest-seat-id]").first().click();
  }
  await guestPage.fill("#guest-waiting-player-name", playerName);
  await guestPage.click("#guest-waiting-register");
  await guestPage.waitForFunction(() => {
    return /waiting|seat request sent/i.test(document.querySelector("#guest-waiting-status")?.textContent ?? "");
  }, null, { timeout: 10000 });
}

async function seatPreTableGuest(harness, { playerName, seatName }) {
  const snapshot = await waitForAsync(async () => {
    const candidate = await harness.fetchJson("/api/pretable-lobby/host-snapshot");
    const guest = candidate.waitingGuests?.find((item) => item.displayName === playerName);
    const seat = candidate.joinableSeats?.find((item) => item.name === seatName);
    return guest && seat ? { candidate, guest, seat } : null;
  }, {
    timeoutMs: 15000,
    description: `pre-table guest ${playerName} waiting for ${seatName}`,
  });
  await harness.fetchJson("/api/pretable-lobby/seat", {
    method: "POST",
    body: {
      waitingGuestId: snapshot.guest.id,
      partyMemberId: snapshot.seat.id,
    },
  });
}

async function waitForActiveJoinableSeat(harness, seatName) {
  return waitForAsync(async () => {
    const { campaign } = await harness.fetchJson("/api/campaign");
    const seat = (campaign.party ?? []).find((member) =>
      member.name === seatName &&
      member.inviteIntent === "remote_player" &&
      member.controllerKind !== "remote_player"
    );
    const table = campaign.multiplayer?.localTable ?? {};
    return table.running && seat ? { campaign, seat, table } : null;
  }, {
    timeoutMs: 15000,
    description: `active joinable seat ${seatName}`,
  });
}

async function seatActiveWaitingGuest(harness, { playerName, seatName }) {
  const state = await waitForAsync(async () => {
    const { campaign } = await harness.fetchJson("/api/campaign");
    const guest = (campaign.multiplayer?.waitingGuests ?? []).find((item) =>
      item.displayName === playerName && item.status === "waiting"
    );
    const seat = (campaign.party ?? []).find((member) => member.name === seatName);
    const table = campaign.multiplayer?.localTable ?? {};
    return guest && seat && table.running ? { campaign, guest, seat, table } : null;
  }, {
    timeoutMs: 15000,
    description: `active waiting guest ${playerName} for ${seatName}`,
  });
  await harness.fetchJson("/api/multiplayer/waiting-room/seat", {
    method: "POST",
    body: {
      campaignId: state.campaign.id,
      tableId: state.table.tableId,
      sessionId: state.table.sessionId,
      waitingGuestId: state.guest.id,
      partyMemberId: state.seat.id,
    },
  });
}

async function waitForGuestConnected(guestPage, { characterName, campaignTitle }) {
  return waitForAsync(async () => {
    const renderer = await guestPage.evaluate(() => window.__lorekeeperDebug?.renderer?.());
    const guest = renderer?.debugSnapshot?.multiplayer?.guest;
    const saveStatus = await guestPage.locator("#save-status").textContent().catch(() => "");
    if (
      guest?.status === "connected" &&
      (!characterName || saveStatus?.includes(characterName)) &&
      (!campaignTitle || renderer?.debugSnapshot?.identity?.campaignTitle === campaignTitle)
    ) {
      return {
        campaignTitle: renderer.debugSnapshot.identity.campaignTitle,
        assignedCharacter: { name: characterName || saveStatus?.replace(/^Guest:\s*/i, "") || "" },
        connection: {
          id: guest.connectionId,
          partyMemberId: guest.partyMemberId,
          status: guest.status,
        },
      };
    }
    return null;
  }, {
    timeoutMs: 20000,
    intervalMs: 250,
    description: `guest connected${characterName ? ` as ${characterName}` : ""}`,
  });
}

async function assertRemoteController(harness, characterName) {
  const { campaign } = await harness.fetchJson("/api/campaign");
  const member = campaign.party.find((item) => item.name === characterName);
  assert.equal(member?.controllerKind, "remote_player", `${characterName} should be remote-controlled`);
}

async function sendTableTalk(page, text) {
  await page.locator("#table-talk-input").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => {
    const input = document.querySelector("#table-talk-input");
    const button = document.querySelector("#table-talk-send");
    return input && button && !input.disabled && !button.disabled;
  }, null, { timeout: 10000 });
  await page.fill("#table-talk-input", text);
  await page.click("#table-talk-send");
  await expectVisibleText(page, text);
}

async function submitGuestTurn(guestPage, text) {
  await guestPage.locator("#player-input").waitFor({ state: "visible", timeout: 10000 });
  await waitForAsync(async () => {
    if (!await setPlayerInput(guestPage, text)) {
      return null;
    }
    return await guestPage.evaluate((expectedText) => {
      const button = document.querySelector("#build-turn");
      const input = document.querySelector("#player-input");
      return Boolean(button && input && input.value === expectedText && !button.disabled && !input.disabled);
    }, text) ? true : null;
  }, {
    timeoutMs: 12000,
    description: "guest input ready to submit",
  });
  await guestPage.click("#build-turn");
  await guestPage.waitForFunction(() => /Action sent|Waiting for the host/i.test(document.querySelector("#provider-activity-label")?.textContent ?? ""), null, { timeout: 10000 });
}

async function waitForHostStagedGuestInput(hostPage, textFragment) {
  return waitForAsync(async () => {
    const stagedInputs = await hostPage.evaluate(() =>
      window.__lorekeeperDebug?.renderer?.().debugSnapshot?.multiplayer?.stagedGuestInputs ?? []
    );
    return stagedInputs.some((input) => input.textPreview?.includes(textFragment)) ? stagedInputs : null;
  }, {
    timeoutMs: 15000,
    description: `host staged guest input containing ${textFragment}`,
  });
}

async function guestDebugSession(guestPage) {
  return guestPage.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("lorekeeper.guestSession") || "null");
    } catch {
      return null;
    }
  });
}

async function expectGuestActionRejected(harness, session, text) {
  if (!session?.connectionId) {
    return;
  }
  const response = await fetch(`${harness.baseUrl}/api/multiplayer/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      connectionId: session.connectionId,
      clientId: session.clientId,
      connectionSecret: session.connectionSecret,
      characterId: session.partyMemberId,
      text,
      ready: true,
      campaignId: session.campaignId,
      tableId: session.tableId,
      sessionId: session.sessionId,
    }),
  });
  assert.equal(response.ok, false, "stale or disconnected guest credentials should not submit actions");
}

async function assertNoDuplicateWizardCardNames(page) {
  const names = await page.locator("[data-wizard-character-card]").evaluateAll((cards) => cards
    .map((card) => card.querySelector("[data-character-field='name'], #new-joiner-name")?.value?.trim())
    .filter(Boolean));
  assertUniqueStrings(names, "wizard character card names");
}

function buildChaosScenarios({ seed, runs }) {
  return Array.from({ length: runs }, (_, index) => {
    const runSeed = `${seed}:${index + 1}`;
    return {
      name: `chaos-table-flow-${sanitizeScenarioName(runSeed)}`,
      viewport: args.mobileChaos && index === runs - 1
        ? narrowChaosViewport
        : desktopChaosViewports[index % desktopChaosViewports.length],
      run: async (harness) => runChaosTableFlow(harness, { runIndex: index + 1, seed: runSeed }),
    };
  });
}

async function runChaosTableFlow(harness, { runIndex, seed }) {
  const rng = seededRandom(seed);
  const page = harness.page;
  await harness.gotoHome();
  await assertHealthyUi(harness, `chaos ${runIndex}: home`);

  await openCampaignWizard(page);
  for (let count = 0, limit = randomInt(rng, 1, 4); count < limit; count += 1) {
    await clickIfVisible(page, "#adventure-seed-preset");
    await page.waitForTimeout(randomInt(rng, 30, 120));
  }
  const primaryName = `Ilyra Chaos ${runIndex}`;
  await fillCampaignSeed(page, {
    title: `Chaos Table ${runIndex}`,
    premise: "A road ambush keeps changing shape while the table is still getting seated.",
    startingLocation: "Switchback Road",
    tone: "urgent, grounded fantasy",
    primary: {
      name: primaryName,
      ancestry: "Half-elf",
      characterClass: "Bard",
      concept: "A watchful traveler who distrusts clean answers.",
    },
  });

  for (let count = 0, limit = randomInt(rng, 3, 7); count < limit; count += 1) {
    await clickIfVisible(page, rng() < 0.7 ? "#add-party-template" : "#add-wizard-party-member");
    await page.waitForTimeout(randomInt(rng, 20, 90));
    await assertNoDuplicateWizardCardNames(page);
  }
  await exerciseRandomButtonMash(harness, rng, `chaos ${runIndex}: wizard mash`, {
    steps: randomInt(rng, 5, 10),
    selectors: wizardMashSelectors(),
    keepCampaignDialogOpen: true,
  });
  if (await page.locator("[data-wizard-character-card]").count()) {
    await fillWizardPartyCard(page.locator("[data-wizard-character-card]").last(), {
      name: `Remote Seat ${runIndex}`,
      ancestry: "Human",
      characterClass: "Ranger",
      concept: "A late-arriving scout who knows the ridge line.",
      integrationPrompt: "They arrive with practical warnings, not exposition.",
      controllerKind: "remote_invite",
    });
  }
  await clickIfVisible(page, "#copy-pretable-guest-link");
  const preTableSnapshot = await waitForPreTableParty(harness, { minSeats: 1 });
  assertUniqueNames(preTableSnapshot.joinableSeats, "name", "chaos pre-table joinable seats");
  assertUniqueIds(preTableSnapshot.joinableSeats, "chaos pre-table joinable seats");
  await assertHealthyUi(harness, `chaos ${runIndex}: wizard party`);

  await page.click("#start-campaign-submit");
  await page.waitForFunction(() => document.querySelector("#campaign-dialog")?.open !== true, null, { timeout: 15000 });
  await page.waitForFunction((title) => {
    return window.__lorekeeperDebug?.stateSummary?.().campaignTitle === title;
  }, `Chaos Table ${runIndex}`, { timeout: 10000 });
  await assertHealthyUi(harness, `chaos ${runIndex}: campaign created`);
  await assertPreOpeningDmNudgeDisabled(harness);
  await assertFirstPreOpeningAiCompanionNudgeDisabled(harness);
  const remoteGuest = await exerciseRemoteGuestPreOpeningChaos(harness, rng, runIndex, `Remote Seat ${runIndex}`);
  await startAdventureOpeningForHarness(
    harness,
    `The switchback road comes alive as the first table beat begins for Chaos Table ${runIndex}.`,
  );
  await exerciseRemoteGuestActiveChaos(harness, remoteGuest, rng, runIndex);

  await exerciseTableChrome(harness, rng, runIndex);
  await exerciseRandomButtonMash(harness, rng, `chaos ${runIndex}: table mash`, {
    steps: randomInt(rng, 8, 16),
    selectors: tableMashSelectors(),
  });
  await exerciseRecords(harness, rng, runIndex);

  const campaign = await harness.fetchJson("/api/campaign");
  const actor = campaign.campaign.party[0];
  assert.ok(actor?.id && actor?.name, "chaos campaign should have a playable actor");
  await harness.mockProviderTurns([
    turnResponse({
      text: `The ridge answers ${actor.name}'s move with a low horn and a flash of hidden steel.`,
      sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
      __delayMs: runIndex % 2 === 0 ? 900 : 1200,
    }),
  ]);

  await exerciseProviderAndTableTalk(harness, rng, runIndex, actor);
  await commitPendingReviewIfAny(harness);
  const chaosCombatStart = combatStartTurnResponse({
    text: `The ambusher breaks cover, and ${actor.name} sees the attack before the road dust settles.`,
    actor,
    runIndex,
  });
  await harness.mockProviderTurns([chaosCombatStart, chaosCombatStart]);
  await submitPlayerTurn(page, `${actor.name} forces the ambusher into the open.`);
  const activeActor = await waitForActiveCombatActor(harness);
  await expectCombatActor(page, activeActor.name);

  if (!await isPlayerInputEnabled(page)) {
    const placeholder = await page.locator("#player-input").getAttribute("placeholder");
    assert.match(placeholder ?? "", new RegExp(escapeRegExp(activeActor.name), "i"), "locked combat input should name the active actor");
    await harness.mockProviderTurns([
      {
        ...turnResponse({
          text: `${activeActor.name} studies the Hidden Beast and waits for the host to stage the companion's move.`,
          sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: true },
        }),
        table: [{
          speaker: activeActor.name,
          speakerId: activeActor.id,
          role: "party",
          kind: "dialogue",
          visibility: "table",
          text: "I can draw it off-balance if you want me to commit.",
        }],
      },
      turnResponse({
        text: `${activeActor.name} holds position while the table waits for the host's call.`,
        sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: true },
      }),
    ]);
    await clickIfVisible(page, "#nudge-dm");
    await assertNoActiveGeneration(page);
    await expectVisibleText(page, "draw it off-balance");
    await assertHealthyUi(harness, `chaos ${runIndex}: companion combat lock`);
    return;
  }

  await harness.mockProviderTurns([
    turnResponse({
      text: `${activeActor.name} drives the Hidden Beast back with a clean hit, forcing it into view.`,
      sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
      mechanics: [{ type: "attack", actor: activeActor.name, target: "Hidden Beast", roll: "d20+5 = 19 vs AC 13", damage: "1d8+3 = 9 piercing", outcome: "success", text: `${activeActor.name} hits the Hidden Beast for 9 piercing damage.` }],
      proposedChanges: [combatChange({
        id: `chaos-player-advance-${runIndex}`,
        summary: "The player attack resolves and initiative advances.",
        data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: activeActor.id },
      })],
    }),
  ]);

  await submitPlayerTurn(page, `${activeActor.name} attacks the Hidden Beast.`);
  const nextActor = await waitForActiveCombatActor(harness);
  await expectCombatActor(page, nextActor.name);

  if (nextActor.type === "enemy" || nextActor.id === "enemy-hidden-beast") {
    await harness.mockProviderTurns([
      turnResponse({
        text: `${nextActor.name} snaps from the ditch, misses, and leaves claw marks in the wet road.`,
        sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: false },
        mechanics: [{ type: "attack", actor: nextActor.name, target: activeActor.name, roll: "d20+4 = 10 vs AC 15", outcome: "failure", text: `${nextActor.name} attacks ${activeActor.name}. Attack 10 vs AC 15: miss.` }],
        proposedChanges: [combatChange({
          id: `chaos-enemy-advance-${runIndex}`,
          summary: "The enemy attack resolves and initiative returns to a party actor.",
          data: { inCombat: true, turnResolved: true, advanceTurn: true, resolvedActorId: nextActor.id },
        })],
      }),
    ]);
    await page.click("#nudge-dm");
    await expectVisibleText(page, "Attack 10 vs AC 15: miss");
    const afterEnemy = await waitForActiveCombatActor(harness);
    await expectCombatActor(page, afterEnemy.name);
  }
  await exerciseRandomButtonMash(harness, rng, `chaos ${runIndex}: combat mash`, {
    steps: randomInt(rng, 5, 10),
    selectors: combatMashSelectors(),
  });
  await assertHealthyUi(harness, `chaos ${runIndex}: combat round`);
}

function combatStartTurnResponse({ text, actor, runIndex }) {
  return turnResponse({
    text,
    sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: true },
    mechanics: [{ type: "initiative", actor: actor.name, roll: `${actor.name} 17; Hidden Beast 11`, outcome: "pending", text: `Initiative begins: ${actor.name} acts before the Hidden Beast.` }],
    flags: { startsCombat: true },
    proposedChanges: [combatChange({
      id: `chaos-combat-start-${runIndex}`,
      summary: "Combat starts with a hidden beast.",
      data: {
        inCombat: true,
        round: 1,
        currentTurnId: actor.id,
        initiative: [actor.id, "enemy-hidden-beast"],
        turnOrder: [
          { id: actor.id, name: actor.name, type: "party", initiativeScore: 17 },
          { id: "enemy-hidden-beast", name: "Hidden Beast", type: "enemy", initiativeScore: 11 },
        ],
        enemies: [{ id: "enemy-hidden-beast", name: "Hidden Beast", hp: { current: 14, max: 14 }, armorClass: 13, attackBonus: 4, damage: "1d6+2" }],
      },
    })],
  });
}

async function waitForActiveCombatActor(harness) {
  return waitForAsync(async () => {
    const snapshot = await harness.page.evaluate(() => window.__lorekeeperDebug?.renderer?.());
    const actor = snapshot?.debugSnapshot?.turn?.activeActorId
      ? {
        id: snapshot.debugSnapshot.turn.activeActorId,
        name: snapshot.debugSnapshot.turn.activeActorName,
        controllerKind: snapshot.debugSnapshot.turn.controller?.kind ?? "",
        type: snapshot.debugSnapshot.combat?.currentTurnId?.startsWith("enemy-") ? "enemy" : "party",
      }
      : null;
    if (!actor?.id || !actor?.name) {
      return null;
    }
    return actor;
  }, {
    timeoutMs: 10000,
    description: "active combat actor",
  });
}

async function isPlayerInputEnabled(page) {
  return page.locator("#player-input").evaluate((input) => Boolean(input && !input.disabled && !input.readOnly)).catch(() => false);
}

function wizardMashSelectors() {
  return [
    "#add-party-template",
    "#add-wizard-party-member",
    "#copy-pretable-guest-link",
  ];
}

function tableMashSelectors() {
  return [
    "#open-setup",
    "#close-setup",
    "#start-local-table",
    "#stop-local-table",
    "#copy-guest-link",
    "#copy-character-invite",
    "#sync-guest-table",
    "#refresh-diagnostics",
    "#copy-diagnostics",
    "[data-add-domain='people']",
    "[data-add-domain='places']",
    "[data-add-domain='items']",
    "[data-add-domain='quests']",
    "#close-record-dialog",
    "#cancel-delete-campaign",
    "#close-delete-campaign",
  ];
}

function combatMashSelectors() {
  return [
    "#open-setup",
    "#close-setup",
    "#start-local-table",
    "#stop-local-table",
    "#copy-guest-link",
    "#refresh-diagnostics",
    "#copy-diagnostics",
    "[data-add-domain='people']",
    "#close-record-dialog",
  ];
}

async function exerciseRandomButtonMash(harness, rng, label, {
  steps = 8,
  selectors = tableMashSelectors(),
  keepCampaignDialogOpen = false,
} = {}) {
  const page = harness.page;
  for (let step = 0; step < steps; step += 1) {
    const clicked = await clickRandomVisibleSelector(page, shuffle(selectors, rng));
    await page.waitForTimeout(randomInt(rng, 60, 220));
    await closeTransientChaosDialogs(page, { keepCampaignDialogOpen });
    await assertHealthyUi(harness, `${label} step ${step + 1}`);
    if (!clicked) {
      break;
    }
  }
}

async function clickRandomVisibleSelector(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!await locator.count()) {
      continue;
    }
    if (!await locator.isVisible().catch(() => false)) {
      continue;
    }
    if (await locator.isDisabled?.().catch(() => false)) {
      continue;
    }
    return locator.click({ timeout: 1200 }).then(() => true).catch(() => false);
  }
  return false;
}

async function closeTransientChaosDialogs(page, { keepCampaignDialogOpen = false } = {}) {
  if (await page.locator("#record-dialog").evaluate((dialog) => dialog?.open === true).catch(() => false)) {
    await clickIfVisible(page, "#close-record-dialog");
  }
  if (await page.locator("#delete-campaign-dialog").evaluate((dialog) => dialog?.open === true).catch(() => false)) {
    await clickIfVisible(page, "#cancel-delete-campaign");
    await clickIfVisible(page, "#close-delete-campaign");
  }
  if (await page.locator("#setup-dialog").evaluate((dialog) => dialog?.open === true).catch(() => false)) {
    await clickIfVisible(page, "#close-setup");
  }
  if (!keepCampaignDialogOpen && await page.locator("#campaign-dialog").evaluate((dialog) => dialog?.open === true).catch(() => false)) {
    await clickIfVisible(page, "#close-campaign-dialog");
  }
}

async function exerciseTableChrome(harness, rng, runIndex) {
  const page = harness.page;
  await page.click("#open-setup");
  await page.locator("#setup-dialog").waitFor({ state: "visible", timeout: 10000 });
  for (const tab of shuffle(["app", "ai", "friends", "troubleshooting"], rng)) {
    await clickIfVisible(page, `[data-settings-tab="${tab}"]`);
    await page.waitForTimeout(randomInt(rng, 40, 140));
  }
  if (rng() < 0.45) {
    await page.evaluate(() => window.__lorekeeperDebug?.openSurface?.("troubleshooting"));
    await page.locator(".diagnostics-section").waitFor({ state: "visible", timeout: 10000 });
  }
  await clickIfVisible(page, "#refresh-diagnostics");
  await clickIfVisible(page, "#start-local-table");
  await clickIfVisible(page, "#copy-guest-link");
  await clickIfVisible(page, "#copy-character-invite");
  await page.click("#close-setup");
  await page.waitForFunction(() => document.querySelector("#setup-dialog")?.open !== true, null, { timeout: 10000 });

  if (await clickIfVisible(page, "#delete-campaign")) {
    await page.locator("#delete-campaign-dialog").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(randomInt(rng, 40, 120));
    await clickIfVisible(page, "#cancel-delete-campaign");
    await page.waitForFunction(() => document.querySelector("#delete-campaign-dialog")?.open !== true, null, { timeout: 10000 });
  }
  await assertHealthyUi(harness, `chaos ${runIndex}: chrome`);
}

async function exerciseRecords(harness, rng, runIndex) {
  const page = harness.page;
  for (const domain of shuffle(["people", "places", "items", "quests"], rng).slice(0, 2)) {
    if (!await clickIfVisible(page, `[data-add-domain='${domain}']`)) {
      continue;
    }
    await page.locator("#record-dialog").waitFor({ state: "visible", timeout: 10000 });
    await fillIfVisible(page, "#record-name", `Chaos ${domain} ${runIndex}`);
    await fillIfVisible(page, "#record-role", domain === "people" ? "Witness" : "");
    await fillIfVisible(page, "#record-notes", `Created by chaos UI flow ${runIndex}.`);
    if (rng() < 0.5) {
      await clickIfVisible(page, "#close-record-dialog");
    } else {
      await clickIfVisible(page, "#save-record");
    }
    await page.waitForFunction(() => document.querySelector("#record-dialog")?.open !== true, null, { timeout: 10000 });
  }
  await assertHealthyUi(harness, `chaos ${runIndex}: records`);
}

async function exerciseProviderAndTableTalk(harness, rng, runIndex, actor) {
  const page = harness.page;
  await page.locator("#player-input").waitFor({ state: "visible", timeout: 10000 });
  await page.fill("#player-input", `${actor.name} studies the ridge while everyone else is still arguing.`);
  await page.click("#build-turn");
  await page.waitForFunction(() => window.__lorekeeperDebug?.stateSummary?.().activeGeneration === true, null, { timeout: 5000 });
  for (let index = 0; index < 3; index += 1) {
    const text = `chaos side chat ${runIndex}.${index}`;
    await page.fill("#table-talk-input", text);
    await page.click("#table-talk-send");
    await expectVisibleText(page, text);
    await page.waitForTimeout(randomInt(rng, 30, 110));
  }
  if (runIndex % 2 === 0) {
    await clickIfVisible(page, "#cancel-generation");
    await assertNoActiveGeneration(page);
    await harness.mockProviderTurns([
      turnResponse({
        text: `The ridge answers ${actor.name}'s repeated watch with a low horn and a flash of hidden steel.`,
        sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
      }),
    ]);
    await submitPlayerTurn(page, `${actor.name} repeats the ridge watch after the table settles.`);
  }
  await assertNoActiveGeneration(page);
  await expectVisibleText(page, "ridge");
  await assertHealthyUi(harness, `chaos ${runIndex}: provider and table talk`);
}

async function exerciseRemoteGuestPreOpeningChaos(harness, rng, runIndex, seatName) {
  await waitForActiveJoinableSeat(harness, seatName);
  const guestPage = await harness.newGuestPage(`chaos-guest-${runIndex}`);
  const playerName = `Chaos Guest ${runIndex}`;
  await requestGuestSeat(guestPage, { playerName, seatName });
  await seatActiveWaitingGuest(harness, { playerName, seatName });
  const session = await waitForGuestConnected(guestPage, {
    characterName: seatName,
    campaignTitle: `Chaos Table ${runIndex}`,
  });
  assert.equal(session.assignedCharacter.name, seatName);
  await expectGuestActionRejected(
    harness,
    await guestDebugSession(guestPage),
    `${seatName} tries to act before Start Adventure in chaos.`,
  );
  const guestText = `chaos guest hello ${runIndex}.${randomInt(rng, 1, 999)}`;
  await sendTableTalk(guestPage, guestText);
  await expectVisibleText(harness.page, guestText);
  return guestPage;
}

async function exerciseRemoteGuestActiveChaos(harness, guestPage, rng, runIndex) {
  const hostText = `chaos host reply ${runIndex}.${randomInt(rng, 1, 999)}`;
  await sendTableTalk(harness.page, hostText);
  await expectVisibleText(guestPage, hostText);
  const actionText = `Remote Seat ${runIndex} checks the switchback edge for a second trail.`;
  await harness.mockProviderTurn(turnResponse({
    text: `Remote Seat ${runIndex} finds a second trail under the switchback grass while the host watches the table react.`,
    sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
  }));
  await submitGuestTurn(guestPage, actionText);
  await assertNoActiveGeneration(harness.page);
  await expectVisibleText(harness.page, "second trail");
  await expectVisibleText(guestPage, "second trail");
}

async function assertHealthyUi(harness, label) {
  const page = harness.page;
  await assertRendererHarness(page);
  const bodyText = await page.locator("body").innerText();
  assert.ok(!/\b(TypeError|ReferenceError|Unhandled|table\[\d+\])\b/.test(bodyText), `${label} leaked technical error text`);
  const openDialogs = await page.locator("dialog[open]").evaluateAll((dialogs) => dialogs.map((dialog) => dialog.id || dialog.getAttribute("aria-label") || dialog.className));
  assert.ok(openDialogs.length <= 1, `${label} has too many open dialogs: ${openDialogs.join(", ")}`);
  if (await page.locator("#campaign-dialog").evaluate((dialog) => dialog?.open === true).catch(() => false)) {
    await assertNoDuplicateWizardCardNames(page);
  }
  const campaign = await tryFetchJson(harness, "/api/campaign");
  if (campaign?.campaign?.party?.length) {
    assertUniqueNames(campaign.campaign.party, "name", `${label} campaign party`);
    assertUniqueIds(campaign.campaign.party, `${label} campaign party`);
  }
  if (campaign?.campaign?.combat?.inCombat) {
    const activeActor = await page.locator("#combat-active-actor").textContent().catch(() => "");
    assert.ok(activeActor?.trim(), `${label} should render an active combat actor`);
  }
}

async function assertFirstPreOpeningAiCompanionNudgeDisabled(harness) {
  const campaign = await harness.fetchJson("/api/campaign");
  const companion = campaign?.campaign?.party?.find((member) => member.controllerKind === "ai_companion");
  if (!companion?.name) {
    return;
  }
  await assertPreOpeningAiCompanionNudgeDisabled(harness, companion.name);
}

async function assertPreOpeningDmNudgeDisabled(harness) {
  const page = harness.page;
  const button = page.locator("#nudge-dm");
  await button.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await button.isDisabled(), true, "DM Nudge should be disabled before Start Adventure");
  assert.match(await button.getAttribute("title") ?? "", /Start Adventure/i);
  const input = page.locator("#player-input");
  const send = page.locator("#build-turn");
  await input.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await input.isDisabled(), true, "table action input should be disabled before Start Adventure");
  assert.equal(await send.isDisabled(), true, "Send Turn should be disabled before Start Adventure");
  assert.match(await input.getAttribute("placeholder") ?? "", /Start Adventure/i);
  await button.evaluate((element) => element.click());
  await page.waitForTimeout(500);
  const snapshot = await page.evaluate(() => ({
    renderer: window.__lorekeeperDebug?.renderer?.(),
    stateSummary: window.__lorekeeperDebug?.stateSummary?.(),
  }));
  assert.equal(snapshot.stateSummary?.activeGeneration, false, "disabled pre-opening DM nudge should not start generation");
  assert.notEqual(snapshot.stateSummary?.tablePhase, "recovery", "disabled pre-opening DM nudge should not trigger recovery");
  assert.doesNotMatch(snapshot.renderer?.providerActivity?.text ?? "", /generating|response review|table check/i);
  const debugSubmit = await page.evaluate(() => window.__lorekeeperDebug?.submitPlayerTurn?.({ text: "I test the pre-opening gate." }));
  assert.equal(debugSubmit?.providerReceived, false, "debug submit should respect the pre-opening gate");
  assert.equal(debugSubmit?.reason, "opening_not_started");
}

async function assertPreOpeningAiCompanionNudgeDisabled(harness, companionName) {
  const page = harness.page;
  const button = page
    .locator(".record")
    .filter({ hasText: companionName })
    .locator("button", { hasText: "Nudge" })
    .first();
  await button.waitFor({ state: "visible", timeout: 10000 });
  assert.equal(await button.isDisabled(), true, `${companionName} Nudge should be disabled before Start Adventure`);
  assert.match(await button.getAttribute("title") ?? "", /Start Adventure/i);
  await button.evaluate((element) => element.click());
  await page.waitForTimeout(500);
  const snapshot = await page.evaluate(() => ({
    renderer: window.__lorekeeperDebug?.renderer?.(),
    stateSummary: window.__lorekeeperDebug?.stateSummary?.(),
  }));
  assert.equal(snapshot.stateSummary?.activeGeneration, false, "disabled pre-opening companion nudge should not start generation");
  assert.notEqual(snapshot.stateSummary?.tablePhase, "recovery", "disabled pre-opening companion nudge should not trigger recovery");
  assert.doesNotMatch(snapshot.renderer?.providerActivity?.text ?? "", /spoke or acted|response review|table check/i);
}

async function startAdventureOpeningForHarness(harness, openingText) {
  const page = harness.page;
  await harness.mockProviderTurns([
    turnResponse({
      text: openingText,
      sceneStatus: { mode: "exploration", danger: "tense", awaitingPlayer: true },
    }),
  ]);
  await page.locator("#start-adventure-opening").waitFor({ state: "visible", timeout: 10000 });
  await page.click("#start-adventure-opening");
  await assertNoActiveGeneration(page, 45000);
  await expectVisibleText(page, openingText);
  await page.waitForFunction(() => window.__lorekeeperDebug?.stateSummary?.().tablePhase !== "opening_ready", null, { timeout: 10000 });
}

async function commitPendingReviewIfAny(harness) {
  const before = await harness.page.evaluate(() => window.__lorekeeperDebug?.renderer?.().reviewBatch);
  if (!before?.proposedChanges?.length) {
    return { committed: false, reason: "no_pending_review" };
  }
  const result = await harness.page.evaluate(() => window.__lorekeeperDebug?.commitPendingReview?.());
  await harness.page.waitForFunction(() => !window.__lorekeeperDebug?.renderer?.().reviewBatch, null, { timeout: 10000 });
  return result;
}

async function tryFetchJson(harness, pathname) {
  try {
    return await harness.fetchJson(pathname);
  } catch {
    return null;
  }
}

async function clickIfVisible(page, selector) {
  const locator = page.locator(selector).first();
  if (!await locator.count()) {
    return false;
  }
  if (!await locator.isVisible().catch(() => false)) {
    return false;
  }
  return locator.click({ timeout: 1200 }).then(() => true).catch(() => false);
}

async function fillIfVisible(page, selector, value) {
  const locator = page.locator(selector).first();
  if (await locator.count() && await locator.isVisible().catch(() => false)) {
    await locator.fill(value);
    return true;
  }
  return false;
}

function stripHarnessResponseMeta(response) {
  const { __delayMs, __error, __rawText, __parseError, __validationErrors, ...structured } = response;
  return structured;
}

async function captureAuditScreenshot(page, name) {
  await mkdir(auditScreenshotsRoot, { recursive: true });
  await page.screenshot({
    path: path.join(auditScreenshotsRoot, `${name}.png`),
    fullPage: true,
  });
}

async function fulfillProviderRoute(route, options) {
  try {
    await route.fulfill(options);
  } catch (error) {
    if (String(error?.message ?? "").includes("already handled")) {
      return;
    }
    throw error;
  }
}

function seededRandom(seed) {
  let state = hashString(seed);
  return () => {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomInt(rng, min, maxInclusive) {
  return Math.floor(rng() * (maxInclusive - min + 1)) + min;
}

function shuffle(values, rng) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}

function sanitizeScenarioName(value) {
  return String(value).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function submitPlayerTurn(page, text) {
  await page.locator("#player-input").waitFor({ state: "visible", timeout: 10000 });
  const ready = await waitForAsync(async () => {
    if (!await setPlayerInput(page, text)) {
      return null;
    }
    const ready = await page.evaluate((expectedText) => {
      const button = document.querySelector("#build-turn");
      const input = document.querySelector("#player-input");
      return Boolean(button && input && input.value === expectedText && !button.disabled && !input.disabled);
    }, text);
    return ready ? true : null;
  }, {
    timeoutMs: 10000,
    description: "player input ready to submit",
  }).then(() => true).catch(() => false);
  const clickAttempted = ready
    ? await page.click("#build-turn", { timeout: 1200 }).then(() => true).catch(() => false)
    : false;
  const clicked = clickAttempted && await page.waitForFunction((expectedText) => {
    return window.__lorekeeperDebug?.renderer?.().currentTurn?.playerMessage === expectedText;
  }, text, { timeout: 2000 }).then(() => true).catch(() => false);
  const clickAccepted = clicked || (clickAttempted && await waitForSubmittedTurnEvidence(page, text, 30000));
  if (clickAccepted) {
    await assertNoActiveGeneration(page, 45000);
    return;
  }
  if (clickAttempted) {
    await assertNoActiveGeneration(page, 45000).catch(() => {});
    if (await waitForSubmittedTurnEvidence(page, text, 5000)) {
      return;
    }
    const diagnostics = await page.evaluate(() => ({
      renderer: window.__lorekeeperDebug?.renderer?.(),
      stateSummary: window.__lorekeeperDebug?.stateSummary?.(),
    }));
    throw new Error(`clicked turn did not advance; diagnostics=${JSON.stringify({
      activity: diagnostics.renderer?.providerActivity,
      bridgeStatus: diagnostics.renderer?.bridgeStatus,
      currentTurn: diagnostics.renderer?.currentTurn?.playerMessage,
      turnProjection: diagnostics.renderer?.turnEngine,
      tablePhase: diagnostics.stateSummary?.tablePhase,
    })}`);
  }
  if (await waitForSubmittedTurnEvidence(page, text, 5000)) {
    await assertNoActiveGeneration(page, 45000).catch(() => {});
    return;
  }
  if (!clickAccepted) {
    const active = await page.evaluate(() => window.__lorekeeperDebug?.stateSummary?.().activeGeneration === true);
    let fallbackResult = null;
    if (!active) {
      fallbackResult = await page.evaluate((fallbackText) => {
        return window.__lorekeeperDebug?.submitPlayerTurn?.({ text: fallbackText });
      }, text);
      if (!fallbackResult) {
        throw new Error("debug submit hook did not return a result");
      }
      if (fallbackResult?.providerReceived === false) {
        throw new Error(`debug submit was blocked: ${fallbackResult.reason || "unknown"} ${JSON.stringify(fallbackResult.debug ?? {})}`);
      }
    }
    const generationStarted = await page.evaluate(() => window.__lorekeeperDebug?.stateSummary?.().activeGeneration === true);
    if (generationStarted) {
      await assertNoActiveGeneration(page, 45000);
    }
    const advanced = await waitForSubmittedTurnEvidence(page, text, 12000);
    if (!advanced) {
      const diagnostics = await page.evaluate(() => ({
        renderer: window.__lorekeeperDebug?.renderer?.(),
        stateSummary: window.__lorekeeperDebug?.stateSummary?.(),
      }));
      throw new Error(`turn did not advance after submit; fallback=${JSON.stringify(fallbackResult)} diagnostics=${JSON.stringify({
        activity: diagnostics.renderer?.providerActivity,
        bridgeStatus: diagnostics.renderer?.bridgeStatus,
        currentTurn: diagnostics.renderer?.currentTurn?.playerMessage,
        turnProjection: diagnostics.renderer?.turnEngine,
        tablePhase: diagnostics.stateSummary?.tablePhase,
      })}`);
    }
  }
  await assertNoActiveGeneration(page, 45000);
}

async function waitForSubmittedTurnEvidence(page, text, timeoutMs = 10000) {
  return page.waitForFunction((expectedText) => {
    const diagnostics = window.__lorekeeperDebug?.renderer?.();
    if (diagnostics?.currentTurn?.playerMessage === expectedText) {
      return true;
    }
    return (diagnostics?.recentPlayMessages ?? []).some((message) => {
      return message?.role === "player" && message?.body === expectedText;
    });
  }, text, { timeout: timeoutMs }).then(() => true).catch(() => false);
}

async function setPlayerInput(page, text) {
  const input = page.locator("#player-input");
  const enabled = await input.evaluate((element) => Boolean(element && !element.disabled && !element.readOnly)).catch(() => false);
  if (!enabled) {
    return false;
  }
  await input.click({ timeout: 800 });
  await page.keyboard.press("Control+A");
  await page.keyboard.type(text);
  const typed = await page.waitForFunction((expectedText) => {
    return document.querySelector("#player-input")?.value === expectedText;
  }, text, { timeout: 1500 }).then(() => true).catch(() => false);
  if (typed) {
    return true;
  }
  await input.fill(text);
  await page.waitForFunction((expectedText) => {
    return document.querySelector("#player-input")?.value === expectedText;
  }, text, { timeout: 10000 });
  return true;
}

async function assertNoActiveGeneration(page, timeoutMs = 15000) {
  await page.waitForFunction(() => {
    return window.__lorekeeperDebug?.stateSummary?.().activeGeneration === false;
  }, null, { timeout: timeoutMs });
}

async function expectCombatActor(page, actorName) {
  await page.waitForFunction((name) => {
    return document.querySelector("#combat-active-actor")?.textContent?.includes(name);
  }, actorName, { timeout: 10000 });
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

async function assertNoVisibleText(page, text) {
  assert.equal(await page.getByText(text, { exact: false }).first().isVisible().catch(() => false), false);
}

async function expectHomeLibraryText(page, text) {
  await page.locator("#home-active-campaign").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction((expected) => document.querySelector("#home-active-campaign")?.textContent?.includes(expected), text, { timeout: 10000 });
}

async function expectHomeCampaignOption(page, text) {
  await page.locator("#home-campaign-select").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction((expected) => {
    return [...document.querySelector("#home-campaign-select")?.options ?? []].some((option) => option.textContent?.includes(expected));
  }, text, { timeout: 10000 });
}

async function waitForProviderActivityText(page, pattern, timeoutMs = 10000) {
  await page.waitForFunction((source) => {
    const pattern = new RegExp(source, "i");
    return pattern.test(document.querySelector("#provider-activity-label")?.textContent ?? "");
  }, pattern.source ?? String(pattern), { timeout: timeoutMs });
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

async function runProviderContractTurn(harness, body) {
  const response = await fetch(`${harness.baseUrl}/api/provider/generate-turn`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lorekeeper-api-token": token,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  let done = null;
  for await (const event of readNdjsonResponse(response.body)) {
    if (event.type === "error") {
      throw new Error(event.error || "Provider returned an error event.");
    }
    if (event.type === "done") {
      done = event.result;
    }
  }
  assert.ok(done, "provider stream should finish with a done event");
  return done;
}

async function* readNdjsonResponse(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          yield JSON.parse(line);
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }
    const final = buffer.trim();
    if (final) {
      yield JSON.parse(final);
    }
  } finally {
    reader.releaseLock();
  }
}

function chooseFastOllamaModel(status = {}) {
  const models = status.providers?.ollama?.models ?? [];
  if (!status.providers?.ollama?.running || !models.length) {
    return "";
  }
  const installed = models.map((model) => model.name || model.model).filter(Boolean);
  const normalized = new Map(installed.map((model) => [normalizeModelId(model), model]));
  for (const candidate of ["llama3.2:3b", "llama3.1:8b", "mistral-nemo", "mistral-nemo:latest", "qwen3:14b"]) {
    const match = normalized.get(normalizeModelId(candidate));
    if (match) {
      return match;
    }
  }
  return installed[0] || "";
}

function normalizeModelId(value) {
  return String(value ?? "").trim().replace(/:latest$/i, "").toLowerCase();
}

function turnResponse({
  text,
  sceneStatus = { mode: "exploration", danger: "tense", awaitingPlayer: true },
  choices = { prompt: "", options: [], allowOther: true },
  mechanics = [],
  proposedChanges = [],
  flags = {},
  __delayMs = 0,
  __error = null,
  __validationErrors = [],
} = {}) {
  return {
    __delayMs,
    __error,
    __validationErrors,
    schemaVersion: 1,
    requestId: "ui-harness",
    table: [{
      speaker: "DM",
      speakerId: null,
      role: "dm",
      kind: "narration",
      visibility: "table",
      text,
    }],
    sceneStatus,
    choices: {
      prompt: "",
      scope: "free",
      options: [],
      allowOther: true,
      ...choices,
    },
    mechanics,
    flags: {
      requiresReview: false,
      startsCombat: false,
      endsScene: false,
      containsSecretInfo: false,
      ...flags,
    },
    proposedChanges,
  };
}

function combatStartResponse() {
  return turnResponse({
    text: "The ash wolf drops from the broken signal stair, hackles sparking with gray cinders as it blocks the ford.",
    sceneStatus: { mode: "combat", danger: "combat", awaitingPlayer: true },
    mechanics: [{ type: "initiative", actor: "Mira", roll: "Mira 18; Ash Wolf 10", outcome: "pending", text: "Initiative begins: Mira acts before the Ash Wolf." }],
    flags: { startsCombat: true },
    proposedChanges: [combatChange({
      id: "combat-start-ash-wolf",
      summary: "Combat starts with an ash wolf.",
      data: {
        inCombat: true,
        round: 1,
        currentTurnId: "party-mira",
        initiative: ["party-mira", "enemy-ash-wolf"],
        turnOrder: [
          { id: "party-mira", name: "Mira", type: "party", initiativeScore: 18 },
          { id: "enemy-ash-wolf", name: "Ash Wolf", type: "enemy", initiativeScore: 10 },
        ],
        enemies: [{ id: "enemy-ash-wolf", name: "Ash Wolf", hp: { current: 16, max: 16 }, armorClass: 13, attackBonus: 4, damage: "1d6+2" }],
      },
    })],
  });
}

function combatChange({ id, summary, data }) {
  return {
    id,
    operation: "update",
    domain: "combat",
    targetId: null,
    importance: "normal",
    visibility: "player_visible",
    summary,
    data,
    confidence: "high",
    reason: summary,
  };
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
    else if (item === "--chaos") output.chaos = true;
    else if (item === "--chaos-only") output.chaosOnly = true;
    else if (item === "--chaos-runs") output.chaosRuns = Number(argv[++index]);
    else if (item === "--mobile-chaos") output.mobileChaos = true;
    else if (item === "--seed") output.seed = argv[++index];
    else if (item === "--skip-build") output.skipBuild = true;
    else if (item === "--keep-temp") output.keepTemp = true;
  }
  return output;
}

function timestampForPath(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}
