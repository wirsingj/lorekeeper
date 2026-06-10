const MESSAGE_TYPE = "lorekeeper.chatgptCommand";

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== MESSAGE_TYPE) {
    return false;
  }

  return handleCommand(message.command, message.payload ?? {});
});

async function handleCommand(command, payload) {
  if (command === "status") {
    return getStatus();
  }

  if (command === "insertPrompt") {
    return insertPrompt(payload.prompt ?? "");
  }

  if (command === "readLatestResponse") {
    return readLatestResponse();
  }

  if (command === "sendPromptAndRead") {
    return sendPromptAndRead(payload.prompt ?? "", payload.timeoutMs ?? 90000);
  }

  throw new Error(`Unsupported ChatGPT bridge command: ${command}`);
}

function getStatus() {
  const input = findPromptInput();
  const assistantResponses = findAssistantResponses();

  return {
    provider: "chatgpt",
    supported: true,
    hasInput: Boolean(input),
    responseCount: assistantResponses.length,
    url: location.href,
    title: document.title,
  };
}

async function insertPrompt(prompt) {
  if (!prompt.trim()) {
    throw new Error("Prompt is empty.");
  }

  const input = findPromptInput();
  if (!input) {
    throw new Error("Could not find ChatGPT prompt input.");
  }

  input.focus();

  if (input.tagName === "TEXTAREA") {
    input.value = prompt;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
  } else {
    input.textContent = prompt;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: prompt }));
  }

  return {
    inserted: true,
    characters: prompt.length,
  };
}

async function sendPromptAndRead(prompt, timeoutMs) {
  await insertPrompt(prompt);
  const beforeText = readLatestResponse().text;
  clickSendButton();
  await waitForAssistantResponseChange(beforeText, timeoutMs);
  return readLatestResponse();
}

function readLatestResponse() {
  const responses = findAssistantResponses();
  const latest = responses.at(-1);

  if (!latest) {
    return {
      found: false,
      text: "",
    };
  }

  return {
    found: true,
    text: latest.innerText.trim(),
    characters: latest.innerText.trim().length,
  };
}

function clickSendButton() {
  const sendButton = findSendButton();
  if (!sendButton) {
    throw new Error("Could not find ChatGPT send button.");
  }

  if (sendButton.disabled || sendButton.getAttribute("aria-disabled") === "true") {
    throw new Error("ChatGPT send button is disabled.");
  }

  sendButton.click();
}

async function waitForAssistantResponseChange(beforeText, timeoutMs) {
  const startedAt = Date.now();
  let lastText = beforeText;
  let stableSince = null;

  while (Date.now() - startedAt < timeoutMs) {
    await delay(750);
    const latest = readLatestResponse();
    const text = latest.text ?? "";

    if (text && text !== beforeText && text !== lastText) {
      lastText = text;
      stableSince = Date.now();
      continue;
    }

    if (text && text !== beforeText && text === lastText) {
      stableSince ??= Date.now();
      if (Date.now() - stableSince > 1800 && !isGenerating()) {
        return;
      }
    }
  }

  throw new Error("Timed out waiting for ChatGPT response.");
}

function findSendButton() {
  const selectors = [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[aria-label*="Send"]',
  ];

  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (match) {
      return match;
    }
  }

  const buttons = [...document.querySelectorAll("button")];
  return buttons.find((button) => /send/i.test(button.getAttribute("aria-label") ?? button.textContent ?? ""));
}

function isGenerating() {
  return Boolean(
    document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('[aria-label*="Stop generating"]'),
  );
}

function findPromptInput() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]')
  );
}

function findAssistantResponses() {
  const candidates = [
    ...document.querySelectorAll('[data-message-author-role="assistant"]'),
    ...document.querySelectorAll(".markdown"),
  ];

  return candidates.filter((node) => node.innerText && node.innerText.trim().length > 0);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
