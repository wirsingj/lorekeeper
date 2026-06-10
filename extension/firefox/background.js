const providerHosts = new Set(["chatgpt.com", "chat.openai.com"]);
const companionStorageKey = "lorekeeper.chatgptCompanion";
const defaultCompanion = Object.freeze({
  providerId: "chatgpt",
  projectHint: "LoreKeeper",
  projectUrl: "https://chatgpt.com/",
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.type === "lorekeeper.findProviderTabs") {
    return findProviderTabs();
  }

  if (message.type === "lorekeeper.providerCommand") {
    return sendProviderCommand(message.tabId, message.command, message.payload);
  }

  if (message.type === "lorekeeper.saveCompanionSession") {
    return saveCompanionSession(message.tabId, message.options ?? {});
  }

  if (message.type === "lorekeeper.getCompanionSession") {
    return getCompanionSession(message.options ?? {});
  }

  if (message.type === "lorekeeper.ensureCompanionSession") {
    return ensureCompanionSession(message.options ?? {}, sender);
  }

  if (message.type === "lorekeeper.runCompanionPrompt") {
    return runCompanionPrompt(message.prompt ?? "", message.options ?? {}, sender);
  }

  return null;
});

async function findProviderTabs() {
  const tabs = await browser.tabs.query({});
  const settings = await getCompanionSettings();

  return tabs
    .filter((tab) => isSupportedProviderUrl(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
      companionScore: scoreCompanionTab(tab, settings),
    }));
}

async function sendProviderCommand(tabId, command, payload = {}) {
  if (!tabId) {
    throw new Error("No provider tab selected.");
  }

  return browser.tabs.sendMessage(tabId, {
    type: "lorekeeper.chatgptCommand",
    command,
    payload,
  });
}

async function saveCompanionSession(tabId, options = {}) {
  if (!tabId) {
    throw new Error("No provider tab selected.");
  }

  const tab = await browser.tabs.get(tabId);
  if (!isSupportedProviderUrl(tab.url)) {
    throw new Error("Selected tab is not a supported ChatGPT tab.");
  }

  const settings = mergeCompanionSettings({
    ...options,
    projectUrl: options.projectUrl || tab.url,
  });
  const companion = {
    ...settings,
    tabId,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title,
    savedAt: new Date().toISOString(),
  };

  await browser.storage.local.set({ [companionStorageKey]: companion });
  return companion;
}

async function getCompanionSession(options = {}) {
  const settings = await getCompanionSettings(options);
  const tab = await findBestCompanionTab(settings);

  if (!tab) {
    return {
      found: false,
      ready: false,
      settings,
    };
  }

  const status = await safeProviderStatus(tab.id, settings.projectHint);
  return {
    found: true,
    ready: Boolean(status?.hasInput),
    loginRequired: Boolean(status && !status.hasInput),
    tab: serializeTab(tab, settings),
    status,
    settings,
  };
}

async function ensureCompanionSession(options = {}, sender) {
  const settings = await getCompanionSettings(options);
  const existing = await findBestCompanionTab(settings);

  if (existing) {
    const status = await waitForProviderStatus(existing.id, settings.projectHint, options.readyTimeoutMs ?? 6000);
    return {
      found: true,
      created: false,
      ready: Boolean(status?.hasInput),
      loginRequired: Boolean(status && !status.hasInput),
      tab: serializeTab(existing, settings),
      status,
      settings,
    };
  }

  const callerTab = sender?.tab;
  const tab = await browser.tabs.create({
    url: settings.projectUrl,
    active: true,
  });

  await browser.storage.local.set({
    [companionStorageKey]: {
      ...settings,
      tabId: tab.id,
      windowId: tab.windowId,
      url: settings.projectUrl,
      title: "ChatGPT LoreKeeper companion",
      savedAt: new Date().toISOString(),
    },
  });

  const status = await waitForProviderStatus(tab.id, settings.projectHint, options.readyTimeoutMs ?? 30000);
  const ready = Boolean(status?.hasInput);

  if (ready && options.returnToCaller !== false) {
    await returnToCallerTab(callerTab);
  }

  return {
    found: true,
    created: true,
    ready,
    loginRequired: !ready,
    tab: serializeTab(tab, settings),
    status,
    settings,
  };
}

async function runCompanionPrompt(prompt, options = {}, sender) {
  if (!prompt.trim()) {
    throw new Error("Prompt is empty.");
  }

  const companion = await ensureCompanionSession(
    {
      ...options,
      returnToCaller: false,
    },
    sender,
  );

  if (!companion.ready) {
    return {
      ...companion,
      sent: false,
      response: null,
      message: "ChatGPT is open, but the prompt input is not ready. Log in or open the LoreKeeper project, then retry.",
    };
  }

  const response = await sendProviderCommand(companion.tab.id, "sendPromptAndRead", {
    prompt,
    timeoutMs: options.responseTimeoutMs ?? 90000,
  });

  if (options.returnToCaller !== false) {
    await returnToCallerTab(sender?.tab);
  }

  return {
    ...companion,
    sent: true,
    response,
  };
}

async function getCompanionSettings(overrides = {}) {
  const stored = await browser.storage.local.get(companionStorageKey);
  return mergeCompanionSettings({
    ...(stored[companionStorageKey] ?? {}),
    ...withoutEmptyOverrides(overrides),
  });
}

function mergeCompanionSettings(overrides = {}) {
  return {
    ...defaultCompanion,
    ...overrides,
    projectHint: overrides.projectHint || defaultCompanion.projectHint,
    projectUrl: normalizeProjectUrl(overrides.projectUrl || defaultCompanion.projectUrl),
  };
}

function withoutEmptyOverrides(overrides) {
  return Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

async function findBestCompanionTab(settings) {
  if (settings.tabId) {
    try {
      const tab = await browser.tabs.get(settings.tabId);
      if (isSupportedProviderUrl(tab.url)) {
        return tab;
      }
    } catch {
      // Stored tab went away; fall through to discovery.
    }
  }

  const tabs = (await browser.tabs.query({})).filter((tab) => isSupportedProviderUrl(tab.url));
  return tabs.sort((a, b) => scoreCompanionTab(b, settings) - scoreCompanionTab(a, settings))[0] ?? null;
}

function scoreCompanionTab(tab, settings) {
  let score = 0;
  const haystack = `${tab.title ?? ""} ${tab.url ?? ""}`.toLowerCase();
  const projectHint = (settings.projectHint ?? "").toLowerCase();
  const projectUrl = normalizeProjectUrl(settings.projectUrl ?? "");

  if (settings.tabId && tab.id === settings.tabId) {
    score += 100;
  }

  if (projectUrl && tab.url?.startsWith(projectUrl)) {
    score += 40;
  }

  if (projectHint && haystack.includes(projectHint)) {
    score += 25;
  }

  if (tab.active) {
    score += 2;
  }

  return score;
}

async function safeProviderStatus(tabId, projectHint) {
  try {
    return await sendProviderCommand(tabId, "status", { projectHint });
  } catch {
    return null;
  }
}

async function waitForProviderStatus(tabId, projectHint, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await safeProviderStatus(tabId, projectHint);
    if (status?.hasInput) {
      return status;
    }

    if (status && !status.hasInput) {
      return status;
    }

    await delay(750);
  }

  return safeProviderStatus(tabId, projectHint);
}

async function returnToCallerTab(tab) {
  if (!tab?.id) {
    return;
  }

  try {
    await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.update(tab.id, { active: true });
  } catch {
    // Returning focus is nice-to-have; the provider run result is more important.
  }
}

function serializeTab(tab, settings) {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    active: tab.active,
    windowId: tab.windowId,
    companionScore: scoreCompanionTab(tab, settings),
  };
}

function normalizeProjectUrl(url) {
  if (!url) {
    return defaultCompanion.projectUrl;
  }

  try {
    return new URL(url).href;
  } catch {
    return defaultCompanion.projectUrl;
  }
}

function isSupportedProviderUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return providerHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
