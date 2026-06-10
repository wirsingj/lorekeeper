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

