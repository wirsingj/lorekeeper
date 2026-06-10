const APP_REQUEST_TYPE = "lorekeeper.appBridge.request";
const APP_RESPONSE_TYPE = "lorekeeper.appBridge.response";

window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.type !== APP_REQUEST_TYPE) {
    return;
  }

  const { requestId, message } = event.data;

  try {
    const result = await browser.runtime.sendMessage(message);
    window.postMessage(
      {
        type: APP_RESPONSE_TYPE,
        requestId,
        ok: true,
        result,
      },
      window.location.origin,
    );
  } catch (error) {
    window.postMessage(
      {
        type: APP_RESPONSE_TYPE,
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "Extension bridge failed.",
      },
      window.location.origin,
    );
  }
});
