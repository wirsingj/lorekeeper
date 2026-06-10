const providerHosts = new Set(["chatgpt.com", "chat.openai.com"]);

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || typeof message !== "object") {
    return null;
  }

  if (message.type === "lorekeeper.findProviderTabs") {
    return findProviderTabs();
  }

  if (message.type === "lorekeeper.providerCommand") {
    return sendProviderCommand(message.tabId, message.command, message.payload);
  }

  return null;
});

async function findProviderTabs() {
  const tabs = await browser.tabs.query({});

  return tabs
    .filter((tab) => isSupportedProviderUrl(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: tab.title,
      url: tab.url,
      active: tab.active,
      windowId: tab.windowId,
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

