import assert from "node:assert/strict";
import { createTraceLog, sanitizeTraceValue } from "../src/observability/trace-log.js";

const trace = createTraceLog({ limit: 3, now: () => "2026-06-18T00:00:00.000Z" });
trace.record("api.request", {
  path: "/api/provider/generate-turn",
  lkToken: "secret-token",
  nested: {
    connectionSecret: "guest-secret",
    text: "short",
  },
});
trace.record("provider.prompt", { prompt: "x".repeat(1200), model: "qwen3:14b" });
trace.record("ui.flow", { state: "ready" });
trace.record("api.response", { statusCode: 200 });

const redacted = trace.snapshot({ redact: true, limit: 3 });
assert.equal(redacted.size, 4);
assert.equal(redacted.events.length, 3);
assert.equal(redacted.events[0].type, "provider.prompt");
assert.equal(redacted.events[0].detail.prompt.length, 900);
assert.equal(redacted.events[2].type, "api.response");

const secretTrace = createTraceLog({ limit: 5, now: () => "2026-06-18T00:00:00.000Z" });
secretTrace.record("secret", {
  token: "abc",
  headers: { authorization: "Bearer abc" },
  inviteLink: "http://join?token=abc",
  promptPreview: "player-facing prompt text",
  textPreview: "provider response text",
});
const secretSnapshot = secretTrace.snapshot({ redact: true });
assert.equal(secretSnapshot.events[0].detail.token, "[redacted]");
assert.equal(secretSnapshot.events[0].detail.headers.authorization, "[redacted]");
assert.equal(secretSnapshot.events[0].detail.inviteLink, "[redacted]");
assert.equal(secretSnapshot.events[0].detail.promptPreview, "[redacted-preview]");
assert.equal(secretSnapshot.events[0].detail.textPreview, "[redacted-preview]");

const fullSnapshot = secretTrace.snapshot({ redact: false });
assert.equal(fullSnapshot.events[0].detail.token, "abc");
assert.equal(fullSnapshot.events[0].detail.promptPreview, "player-facing prompt text");

const sanitizedError = sanitizeTraceValue(new Error("boom"), { redact: true });
assert.equal(sanitizedError.name, "Error");
assert.match(sanitizedError.message, /boom/);

trace.clear();
assert.equal(trace.snapshot().size, 0);

console.log("observability tests passed");
