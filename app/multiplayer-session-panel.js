export function buildMultiplayerSessionProjection({
  campaign,
  clientMode = false,
  guestSession = null,
  guestSnapshot = null,
  hostSnapshot = null,
  locationPort = "",
} = {}) {
  const multiplayer = !clientMode && hostSnapshot?.localTable ? hostSnapshot : campaign?.multiplayer ?? {};
  const table = multiplayer.localTable ?? {};
  if (clientMode) {
    return {
      mode: "guest",
      localTableState: "Joined",
      localTableAddress: guestSession?.hostBaseUrl
        ? `${guestSession.status === "connected" ? "Connected" : "Waiting"}: ${guestSession.hostBaseUrl}`
        : "Open a guest page or invite link to join.",
      canStartLocalTable: false,
      canStopLocalTable: false,
      canCopyGuestLink: false,
      canSyncGuestTable: Boolean(guestSession?.hostBaseUrl),
      canResolvePartyInputs: false,
      guestLink: "",
      flowSummary: guestSession?.hostBaseUrl
        ? "Your action goes to the table first. The host sends it to the DM."
        : "Open a guest page or invite link to join a table.",
      resolvePartyInputsLabel: "Send Actions",
      requireGuestActionApproval: false,
      holdGuestActionsForGroupInput: false,
      connectedGuests: [],
      waitingGuests: [],
      pendingInputs: guestSnapshot?.pendingInput ? [decoratePendingInput(guestSnapshot.pendingInput, { mode: "guest" })] : [],
    };
  }

  const pendingInputs = multiplayer.pendingTurnInputs ?? [];
  const readyInputs = pendingInputs.filter((input) => input.ready && !input.passed && input.text);
  const settings = {
    requireGuestActionApproval: Boolean(multiplayer.settings?.requireGuestActionApproval),
    holdGuestActionsForGroupInput: Boolean(multiplayer.settings?.holdGuestActionsForGroupInput),
  };
  const guestLink = localGuestLink(table, locationPort, { campaignId: multiplayer.campaignId || campaign?.id || "" });
  return {
    mode: "host",
    localTableState: table.running ? "On" : "Off",
    localTableAddress: table.running
      ? `LAN: ${table.lanAddress || "127.0.0.1"}:${table.port || locationPort}`
      : "Open the guest page when a friend is joining.",
    canStartLocalTable: true,
    canStopLocalTable: Boolean(table.running),
    canCopyGuestLink: Boolean(guestLink),
    canSyncGuestTable: false,
    canResolvePartyInputs: readyInputs.length > 0,
    guestLink,
    flowSummary: hostFlowSummary({ table, settings, pendingInputs }),
    resolvePartyInputsLabel: resolvePartyInputsLabel({ readyInputs, settings }),
    requireGuestActionApproval: settings.requireGuestActionApproval,
    holdGuestActionsForGroupInput: settings.holdGuestActionsForGroupInput,
    party: campaign?.party ?? [],
    connectedGuests: multiplayer.connections ?? [],
    waitingGuests: multiplayer.waitingGuests ?? [],
    pendingInputs: pendingInputs.map((input) => decoratePendingInput(input, { settings })),
  };
}

export function renderMultiplayerSessionPanel({
  elements,
  projection,
  labelById,
  seatWaitingGuest,
  approveGuest,
  denyGuest,
}) {
  elements.localTableState.textContent = projection.localTableState;
  elements.localTableAddress.textContent = projection.localTableAddress;
  if (elements.localTableGuidance) {
    elements.localTableGuidance.textContent = projection.flowSummary;
  }
  if (elements.localTableGuestLink) {
    elements.localTableGuestLink.value = projection.guestLink || "";
    elements.localTableGuestLink.placeholder = projection.guestLink
      ? ""
      : "Open the guest page to get a share link.";
  }
  elements.startLocalTable.disabled = !projection.canStartLocalTable;
  elements.stopLocalTable.disabled = !projection.canStopLocalTable;
  if (elements.copyGuestLink) {
    elements.copyGuestLink.disabled = !projection.canCopyGuestLink && projection.mode !== "host";
  }
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
  elements.resolvePartyInputs.textContent = projection.resolvePartyInputsLabel || "Send Actions";
  renderWaitingGuests(elements.waitingGuests, projection.waitingGuests, { party: projection.party ?? [], seatWaitingGuest });
  renderConnectedGuests(elements.connectedGuests, projection.connectedGuests, { labelById, approveGuest, denyGuest });
  renderPendingInputs(elements.pendingInputs, projection.pendingInputs);
}

function localGuestLink(table = {}, locationPort = "", { campaignId = "" } = {}) {
  if (!table.running) {
    return "";
  }
  const host = table.lanAddress || "127.0.0.1";
  const port = table.port || locationPort;
  return port ? `http://${host}:${port}/guest` : `http://${host}/guest`;
}

function renderWaitingGuests(container, waitingGuests = [], { party = [], seatWaitingGuest } = {}) {
  if (!container) {
    return;
  }
  const openParty = party.filter((member) =>
    member.controllerKind !== "remote_player" &&
    member.controllerKind !== "host"
  );
  container.replaceChildren(
    ...emptyOrRows(
      waitingGuests.map((guest) => {
        const preferred = guest.preferredPartyMemberId
          ? openParty.find((member) => member.id === guest.preferredPartyMemberId)
          : null;
        const orderedParty = preferred
          ? [preferred, ...openParty.filter((member) => member.id !== preferred.id)]
          : openParty;
        return localTableRow({
          title: guest.displayName || "Guest",
          subtitle: preferred ? `requested ${preferred.name}` : "waiting for a character seat",
          actions: orderedParty.slice(0, 3).map((member) => ({
            label: `Seat as ${member.name}`,
            onClick: () => seatWaitingGuest?.(guest.id, member.id),
          })),
        });
      }),
      "No friends waiting for seats.",
    ),
  );
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
      "No friends connected.",
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
    `${connection.status} / wants a seat as ${proposal.name}`,
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
    return "Open the guest page when someone is joining from LoreKeeper.";
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
      ? `${namedCount} waiting for your review before the DM sees ${readyCount === 1 ? "it" : "them"}.`
      : "Friend actions wait for your review before the DM sees them.";
  }
  if (settings.holdGuestActionsForGroupInput) {
    return readyCount
      ? `${namedCount} held for the group turn.`
      : "Friend actions collect here until you send a group turn.";
  }
  return readyCount
    ? `${namedCount} queued and ready; LoreKeeper resolves ${readyCount === 1 ? "that action" : "those actions"} when the DM is idle.`
    : "Friend actions resolve one at a time when the DM is idle.";
}

function resolvePartyInputsLabel({ readyInputs = [], settings = {} } = {}) {
  if (!readyInputs.length) {
    return settings.holdGuestActionsForGroupInput ? "Send Group Turn" : "Send Actions";
  }
  if (settings.requireGuestActionApproval) {
    return readyInputs.length === 1 ? "Send To DM" : `Send ${readyInputs.length} To DM`;
  }
  if (settings.holdGuestActionsForGroupInput) {
    return readyInputs.length === 1 ? "Send Group Turn" : `Send ${readyInputs.length} Actions`;
  }
  return readyInputs.length === 1 ? "Send Friend Action" : `Send ${readyInputs.length} Actions`;
}

function decoratePendingInput(input = {}, { settings = {}, mode = "host" } = {}) {
  const text = input.text || "not ready";
  if (input.passed) {
    return { ...input, statusLabel: "Passed this turn." };
  }
  if (mode === "guest" && input.text) {
    return { ...input, statusLabel: `Sent to the table; waiting to be resolved: ${text}` };
  }
  if (!input.ready || !input.text) {
    return { ...input, statusLabel: "Not ready yet." };
  }
  if (settings.requireGuestActionApproval) {
    return { ...input, statusLabel: `Waiting for host review: ${text}` };
  }
  if (settings.holdGuestActionsForGroupInput) {
    return { ...input, statusLabel: `Held for the group turn: ${text}` };
  }
  return { ...input, statusLabel: `Friend action queued for the DM: ${text}` };
}

function localTableRow({ title, subtitle, actions = [] }) {
  const row = document.createElement("div");
  row.className = "local-table-row";
  const text = document.createElement("span");
  text.textContent = `${title}: ${subtitle}`;
  text.title = `${title}: ${subtitle}`;
  row.append(text);
  if (actions.length) {
    const actionRow = document.createElement("div");
    actionRow.className = "local-table-row-actions";
    for (const action of actions) {
      actionRow.append(actionButton(action.label, action.onClick));
    }
    row.append(actionRow);
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
