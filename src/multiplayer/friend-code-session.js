import { randomBytes } from "node:crypto";

const friendCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const defaultLimits = Object.freeze({
  codeTtlMs: 2 * 60 * 60 * 1000,
  idleTimeoutMs: 10 * 60 * 1000,
  maxSessionDurationMs: 4 * 60 * 60 * 1000,
  maxGuests: 5,
  maxPayloadBytes: 16 * 1024,
});

export const friendCodeSessionStatus = Object.freeze({
  ACTIVE: "active",
  STOPPED: "stopped",
  EXPIRED: "expired",
});

export const relayMessageKinds = Object.freeze({
  GUEST_HELLO: "guest.hello",
  GUEST_JOIN_REQUEST: "guest.join.request",
  GUEST_WAITING_HEARTBEAT: "guest.waiting.heartbeat",
  GUEST_SNAPSHOT_REQUEST: "guest.snapshot.request",
  GUEST_ACTION_SUBMIT: "guest.action.submit",
  GUEST_PASS: "guest.pass",
  GUEST_CHOICE_VOTE: "guest.choice.vote",
  GUEST_TABLE_TALK_POST: "guest.tableTalk.post",
  GUEST_DISCONNECT: "guest.disconnect",
});

const guestSafeRelayMessageKinds = new Set(Object.values(relayMessageKinds));
const blockedRelayKeys = new Set([
  "apikey",
  "authorization",
  "credential",
  "debug",
  "diagnostics",
  "filesystem",
  "localpath",
  "ollama",
  "password",
  "provider",
  "providersettings",
  "rawdatabase",
  "rawresponse",
  "secret",
  "sqlitepath",
  "token",
]);

export function createFriendCodeSession({
  campaignId = "",
  tableId = "",
  sessionId = "",
  relayBaseUrl = "",
  hostSlug = "",
  now = new Date(),
  code = "",
  internalToken = "",
  limits = {},
} = {}) {
  const createdAt = toDate(now);
  const resolvedLimits = normalizeFriendCodeLimits(limits);
  const normalizedCode = normalizeFriendCode(code || generateFriendCode());
  const token = internalToken || randomToken(24);
  return {
    id: `remote-${randomToken(8)}`,
    status: friendCodeSessionStatus.ACTIVE,
    campaignId: String(campaignId || ""),
    tableId: String(tableId || ""),
    sessionId: String(sessionId || ""),
    code: normalizedCode,
    hostSlug: normalizeHostSlug(hostSlug || `host-${randomToken(4)}`),
    internalToken: token,
    relayBaseUrl: normalizeRelayBaseUrl(relayBaseUrl),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + resolvedLimits.codeTtlMs).toISOString(),
    lastHostSeenAt: createdAt.toISOString(),
    stoppedAt: null,
    limits: resolvedLimits,
  };
}

export function generateFriendCode({ groups = 2, groupLength = 4 } = {}) {
  const total = Math.max(1, groups) * Math.max(1, groupLength);
  let raw = "";
  for (let index = 0; index < total; index += 1) {
    raw += friendCodeAlphabet[randomBytes(1)[0] % friendCodeAlphabet.length];
  }
  return normalizeFriendCode(raw, { groupLength });
}

export function normalizeFriendCode(value, { groupLength = 4 } = {}) {
  const compact = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/[OI]/g, "");
  if (!compact) {
    return "";
  }
  const groups = [];
  for (let index = 0; index < compact.length; index += groupLength) {
    groups.push(compact.slice(index, index + groupLength));
  }
  return groups.join("-");
}

export function friendCodePublicLink(session = {}) {
  const base = normalizeRelayBaseUrl(session.relayBaseUrl);
  const code = normalizeFriendCode(session.code);
  const hostSlug = normalizeHostSlug(session.hostSlug || "host");
  if (!base || !code) {
    return "";
  }
  return `${base}/host/${encodeURIComponent(hostSlug)}/table-code/${encodeURIComponent(code)}`;
}

export function publicFriendCodeSession(session = {}, { now = new Date() } = {}) {
  const status = effectiveFriendCodeStatus(session, { now });
  return {
    status,
    campaignId: session.campaignId || "",
    tableId: session.tableId || "",
    sessionId: session.sessionId || "",
    code: normalizeFriendCode(session.code || ""),
    link: friendCodePublicLink(session),
    expiresAt: session.expiresAt || "",
    maxGuests: Number(session.limits?.maxGuests) || defaultLimits.maxGuests,
    idleTimeoutMs: Number(session.limits?.idleTimeoutMs) || defaultLimits.idleTimeoutMs,
    safety: "Remote friend code shares browser guest mode only: preview, seat request, approved character actions, votes, pass, leave/rejoin, and Table Talk. Host settings, model setup, Ollama, files, diagnostics, provider keys, and campaign storage stay on the host.",
  };
}

export function effectiveFriendCodeStatus(session = {}, { now = new Date() } = {}) {
  if (session.status === friendCodeSessionStatus.STOPPED || session.stoppedAt) {
    return friendCodeSessionStatus.STOPPED;
  }
  if (isFriendCodeExpired(session, { now })) {
    return friendCodeSessionStatus.EXPIRED;
  }
  return session.status || friendCodeSessionStatus.ACTIVE;
}

export function isFriendCodeExpired(session = {}, { now = new Date() } = {}) {
  const expiresAt = Date.parse(session.expiresAt || "");
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return toDate(now).getTime() >= expiresAt;
}

export function stopFriendCodeSession(session = {}, { now = new Date() } = {}) {
  return {
    ...session,
    status: friendCodeSessionStatus.STOPPED,
    stoppedAt: toDate(now).toISOString(),
  };
}

export function validateGuestRelayMessage(message = {}, { maxPayloadBytes = defaultLimits.maxPayloadBytes } = {}) {
  const errors = [];
  const kind = String(message?.kind || message?.type || "");
  if (!guestSafeRelayMessageKinds.has(kind)) {
    errors.push(`relay message kind is not guest-safe: ${kind || "(missing)"}`);
  }
  const size = byteLength(message);
  if (size > maxPayloadBytes) {
    errors.push(`relay message exceeds ${maxPayloadBytes} bytes`);
  }
  const blockedKey = firstBlockedRelayKey(message);
  if (blockedKey) {
    errors.push(`relay message contains host-only field: ${blockedKey}`);
  }
  return {
    valid: errors.length === 0,
    errors,
    kind,
    size,
  };
}

export function normalizeFriendCodeLimits(limits = {}) {
  return {
    codeTtlMs: positiveNumber(limits.codeTtlMs, defaultLimits.codeTtlMs),
    idleTimeoutMs: positiveNumber(limits.idleTimeoutMs, defaultLimits.idleTimeoutMs),
    maxSessionDurationMs: positiveNumber(limits.maxSessionDurationMs, defaultLimits.maxSessionDurationMs),
    maxGuests: positiveNumber(limits.maxGuests, defaultLimits.maxGuests),
    maxPayloadBytes: positiveNumber(limits.maxPayloadBytes, defaultLimits.maxPayloadBytes),
  };
}

function firstBlockedRelayKey(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const blocked = firstBlockedRelayKey(item, depth + 1);
      if (blocked) {
        return blocked;
      }
    }
    return "";
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (
      blockedRelayKeys.has(normalized) ||
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("apikey") ||
      normalized.includes("password")
    ) {
      return key;
    }
    const blocked = firstBlockedRelayKey(item, depth + 1);
    if (blocked) {
      return blocked;
    }
  }
  return "";
}

function normalizeRelayBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeHostSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "host";
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function randomToken(bytes) {
  const token = randomBytes(bytes).toString("base64url");
  if (!base64UrlPattern.test(token)) {
    throw new Error("Generated token was not URL-safe.");
  }
  return token;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}
