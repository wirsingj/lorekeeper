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
}), guestAllowed).valid, false);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "guest.action.submit",
  providerSettings: { selectedModel: "private" },
}), guestAllowed).errors.join(" "), /host_only_field/);

assert.match(parseRelayMessage(JSON.stringify({
  kind: "guest.tableTalk.post",
  text: "x".repeat(20_000),
}), guestAllowed).errors.join(" "), /payload_too_large/);

assert.equal(parseRelayMessage(JSON.stringify({
  kind: "host.snapshot",
  guestId: "guest-1",
  snapshot: { scene: { immediateSituation: "The road is quiet." } },
}), hostAllowed).valid, true);

assert.equal(parseRelayMessage("{", guestAllowed).valid, false);

console.log("LoreKeeper friend relay tests passed.");
