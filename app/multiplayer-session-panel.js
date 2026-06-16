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
      flowSummary: guestSession?.hostBaseUrl
        ? "Your action goes to the host table first. The host DM resolves it from LoreKeeper."
        : "Paste an invite link to join a host table.",
      resolvePartyInputsLabel: "Resolve Inputs",
      requireGuestActionApproval: false,
      holdGuestActionsForGroupInput: false,
      connectedGuests: [],
      pendingInputs: guestSnapshot?.pendingInput ? [decoratePendingInput(guestSnapshot.pendingInput, { mode: "guest" })] : [],
    };
  }

  const pendingInputs = multiplayer.pendingTurnInputs ?? [];
  const readyInputs = pendingInputs.filter((input) => input.ready && !input.passed && input.text);
  const settings = {
    requireGuestActionApproval: Boolean(multiplayer.settings?.requireGuestActionApproval),
    holdGuestActionsForGroupInput: Boolean(multiplayer.settings?.holdGuestActionsForGroupInput),
  };
  return {
    mode: "host",
    localTableState: table.running ? "On" : "Off",
    localTableAddress: table.running
      ? `LAN: ${table.lanAddress || "127.0.0.1"}:${table.port || locationPort}`
      : "Start a LAN table only when another local app is joining.",
    canStartLocalTable: true,
    canStopLocalTable: Boolean(table.running),
    canSyncGuestTable: false,
    canResolvePartyInputs: readyInputs.length > 0,
    flowSummary: hostFlowSummary({ table, settings, pendingInputs }),
    resolvePartyInputsLabel: resolvePartyInputsLabel({ readyInputs, settings }),
    requireGuestActionApproval: settings.requireGuestActionApproval,
    holdGuestActionsForGroupInput: settings.holdGuestActionsForGroupInput,
    connectedGuests: multiplayer.connections ?? [],
    pendingInputs: pendingInputs.map((input) => decoratePendingInput(input, { settings })),
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
  if (elements.localTableGuidance) {
    elements.localTableGuidance.textContent = projection.flowSummary;
  }
  elements.startLocalTable.disabled = !projection.canStartLocalTable;
  elements.stopLocalTable.disabled = !projection.canStopLocalTable;
  if (elements.syncGuestTable) {
    elements.syncGuestTable.disabled = !projection.canSyncGuestTable;
  }
  if (elements.requireGuestActionApproval) {
    elements.requireGuestActionApproval.checked = projection.requireGuestActionApproval;
    elements.requireGuestActionApproval.disabled = projection.mode !== "host";
  }
  if (elements.holdGuestActionsForGroup) {
    elements.holdGuestActionsForGroup.checked = projection.holdGuestActionsForGroupInput;
    elements.holdGuestActionsForGroup.disabled = projection.mode !== "host" || projection.requireGuestActionApproval;
  }
  elements.resolvePartyInputs.disabled = !projection.canResolvePartyInputs;
  elements.resolvePartyInputs.textContent = projection.resolvePartyInputsLabel || "Resolve Inputs";
  renderConnectedGuests(elements.connectedGuests, projection.connectedGuests, { labelById, approveGuest, denyGuest });
  renderPendingInputs(elements.pendingInputs, projection.pendingInputs);
}

function renderConnectedGuests(container, connections, { labelById, approveGuest, denyGuest }) {
  container.replaceChildren(
    ...emptyOrRows(
      connections.map((connection) => {
        if (connection.status === "pending" && connection.proposedCharacter?.name) {
          return joinRequestRow(connection, { approveGuest, denyGuest });
        }
        return localTableRow({
          title: connection.displayName || "Guest",
          subtitle: connection.proposedCharacter?.name
            ? joinProposalSummary(connection)
            : `${connection.status} / ${labelById(connection.partyMemberId)}`,
          actions: connection.status === "pending"
            ? [
              { label: "Approve", onClick: () => approveGuest(connection.id) },
              { label: "Deny", onClick: () => denyGuest(connection.id) },
            ]
            : [],
        });
      }),
      "No guests connected.",
    ),
  );
}

function joinRequestRow(connection, { approveGuest, denyGuest }) {
  const row = localTableRow({
    title: connection.displayName || "Guest",
    subtitle: joinProposalSummary(connection),
    actions: [],
  });
  row.classList.add("join-request-row");

  const context = document.createElement("textarea");
  context.className = "local-table-join-context";
  context.rows = 3;
  context.maxLength = 1600;
  context.placeholder = "Optional host note for the DM: how should this character enter the current scene?";
  context.value = connection.hostIntegrationPrompt || "";
  row.append(context);

  const actions = document.createElement("div");
  actions.className = "local-table-row-actions";
  actions.append(
    actionButton("Approve", () => approveGuest(connection.id, context.value)),
    actionButton("Deny", () => denyGuest(connection.id)),
  );
  row.append(actions);
  return row;
}

function joinProposalSummary(connection) {
  const proposal = connection.proposedCharacter ?? {};
  const ancestryClass = [proposal.ancestry, proposal.characterClass].filter(Boolean).join(" ");
  const details = [
    `${connection.status} / wants to join as ${proposal.name}`,
    ancestryClass,
    proposal.roleIntent,
    proposal.integrationPrompt ? `Hook: ${proposal.integrationPrompt}` : "",
  ].filter(Boolean);
  return details.join(" / ");
}

function renderPendingInputs(container, inputs) {
  container.replaceChildren(
    ...emptyOrRows(
      inputs.map((input) => localTableRow({
        title: input.characterName || "Party member",
        subtitle: input.statusLabel || input.text || "not ready",
        actions: [],
      })),
      "No guest or party actions are staged right now.",
    ),
  );
}

function hostFlowSummary({ table = {}, settings = {}, pendingInputs = [] } = {}) {
  if (!table.running) {
    return "Start a LAN table when someone is joining from LoreKeeper.";
  }
  const readyCount = pendingInputs.filter((input) => input.ready && !input.passed && input.text).length;
  const names = pendingInputs
    .filter((input) => input.ready && !input.passed && input.text)
    .map((input) => input.characterName || "A guest")
    .slice(0, 3)
    .join(", ");
  const namedCount = names || `${readyCount} guest action${readyCount === 1 ? "" : "s"}`;
  if (settings.requireGuestActionApproval) {
    return readyCount
      ? `${namedCount} waiting for host approval before the DM sees ${readyCount === 1 ? "it" : "them"}.`
      : "Guest actions wait for host approval before the DM sees them.";
  }
  if (settings.holdGuestActionsForGroupInput) {
    return readyCount
      ? `${namedCount} held for the grouped host turn.`
      : "Guest actions wait here until the host resolves a grouped table turn.";
  }
  return readyCount
    ? `${namedCount} queued and ready; LoreKeeper resolves ${readyCount === 1 ? "that action" : "those actions"} when the DM is idle.`
    : "Guest actions resolve one at a time when the DM is idle.";
}

function resolvePartyInputsLabel({ readyInputs = [], settings = {} } = {}) {
  if (!readyInputs.length) {
    return settings.holdGuestActionsForGroupInput ? "Resolve Group Turn" : "Resolve Inputs";
  }
  if (settings.requireGuestActionApproval) {
    return readyInputs.length === 1 ? "Approve For DM" : `Approve ${readyInputs.length} For DM`;
  }
  if (settings.holdGuestActionsForGroupInput) {
    return readyInputs.length === 1 ? "Resolve Group Turn" : `Resolve ${readyInputs.length} Inputs`;
  }
  return readyInputs.length === 1 ? "Resolve Guest Action" : `Resolve ${readyInputs.length} Actions`;
}

function decoratePendingInput(input = {}, { settings = {}, mode = "host" } = {}) {
  const text = input.text || "not ready";
  if (input.passed) {
    return { ...input, statusLabel: "Passed this turn." };
  }
  if (mode === "guest" && input.text) {
    return { ...input, statusLabel: `Sent to host table; waiting for host to resolve: ${text}` };
  }
  if (!input.ready || !input.text) {
    return { ...input, statusLabel: "Not ready yet." };
  }
  if (settings.requireGuestActionApproval) {
    return { ...input, statusLabel: `Waiting for host approval; guest is waiting on host: ${text}` };
  }
  if (settings.holdGuestActionsForGroupInput) {
    return { ...input, statusLabel: `Held for group turn; guest is waiting for the host: ${text}` };
  }
  return { ...input, statusLabel: `Guest action received; Queued for DM: ${text}` };
}

function localTableRow({ title, subtitle, actions = [] }) {
  const row = document.createElement("div");
  row.className = "local-table-row";
  const text = document.createElement("span");
  text.textContent = `${title}: ${subtitle}`;
  text.title = `${title}: ${subtitle}`;
  row.append(text);
  for (const action of actions) {
    row.append(actionButton(action.label, action.onClick));
  }
  return row;
}

function actionButton(label, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mini-action";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
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
