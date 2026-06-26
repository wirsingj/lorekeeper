export const guestSafeShareRouteBoundary = Object.freeze([
  "/guest",
  "/api/multiplayer/join",
  "/api/multiplayer/join-preview",
  "/api/multiplayer/waiting-room/*",
  "/api/multiplayer/guest-snapshot",
  "/api/multiplayer/action",
  "/api/multiplayer/pass",
  "/api/multiplayer/choice-vote",
  "/api/multiplayer/disconnect",
  "/api/multiplayer/combat/join",
  "/api/multiplayer/table-talk",
]);

export function buildShareTableSession({ table = {}, campaignId = "", locationPort = "", guestLink = "" } = {}) {
  const running = Boolean(table.running);
  const host = table.lanAddress || "127.0.0.1";
  const port = table.port || locationPort || "";
  const tableId = table.tableId || "";
  const sessionId = table.sessionId || "";
  const link = guestLink || (running ? buildGuestLobbyLink({ host, port }) : "");
  return {
    running,
    campaignId,
    tableId,
    sessionId,
    host,
    port,
    guestLink: link,
    routeBoundary: [...guestSafeShareRouteBoundary],
    summary: running
      ? `LAN session: ${host}${port ? `:${port}` : ""} / table ${shortId(tableId)} / session ${shortId(sessionId)}`
      : "Guest lobby closed.",
    safety: running
      ? "Shares browser guest mode only: preview, seat request, fixed invite join, approved character actions, votes, pass, leave/rejoin, combat participation, and Table Talk. Host settings, DM Voice, Ollama, files, and diagnostics stay on this machine."
      : "Open Guest Lobby when a friend is ready to join. Guests ask for seats; the host stays authoritative.",
  };
}

function buildGuestLobbyLink({ host, port } = {}) {
  const safeHost = host || "127.0.0.1";
  return port ? `http://${safeHost}:${port}/guest` : `http://${safeHost}/guest`;
}

function shortId(value = "") {
  const text = String(value || "").trim();
  if (!text) {
    return "pending";
  }
  return text.length > 12 ? text.slice(-12) : text;
}
