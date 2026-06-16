import assert from "node:assert/strict";
import { isProtectedApiPath, requiresCampaignPin } from "./serve.js";

const publicGuestRoutes = [
  ["GET", "/api/runtime"],
  ["POST", "/api/multiplayer/join"],
  ["GET", "/api/multiplayer/join-preview"],
  ["POST", "/api/multiplayer/waiting-room/register"],
  ["GET", "/api/multiplayer/waiting-room/status"],
  ["GET", "/api/multiplayer/guest-snapshot"],
  ["POST", "/api/multiplayer/action"],
  ["POST", "/api/multiplayer/pass"],
  ["POST", "/api/multiplayer/combat/join"],
  ["POST", "/api/multiplayer/table-talk"],
];

for (const [method, pathname] of publicGuestRoutes) {
  assert.equal(
    isProtectedApiPath(pathname, method),
    false,
    `${method} ${pathname} should remain reachable from guest clients`,
  );
}

const protectedHostRoutes = [
  ["POST", "/api/campaign/record"],
  ["POST", "/api/campaign/delete"],
  ["POST", "/api/provider/generate-turn"],
  ["POST", "/api/multiplayer/start"],
  ["POST", "/api/multiplayer/stop"],
  ["POST", "/api/multiplayer/invite"],
  ["POST", "/api/multiplayer/invite-character"],
  ["POST", "/api/multiplayer/invite/revoke"],
  ["POST", "/api/multiplayer/join/approve"],
  ["POST", "/api/multiplayer/join/deny"],
  ["POST", "/api/multiplayer/waiting-room/seat"],
  ["POST", "/api/multiplayer/controller/revoke"],
  ["POST", "/api/multiplayer/controller/ai"],
  ["POST", "/api/multiplayer/controller/host"],
  ["POST", "/api/multiplayer/pending/clear"],
  ["POST", "/api/review/commit"],
];

for (const [method, pathname] of protectedHostRoutes) {
  assert.equal(
    isProtectedApiPath(pathname, method),
    true,
    `${method} ${pathname} should require host authorization when an API token is configured`,
  );
  assert.equal(
    requiresCampaignPin(pathname),
    true,
    `${method} ${pathname} should reject stale campaign/table mutations`,
  );
}

assert.equal(isProtectedApiPath("/api/unknown-host-only", "POST"), true);
assert.equal(requiresCampaignPin("/api/runtime"), false);
assert.equal(requiresCampaignPin("/api/multiplayer/waiting-room/register"), false);

console.log("Lorekeeper server security route tests passed.");
