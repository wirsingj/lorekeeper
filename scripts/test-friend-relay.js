import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseRelayMessage } from "../workers/relay/src/index.js";

const guestAllowed = new Set([
  "guest.join.request",
  "guest.snapshot.request",
  "guest.action.submit",
  "guest.pass",
  "guest.choice.vote",
  "guest.tableTalk.post",
  "guest.disconnect",
]);

const hostAllowed = new Set([
  "host.snapshot",
  "host.guest.pending",
  "host.guest.approved",
]);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.join.request",
  code: "M7SS-7K4P",
  displayName: "Nora",
  preferredPartyMemberId: "lysa",
}), guestAllowed).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "host.provider.settings.read",
}), guestAllowed, { direction: "guest" }).valid, false);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "guest.action.submit",
  providerSettings: { selectedModel: "private" },
}), guestAllowed, { direction: "guest" }).errors.join(" "), /host_only_field/);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "guest.action.submit",
  sessionKey: "guest-secret-should-not-ride-guest-messages",
}), guestAllowed, { direction: "guest" }).errors.join(" "), /host_only_field:sessionKey/);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.snapshot.request",
  code: "M7SS-7K4P",
}), guestAllowed, { direction: "guest" }).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.action.submit",
  text: "I check the locked gate.",
}), guestAllowed, { direction: "guest" }).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.pass",
}), guestAllowed, { direction: "guest" }).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.disconnect",
}), guestAllowed, { direction: "guest" }).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.choice.vote",
  choiceKey: "current-choice",
  optionId: "A",
  optionLabel: "A",
  optionText: "Take cover.",
  prompt: "What do you do?",
}), guestAllowed, { direction: "guest" }).valid, true);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "guest.tableTalk.post",
  text: "x".repeat(20_000),
}), guestAllowed, { direction: "guest" }).errors.join(" "), /payload_too_large/);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "host.snapshot",
  guestId: "guest-1",
  snapshot: { scene: { immediateSituation: "The road is quiet." } },
}), hostAllowed, { direction: "host" }).valid, true);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "host.guest.approved",
  guestId: "guest-1",
  connectionId: "conn-1",
  sessionKey: "guest-session-key",
  characterName: "Rowan",
}), hostAllowed, { direction: "host" }).valid, true);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "host.guest.approved",
  connectionId: "conn-1",
  sessionKey: "guest-session-key",
}), hostAllowed, { direction: "host" }).errors.join(" "), /target_guest_required/);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "host.guest.approved",
  guestId: "guest-1",
  connectionId: "conn-1",
}), hostAllowed, { direction: "host" }).errors.join(" "), /session_key_required/);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "host.guest.pending",
}), hostAllowed, { direction: "host" }).errors.join(" "), /target_guest_required/);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "host.snapshot",
  snapshot: { scene: { immediateSituation: "The road is quiet." } },
  sessionKey: "guest-session-key",
}), hostAllowed, { direction: "host" }).errors.join(" "), /host_only_field:sessionKey/);

assert.equal(parseRelayMessage("{", guestAllowed).valid, false);

const relaySource = readFileSync(new URL("../workers/relay/src/index.js", import.meta.url), "utf8");
const relayGuestPageSource = relaySource.slice(relaySource.indexOf("function renderGuestEntryPage"));
assert.match(relaySource, /playable-browser-guest-alpha/, "relay health should identify the playable browser guest alpha build");
assert.match(relayGuestPageSource, /id="table-panel"/, "public guest page should include a post-approval table panel");
assert.match(relayGuestPageSource, /id="send-action"/, "public guest page should let approved guests send actions");
assert.match(relayGuestPageSource, /class="table-shell"/, "public guest page should use the LoreKeeper table shell instead of a plain form");
assert.match(relayGuestPageSource, /class="rail left-rail"/, "public guest page should show a party/adventure rail like the full app");
assert.match(relayGuestPageSource, /class="stage"/, "public guest page should center the story stage like the full app");
assert.match(relayGuestPageSource, /class="rail right-rail"/, "public guest page should show Table Talk as a right rail on desktop");
assert.match(relayGuestPageSource, /class="command-deck"/, "public guest page should keep actions in a bottom command deck");
assert.match(relayGuestPageSource, /id="party-list"/, "public guest page should render guest-safe party details");
assert.match(relayGuestPageSource, /id="moment-panel"/, "public guest page should show the current table moment");
assert.match(relayGuestPageSource, /id="table-notice"/, "public guest page should show seated guests visible connection/action feedback");
assert.match(relayGuestPageSource, /setTableConnected/, "public guest page should centralize connected/disconnected action button state");
assert.match(relayGuestPageSource, /updateActionAvailability/, "public guest page should project action availability from guest-safe state");
assert.match(relayGuestPageSource, /The table is syncing before actions unlock/, "public guest actions should stay locked until the first snapshot arrives");
assert.match(relayGuestPageSource, /Your action is already queued at the host table/, "public guest page should avoid duplicate action submits while pending");
assert.match(relayGuestPageSource, /Waiting for " \+ \(context\.activeActorName/, "public guest page should tell guests whose combat turn is active");
assert.match(relayGuestPageSource, /It is your combat turn/, "public guest page should unlock actions with clear combat-turn copy");
assert.match(relayGuestPageSource, /function actionContext/, "public guest action gating should use guest-safe snapshot context");
assert.match(relayGuestPageSource, /function compactText/, "public guest page should clamp rendered snapshot text client-side");
assert.match(relayGuestPageSource, /function safeList/, "public guest page should bound rendered snapshot lists client-side");
assert.match(relayGuestPageSource, /safeList\(block\.options, 6\)/, "public guest page should bound rendered choice options");
assert.match(relayGuestPageSource, /compactText\(message\.body \|\| "", 1600\)/, "public guest page should bound rendered story text");
assert.match(relayGuestPageSource, /refresh\.textContent = connected \? "Sync" : "Reconnect"/, "public guest Sync button should become Reconnect when the socket is closed");
assert.match(relayGuestPageSource, /Connection paused\. Press Reconnect/, "public guest page should not strand seated guests on socket close");
assert.match(relayGuestPageSource, /const guestSocket = socket/, "public guest page should pin reconnect handlers to the socket that created them");
assert.match(relayGuestPageSource, /if \(socket !== guestSocket\) return;/, "public guest stale socket events should not flip the current table state");
assert.match(relayGuestPageSource, /Ask the host to click Reconnect Sharing/, "public guest page should tell friends what the host needs to do when the code is inactive");
assert.match(relayGuestPageSource, /showWaitingTable/, "public guest page should render the table shell immediately after host approval");
assert.match(relayGuestPageSource, /Rejoin request sent\. The host may need to seat you again\./, "public guest page should be honest when a browser reconnect gets a fresh relay identity");
assert.match(relayGuestPageSource, /guest\.snapshot\.request/, "public guest page should request guest-safe snapshots after approval");
assert.match(relayGuestPageSource, /setInterval\(requestSnapshot, 5000\)/, "public guest page should auto-refresh approved guest snapshots");
assert.match(relayGuestPageSource, /pendingJoin/, "public guest page should remember a pending join across host relay reconnects");
assert.match(relayGuestPageSource, /relay\.host\.ready[\s\S]*guest\.join\.request/, "public guest page should resend a pending join when the host reconnects");
assert.match(relayGuestPageSource, /guest\.tableTalk\.post/, "public guest page should send Table Talk through the relay");
assert.match(relayGuestPageSource, /guest\.disconnect/, "public guest page should notify the host when the browser tab leaves");
assert.match(relaySource, /relay\.host\.disconnected/, "relay should notify guests when the host socket disconnects");
assert.doesNotMatch(relaySource, /sessionKey:\s*message\.sessionKey/, "guest-originated relay messages must not forward session keys");
assert.doesNotMatch(relayGuestPageSource, /providerSettings|Ollama|diagnostics|sqlite/i, "public guest page should not expose host/provider/debug language");
assert.match(relaySource, /content-security-policy/, "public guest HTML should send a Content-Security-Policy header");
assert.match(relaySource, /frame-ancestors 'none'/, "public guest HTML should not be frameable");
assert.match(relaySource, /x-content-type-options/, "public guest HTML should send nosniff");
assert.match(relaySource, /permissions-policy/, "public guest HTML should disable unused browser permissions");

console.log("LoreKeeper friend relay tests passed.");
