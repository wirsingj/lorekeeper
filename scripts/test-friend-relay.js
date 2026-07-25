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
assert.match(relayGuestPageSource, /guest\.snapshot\.request/, "public guest page should request guest-safe snapshots after approval");
assert.match(relayGuestPageSource, /setInterval\(requestSnapshot, 5000\)/, "public guest page should auto-refresh approved guest snapshots");
assert.match(relayGuestPageSource, /pendingJoin/, "public guest page should remember a pending join across host relay reconnects");
assert.match(relayGuestPageSource, /relay\.host\.ready[\s\S]*guest\.join\.request/, "public guest page should resend a pending join when the host reconnects");
assert.match(relayGuestPageSource, /guest\.tableTalk\.post/, "public guest page should send Table Talk through the relay");
assert.match(relayGuestPageSource, /guest\.disconnect/, "public guest page should notify the host when the browser tab leaves");
assert.match(relaySource, /relay\.host\.disconnected/, "relay should notify guests when the host socket disconnects");
assert.doesNotMatch(relaySource, /sessionKey:\s*message\.sessionKey/, "guest-originated relay messages must not forward session keys");
assert.doesNotMatch(relayGuestPageSource, /providerSettings|Ollama|diagnostics|sqlite/i, "public guest page should not expose host/provider/debug language");

console.log("LoreKeeper friend relay tests passed.");
