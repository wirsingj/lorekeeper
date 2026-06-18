export const campaignChatFallbackReasons = Object.freeze({
  EXTENSION_UNAVAILABLE: "extension_unavailable",
  LOGIN_REQUIRED: "login_required",
  NO_RESPONSE: "no_response",
  RUN_FAILED: "run_failed",
});

export function buildCampaignChatFallbackPlan(reason) {
  switch (reason) {
    case campaignChatFallbackReasons.EXTENSION_UNAVAILABLE:
      return {
        copy: {
          successMessage: "Extension not connected; prompt copied",
          failureMessage: "Extension not connected; copy from DM Instructions",
        },
        bridgeMode: "manual",
        activityText: "Extension unavailable; prompt copied for manual paste",
        activityState: "error",
      };
    case campaignChatFallbackReasons.LOGIN_REQUIRED:
      return {
        copy: {
          successMessage: "ChatGPT needs login; prompt copied",
          failureMessage: "ChatGPT needs login; copy from DM Instructions",
        },
        bridgeMode: "extension",
        activityText: "ChatGPT needs login; prompt copied",
        activityState: "error",
      };
    case campaignChatFallbackReasons.NO_RESPONSE:
      return {
        copy: {
          successMessage: "Campaign chat did not return a response; prompt copied",
          failureMessage: "Campaign chat did not return a response; copy from DM Instructions",
        },
        bridgeMode: "extension",
        activityText: "No DM response returned; prompt copied",
        activityState: "error",
      };
    case campaignChatFallbackReasons.RUN_FAILED:
    default:
      return {
        copy: {
          successMessage: "Campaign chat failed; prompt copied",
          failureMessage: "Campaign chat failed; copy from DM Instructions",
        },
        bridgeMode: "manual",
        activityText: "Provider run failed; prompt copied for manual paste",
        activityState: "error",
      };
  }
}

export function buildCampaignChatProgressSteps() {
  return [
    {
      delayMs: 8000,
      bridgeStatus: "Waiting for ChatGPT response...",
      activityText: "Waiting on ChatGPT response...",
      activityState: "waiting",
    },
    {
      delayMs: 30000,
      bridgeStatus: "Still waiting on the campaign chat...",
      activityText: "Still waiting on ChatGPT...",
      activityState: "waiting",
    },
    {
      delayMs: 65000,
      bridgeStatus: "Campaign chat is taking a while; manual fallback remains available",
      activityText: "ChatGPT is taking a while; manual fallback is ready",
      activityState: "waiting",
    },
  ];
}
