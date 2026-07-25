const MAX_PAYLOAD_BYTES = 16 * 1024;
const FRIEND_CODE_PATTERN = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const RELAY_VERSION = "2026-07-25-playable-browser-guest-alpha";

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

const TARGET_REQUIRED_HOST_KINDS = new Set([
  "host.guest.pending",
  "host.guest.approved",
  "host.guest.denied",
  "host.error",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "lorekeeper-friend-relay", version: RELAY_VERSION });
    }
    if (!url.pathname.startsWith("/api/")) {
      const cspNonce = createCspNonce();
      return html(renderGuestEntryPage(extractFriendCodeFromUrl(url), cspNonce), { cspNonce });
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
    if (this.session?.hostToken && this.session.hostToken !== token) {
      return json({ ok: false, error: "invalid_host_token" }, 403);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    this.closeHost("host_reconnected");
    this.hostSocket = server;
    this.session = {
      code,
      hostToken: token,
      startedAt: this.session?.startedAt || new Date().toISOString(),
      lastHostSeenAt: new Date().toISOString(),
    };
    server.addEventListener("message", (event) => this.onHostMessage(event));
    server.addEventListener("close", () => this.closeHost("host_disconnected", { notifyGuests: true }));
    server.addEventListener("error", () => this.closeHost("host_error", { notifyGuests: true }));
    this.send(server, { kind: "relay.host.ready", code, guests: this.guestSockets.size });
    this.broadcastGuests({ kind: "relay.host.ready", code });
    return new Response(null, { status: 101, webSocket: client });
  }

  acceptGuest(request, code) {
    const upgrade = request.headers.get("upgrade") || "";
    if (upgrade.toLowerCase() !== "websocket") {
      return json({ ok: false, error: "websocket_required" }, 426);
    }
    if (!this.hostSocket) {
      return json({ ok: false, error: "host_not_connected" }, 409);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const guestId = `guest-${crypto.randomUUID()}`;
    server.accept();
    this.guestSockets.set(guestId, server);
    server.addEventListener("message", (event) => this.onGuestMessage(guestId, event));
    server.addEventListener("close", () => this.closeGuest(guestId, "guest_disconnected"));
    server.addEventListener("error", () => this.closeGuest(guestId, "guest_error"));
    this.send(server, { kind: "relay.guest.ready", code, guestId, hostConnected: Boolean(this.hostSocket) });
    this.sendHost({ kind: "relay.guest.connected", code, guestId });
    return new Response(null, { status: 101, webSocket: client });
  }

  onHostMessage(event) {
    const parsed = parseRelayMessage(event.data, HOST_SAFE_KINDS, { direction: "host" });
    if (!parsed.valid) {
      this.send(this.hostSocket, { kind: "relay.error", errors: parsed.errors });
      return;
    }
    const targetGuestId = parsed.message.guestId || "";
    if (TARGET_REQUIRED_HOST_KINDS.has(parsed.message.kind)) {
      if (!targetGuestId || !this.guestSockets.has(targetGuestId)) {
        this.send(this.hostSocket, { kind: "relay.error", errors: ["target_guest_not_connected"] });
        return;
      }
      this.send(this.guestSockets.get(targetGuestId), parsed.message);
      return;
    }
    if (targetGuestId) {
      const socket = this.guestSockets.get(targetGuestId);
      if (!socket) {
        this.send(this.hostSocket, { kind: "relay.error", errors: ["target_guest_not_connected"] });
        return;
      }
      this.send(socket, parsed.message);
      return;
    }
    this.broadcastGuests(parsed.message);
  }

  onGuestMessage(guestId, event) {
    const parsed = parseRelayMessage(event.data, GUEST_SAFE_KINDS, { direction: "guest" });
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

  closeGuest(guestId, reason = "guest_disconnected") {
    const existed = this.guestSockets.delete(guestId);
    if (existed) {
      this.sendHost({ kind: "guest.disconnect", guestId, reason });
    }
  }

  closeHost(reason, { notifyGuests = false } = {}) {
    if (this.hostSocket) {
      try {
        this.hostSocket.close(1012, reason);
      } catch {
        // Best effort cleanup; the next connect replaces the socket.
      }
    }
    this.hostSocket = null;
    if (notifyGuests) {
      this.broadcastGuests({ kind: "relay.host.disconnected", reason });
    }
  }
}

export function parseRelayMessage(data, allowedKinds, { direction = "guest" } = {}) {
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
  const blocked = firstBlockedKey(message, {
    allowSessionKey: direction === "host" && kind === "host.guest.approved",
  });
  if (blocked) {
    errors.push(`host_only_field:${blocked}`);
  }
  if (direction === "host" && TARGET_REQUIRED_HOST_KINDS.has(kind) && !String(message?.guestId || "").trim()) {
    errors.push("target_guest_required");
  }
  if (direction === "host" && kind === "host.guest.approved" && !String(message?.sessionKey || "").trim()) {
    errors.push("session_key_required");
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

function firstBlockedKey(value, { allowSessionKey = false } = {}, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const blocked = firstBlockedKey(item, { allowSessionKey }, depth + 1);
      if (blocked) {
        return blocked;
      }
    }
    return "";
  }
  for (const [key, item] of Object.entries(value)) {
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalized === "sessionkey") {
      if (allowSessionKey) {
        continue;
      }
      return key;
    }
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
    const blocked = firstBlockedKey(item, { allowSessionKey }, depth + 1);
    if (blocked) {
      return blocked;
    }
  }
  return "";
}

function renderGuestEntryPage(initialCode, cspNonce = "") {
  const code = normalizeFriendCode(initialCode);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LoreKeeper Remote Table</title>
  <style nonce="${escapeHtml(cspNonce)}">
    :root {
      color-scheme: dark;
      --ink: #e8edf0;
      --muted: #a5b0b9;
      --line: rgba(174, 191, 202, 0.16);
      --stone-dark: #171a1d;
      --stone-mid: #30363b;
      --surface: rgba(22, 27, 30, 0.84);
      --surface-raised: #20262a;
      --moss: #8ec6a5;
      --steel: #8fa6b8;
      --copper: #a8845b;
      --red: #b36862;
      --shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 16% 8%, rgba(125, 213, 201, 0.1), transparent 24%),
        radial-gradient(circle at 82% 18%, rgba(168, 132, 91, 0.12), transparent 28%),
        linear-gradient(135deg, #0e1214, #1a2123 52%, #101316);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    button, input, textarea { font: inherit; }
    button {
      min-height: 40px;
      border: 1px solid rgba(174, 191, 202, 0.18);
      border-radius: 8px;
      background: linear-gradient(180deg, #4c5962, #343d43);
      color: #f4f8fa;
      font-weight: 850;
      cursor: pointer;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
    button.primary { background: linear-gradient(180deg, #9ccfb2, #79a98f); color: #09120d; }
    button:disabled { opacity: .55; cursor: default; }
    input, textarea {
      width: 100%;
      border-radius: 8px;
      border: 1px solid rgba(174, 191, 202, 0.22);
      background: #13191c;
      color: #fff;
      padding: 10px 12px;
      outline: none;
    }
    input:focus, textarea:focus { border-color: rgba(142, 198, 165, 0.74); }
    textarea { min-height: 88px; resize: vertical; }
    label { display: grid; gap: 6px; color: #d8e1e5; font-size: .78rem; font-weight: 850; }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 0; font-size: 1.24rem; line-height: 1.1; }
    h2 { margin-bottom: 0; font-size: .86rem; text-transform: uppercase; color: var(--steel); }
    p { color: var(--muted); line-height: 1.45; }
    main { min-height: 100vh; }
    .join-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .join-card {
      width: min(760px, 100%);
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--surface);
      padding: 18px;
      box-shadow: var(--shadow);
      display: grid;
      gap: 14px;
    }
    .brand-row { display: flex; align-items: center; gap: 10px; }
    .app-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: linear-gradient(180deg, #2f4c48, #202b2d);
      border: 1px solid rgba(142, 198, 165, 0.28);
      font-weight: 950;
    }
    .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .character-draft {
      border: 1px solid rgba(142, 198, 165, 0.2);
      border-radius: 8px;
      padding: 12px;
      display: grid;
      gap: 10px;
      background: rgba(18, 30, 25, 0.7);
    }
    .character-draft h2 { font-size: 14px; margin: 0; text-transform: uppercase; color: var(--muted); }
    .character-draft textarea { min-height: 82px; }
    #code { letter-spacing: .08em; text-transform: uppercase; }
    .table-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 236px minmax(420px, 1fr) 252px;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 12px;
    }
    .table-shell[hidden], .join-shell[hidden] { display: none; }
    .rail, .stage, .command-deck {
      border: 1px solid var(--line);
      border-radius: 8px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 30%),
        var(--surface);
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .rail { padding: 10px; display: grid; align-content: start; gap: 10px; overflow: auto; }
    .stage { display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
    .table-status {
      min-height: 40px;
      padding: 10px 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--muted);
      font-weight: 750;
    }
    .status-copy { display: grid; gap: 2px; min-width: 0; }
    .status-copy strong {
      color: var(--ink);
      font-size: .86rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status-copy span {
      color: var(--muted);
      font-size: .76rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: var(--moss); box-shadow: 0 0 14px rgba(142, 198, 165, 0.5); }
    .table-shell[data-connection="disconnected"] .dot { background: var(--red); box-shadow: 0 0 14px rgba(179, 104, 98, 0.5); }
    .table-shell[data-connection="disconnected"] .command-deck { border-color: rgba(179, 104, 98, 0.36); }
    .story-log { padding: 18px; display: grid; align-content: start; gap: 16px; overflow: auto; }
    .msg {
      max-width: 850px;
      border: 1px solid rgba(174, 191, 202, 0.16);
      border-radius: 8px;
      background: rgba(32, 38, 42, 0.88);
      padding: 14px;
      line-height: 1.5;
    }
    .msg strong, .talk strong { display: block; margin-bottom: 6px; color: var(--ink); font-size: .82rem; }
    .empty { color: var(--muted); border: 1px dashed rgba(174, 191, 202, 0.16); border-radius: 8px; padding: 14px; }
    .seat-card, .party-card, .talk {
      border: 1px solid rgba(174, 191, 202, 0.12);
      border-radius: 8px;
      background: rgba(32, 38, 42, 0.78);
      padding: 10px;
    }
    .talk.pending {
      border-color: rgba(142, 198, 165, 0.34);
      background: rgba(33, 53, 43, 0.78);
      opacity: .84;
    }
    .talk.pending strong::after {
      content: " sending";
      color: var(--muted);
      font-weight: 700;
    }
    .moment-panel {
      border: 1px solid rgba(168, 132, 91, 0.24);
      border-radius: 8px;
      background: rgba(50, 39, 25, 0.58);
      padding: 10px;
      display: grid;
      gap: 4px;
    }
    .moment-panel strong { color: #f4eadb; }
    .party-card { display: grid; gap: 3px; }
    .party-card.active { border-color: rgba(142, 198, 165, 0.58); background: rgba(32, 49, 43, 0.72); }
    .meta { color: var(--muted); font-size: .78rem; }
    .talk-log { display: grid; gap: 8px; max-height: calc(100vh - 220px); overflow: auto; }
    .command-deck {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 160px;
      gap: 10px;
      padding: 12px;
      align-items: end;
    }
    .command-stack { display: grid; gap: 8px; }
    .command-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .choices { display: grid; gap: 8px; }
    .choice { text-align: left; min-height: 38px; background: rgba(34, 49, 43, 0.9); color: #eaf8ef; }
    .choice-panel {
      border: 1px solid rgba(142, 198, 165, 0.28);
      background: rgba(30, 50, 39, 0.66);
      border-radius: 8px;
      padding: 10px;
      display: grid;
      gap: 8px;
    }
    .muted { color: var(--muted); }
    .mobile-talk { display: none; }
    @media (max-width: 980px) {
      .table-shell {
        grid-template-columns: 1fr;
        grid-template-rows: auto minmax(320px, 1fr) auto auto;
      }
      .right-rail { display: none; }
      .left-rail { max-height: none; overflow: visible; }
      .mobile-talk { display: grid; }
      .desktop-talk { display: none; }
      .command-deck { grid-column: 1; grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <section id="join-panel" class="join-shell">
      <div class="join-card">
      <div class="brand-row">
        <div class="app-icon">LK</div>
        <div>
          <h1>LoreKeeper</h1>
          <p class="muted">Join a friend's table from your browser.</p>
        </div>
      </div>
      <div class="grid">
        <label>Friend Code<input id="code" value="${escapeHtml(code)}" placeholder="M7SS-7K4P" maxlength="9" /></label>
        <label>Your Name<input id="name" value="" placeholder="Player name" maxlength="40" /></label>
      </div>
      <div class="character-draft">
        <h2>Your Character</h2>
        <div class="grid">
          <label>Character Name<input id="character-name" value="" placeholder="Rowan" maxlength="80" /></label>
          <label>Level<input id="character-level" value="1" inputmode="numeric" maxlength="2" /></label>
          <label>Ancestry<input id="character-ancestry" value="" placeholder="Human, elf, dwarf..." maxlength="80" /></label>
          <label>Class<input id="character-class" value="" placeholder="Fighter, wizard, rogue..." maxlength="80" /></label>
        </div>
        <label>Table Role<input id="character-role" value="" placeholder="Scout, healer, protector, wildcard..." maxlength="160" /></label>
        <label>Why They Are Here<textarea id="character-backstory" maxlength="900" placeholder="A quick hook the host can use when seating you."></textarea></label>
      </div>
      <button id="join" class="primary">Ask To Join</button>
      <p id="status">Remote relay is online.</p>
      </div>
    </section>
    <section id="table-panel" class="table-shell" hidden>
      <aside class="rail left-rail">
        <h2>Adventure</h2>
        <div class="seat-card">
          <h1 id="table-title">LoreKeeper Table</h1>
          <p id="seat" class="muted">Waiting for a seat.</p>
        </div>
        <div id="moment-panel" class="moment-panel">
          <strong>Waiting</strong>
          <span class="meta">The host table is syncing.</span>
        </div>
        <h2>Party</h2>
        <div id="party-list" class="choices"></div>
      </aside>
      <section class="stage">
        <div class="table-status"><span class="dot"></span><div class="status-copy"><strong id="now-cue">Now: Waiting</strong><span id="scene">Next: Waiting for the host table.</span></div></div>
        <div id="log" class="story-log"></div>
      </section>
      <aside class="rail right-rail">
        <h2>Table Talk</h2>
        <div id="talk-log" class="talk-log"></div>
      </aside>
      <section class="command-deck">
        <div class="command-stack">
          <div id="choices" class="choices"></div>
          <label>Your Action<textarea id="action" maxlength="1200" placeholder="What do you do?"></textarea></label>
          <label class="mobile-talk">Table Talk<input id="talk-mobile" maxlength="800" placeholder="Say something out of character..." /></label>
        </div>
        <div class="command-stack">
          <div class="command-buttons">
            <button id="send-action" class="primary">Send</button>
            <button id="pass">Pass</button>
            <button id="refresh">Sync</button>
          </div>
          <label class="desktop-talk">Table Talk<input id="talk" maxlength="800" placeholder="Say something out of character..." /></label>
          <button id="send-talk">Send Table Talk</button>
          <p id="table-notice" class="muted">Connected.</p>
        </div>
      </section>
    </section>
  </main>
  <script nonce="${escapeHtml(cspNonce)}">
    const input = document.querySelector("#code");
    const nameInput = document.querySelector("#name");
    const characterNameInput = document.querySelector("#character-name");
    const characterLevelInput = document.querySelector("#character-level");
    const characterAncestryInput = document.querySelector("#character-ancestry");
    const characterClassInput = document.querySelector("#character-class");
    const characterRoleInput = document.querySelector("#character-role");
    const characterBackstoryInput = document.querySelector("#character-backstory");
    const status = document.querySelector("#status");
    const tableNotice = document.querySelector("#table-notice");
    const join = document.querySelector("#join");
    const joinPanel = document.querySelector("#join-panel");
    const tablePanel = document.querySelector("#table-panel");
    const tableTitle = document.querySelector("#table-title");
    const seat = document.querySelector("#seat");
    const momentPanel = document.querySelector("#moment-panel");
    const nowCue = document.querySelector("#now-cue");
    const scene = document.querySelector("#scene");
    const log = document.querySelector("#log");
    const talkLog = document.querySelector("#talk-log");
    const partyList = document.querySelector("#party-list");
    const choices = document.querySelector("#choices");
    const action = document.querySelector("#action");
    const talk = document.querySelector("#talk");
    const talkMobile = document.querySelector("#talk-mobile");
    const sendAction = document.querySelector("#send-action");
    const sendTalk = document.querySelector("#send-talk");
    const pass = document.querySelector("#pass");
    const refresh = document.querySelector("#refresh");
    let socket = null;
    let session = null;
    let latestSnapshot = null;
    let snapshotTimer = null;
    let pendingJoin = null;
    let pendingTableTalk = [];
    let reconnecting = false;
    const normalizeCodeInput = (value) => {
      const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/[OI]/g, "");
      return compact.length > 4 ? compact.slice(0, 4) + "-" + compact.slice(4, 8) : compact;
    };
    const setStatus = (text) => {
      const message = compactText(text, 260);
      status.textContent = message;
      tableNotice.textContent = message;
    };
    const setTableConnected = (connected) => {
      tablePanel.dataset.connection = connected ? "connected" : "disconnected";
      action.disabled = !connected;
      sendTalk.disabled = !connected;
      refresh.textContent = connected ? "Sync" : "Reconnect";
      updateActionAvailability(latestSnapshot);
    };
    const send = (message) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
        return true;
      }
      setTableConnected(false);
      setStatus("Connection paused. Press Reconnect when the host is back.");
      return false;
    };
    const requestSnapshot = () => {
      if (session) {
        send({ kind: "guest.snapshot.request", code: session.code });
      }
    };
    const startSnapshotPolling = () => {
      window.clearInterval(snapshotTimer);
      snapshotTimer = window.setInterval(requestSnapshot, 5000);
    };
    const stopSnapshotPolling = () => {
      window.clearInterval(snapshotTimer);
      snapshotTimer = null;
    };
    const showWaitingTable = () => {
      tablePanel.hidden = false;
      joinPanel.hidden = true;
      renderParty([]);
      renderMessages([]);
      renderTalk([]);
      renderChoices([]);
      renderMoment(null);
    };
    const collectCharacterDraft = (displayName) => ({
      name: characterNameInput.value.trim() || displayName,
      ancestry: characterAncestryInput.value.trim(),
      characterClass: characterClassInput.value.trim(),
      level: characterLevelInput.value.trim() || "1",
      roleIntent: characterRoleInput.value.trim(),
      backstory: characterBackstoryInput.value.trim(),
    });
    const joinRequestMessage = ({ code, displayName, proposedCharacter }) => ({
      kind: "guest.join.request",
      code,
      displayName,
      proposedCharacter,
    });
    const openGuestSocket = ({ code, displayName, proposedCharacter, rejoin = false }) => {
      socket?.close();
      socket = new WebSocket(location.origin.replace(/^http/i, "ws") + "/api/guest/connect?code=" + encodeURIComponent(code));
      const guestSocket = socket;
      join.disabled = true;
      reconnecting = Boolean(rejoin);
      setTableConnected(false);
      setStatus(rejoin ? "Reconnecting to the host..." : "Connecting to the host...");
      guestSocket.addEventListener("open", () => {
        if (socket !== guestSocket) return;
        setTableConnected(true);
        if (rejoin && session) {
          guestSocket.send(JSON.stringify({ kind: "guest.hello", code, displayName }));
          guestSocket.send(JSON.stringify(joinRequestMessage({ code, displayName, proposedCharacter })));
          setStatus("Rejoin request sent. The host may need to seat you again.");
          reconnecting = false;
          return;
        }
        guestSocket.send(JSON.stringify({ kind: "guest.hello", code, displayName }));
        guestSocket.send(JSON.stringify(joinRequestMessage({ code, displayName, proposedCharacter })));
        setStatus("Join request sent. Waiting for the host to seat you.");
      });
      guestSocket.addEventListener("message", (event) => {
        if (socket !== guestSocket) return;
        let message = null;
        try { message = JSON.parse(event.data); } catch {}
        if (message?.kind === "host.guest.pending") {
          setStatus("The host sees your request. Waiting for a seat.");
        } else if (message?.kind === "host.guest.approved") {
          session = {
            code,
            connectionId: message.connectionId || "",
            clientId: message.clientId || "",
            partyMemberId: message.partyMemberId || "",
            characterName: message.characterName || "",
          };
          setTableConnected(true);
          setStatus(message.characterName
            ? "Joined as " + message.characterName + "."
            : "Joined the table.");
          showWaitingTable();
          seat.textContent = message.characterName ? "Seated as " + message.characterName + "." : "Seated at the table.";
          join.disabled = true;
          requestSnapshot();
          startSnapshotPolling();
        } else if (message?.kind === "host.snapshot") {
          latestSnapshot = message.snapshot || null;
          setTableConnected(true);
          renderSnapshot(latestSnapshot);
        } else if (message?.kind === "host.error") {
          setStatus(message.message || "The host could not complete that request.");
        } else if (message?.kind === "relay.host.ready") {
          setStatus("Host is connected. Syncing the table...");
          setTableConnected(true);
          if (!session && pendingJoin) {
            socket.send(JSON.stringify(joinRequestMessage(pendingJoin)));
          } else if (session) {
            requestSnapshot();
          }
        } else if (message?.kind === "relay.host.disconnected") {
          setTableConnected(false);
          setStatus("The host disconnected. Press Reconnect after they start sharing again.");
        } else if (message?.kind === "relay.error") {
          setStatus("Relay rejected the request. Ask the host for a fresh code.");
        }
      });
      guestSocket.addEventListener("close", () => {
        if (socket !== guestSocket) return;
        join.disabled = false;
        stopSnapshotPolling();
        reconnecting = false;
        if (session || reconnecting) {
          setTableConnected(false);
          setStatus("Connection paused. Press Reconnect when the host is back.");
        }
      });
      guestSocket.addEventListener("error", () => {
        if (socket !== guestSocket) return;
        join.disabled = false;
        stopSnapshotPolling();
        setTableConnected(false);
        setStatus("Could not connect to the relay. Press Reconnect to try again.");
      });
    };
    const joinRemoteTable = async ({ rejoin = false } = {}) => {
      input.value = normalizeCodeInput(session?.code || input.value);
      const code = input.value.trim().toUpperCase();
      const res = await fetch("/api/session/" + encodeURIComponent(code));
      const body = await res.json();
      if (!body.ok) {
        setStatus("That friend code was not recognized.");
        return;
      }
      if (!body.active) {
        setTableConnected(false);
        setStatus("That code exists, but the host is not connected right now. Ask the host to click Reconnect Sharing.");
        return;
      }
      const displayName = nameInput.value.trim() || session?.characterName || "Remote Friend";
      const proposedCharacter = collectCharacterDraft(displayName);
      pendingJoin = { code, displayName, proposedCharacter };
      openGuestSocket({ code, displayName, proposedCharacter, rejoin });
    };
    const checkFriendCodeAvailability = async ({ quiet = false } = {}) => {
      input.value = normalizeCodeInput(input.value);
      const code = input.value.trim().toUpperCase();
      if (code.length < 9) {
        if (!quiet) setStatus("Enter the friend code from your host.");
        return null;
      }
      try {
        const res = await fetch("/api/session/" + encodeURIComponent(code));
        const body = await res.json();
        if (!body.ok) {
          if (!quiet) setStatus("That friend code was not recognized.");
          return body;
        }
        setStatus(body.active
          ? "Friend code found. Enter your name and ask to join."
          : "Friend code found, but the host is not connected yet. Ask the host to click Reconnect Sharing.");
        return body;
      } catch {
        if (!quiet) setStatus("Could not check that friend code. Try again in a moment.");
        return null;
      }
    };
    document.querySelector("#join").addEventListener("click", async () => {
      await joinRemoteTable();
    });
    input.addEventListener("input", () => {
      input.value = normalizeCodeInput(input.value);
      if (input.value.length === 9) {
        checkFriendCodeAvailability({ quiet: true });
      }
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        nameInput.focus();
      }
    });
    nameInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        characterNameInput.focus();
      }
    });
    characterBackstoryInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        await joinRemoteTable();
      }
    });
    if (input.value.trim()) {
      nameInput.focus();
      checkFriendCodeAvailability({ quiet: true });
    } else {
      input.focus();
    }
    refresh.addEventListener("click", async () => {
      if (socket?.readyState === WebSocket.OPEN) {
        requestSnapshot();
        return;
      }
      await joinRemoteTable({ rejoin: Boolean(session) });
    });
    window.addEventListener("beforeunload", () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ kind: "guest.disconnect", code: session?.code || input.value.trim().toUpperCase() }));
      }
    });
    sendAction.addEventListener("click", () => {
      submitAction();
    });
    action.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        submitAction();
      }
    });
    function submitAction() {
      const text = action.value.trim();
      if (!text) {
        setStatus("Write an action first.");
        return;
      }
      if (send({ kind: "guest.action.submit", code: session?.code || input.value.trim().toUpperCase(), text })) {
        action.value = "";
        setStatus("Action sent. Waiting for the host table.");
      }
    }
    pass.addEventListener("click", () => {
      if (send({ kind: "guest.pass", code: session?.code || input.value.trim().toUpperCase() })) {
        setStatus("Passed. Waiting for the host table.");
      }
    });
    sendTalk.addEventListener("click", submitTableTalk);
    talk.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitTableTalk();
      }
    });
    talkMobile?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitTableTalk();
      }
    });
    function submitTableTalk() {
      const activeTalk = talkMobile?.offsetParent ? talkMobile : talk;
      const text = activeTalk.value.trim();
      if (!text) {
        return;
      }
      if (send({ kind: "guest.tableTalk.post", code: session?.code || input.value.trim().toUpperCase(), text })) {
        rememberPendingTableTalk(text);
        talk.value = "";
        if (talkMobile) talkMobile.value = "";
        renderTalk(latestSnapshot?.tableTalk || latestSnapshot?.tableState?.tableTalk || []);
        setStatus("Table Talk sent. Syncing with the host table.");
        window.setTimeout(requestSnapshot, 700);
      }
    }
    function renderSnapshot(snapshot) {
      if (!snapshot) {
        return;
      }
      tablePanel.hidden = false;
      joinPanel.hidden = true;
      tableTitle.textContent = snapshot.campaignTitle || "LoreKeeper Table";
      const characterName = snapshot.assignedCharacter?.name || session?.characterName || snapshot.connection?.displayName || "Your seat";
      seat.textContent = "You are " + compactText(characterName, 80) + ".";
      const cues = tableCues(snapshot);
      nowCue.textContent = compactText(cues.now, 140);
      scene.textContent = compactText(cues.next, 220);
      renderMoment(snapshot);
      renderParty(snapshot.tableState?.party || snapshot.party || []);
      renderMessages(snapshot.messages || snapshot.tableState?.messages || []);
      const tableTalkMessages = snapshot.tableTalk || snapshot.tableState?.tableTalk || [];
      reconcilePendingTableTalk(tableTalkMessages);
      renderTalk(tableTalkMessages);
      renderChoices(snapshot.messages || snapshot.tableState?.messages || []);
      const pending = snapshot.pendingInput || snapshot.tableState?.pendingInput;
      updateActionAvailability(snapshot);
      if (pending?.text) {
        setStatus("Your action is queued: " + pending.text);
      } else if (pending?.passed) {
        setStatus("You passed this turn.");
      } else {
        setStatus("Connected.");
      }
    }
    function updateActionAvailability(snapshot) {
      const connected = tablePanel.dataset.connection === "connected";
      const pending = snapshot?.pendingInput || snapshot?.tableState?.pendingInput;
      const context = actionContext(snapshot);
      let available = connected && Boolean(snapshot);
      let reason = connected ? "The table is syncing before actions unlock." : "Reconnect before sending an action.";
      if (snapshot && !pending?.text && !pending?.passed) {
        reason = "Describe what your character does.";
      }
      if (pending?.text || pending?.passed) {
        available = false;
        reason = "Your action is already queued at the host table.";
      } else if (context.inCombat && context.activeActorId && context.activeActorId !== context.assignedId) {
        available = false;
        reason = "Waiting for " + (context.activeActorName || "the active combatant") + "'s combat turn.";
      } else if (context.inCombat && context.activeActorId === context.assignedId) {
        reason = "It is your combat turn.";
      }
      action.disabled = !available;
      sendAction.disabled = !available;
      pass.disabled = !available;
      action.placeholder = available ? "What do you do?" : reason;
      sendAction.title = available ? "Send your character action to the host table." : reason;
      pass.title = available ? "Pass this turn." : reason;
    }
    function renderMoment(snapshot) {
      const cues = tableCues(snapshot);
      momentPanel.replaceChildren();
      const strong = document.createElement("strong");
      strong.textContent = cues.title;
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = compactText(cues.detail, 180);
      momentPanel.append(strong, meta);
    }
    function tableCues(snapshot) {
      const context = actionContext(snapshot);
      const pending = snapshot?.pendingInput || snapshot?.tableState?.pendingInput;
      const situation = snapshot?.scene?.immediateSituation || snapshot?.tableState?.scene?.immediateSituation || "";
      if (pending?.text) {
        return {
          title: "Action Queued",
          detail: "The host has your action and will resolve it at the table.",
          now: "Now: Action Queued",
          next: "Next: Wait for the host table to resolve your action.",
        };
      }
      if (pending?.passed) {
        return {
          title: "Passed",
          detail: "You passed. Waiting for the host table.",
          now: "Now: Passed",
          next: "Next: Wait for the host table.",
        };
      }
      if (context.inCombat && context.activeActorId === context.assignedId) {
        return {
          title: "Your Turn",
          detail: "Choose your combat action, pass, or use Table Talk.",
          now: "Now: Your Combat Turn",
          next: "Next: Send an action, vote, or pass.",
        };
      }
      if (context.inCombat && context.activeActorId) {
        const actor = context.activeActorName || "the active combatant";
        return {
          title: "Combat",
          detail: "Waiting for " + actor + ".",
          now: "Now: Combat - " + actor,
          next: "Next: Watch the table or use Table Talk.",
        };
      }
      if (snapshot) {
        return {
          title: "At The Table",
          detail: situation || "Send an action when you are ready, or use Table Talk.",
          now: "Now: At The Table",
          next: "Next: Send an action when you are ready, or use Table Talk.",
        };
      }
      return {
        title: "Waiting",
        detail: "The host table is syncing.",
        now: "Now: Waiting",
        next: "Next: Waiting for the host table.",
      };
    }
    function actionContext(snapshot) {
      const tableState = snapshot?.tableState || snapshot || {};
      const combat = tableState.combat || snapshot?.combat || null;
      const assignedId = snapshot?.assignedCharacter?.id || session?.partyMemberId || "";
      const activeActorId = combat?.currentTurnId || combat?.activeActorId || "";
      const turnOrder = Array.isArray(combat?.turnOrder) ? combat.turnOrder : [];
      const activeActor = turnOrder.find((entry) => (entry.id || entry.actorId) === activeActorId)
        || (tableState.party || snapshot?.party || []).find((member) => member.id === activeActorId)
        || (combat?.enemies || []).find((enemy) => enemy.id === activeActorId);
      return {
        inCombat: Boolean(combat?.inCombat && activeActorId),
        assignedId,
        activeActorId,
        activeActorName: activeActor?.name || "",
      };
    }
    function renderMessages(messages) {
      log.innerHTML = "";
      for (const message of safeList(messages, 10)) {
        const div = document.createElement("div");
        div.className = "msg";
        const title = document.createElement("strong");
        title.textContent = compactText(message.title || String(message.role || "Table").toUpperCase(), 80);
        const body = document.createElement("div");
        body.textContent = compactText(message.body || "", 1600);
        div.append(title, body);
        log.append(div);
      }
      if (!log.children.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "The story log is waiting for the host table.";
        log.append(empty);
      }
    }
    function renderParty(party) {
      partyList.innerHTML = "";
      const assignedId = latestSnapshot?.assignedCharacter?.id || session?.partyMemberId || "";
      for (const member of safeList(party, 8)) {
        const div = document.createElement("div");
        div.className = "party-card" + (member.id === assignedId ? " active" : "");
        const name = document.createElement("strong");
        name.textContent = compactText(member.name || "Party member", 80);
        const meta = document.createElement("div");
        meta.className = "meta";
        const hp = Number.isFinite(member.hp) && Number.isFinite(member.maxHp) ? "HP " + member.hp + "/" + member.maxHp : "";
        const role = [member.ancestry, member.characterClass].filter(Boolean).join(" ");
        meta.textContent = compactText([role, hp, member.id === assignedId ? "You" : ""].filter(Boolean).join(" - "), 120);
        div.append(name, meta);
        partyList.append(div);
      }
      if (!partyList.children.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Party details will appear once the host shares the table.";
        partyList.append(empty);
      }
    }
    function renderTalk(messages) {
      talkLog.innerHTML = "";
      for (const message of safeList([...messages, ...pendingTableTalk], 12)) {
        const div = document.createElement("div");
        div.className = "talk" + (message.pending ? " pending" : "");
        const title = document.createElement("strong");
        title.textContent = compactText(message.playerName || "Table", 80);
        const body = document.createElement("div");
        body.textContent = compactText(message.text || "", 800);
        div.append(title, body);
        talkLog.append(div);
      }
      if (!talkLog.children.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Table Talk is quiet.";
        talkLog.append(empty);
      }
      talkLog.scrollTop = talkLog.scrollHeight;
    }
    function rememberPendingTableTalk(text) {
      const playerName = session?.characterName || nameInput.value.trim() || "You";
      pendingTableTalk = [...pendingTableTalk, {
        id: "pending-talk-" + Date.now().toString(36),
        playerName,
        text,
        pending: true,
      }].slice(-4);
    }
    function reconcilePendingTableTalk(messages) {
      if (!pendingTableTalk.length) {
        return;
      }
      const delivered = new Set(safeList(messages, 12).map((message) =>
        compactCompareText([message.playerName || "", message.text || ""].join("::"))
      ));
      pendingTableTalk = pendingTableTalk.filter((message) => {
        const key = compactCompareText([message.playerName || "", message.text || ""].join("::"));
        const textOnlyDelivered = safeList(messages, 12).some((entry) =>
          compactCompareText(entry.text || "") === compactCompareText(message.text || "")
        );
        return !delivered.has(key) && !textOnlyDelivered;
      });
    }
    function renderChoices(messages) {
      choices.innerHTML = "";
      choices.className = "choices";
      const choiceMessage = [...messages].reverse().find((message) => message?.data?.choices?.options?.length);
      const block = choiceMessage?.data?.choices;
      if (!block) {
        return;
      }
      choices.className = "choice-panel";
      const prompt = document.createElement("p");
      prompt.textContent = compactText(block.prompt || "What do you do?", 360);
      choices.append(prompt);
      safeList(block.options, 6).forEach((option, index) => {
        const button = document.createElement("button");
        button.className = "choice";
        const label = String.fromCharCode(65 + index);
        button.textContent = compactText(label + ". " + (option.text || option.label || "Choice"), 360);
        button.addEventListener("click", () => {
          if (send({
            kind: "guest.choice.vote",
            code: session?.code || input.value.trim().toUpperCase(),
            choiceKey: choiceKey(block),
            optionId: compactText(option.id || label, 80),
            optionLabel: label,
            optionText: compactText(option.text || option.label || "", 360),
            prompt: compactText(block.prompt || "", 360),
          })) {
            disableChoiceButtons();
            setStatus("Vote sent.");
          }
        });
        choices.append(button);
      });
    }
    function disableChoiceButtons() {
      choices.querySelectorAll("button.choice").forEach((button) => {
        button.disabled = true;
      });
    }
    function choiceKey(block) {
      return compactCompareText([
        block.prompt || "",
        block.scope || "",
        block.forActorId || "",
        safeList(block.options, 6).map((option, index) => {
          const label = String.fromCharCode(65 + index);
          const id = option.id || label;
          return id + ":" + (option.text || option.label || "");
        }).join("|"),
      ].join("::")).slice(0, 500);
    }
    function safeList(value, limit) {
      return Array.isArray(value) ? value.slice(-limit) : [];
    }
    function compactText(value, max = 500) {
      const text = String(value || "").replace(/\\s+/g, " ").trim();
      if (text.length <= max) return text;
      return text.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
    }
    function compactCompareText(value) {
      return String(value || "")
        .toLowerCase()
        .replace(/[^\\p{L}\\p{N}]+/gu, " ")
        .replace(/\\s+/g, " ")
        .trim();
    }
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

function html(value, { cspNonce = "" } = {}) {
  const inlinePolicy = cspNonce ? `'nonce-${cspNonce}'` : "'none'";
  return new Response(value, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'self'; script-src 'self' ${inlinePolicy}; style-src 'self' ${inlinePolicy}; connect-src 'self' https: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
    },
  });
}

function createCspNonce() {
  return crypto.randomUUID().replace(/-/g, "");
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
