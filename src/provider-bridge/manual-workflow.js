import { createProviderAdapterDescriptor } from "./contracts.js";

export const manualProviderAdapter = createProviderAdapterDescriptor({
  id: "manual-copy-import",
  label: "Manual Copy/Import",
});

export function createManualWorkflow(prompt) {
  return {
    adapterId: manualProviderAdapter.id,
    steps: [
      {
        id: "copy_prompt",
        label: "Copy prompt",
        detail: "Copy the LoreKeeper prompt and paste it into the chosen provider chat.",
      },
      {
        id: "send_in_provider",
        label: "Send in provider",
        detail: "Submit the prompt in the visible provider UI using the user's logged-in session.",
      },
      {
        id: "copy_response",
        label: "Copy response",
        detail: "Copy the latest assistant response after generation completes.",
      },
      {
        id: "import_response",
        label: "Import response",
        detail: "Paste or import the response into LoreKeeper for proposed canon updates.",
      },
    ],
    prompt,
  };
}
