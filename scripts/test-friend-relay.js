import assert from "node:assert/strict";
import { parseRelayMessage } from "../workers/relay/src/index.js";

const guestAllowed = new Set([
  "guest.join.request",
  "guest.action.submit",
  "guest.tableTalk.post",
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

console.log("LoreKeeper friend relay tests passed.");
