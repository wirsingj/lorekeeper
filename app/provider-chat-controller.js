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
          successMessage: "ChatGPT helper not connected; prompt copied",
          failureMessage: "ChatGPT helper not connected; copy from DM Instructions",
        },
        bridgeMode: "manual",
        activityText: "ChatGPT helper unavailable; prompt copied for handoff",
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
          successMessage: "ChatGPT DM did not return a response; prompt copied",
          failureMessage: "ChatGPT DM did not return a response; copy from DM Instructions",
        },
        bridgeMode: "extension",
        activityText: "No DM response returned; prompt copied",
        activityState: "error",
      };
    case campaignChatFallbackReasons.RUN_FAILED:
    default:
      return {
        copy: {
          successMessage: "ChatGPT DM failed; prompt copied",
          failureMessage: "ChatGPT DM failed; copy from DM Instructions",
        },
        bridgeMode: "manual",
        activityText: "ChatGPT DM failed; prompt copied for handoff",
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
      bridgeStatus: "Still waiting on the DM Voice chat...",
      activityText: "Still waiting on ChatGPT...",
      activityState: "waiting",
    },
    {
      delayMs: 65000,
      bridgeStatus: "DM Voice chat is taking a while; you can keep waiting or start a new DM chat",
      activityText: "ChatGPT is taking a while; you can keep waiting or start a new DM chat",
      activityState: "waiting",
    },
  ];
}
