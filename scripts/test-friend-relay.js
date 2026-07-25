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
  "host.tableTalk",
]);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "guest.join.request",
  code: "M7SS-7K4P",
  displayName: "Nora",
  preferredPartyMemberId: "lysa",
  proposedCharacter: {
    name: "Nora",
    ancestry: "Human",
    characterClass: "Ranger",
    level: 2,
    roleIntent: "careful scout",
    backstory: "Tracking the same trouble as the party.",
  },
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

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "host.tableTalk",
  guestId: "guest-1",
  status: "delivered",
  playerName: "Rowan",
  text: "hi",
}), hostAllowed, { direction: "host" }).valid, true);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "host.tableTalk",
  status: "delivered",
  text: "hi",
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
assert.match(relayGuestPageSource, /class="character-draft"/, "public guest page should collect a character draft before asking to join");
assert.match(relayGuestPageSource, /id="character-name"/, "public guest page should collect character name");
assert.match(relayGuestPageSource, /id="character-class"/, "public guest page should collect character class");
assert.match(relayGuestPageSource, /collectCharacterDraft =/, "public guest page should build a structured character draft");
assert.match(relayGuestPageSource, /proposedCharacter/, "public guest join requests should carry the character draft through the relay");
assert.match(relayGuestPageSource, /preferredPartyMemberId:\s*session\?\.partyMemberId/, "public guest rejoin requests should carry the last seated character as a preferred seat only");
assert.match(relayGuestPageSource, /id="send-action"/, "public guest page should let approved guests send actions");
assert.match(relayGuestPageSource, /class="table-shell"/, "public guest page should use the LoreKeeper table shell instead of a plain form");
assert.match(relayGuestPageSource, /class="rail left-rail"/, "public guest page should show a party/adventure rail like the full app");
assert.match(relayGuestPageSource, /class="stage"/, "public guest page should center the story stage like the full app");
assert.match(relayGuestPageSource, /class="rail right-rail"/, "public guest page should show Table Talk as a right rail on desktop");
assert.match(relayGuestPageSource, /class="command-deck"/, "public guest page should keep actions in a bottom command deck");
assert.match(relayGuestPageSource, /\.left-rail \{ max-height: none; overflow: visible; \}/, "public guest mobile page should not clip the Adventure and Party rail");
assert.match(relayGuestPageSource, /id="party-list"/, "public guest page should render guest-safe party details");
assert.match(relayGuestPageSource, /id="moment-panel"/, "public guest page should show the current table moment");
assert.match(relayGuestPageSource, /id="now-cue"/, "public guest page should show a host-app-style Now cue");
assert.match(relayGuestPageSource, /function tableCues/, "public guest page should derive Now/Next copy from guest-safe state");
assert.match(relayGuestPageSource, /Now: Your Combat Turn/, "public guest page should make active combat turns obvious");
assert.match(relayGuestPageSource, /Next: Wait for the host table to resolve your action/, "public guest page should explain queued-action waiting");
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
assert.match(relayGuestPageSource, /const normalizeCodeInput/, "public guest page should normalize friend codes while typing");
assert.match(relayGuestPageSource, /checkFriendCodeAvailability/, "public guest page should check direct friend-code links before join submit");
assert.match(relayGuestPageSource, /Friend code found\. Enter your name and ask to join\./, "public guest page should confirm active direct codes");
assert.match(relayGuestPageSource, /host is not connected yet\. Ask the host to click Reconnect Sharing/, "public guest page should explain inactive direct codes before submit");
assert.match(relayGuestPageSource, /input\.addEventListener\("input"[\s\S]*normalizeCodeInput/, "public guest page should format friend code input immediately");
assert.match(relayGuestPageSource, /nameInput\.addEventListener\("keydown"[\s\S]*await joinRemoteTable/, "public guest page should submit from the name field with Enter");
assert.match(relayGuestPageSource, /input\.value\.trim\(\)[\s\S]*nameInput\.focus\(\)/, "direct friend-code links should focus the player's name field");
assert.match(relayGuestPageSource, /action\.addEventListener\("keydown"[\s\S]*event\.ctrlKey \|\| event\.metaKey[\s\S]*submitAction/, "public guest action composer should submit with Ctrl/Cmd+Enter");
assert.match(relayGuestPageSource, /talk\.addEventListener\("keydown"[\s\S]*submitTableTalk/, "public guest Table Talk should send with Enter");
assert.match(relayGuestPageSource, /function disableChoiceButtons/, "public guest page should avoid duplicate choice-vote clicks");
assert.match(relayGuestPageSource, /disableChoiceButtons\(\)[\s\S]*setStatus\("Vote sent\."\)/, "public guest choice vote should disable visible choices after sending");
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
assert.match(relayGuestPageSource, /relay\.host\.ready[\s\S]*joinRequestMessage\(pendingJoin\)/, "public guest page should resend a pending join when the host reconnects");
assert.match(relayGuestPageSource, /lorekeeper\.remoteGuest\.v1/, "public guest page should persist guest-facing reconnect context locally");
assert.match(relayGuestPageSource, /function restoreGuestDraft|const restoreGuestDraft =/, "public guest page should restore the player's friend code, name, and character draft after refresh");
assert.match(relayGuestPageSource, /function rememberGuestDraft|const rememberGuestDraft =/, "public guest page should save guest-facing reconnect context while the form changes");
assert.doesNotMatch(relayGuestPageSource, /localStorage\.setItem[\s\S]{0,160}sessionKey/, "public guest page should not store local authority session keys in browser storage");
assert.match(relayGuestPageSource, /guest\.tableTalk\.post/, "public guest page should send Table Talk through the relay");
assert.match(relayGuestPageSource, /pendingTableTalk/, "public guest page should keep local pending Table Talk echoes");
assert.match(relayGuestPageSource, /rememberPendingTableTalk\(text\)/, "public guest Table Talk should render immediately after send");
assert.match(relayGuestPageSource, /reconcilePendingTableTalk/, "public guest Table Talk should reconcile local echoes with host snapshots");
assert.match(relayGuestPageSource, /handleTableTalkAck/, "public guest page should handle targeted Table Talk delivery acknowledgements");
assert.match(relayGuestPageSource, /Table Talk delivered\./, "public guest Table Talk should confirm when the host accepted the message");
assert.match(relayGuestPageSource, /markPendingTableTalkFailed/, "public guest page should visibly fail optimistic Table Talk if the host rejects it");
assert.match(relayGuestPageSource, /Table Talk sent\. Syncing with the host table\./, "public guest Table Talk status should explain the sync step");
assert.match(relayGuestPageSource, /talk\.pending/, "public guest page should visibly mark optimistic Table Talk messages");
assert.match(relayGuestPageSource, /talk\.failed/, "public guest page should visibly mark rejected optimistic Table Talk messages");
assert.match(relayGuestPageSource, /guest\.disconnect/, "public guest page should notify the host when the browser tab leaves");
assert.match(relaySource, /relay\.host\.disconnected/, "relay should notify guests when the host socket disconnects");
assert.match(relaySource, /if \(!this\.hostSocket\) \{[\s\S]*host_not_connected/, "relay should reject fresh guest sockets when no host is connected");
assert.match(relaySource, /this\.session\?\.hostToken && this\.session\.hostToken !== token[\s\S]*invalid_host_token/, "relay should bind host reconnects to the original unshared host token");
assert.doesNotMatch(relaySource, /hostTokenHint/, "relay should not keep token hint fields around");
assert.doesNotMatch(relaySource, /sessionKey:\s*message\.sessionKey/, "guest-originated relay messages must not forward session keys");
assert.doesNotMatch(relayGuestPageSource, /providerSettings|Ollama|diagnostics|sqlite/i, "public guest page should not expose host/provider/debug language");
assert.match(relaySource, /content-security-policy/, "public guest HTML should send a Content-Security-Policy header");
assert.match(relaySource, /frame-ancestors 'none'/, "public guest HTML should not be frameable");
assert.match(relaySource, /x-content-type-options/, "public guest HTML should send nosniff");
assert.match(relaySource, /permissions-policy/, "public guest HTML should disable unused browser permissions");
assert.match(relaySource, /function createCspNonce/, "public guest HTML should create a per-response CSP nonce");
assert.match(relayGuestPageSource, /<style nonce="\$\{escapeHtml\(cspNonce\)\}">/, "public guest inline styles should be nonce-gated");
assert.match(relayGuestPageSource, /<script nonce="\$\{escapeHtml\(cspNonce\)\}">/, "public guest inline script should be nonce-gated");
assert.doesNotMatch(relaySource, /unsafe-inline/, "public guest CSP should avoid unsafe-inline");

console.log("LoreKeeper friend relay tests passed.");
