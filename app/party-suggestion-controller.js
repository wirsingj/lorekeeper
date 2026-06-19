const partySuggestionStatuses = new Set([
  "pending_party_approval",
  "approved_party_input",
  "rejected_party_input",
  "submitted_party_input",
]);

export function buildPartyApprovalProjection(message = {}, {
  providerAuthored = false,
  hidden = false,
} = {}) {
  if (message.role !== "party" || !providerAuthored || hidden) {
    return null;
  }
  const status = message.data?.status || "pending_party_approval";
  if (!partySuggestionStatuses.has(status)) {
    return null;
  }
  return { status };
}

export function buildPartyApprovalControlsProjection(approval = {}, { resolveGate = {} } = {}) {
  if (approval.status === "pending_party_approval") {
    return {
      statusLabel: "",
      canUndo: false,
      actions: [
        {
          kind: "approve",
          label: "Stage For DM",
          title: "Stage this companion beat for the next Send Turn",
          className: "mini-action message-approve-action",
          nextStatus: "approved_party_input",
        },
        {
          kind: "resolve",
          label: "Resolve Now",
          title: resolveGate.blocked
            ? resolveGate.activityText
            : "Send this companion beat to the DM now",
          className: "mini-action message-submit-action",
          disabled: Boolean(resolveGate.blocked),
        },
        {
          kind: "reject",
          label: "Pass",
          title: "Do not send this companion beat to the DM",
          className: "mini-action secondary-action",
          nextStatus: "rejected_party_input",
        },
      ],
    };
  }
  return {
    statusLabel: partySuggestionStatusLabel(approval.status),
    canUndo: approval.status === "approved_party_input" || approval.status === "rejected_party_input",
    actions: [],
  };
}

export function partySuggestionStatusMeta(status = "") {
  return {
    pending_party_approval: "Companion beat waiting for host",
    approved_party_input: "Staged for next Send Turn",
    rejected_party_input: "Passed by host",
    submitted_party_input: "Sent to DM",
  }[status] || "";
}

export function partySuggestionActivityForStatus(status = "") {
  if (status === "approved_party_input") {
    return {
      text: "Companion beat staged; add host text or press Send Turn when ready.",
      state: "waiting",
    };
  }
  return {
    text: partySuggestionStatusMeta(status) || "Companion beat updated",
    state: "idle",
  };
}

export function partySuggestionInputFromMessage(message = {}) {
  return {
    type: "approved_party_contribution",
    id: message.id,
    characterId: message.data?.characterId || "",
    characterName: message.data?.characterName || message.title || "",
    text: message.body || "",
    ready: true,
  };
}

function partySuggestionStatusLabel(status = "") {
  return {
    approved_party_input: "Staged for next Send Turn",
    rejected_party_input: "Passed",
    submitted_party_input: "Sent to DM",
  }[status] || status;
}
