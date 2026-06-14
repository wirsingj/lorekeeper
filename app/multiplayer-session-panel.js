export function buildMultiplayerSessionProjection({
  campaign,
  clientMode = false,
  guestSession = null,
  guestSnapshot = null,
  locationPort = "",
} = {}) {
  const multiplayer = campaign?.multiplayer ?? {};
  const table = multiplayer.localTable ?? {};
  if (clientMode) {
    return {
      mode: "guest",
      localTableState: "Client",
      localTableAddress: guestSession?.hostBaseUrl
        ? `${guestSession.status === "connected" ? "Connected" : "Waiting"}: ${guestSession.hostBaseUrl}`
        : "Paste a host invite link to join.",
      canStartLocalTable: false,
      canStopLocalTable: false,
      canSyncGuestTable: Boolean(guestSession?.hostBaseUrl),
      canResolvePartyInputs: false,
      requireGuestActionApproval: false,
      connectedGuests: [],
      pendingInputs: guestSnapshot?.pendingInput ? [guestSnapshot.pendingInput] : [],
    };
  }

  const pendingInputs = multiplayer.pendingTurnInputs ?? [];
  return {
    mode: "host",
    localTableState: table.running ? "On" : "Off",
    localTableAddress: table.running
      ? `LAN: ${table.lanAddress || "127.0.0.1"}:${table.port || locationPort}`
      : "Start a LAN table only when another local app is joining.",
    canStartLocalTable: true,
    canStopLocalTable: Boolean(table.running),
    canSyncGuestTable: false,
    canResolvePartyInputs: pendingInputs.some((input) => input.ready && !input.passed && input.text),
    requireGuestActionApproval: Boolean(multiplayer.settings?.requireGuestActionApproval),
    connectedGuests: multiplayer.connections ?? [],
    pendingInputs,
  };
}

export function renderMultiplayerSessionPanel({
  elements,
  projection,
  labelById,
  approveGuest,
  denyGuest,
}) {
  elements.localTableState.textContent = projection.localTableState;
  elements.localTableAddress.textContent = projection.localTableAddress;
  elements.startLocalTable.disabled = !projection.canStartLocalTable;
  elements.stopLocalTable.disabled = !projection.canStopLocalTable;
  if (elements.syncGuestTable) {
    elements.syncGuestTable.disabled = !projection.canSyncGuestTable;
  }
  if (elements.requireGuestActionApproval) {
    elements.requireGuestActionApproval.checked = projection.requireGuestActionApproval;
    elements.requireGuestActionApproval.disabled = projection.mode !== "host";
  }
  elements.resolvePartyInputs.disabled = !projection.canResolvePartyInputs;
  renderConnectedGuests(elements.connectedGuests, projection.connectedGuests, { labelById, approveGuest, denyGuest });
  renderPendingInputs(elements.pendingInputs, projection.pendingInputs);
}

function renderConnectedGuests(container, connections, { labelById, approveGuest, denyGuest }) {
  container.replaceChildren(
    ...emptyOrRows(
      connections.map((connection) => localTableRow({
        title: connection.displayName || "Guest",
        subtitle: connection.proposedCharacter?.name
          ? `${connection.status} / wants to join as ${connection.proposedCharacter.name}`
          : `${connection.status} / ${labelById(connection.partyMemberId)}`,
        actions: connection.status === "pending"
          ? [
            { label: "Approve", onClick: () => approveGuest(connection.id) },
            { label: "Deny", onClick: () => denyGuest(connection.id) },
          ]
          : [],
      })),
      "No guests connected.",
    ),
  );
}

function renderPendingInputs(container, inputs) {
  container.replaceChildren(
    ...emptyOrRows(
      inputs.map((input) => localTableRow({
        title: input.characterName || "Party member",
        subtitle: input.passed ? "passed" : input.text || "not ready",
        actions: [],
      })),
      "No pending party inputs.",
    ),
  );
}

function localTableRow({ title, subtitle, actions = [] }) {
  const row = document.createElement("div");
  row.className = "local-table-row";
  const text = document.createElement("span");
  text.textContent = `${title}: ${subtitle}`;
  row.append(text);
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-action";
    button.textContent = action.label;
    button.addEventListener("click", action.onClick);
    row.append(button);
  }
  return row;
}

function emptyOrRows(rows, message) {
  if (rows.length) {
    return rows;
  }
  const empty = document.createElement("p");
  empty.className = "empty-state";
  empty.textContent = message;
  return [empty];
}
