const providerTabs = document.querySelector("#provider-tabs");
const providerStatus = document.querySelector("#provider-status");
const refreshTabs = document.querySelector("#refresh-tabs");
const promptInput = document.querySelector("#prompt-input");
const responseOutput = document.querySelector("#response-output");
const insertPrompt = document.querySelector("#insert-prompt");
const sendPrompt = document.querySelector("#send-prompt");
const copyPrompt = document.querySelector("#copy-prompt");
const readResponse = document.querySelector("#read-response");

refreshTabs.addEventListener("click", refreshProviderTabs);
providerTabs.addEventListener("change", checkSelectedTab);
insertPrompt.addEventListener("click", insertPromptIntoProvider);
sendPrompt.addEventListener("click", sendPromptToProvider);
copyPrompt.addEventListener("click", copyPromptToClipboard);
readResponse.addEventListener("click", readLatestProviderResponse);

refreshProviderTabs();

async function refreshProviderTabs() {
  setStatus("Looking for ChatGPT tabs...");
  const tabs = await browser.runtime.sendMessage({ type: "lorekeeper.findProviderTabs" });
  providerTabs.replaceChildren();

  if (!tabs.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No ChatGPT tabs found";
    providerTabs.append(option);
    setStatus("Open ChatGPT in Firefox, log in, then refresh.");
    return;
  }

  for (const tab of tabs) {
    const option = document.createElement("option");
    option.value = String(tab.id);
    option.textContent = tab.title || tab.url;
    providerTabs.append(option);
  }

  setStatus(`Found ${tabs.length} ChatGPT tab${tabs.length === 1 ? "" : "s"}.`);
  await checkSelectedTab();
}

async function checkSelectedTab() {
  const tabId = selectedTabId();
  if (!tabId) {
    return;
  }

  try {
    const status = await providerCommand("status");
    setStatus(status.hasInput ? "ChatGPT tab ready." : "ChatGPT tab found, but no prompt input detected.");
  } catch (error) {
    setStatus(`Could not reach content script: ${error.message}`);
  }
}

async function insertPromptIntoProvider() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus("Prompt is empty.");
    return;
  }

  try {
    const result = await providerCommand("insertPrompt", { prompt });
    setStatus(`Inserted ${result.characters} characters into ChatGPT. Review, then submit in ChatGPT.`);
  } catch (error) {
    setStatus(`Insert failed: ${error.message}`);
  }
}

async function sendPromptToProvider() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus("Prompt is empty.");
    return;
  }

  try {
    setStatus("Sending prompt to ChatGPT...");
    const result = await providerCommand("sendPromptAndRead", {
      prompt,
      timeoutMs: 90000,
    });
    responseOutput.value = result.text ?? "";
    setStatus(result.found ? `Imported ${result.characters} response characters.` : "Sent, but no response was found.");
  } catch (error) {
    setStatus(`Send failed: ${error.message}`);
  }
}


async function copyPromptToClipboard() {
  await navigator.clipboard.writeText(promptInput.value);
  setStatus("Prompt copied.");
}

async function readLatestProviderResponse() {
  try {
    const result = await providerCommand("readLatestResponse");
    responseOutput.value = result.text ?? "";
    setStatus(result.found ? `Read ${result.characters} response characters.` : "No assistant response found yet.");
  } catch (error) {
    setStatus(`Read failed: ${error.message}`);
  }
}

function providerCommand(command, payload = {}) {
  return browser.runtime.sendMessage({
    type: "lorekeeper.providerCommand",
    tabId: selectedTabId(),
    command,
    payload,
  });
}

function selectedTabId() {
  const value = providerTabs.value;
  return value ? Number(value) : null;
}

function setStatus(message) {
  providerStatus.textContent = message;
}
