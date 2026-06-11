import { touchCampaign } from "./schema.js";

export function upsertProviderConversation(campaign, input = {}) {
  const working = structuredClone(campaign);
  const now = new Date().toISOString();
  const providerSettings = normalizeProviderSettings(working.providerSettings);
  const providerId = input.providerId || providerSettings.preferredProvider || "chatgpt";
  const conversationId = input.providerConversationId || input.conversationId || nextConversationId(providerSettings);
  const existing = providerSettings.conversations.find((conversation) => conversation.id === conversationId);
  const conversationHint = input.conversationHint || existing?.conversationHint || conversationTitle(working, providerSettings, conversationId);

  const conversation = {
    id: conversationId,
    providerId,
    projectHint: input.projectHint || existing?.projectHint || providerSettings.projectHint || "LoreKeeper",
    projectUrl: input.projectUrl || existing?.projectUrl || "",
    providerUrl: input.providerUrl || input.url || existing?.providerUrl || "",
    providerTitle: input.providerTitle || input.title || existing?.providerTitle || "",
    conversationHint,
    status: input.status || existing?.status || "active",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastUsedAt: input.lastUsedAt || now,
    notes: input.notes || existing?.notes || "",
  };

  working.providerSettings = {
    ...providerSettings,
    preferredProvider: providerId,
    projectHint: conversation.projectHint,
    activeConversationId: conversation.id,
    conversations: [
      ...providerSettings.conversations.filter((item) => item.id !== conversation.id),
      conversation,
    ],
  };

  return {
    campaign: touchCampaign(working),
    conversation,
  };
}

export function getActiveProviderConversation(campaign, providerId = "chatgpt") {
  const providerSettings = normalizeProviderSettings(campaign.providerSettings);
  const active = providerSettings.conversations.find((conversation) => conversation.id === providerSettings.activeConversationId);
  if (active) {
    return active;
  }

  const conversationId = nextConversationId(providerSettings);
  return {
    id: conversationId,
    providerId,
    projectHint: providerSettings.projectHint || "LoreKeeper",
    projectUrl: "",
    providerUrl: "",
    providerTitle: "",
    conversationHint: conversationTitle(campaign, providerSettings, conversationId),
    status: "planned",
    createdAt: null,
    updatedAt: null,
    lastUsedAt: null,
    notes: "",
  };
}

function normalizeProviderSettings(providerSettings = {}) {
  return {
    preferredProvider: providerSettings.preferredProvider || "chatgpt",
    bridgeMode: providerSettings.bridgeMode || "manual_until_adapter_ready",
    requireExplicitTabSelection: providerSettings.requireExplicitTabSelection ?? true,
    automationVisible: providerSettings.automationVisible ?? true,
    allowBackgroundArbitraryTabs: providerSettings.allowBackgroundArbitraryTabs ?? false,
    projectHint: providerSettings.projectHint || "LoreKeeper",
    activeConversationId: providerSettings.activeConversationId || null,
    conversations: Array.isArray(providerSettings.conversations) ? providerSettings.conversations : [],
  };
}

function nextConversationId(providerSettings) {
  const next = providerSettings.conversations.length + 1;
  return `provider-chat-${String(next).padStart(2, "0")}`;
}

function conversationTitle(campaign, providerSettings, conversationId) {
  const ordinal = conversationId.match(/(\d+)$/)?.[1] || String(providerSettings.conversations.length + 1).padStart(2, "0");
  return `${campaign.title} [${shortCampaignId(campaign.id)}-${ordinal}]`;
}

function shortCampaignId(id = "") {
  const compact = String(id).replace(/[^a-z0-9]/gi, "");
  return compact.slice(0, 8) || "campaign";
}
