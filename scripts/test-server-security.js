import assert from "node:assert/strict";
import {
  isAuthorizedRequestForToken,
  isGuestSafeRemotePath,
  isProtectedApiPath,
  requiresCampaignPin,
} from "./serve.js";
import { guestSafeShareRouteBoundary } from "../src/multiplayer/share-table-session.js";

const publicGuestRoutes = [
  ["GET", "/guest"],
  ["GET", "/assets/index.js"],
  ["GET", "/icons/lorekeeper-icon-192.png"],
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
    isGuestSafeRemotePath(pathname, method),
    true,
    `${method} ${pathname} should be allowed through future remote guest sharing`,
  );
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

const shareBoundaryExamples = new Map([
  ["/guest", [["GET", "/guest"]]],
  ["/api/multiplayer/join", [["POST", "/api/multiplayer/join"]]],
  ["/api/multiplayer/join-preview", [["GET", "/api/multiplayer/join-preview"]]],
  ["/api/multiplayer/waiting-room/*", [
    ["POST", "/api/multiplayer/waiting-room/register"],
    ["GET", "/api/multiplayer/waiting-room/status"],
  ]],
  ["/api/multiplayer/guest-snapshot", [["GET", "/api/multiplayer/guest-snapshot"]]],
  ["/api/multiplayer/action", [["POST", "/api/multiplayer/action"]]],
  ["/api/multiplayer/pass", [["POST", "/api/multiplayer/pass"]]],
  ["/api/multiplayer/choice-vote", [["POST", "/api/multiplayer/choice-vote"]]],
  ["/api/multiplayer/disconnect", [["POST", "/api/multiplayer/disconnect"]]],
  ["/api/multiplayer/combat/join", [["POST", "/api/multiplayer/combat/join"]]],
  ["/api/multiplayer/table-talk", [["POST", "/api/multiplayer/table-talk"]]],
]);

for (const routeCategory of guestSafeShareRouteBoundary) {
  const examples = shareBoundaryExamples.get(routeCategory);
  assert.ok(examples?.length, `${routeCategory} should have a server-route security example`);
  for (const [method, pathname] of examples) {
    assert.equal(
      isGuestSafeRemotePath(pathname, method),
      true,
      `Share Table boundary ${routeCategory} should match server allowlist for ${method} ${pathname}`,
    );
  }
}

const protectedHostRoutes = [
  ["GET", "/api/runtime", false],
  ["GET", "/api/diagnostics", false],
  ["GET", "/api/diagnostics/trace", false],
  ["POST", "/api/diagnostics/trace/clear", false],
  ["POST", "/api/campaign/record", true],
  ["POST", "/api/campaign/delete", true],
  ["POST", "/api/campaign/player-notes", true],
  ["GET", "/api/provider/status", false],
  ["POST", "/api/provider/settings", true],
  ["POST", "/api/provider/generate-turn", true],
  ["POST", "/api/ollama/test", false],
  ["POST", "/api/ollama/pull", false],
  ["POST", "/api/multiplayer/start", true],
  ["POST", "/api/multiplayer/stop", true],
  ["POST", "/api/multiplayer/remote/start", true],
  ["POST", "/api/multiplayer/remote/stop", true],
  ["POST", "/api/multiplayer/invite", true],
  ["POST", "/api/multiplayer/invite-character", true],
  ["POST", "/api/multiplayer/invite/revoke", true],
  ["POST", "/api/multiplayer/join/approve", true],
  ["POST", "/api/multiplayer/join/deny", true],
  ["POST", "/api/multiplayer/waiting-room/seat", true],
  ["POST", "/api/multiplayer/controller/revoke", true],
  ["POST", "/api/multiplayer/controller/ai", true],
  ["POST", "/api/multiplayer/controller/host", true],
  ["POST", "/api/multiplayer/pending/clear", true],
  ["POST", "/api/pretable-lobby/publish", false],
  ["POST", "/api/pretable-lobby/close", false],
  ["GET", "/api/pretable-lobby/host-snapshot", false],
  ["POST", "/api/pretable-lobby/seat", false],
  ["POST", "/api/pretable-lobby/adopt-active", true],
  ["POST", "/api/review/commit", true],
  ["GET", "/local-asset", false],
];

for (const [method, pathname, campaignPinned] of protectedHostRoutes) {
  assert.equal(
    isGuestSafeRemotePath(pathname, method),
    false,
    `${method} ${pathname} should not be allowed through future remote guest sharing`,
  );
  assert.equal(
    isProtectedApiPath(pathname, method),
    pathname === "/local-asset" ? false : true,
    `${method} ${pathname} should require host authorization when an API token is configured`,
  );
  if (pathname.startsWith("/api/")) {
    assert.equal(
      requiresCampaignPin(pathname),
      campaignPinned,
      `${method} ${pathname} should have the expected stale-campaign pin policy`,
    );
  }
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
assert.equal(isGuestSafeRemotePath("/api/unknown-host-only", "POST"), false);
assert.equal(isAuthorizedRequestForToken("host-secret-token", { pathname: "/api/unknown-host-only", method: "POST" }), false);
assert.equal(isAuthorizedRequestForToken("host-secret-token", {
  pathname: "/api/unknown-host-only",
  method: "POST",
  headers: { "x-lorekeeper-api-token": "host-secret-token" },
}), true);
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
assert.equal(isGuestSafeRemotePath("/assets/../secret.txt", "GET"), false);
assert.equal(isGuestSafeRemotePath("/assets/nested/thing.js", "GET"), true);
assert.equal(isGuestSafeRemotePath("/", "GET"), false);
assert.equal(isGuestSafeRemotePath("/api/provider/settings", "OPTIONS"), false);

console.log("LoreKeeper server security route tests passed.");
