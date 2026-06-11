const providerHosts = new Set(["chatgpt.com", "chat.openai.com"]);
const appHosts = new Set(["localhost", "127.0.0.1"]);
const legacyCompanionStorageKey = "lorekeeper.chatgptCompanion";
const companionStoragePrefix = "lorekeeper.providerConversation";
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
    return findProviderTabs(message.options ?? {});
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

  if (message.type === "lorekeeper.openSidebar") {
    return openLorekeeperSidebar(sender);
  }

  return null;
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  syncSidebarForTab(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    syncSidebarForTab(tabId);
  }
});

browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    return;
  }

  const [tab] = await browser.tabs.query({ active: true, windowId });
  if (tab?.id) {
    syncSidebarForTab(tab.id);
  }
});

async function findProviderTabs(options = {}) {
  const tabs = await browser.tabs.query({});
  const settings = await getCompanionSettings(options);

  return tabs
    .filter((tab) => isSupportedProviderUrl(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
      companionScore: scoreCompanionTab(tab, settings),
      conversationHint: settings.conversationHint,
      campaignId: settings.campaignId,
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

  await browser.storage.local.set({ [settings.storageKey]: companion });
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

  const status = await safeProviderStatus(tab.id, settings);
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
    if (options.focusProvider) {
      await focusProviderTab(existing);
    }

    const status = await waitForProviderStatus(existing.id, settings, options.readyTimeoutMs ?? 6000);
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
  const projectUrl = await resolveProjectUrl(settings);
  const tab = await browser.tabs.create({
    url: projectUrl,
    active: true,
  });

  await browser.storage.local.set({
    [settings.storageKey]: {
      ...settings,
      tabId: tab.id,
      windowId: tab.windowId,
      url: projectUrl,
      projectUrl,
      title: `ChatGPT ${settings.conversationHint || "LoreKeeper"} conversation`,
      savedAt: new Date().toISOString(),
    },
  });

  const status = await waitForProviderStatus(tab.id, settings, options.readyTimeoutMs ?? 30000);
  const ready = Boolean(status?.hasInput);

  if (ready && options.returnToCaller !== false && !options.focusProvider) {
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
  const requested = withoutEmptyOverrides(overrides);
  const storageKey = companionStorageKeyFor(requested);
  const stored = await browser.storage.local.get([storageKey, legacyCompanionStorageKey]);
  const storedSettings = stored[storageKey] ?? (requested.campaignId ? {} : stored[legacyCompanionStorageKey] ?? {});
  return mergeCompanionSettings({
    ...storedSettings,
    ...requested,
    storageKey,
  });
}

function mergeCompanionSettings(overrides = {}) {
  const providerId = overrides.providerId || defaultCompanion.providerId;
  const campaignId = overrides.campaignId || "";
  const providerConversationId = overrides.providerConversationId || "";
  return {
    ...defaultCompanion,
    ...overrides,
    providerId,
    campaignId,
    providerConversationId,
    campaignTitle: overrides.campaignTitle || "",
    conversationHint: overrides.conversationHint || overrides.campaignTitle || "",
    storageKey: overrides.storageKey || companionStorageKeyFor({ providerId, campaignId, providerConversationId }),
    projectHint: overrides.projectHint || defaultCompanion.projectHint,
    projectUrl: normalizeProjectUrl(overrides.projectUrl || defaultCompanion.projectUrl),
  };
}

function companionStorageKeyFor(options = {}) {
  const providerId = sanitizeStorageSegment(options.providerId || defaultCompanion.providerId);
  const campaignId = sanitizeStorageSegment(options.campaignId || "");
  const providerConversationId = sanitizeStorageSegment(options.providerConversationId || "");

  if (!campaignId) {
    return legacyCompanionStorageKey;
  }

  return [companionStoragePrefix, providerId, campaignId, providerConversationId || "active"].join(".");
}

function sanitizeStorageSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
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
  const scored = await Promise.all(
    tabs.map(async (tab) => ({
      tab,
      score: scoreCompanionTab(tab, settings) + scoreProviderStatus(await safeProviderStatus(tab.id, settings), settings),
    })),
  );

  const best = scored.sort((a, b) => b.score - a.score)[0];
  const minimumScore = settings.campaignId ? 20 : 1;
  return best && best.score >= minimumScore ? best.tab : null;
}

async function resolveProjectUrl(settings) {
  if (settings.projectUrl && settings.projectUrl !== defaultCompanion.projectUrl) {
    return settings.projectUrl;
  }

  const tabs = (await browser.tabs.query({})).filter((tab) => isSupportedProviderUrl(tab.url));
  for (const tab of tabs) {
    const status = await safeProviderStatus(tab.id, settings);
    if (status?.projectHintVisible) {
      const projectUrl = deriveProjectRootUrl(tab.url);
      if (projectUrl) {
        return projectUrl;
      }
    }
  }

  return settings.projectUrl || defaultCompanion.projectUrl;
}

function deriveProjectRootUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/g\/([^/]+)/);
    if (!match) {
      return null;
    }

    return `${parsed.origin}/g/${match[1]}`;
  } catch {
    return null;
  }
}

function scoreCompanionTab(tab, settings) {
  let score = 0;
  const haystack = `${tab.title ?? ""} ${tab.url ?? ""}`.toLowerCase();
  const projectHint = (settings.projectHint ?? "").toLowerCase();
  const conversationHint = (settings.conversationHint ?? "").toLowerCase();
  const campaignTitle = (settings.campaignTitle ?? "").toLowerCase();
  const campaignId = (settings.campaignId ?? "").toLowerCase();
  const projectUrl = normalizeProjectUrl(settings.projectUrl ?? "");

  if (settings.tabId && tab.id === settings.tabId) {
    score += 100;
  }

  if (projectUrl && projectUrl !== defaultCompanion.projectUrl && tab.url?.startsWith(projectUrl)) {
    score += 40;
  }

  if (projectHint && haystack.includes(projectHint)) {
    score += 25;
  }

  if (conversationHint && haystack.includes(conversationHint)) {
    score += 35;
  }

  if (campaignTitle && haystack.includes(campaignTitle)) {
    score += 25;
  }

  if (campaignId && haystack.includes(campaignId)) {
    score += 20;
  }

  if (tab.active) {
    score += 2;
  }

  return score;
}

function scoreProviderStatus(status, settings) {
  if (!status) {
    return 0;
  }

  let score = 0;
  if (status.projectHintVisible) {
    score += settings.campaignId ? 0 : 12;
  }
  if (status.conversationHintVisible) {
    score += 30;
  }
  if (status.campaignTitleVisible) {
    score += 18;
  }
  if (status.campaignIdVisible) {
    score += 16;
  }
  if (status.url && settings.projectUrl && status.url.startsWith(settings.projectUrl)) {
    score += 8;
  }
  return score;
}

async function safeProviderStatus(tabId, settings) {
  try {
    return await sendProviderCommand(tabId, "status", settings);
  } catch {
    return null;
  }
}

async function waitForProviderStatus(tabId, settings, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const status = await safeProviderStatus(tabId, settings);
    if (status?.hasInput) {
      return status;
    }

    if (status && !status.hasInput) {
      return status;
    }

    await delay(750);
  }

  return safeProviderStatus(tabId, settings);
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

async function focusProviderTab(tab) {
  if (!tab?.id) {
    return;
  }

  try {
    await browser.windows.update(tab.windowId, { focused: true });
    await browser.tabs.update(tab.id, { active: true });
  } catch {
    // Focusing the provider is a convenience; status reporting still matters.
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

async function syncSidebarForTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (isLorekeeperAppUrl(tab.url)) {
      await browser.sidebarAction.setPanel({
        tabId,
        panel: "sidebar/sidebar.html",
      });
      return;
    }

    if (browser.sidebarAction.close) {
      await browser.sidebarAction.close();
    }
  } catch {
    // Sidebar close behavior varies by Firefox version and user gesture state.
  }
}

async function openLorekeeperSidebar(sender) {
  const tab = sender?.tab;
  if (!tab?.id || !isLorekeeperAppUrl(tab.url)) {
    return {
      opened: false,
      reason: "Open Lorekeeper at localhost first.",
    };
  }

  try {
    await browser.sidebarAction.setPanel({
      tabId: tab.id,
      panel: "sidebar/sidebar.html",
    });

    if (browser.sidebarAction.open) {
      await browser.sidebarAction.open();
      return {
        opened: true,
      };
    }

    return {
      opened: false,
      reason: "Firefox did not expose sidebarAction.open for this context.",
    };
  } catch (error) {
    return {
      opened: false,
      reason: error instanceof Error ? error.message : "Could not open sidebar.",
    };
  }
}

function isLorekeeperAppUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return appHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
