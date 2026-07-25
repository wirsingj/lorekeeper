const MAX_PAYLOAD_BYTES = 16 * 1024;
const FRIEND_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const RELAY_VERSION = "2026-07-25-join-request";

const GUEST_SAFE_KINDS = new Set([
  "guest.hello",
  "guest.join.request",
  "guest.waiting.heartbeat",
  "guest.snapshot.request",
  "guest.action.submit",
  "guest.pass",
  "guest.choice.vote",
  "guest.tableTalk.post",
  "guest.disconnect",
]);

const HOST_SAFE_KINDS = new Set([
  "host.hello",
  "host.session.ready",
  "host.session.closed",
  "host.guest.pending",
  "host.guest.approved",
  "host.guest.denied",
  "host.snapshot",
  "host.tableTalk",
  "host.error",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "lorekeeper-friend-relay", version: RELAY_VERSION });
    }
    if (!url.pathname.startsWith("/api/")) {
      return html(renderGuestEntryPage(extractFriendCodeFromUrl(url)));
    }
    if (url.pathname.startsWith("/api/host/connect")) {
      const code = normalizeFriendCode(url.searchParams.get("code") || "");
      return relayStub(env, code).fetch(request);
    }
    if (url.pathname.startsWith("/api/guest/connect")) {
      const code = normalizeFriendCode(url.searchParams.get("code") || "");
      return relayStub(env, code).fetch(request);
    }
    if (url.pathname.startsWith("/api/session/")) {
      const code = normalizeFriendCode(url.pathname.split("/").pop() || "");
      return relayStub(env, code).fetch(request);
    }
    return json({ ok: false, error: "not_found" }, 404);
  },
};

export class TableRelay {
  constructor(state) {
    this.state = state;
    this.hostSocket = null;
    this.guestSockets = new Map();
    this.session = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = normalizeFriendCode(url.searchParams.get("code") || url.pathname.split("/").pop() || "");
    if (!isValidFriendCode(code)) {
      return json({ ok: false, error: "invalid_friend_code" }, 400);
    }
    if (url.pathname.startsWith("/api/session/")) {
      return json({
        ok: true,
        code,
        active: Boolean(this.hostSocket),
        guests: this.guestSockets.size,
      });
    }
    if (url.pathname.startsWith("/api/host/connect")) {
      return this.acceptHost(request, code);
    }
    if (url.pathname.startsWith("/api/guest/connect")) {
      return this.acceptGuest(request, code);
    }
    return json({ ok: false, error: "not_found" }, 404);
  }

  acceptHost(request, code) {
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }
    const token = new URL(request.url).searchParams.get("token") || "";
    if (token.length < 24) {
      return json({ ok: false, error: "host_token_required" }, 403);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.closeHost("host_reconnected");
    this.hostSocket = server;
    this.session = {
      code,
      hostTokenHint: token.slice(0, 4),
      startedAt: new Date().toISOString(),
    };
    server.addEventListener("message", (event) => this.onHostMessage(event));
    server.addEventListener("close", () => this.closeHost("host_disconnected"));
    server.addEventListener("error", () => this.closeHost("host_error"));
    this.send(server, { kind: "relay.host.ready", code, guests: this.guestSockets.size });
    this.broadcastGuests({ kind: "relay.host.ready", code });
    return new Response(null, { status: 101, webSocket: client });
  }

  acceptGuest(request, code) {
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const guestId = `guest-${crypto.randomUUID()}`;
    server.accept();
    this.guestSockets.set(guestId, server);
    server.addEventListener("message", (event) => this.onGuestMessage(guestId, event));
    server.addEventListener("close", () => this.guestSockets.delete(guestId));
    server.addEventListener("error", () => this.guestSockets.delete(guestId));
    this.send(server, { kind: "relay.guest.ready", code, guestId, hostConnected: Boolean(this.hostSocket) });
    this.sendHost({ kind: "relay.guest.connected", code, guestId });
    return new Response(null, { status: 101, webSocket: client });
  }

  onHostMessage(event) {
    const parsed = parseRelayMessage(event.data, HOST_SAFE_KINDS);
    if (!parsed.valid) {
      this.send(this.hostSocket, { kind: "relay.error", errors: parsed.errors });
      return;
    }
    const targetGuestId = parsed.message.guestId || "";
    if (targetGuestId && this.guestSockets.has(targetGuestId)) {
      this.send(this.guestSockets.get(targetGuestId), parsed.message);
      return;
    }
    this.broadcastGuests(parsed.message);
  }

  onGuestMessage(guestId, event) {
    const parsed = parseRelayMessage(event.data, GUEST_SAFE_KINDS);
    if (!parsed.valid) {
      this.send(this.guestSockets.get(guestId), { kind: "relay.error", errors: parsed.errors });
      return;
    }
    this.sendHost({
      ...parsed.message,
      guestId,
    });
  }

  sendHost(message) {
    if (!this.hostSocket) {
      return false;
    }
    return this.send(this.hostSocket, message);
  }

  broadcastGuests(message) {
    for (const socket of this.guestSockets.values()) {
      this.send(socket, message);
    }
  }

  send(socket, message) {
    try {
      socket?.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  closeHost(reason) {
    if (this.hostSocket) {
      try {
        this.hostSocket.close(1012, reason);
      } catch {
        // Best effort cleanup; the next connect replaces the socket.
      }
    }
    this.hostSocket = null;
  }
}

export function parseRelayMessage(data, allowedKinds) {
  const errors = [];
  const raw = typeof data === "string" ? data : "";
  if (new TextEncoder().encode(raw).length > MAX_PAYLOAD_BYTES) {
    errors.push("payload_too_large");
  }
  let message = null;
  try {
    message = JSON.parse(raw);
  } catch {
    errors.push("invalid_json");
  }
  const kind = String(message?.kind || "");
  if (!allowedKinds.has(kind)) {
    errors.push("message_kind_not_allowed");
  }
  const blocked = firstBlockedKey(message);
  if (blocked) {
    errors.push(`host_only_field:${blocked}`);
  }
  return {
    valid: errors.length === 0,
    errors,
    message,
  };
}

function relayStub(env, code) {
  const id = env.TABLE_RELAY.idFromName(code || "invalid");
  return env.TABLE_RELAY.get(id);
}

function normalizeFriendCode(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[OI]/g, "");
  return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4, 8)}` : compact;
}

function extractFriendCodeFromUrl(url) {
  const queryCode = url.searchParams.get("code");
  if (queryCode) {
    return queryCode;
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const tableCodeIndex = parts.findIndex((part) => part.toLowerCase() === "table-code");
  if (tableCodeIndex >= 0 && parts[tableCodeIndex + 1]) {
    return parts[tableCodeIndex + 1];
  }
  const tableCodeEquals = parts.find((part) => part.toLowerCase().startsWith("table-code="));
  if (tableCodeEquals) {
    return tableCodeEquals.slice(tableCodeEquals.indexOf("=") + 1);
  }
  return "";
}

function isValidFriendCode(code) {
  return FRIEND_CODE_PATTERN.test(code);
}

function firstBlockedKey(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const blocked = firstBlockedKey(item, depth + 1);
      if (blocked) {
        return blocked;
      }
    }
    return "";
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("password") ||
      normalized.includes("apikey") ||
      normalized.includes("authorization") ||
      normalized.includes("credential") ||
      normalized === "providersettings" ||
      normalized === "ollama" ||
      normalized === "sqlitepath" ||
      normalized === "localpath" ||
      normalized === "filepath" ||
      normalized === "rawresponse" ||
      normalized === "rawprompt" ||
      normalized === "diagnostics" ||
      normalized === "debug"
    ) {
      return key;
    }
    const blocked = firstBlockedKey(item, depth + 1);
    if (blocked) {
      return blocked;
    }
  }
  return "";
}

function renderGuestEntryPage(initialCode) {
  const code = normalizeFriendCode(initialCode);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LoreKeeper Remote Table</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101416; color: #edf2f4; font-family: system-ui, sans-serif; }
    main { width: min(420px, calc(100vw - 32px)); display: grid; gap: 14px; }
    h1 { margin: 0; font-size: 1.6rem; }
    p { color: #aebbc2; line-height: 1.45; }
    label { display: grid; gap: 6px; color: #cbd5da; font-size: .82rem; font-weight: 700; }
    input { min-height: 44px; border-radius: 8px; border: 1px solid #3b474d; background: #151b1f; color: #fff; padding: 0 12px; font: inherit; }
    #code { letter-spacing: .08em; text-transform: uppercase; }
    button { min-height: 44px; border: 0; border-radius: 8px; background: #8ec6a5; color: #07100b; font-weight: 800; cursor: pointer; }
    button:disabled { opacity: .55; cursor: default; }
    code { color: #8ec6a5; }
  </style>
</head>
<body>
  <main>
    <h1>LoreKeeper</h1>
    <p>Enter a friend code to join a remote table. The host keeps campaign state and the DM brain on their machine.</p>
    <label>Friend Code<input id="code" value="${escapeHtml(code)}" placeholder="M7SS-7K4P" maxlength="9" /></label>
    <label>Your Name<input id="name" value="" placeholder="Player name" maxlength="40" /></label>
    <button id="join">Ask To Join</button>
    <p id="status">Remote relay is online. Guest table UI is the next integration step.</p>
  </main>
  <script>
    const input = document.querySelector("#code");
    const nameInput = document.querySelector("#name");
    const status = document.querySelector("#status");
    const join = document.querySelector("#join");
    let socket = null;
    document.querySelector("#join").addEventListener("click", async () => {
      const code = input.value.trim().toUpperCase();
      const res = await fetch("/api/session/" + encodeURIComponent(code));
      const body = await res.json();
      if (!body.ok) {
        status.textContent = "That friend code was not recognized.";
        return;
      }
      if (!body.active) {
        status.textContent = "That code exists, but the host is not connected right now.";
        return;
      }
      const displayName = nameInput.value.trim() || "Remote Friend";
      socket?.close();
      socket = new WebSocket(location.origin.replace(/^http/i, "ws") + "/api/guest/connect?code=" + encodeURIComponent(code));
      join.disabled = true;
      status.textContent = "Connecting to the host...";
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ kind: "guest.hello", code, displayName }));
        socket.send(JSON.stringify({ kind: "guest.join.request", code, displayName }));
        status.textContent = "Join request sent. Waiting for the host to seat you.";
      });
      socket.addEventListener("message", (event) => {
        let message = null;
        try { message = JSON.parse(event.data); } catch {}
        if (message?.kind === "host.guest.pending") {
          status.textContent = "The host sees your request. Waiting for a seat.";
        } else if (message?.kind === "relay.host.ready") {
          status.textContent = "Host is connected. Sending request...";
        } else if (message?.kind === "relay.error") {
          status.textContent = "Relay rejected the request. Ask the host for a fresh code.";
        }
      });
      socket.addEventListener("close", () => {
        join.disabled = false;
      });
      socket.addEventListener("error", () => {
        join.disabled = false;
        status.textContent = "Could not connect to the relay.";
      });
    });
  </script>
</body>
</html>`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(value) {
  return new Response(value, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}
