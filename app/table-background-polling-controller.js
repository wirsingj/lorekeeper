export const multiplayerPollingActions = Object.freeze({
  REFRESH_HOST_SNAPSHOT_DURING_GENERATION: "refresh_host_snapshot_during_generation",
  IDLE_DURING_GENERATION: "idle_during_generation",
  REFRESH_GUEST_SNAPSHOT: "refresh_guest_snapshot",
  REFRESH_WAITING_ROOM_STATUS: "refresh_waiting_room_status",
  REFRESH_GUEST_LOBBY_PREVIEW: "refresh_guest_lobby_preview",
  IDLE_CAMPAIGN_WIZARD_CREATING: "idle_campaign_wizard_creating",
  POLL_LOCAL_TABLE: "poll_local_table",
  IDLE: "idle",
});

export function buildMultiplayerPollingPlan({
  activeGeneration = false,
  guestWaitingRoomMode = false,
  localTableRunning = false,
  guestHostBaseUrl = "",
  guestConnectionId = "",
  waitingRoomGuestId = "",
  campaignWizardCreating = false,
} = {}) {
  if (activeGeneration) {
    return plan(
      !guestWaitingRoomMode && localTableRunning
        ? multiplayerPollingActions.REFRESH_HOST_SNAPSHOT_DURING_GENERATION
        : multiplayerPollingActions.IDLE_DURING_GENERATION,
    );
  }
  if (guestHostBaseUrl && guestConnectionId) {
    return plan(multiplayerPollingActions.REFRESH_GUEST_SNAPSHOT);
  }
  if (guestWaitingRoomMode && waitingRoomGuestId) {
    return plan(multiplayerPollingActions.REFRESH_WAITING_ROOM_STATUS);
  }
  if (guestWaitingRoomMode) {
    return plan(multiplayerPollingActions.REFRESH_GUEST_LOBBY_PREVIEW);
  }
  if (campaignWizardCreating) {
    return plan(multiplayerPollingActions.IDLE_CAMPAIGN_WIZARD_CREATING);
  }
  if (localTableRunning) {
    return plan(multiplayerPollingActions.POLL_LOCAL_TABLE);
  }
  return plan(multiplayerPollingActions.IDLE);
}

function plan(action) {
  return { action };
}
