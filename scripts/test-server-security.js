import assert from "node:assert/strict";
import { isAuthorizedRequestForToken, isProtectedApiPath, requiresCampaignPin } from "./serve.js";

const publicGuestRoutes = [
  ["GET", "/api/runtime"],
  ["POST", "/api/multiplayer/join"],
  ["GET", "/api/multiplayer/join-preview"],
  ["POST", "/api/multiplayer/waiting-room/register"],
  ["GET", "/api/multiplayer/waiting-room/status"],
  ["GET", "/api/multiplayer/guest-snapshot"],
  ["POST", "/api/multiplayer/action"],
  ["POST", "/api/multiplayer/choice-vote"],
  ["POST", "/api/multiplayer/pass"],
  ["POST", "/api/multiplayer/disconnect"],
  ["POST", "/api/multiplayer/combat/join"],
  ["POST", "/api/multiplayer/table-talk"],
];

for (const [method, pathname] of publicGuestRoutes) {
  assert.equal(
    isProtectedApiPath(pathname, method),
    false,
    `${method} ${pathname} should remain reachable from guest clients`,
  );
  assert.equal(
    isAuthorizedRequestForToken("host-secret-token", { pathname, method, headers: {} }),
    true,
    `${method} ${pathname} should not require the host API token from guest clients`,
  );
}

const protectedHostRoutes = [
  ["POST", "/api/campaign/record"],
  ["POST", "/api/campaign/delete"],
  ["POST", "/api/campaign/player-notes"],
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
  assert.equal(
    isAuthorizedRequestForToken("host-secret-token", { pathname, method, headers: {} }),
    false,
    `${method} ${pathname} should reject missing host API token`,
  );
  assert.equal(
    isAuthorizedRequestForToken("host-secret-token", {
      pathname,
      method,
      headers: { "x-lorekeeper-api-token": "host-secret-token" },
    }),
    true,
    `${method} ${pathname} should accept the configured host API token`,
  );
}

assert.equal(isProtectedApiPath("/api/unknown-host-only", "POST"), true);
assert.equal(isAuthorizedRequestForToken("host-secret-token", { pathname: "/api/unknown-host-only", method: "POST" }), false);
assert.equal(isAuthorizedRequestForToken("host-secret-token", {
  pathname: "/api/unknown-host-only",
  method: "POST",
  headers: { "x-lorekeeper-api-token": "host-secret-token" },
}), true);
assert.equal(requiresCampaignPin("/api/runtime"), false);
assert.equal(requiresCampaignPin("/api/multiplayer/waiting-room/register"), false);
assert.equal(isAuthorizedRequestForToken("host-secret-token", {
  pathname: "/local-asset",
  method: "GET",
  searchParams: new URLSearchParams({ lkToken: "host-secret-token" }),
}), true);
assert.equal(isAuthorizedRequestForToken("host-secret-token", {
  pathname: "/local-asset",
  method: "GET",
  searchParams: new URLSearchParams({ lkToken: "wrong-token" }),
}), false);

console.log("Lorekeeper server security route tests passed.");
