const starterCampaignSummary = "A new D&D 5e-lite campaign ready to grow through play.";

export function isBackendStarterCampaign(campaign = {}) {
  const title = String(campaign.title || "").trim();
  const summary = String(campaign.summary || "").trim();
  return /^Untitled Campaign(?: \d+)?$/i.test(title) && summary === starterCampaignSummary;
}

export function visibleCampaigns(campaigns = []) {
  return (Array.isArray(campaigns) ? campaigns : []).filter((campaign) => !isBackendStarterCampaign(campaign));
}

export function buildHomeCampaignPickerProjection({ campaigns = [], selectedSqlitePath = "" } = {}) {
  const visible = visibleCampaigns(campaigns);
  const count = visible.length;
  if (!count) {
    return {
      count,
      savedText: "No saved adventures yet",
      characterText: "Characters live with their campaigns",
      selectDisabled: true,
      hostDisabled: true,
      hostTitle: "Start a new adventure first.",
      deleteDisabled: true,
      deleteTitle: "No saved adventure to delete.",
      options: [{ value: "", label: "No saved adventures yet", selected: true }],
      selectedCampaign: null,
    };
  }

  const selectedCampaign = visible.find((campaign) => campaign.sqlitePath === selectedSqlitePath) ?? visible[0];
  return {
    count,
    savedText: `${count} saved ${count === 1 ? "adventure" : "adventures"}`,
    characterText: "Characters live with their campaigns",
    selectDisabled: false,
    hostDisabled: false,
    hostTitle: "Open the selected campaign as host.",
    deleteDisabled: false,
    deleteTitle: "Delete the selected saved adventure.",
    options: visible.map((campaign) => ({
      value: campaign.sqlitePath,
      label: campaign.title,
      selected: campaign.sqlitePath === selectedCampaign?.sqlitePath,
    })),
    selectedCampaign,
  };
}

export function selectedHomeCampaign(campaigns = [], sqlitePath = "") {
  const selectedPath = String(sqlitePath || "").trim();
  if (!selectedPath) {
    return null;
  }
  return visibleCampaigns(campaigns).find((campaign) => campaign.sqlitePath === selectedPath) ?? null;
}

export function activeCampaignDeleteTarget({ sqlitePath = "", campaign = null } = {}) {
  if (!sqlitePath || !campaign?.title || isBackendStarterCampaign(campaign)) {
    return null;
  }
  return {
    sqlitePath,
    title: campaign.title,
  };
}
