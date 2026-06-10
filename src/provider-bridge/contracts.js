export const providerBridgeStates = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  SENDING: "sending",
  WAITING: "waiting",
  IMPORTING: "importing",
  FAILED: "failed",
});

export const providerCapabilities = Object.freeze({
  DETECT_TAB: "detect_tab",
  INSERT_PROMPT: "insert_prompt",
  SUBMIT_PROMPT: "submit_prompt",
  DETECT_GENERATION: "detect_generation",
  READ_RESPONSE: "read_response",
  MANUAL_COPY_IMPORT: "manual_copy_import",
});

export function createProviderAdapterDescriptor(overrides = {}) {
  return {
    id: overrides.id ?? "manual",
    label: overrides.label ?? "Manual Copy/Import",
    supportedHosts: overrides.supportedHosts ?? [],
    capabilities: overrides.capabilities ?? [providerCapabilities.MANUAL_COPY_IMPORT],
    safety: {
      requiresExplicitTabSelection: true,
      readsCredentials: false,
      accessesUnrelatedTabs: false,
      visibleAutomationOnly: true,
      ...(overrides.safety ?? {}),
    },
  };
}

export function createBridgeRun({ providerId, tabId, prompt }) {
  return {
    id: `bridge-run-${Date.now()}`,
    providerId,
    tabId,
    prompt,
    state: providerBridgeStates.IDLE,
    startedAt: null,
    completedAt: null,
    importedResponse: null,
    error: null,
  };
}

