const MESSAGE_TYPE = "lorekeeper.chatgptCommand";

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== MESSAGE_TYPE) {
    return false;
  }

  return handleCommand(message.command, message.payload ?? {});
});

async function handleCommand(command, payload) {
  if (command === "status") {
    return getStatus(payload);
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

function getStatus(settings = {}) {
  const input = findPromptInput();
  const assistantResponses = findAssistantResponses();
  const sendButton = input ? findSendButton(input) : null;
  const haystack = document.body.innerText.toLowerCase();

  return {
    provider: "chatgpt",
    supported: true,
    hasInput: Boolean(input),
    inputKind: input ? describeNode(input) : null,
    hasSendButton: Boolean(sendButton),
    sendButtonKind: sendButton ? describeNode(sendButton) : null,
    sendButtonDisabled: sendButton ? isDisabled(sendButton) : null,
    responseCount: assistantResponses.length,
    url: location.href,
    title: document.title,
    projectHint: settings.projectHint,
    conversationHint: settings.conversationHint,
    campaignTitle: settings.campaignTitle,
    campaignId: settings.campaignId,
    projectHintVisible: includesNeedle(haystack, settings.projectHint),
    conversationHintVisible: includesNeedle(haystack, settings.conversationHint),
    campaignTitleVisible: includesNeedle(haystack, settings.campaignTitle),
    campaignIdVisible: includesNeedle(haystack, settings.campaignId),
  };
}

function includesNeedle(haystack, needle) {
  return needle ? haystack.includes(String(needle).toLowerCase()) : null;
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
    setNativeTextareaValue(input, prompt);
  } else {
    setContentEditableValue(input, prompt);
  }

  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " ", code: "Space" }));
  await waitForComposerToAcceptText(input, prompt);

  return {
    inserted: true,
    characters: prompt.length,
    inputKind: describeNode(input),
  };
}

async function sendPromptAndRead(prompt, timeoutMs) {
  const insertResult = await insertPrompt(prompt);
  const beforeText = readLatestResponse().text;
  const input = findPromptInput();

  try {
    const submitResult = await submitPrompt();
    await waitForAssistantResponseChange(beforeText, timeoutMs);
    return {
      ...readLatestResponse(),
      inserted: insertResult,
      submit: submitResult,
      needsManualSubmit: false,
    };
  } catch (error) {
    const promptStillInComposer = readPromptInputText(input).includes(prompt.trim().slice(0, 80));
    if (promptStillInComposer) {
      return {
        found: false,
        text: "",
        characters: 0,
        inserted: insertResult,
        submit: null,
        needsManualSubmit: true,
        error: error instanceof Error ? error.message : "ChatGPT did not accept the automatic submit.",
      };
    }

    throw error;
  }
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

async function submitPrompt() {
  const input = findPromptInput();
  const sendButton = await waitForSendButton(input, 5000);

  if (sendButton && !isDisabled(sendButton)) {
    clickButtonLikeUser(sendButton);
    return {
      method: "button",
      button: describeNode(sendButton),
    };
  }

  const submittedByForm = submitComposerForm(input);
  if (submittedByForm) {
    return {
      method: "form",
    };
  }

  const submittedByEnter = pressEnterToSend(input);
  if (submittedByEnter) {
    return {
      method: "enter",
    };
  }

  if (!sendButton) {
    throw new Error("Could not find ChatGPT send button.");
  }

  throw new Error("ChatGPT send button is disabled.");
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
      if (Date.now() - stableSince > 4500 && !isGenerating() && !hasIncompleteLorekeeperJson(text)) {
        return;
      }
    }
  }

  throw new Error("Timed out waiting for ChatGPT response.");
}

async function waitForComposerToAcceptText(input, prompt) {
  const expectedStart = prompt.trim().slice(0, 80);
  const startedAt = Date.now();

  while (Date.now() - startedAt < 2500) {
    if (readPromptInputText(input).includes(expectedStart)) {
      return;
    }

    await delay(100);
  }
}

async function waitForSendButton(input, timeoutMs) {
  const startedAt = Date.now();
  let lastButton = null;

  while (Date.now() - startedAt < timeoutMs) {
    const button = findSendButton(input);
    if (button) {
      lastButton = button;
      if (!isDisabled(button)) {
        return button;
      }
    }

    await delay(150);
  }

  return lastButton;
}

function findSendButton(input = findPromptInput()) {
  const scopes = [
    findComposerScope(input),
    document,
  ].filter(Boolean);

  const selectors = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'button[data-testid*="send"]',
    'button[data-testid*="submit"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
    'button[aria-label*="Send"]',
    'button[type="submit"]',
  ];

  for (const scope of scopes) {
    for (const selector of selectors) {
      const matches = [...scope.querySelectorAll(selector)].filter(isVisible);
      const enabled = matches.find((button) => !isDisabled(button));
      if (enabled) {
        return enabled;
      }

      if (matches[0]) {
        return matches[0];
      }
    }
  }

  const buttons = [...(findComposerScope(input) ?? document).querySelectorAll("button")].filter(isVisible);
  return (
    buttons.find((button) => /send|submit/i.test(button.getAttribute("aria-label") ?? button.textContent ?? "")) ??
    buttons.find((button) => button.querySelector("svg") && button.type === "submit") ??
    findLikelyComposerSendButton(input, buttons)
  );
}

function findLikelyComposerSendButton(input, buttons) {
  if (!input || buttons.length === 0) {
    return null;
  }

  const inputRect = input.getBoundingClientRect();
  const nearbyButtons = buttons
    .map((button) => ({
      button,
      rect: button.getBoundingClientRect(),
      label: `${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`.toLowerCase(),
    }))
    .filter(({ button, rect, label }) => {
      if (!button.querySelector("svg")) {
        return false;
      }

      if (/attach|file|voice|dictate|microphone|apps|tools|stop/i.test(label)) {
        return false;
      }

      const horizontallyNearInput = rect.left >= inputRect.left - 20 && rect.left <= inputRect.right + 120;
      const verticallyNearInput = rect.top >= inputRect.top - 80 && rect.top <= inputRect.bottom + 80;
      return horizontallyNearInput && verticallyNearInput;
    })
    .sort((a, b) => b.rect.right + b.rect.bottom - (a.rect.right + a.rect.bottom));

  return nearbyButtons[0]?.button ?? null;
}

function clickButtonLikeUser(button) {
  button.focus();
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    button.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
      }),
    );
  }
}

function isGenerating() {
  return Boolean(
    document.querySelector('button[aria-label*="Stop"]') ||
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('[aria-label*="Stop generating"]'),
  );
}

function hasIncompleteLorekeeperJson(text) {
  const markerIndex = text.indexOf('"proposedChanges"');
  if (markerIndex === -1) {
    return false;
  }

  const objectStart = text.lastIndexOf("{", markerIndex);
  if (objectStart === -1) {
    return false;
  }

  return findBalancedObjectEnd(text, objectStart) === -1;
}

function findBalancedObjectEnd(text, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findPromptInput() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('[data-testid="prompt-textarea"]') ||
    document.querySelector('[contenteditable="true"][role="textbox"]') ||
    document.querySelector("textarea") ||
    document.querySelector('[contenteditable="true"]')
  );
}

function findComposerScope(input) {
  return (
    input?.closest("form") ||
    input?.closest('[data-testid="composer-root"]') ||
    input?.closest('[data-testid*="composer"]') ||
    input?.closest("main") ||
    null
  );
}

function submitComposerForm(input) {
  const form = input?.closest("form");
  if (!form) {
    return false;
  }

  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
  } else {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  }

  return true;
}

function pressEnterToSend(input) {
  if (!input) {
    return false;
  }

  input.focus();
  for (const type of ["keydown", "keypress", "keyup"]) {
    input.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        code: "Enter",
        which: 13,
        keyCode: 13,
      }),
    );
  }

  return true;
}

function setNativeTextareaValue(textarea, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

function setContentEditableValue(input, value) {
  input.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection.removeAllRanges();
  selection.addRange(range);

  const inserted = document.execCommand?.("insertText", false, value);
  if (!inserted) {
    input.textContent = value;
  }

  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
}

function readPromptInputText(input) {
  if (!input) {
    return "";
  }

  return input.value ?? input.innerText ?? input.textContent ?? "";
}

function isDisabled(button) {
  return (
    button.disabled ||
    button.getAttribute("aria-disabled") === "true" ||
    button.dataset.disabled === "true" ||
    button.closest("[inert]")
  );
}

function isVisible(node) {
  const rect = node.getBoundingClientRect();
  const style = window.getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function describeNode(node) {
  return {
    tagName: node.tagName,
    id: node.id || null,
    testId: node.getAttribute("data-testid"),
    ariaLabel: node.getAttribute("aria-label"),
    type: node.getAttribute("type"),
  };
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
