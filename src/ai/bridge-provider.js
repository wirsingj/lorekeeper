export class BridgeProvider {
  constructor(options = {}) {
    this.id = "bridge";
    this.label = options.label ?? "Browser Bridge";
    this.capabilities = {
      streaming: false,
      cancellation: "limited",
      local: false,
      requiresExtension: true,
    };
  }

  getStatus({ bridgeReady = false } = {}) {
    return {
      providerId: this.id,
      label: this.label,
      running: bridgeReady,
      state: bridgeReady ? "ready" : "bridge_unavailable",
      message: bridgeReady
        ? "Browser bridge is available."
        : "Browser bridge requires the Firefox extension and a saved provider chat.",
      capabilities: this.capabilities,
    };
  }
}
