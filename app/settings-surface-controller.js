export const settingsSurfaceModes = Object.freeze({
  app: ["app", "ai"],
  ai: ["ai", "app"],
  table: ["friends", "troubleshooting"],
  troubleshooting: ["troubleshooting", "friends"],
  recovery: ["troubleshooting"],
});

const settingsCopy = Object.freeze({
  app: {
    eyebrow: "Preferences",
    title: "App Preferences",
    subtitle: "Choose how LoreKeeper starts and behaves before you sit down.",
  },
  ai: {
    eyebrow: "AI Readiness",
    title: "DM Voice",
    subtitle: "Check or tune the storyteller before you host.",
  },
  friends: {
    eyebrow: "Table Settings",
    title: "Friends And Seats",
    subtitle: "Open the guest page, share the table link, and seat friends.",
  },
  troubleshooting: {
    eyebrow: "Troubleshooting",
    title: "Table Diagnostics",
    subtitle: "Use these only when the table is stuck or a DM response needs review.",
  },
});

const settingsModeCopy = Object.freeze({
  recovery: {
    eyebrow: "DM Recovery",
    title: "Review DM Response",
    subtitle: "Resolve the paused DM response before returning to play.",
  },
});

export function settingsModeForTab(tab = "app") {
  if (tab === "friends") {
    return "table";
  }
  if (tab === "troubleshooting") {
    return "troubleshooting";
  }
  if (tab === "ai") {
    return "ai";
  }
  return "app";
}

export function buildSettingsSurfaceProjection({ tab = "app", mode = "" } = {}) {
  const validMode = settingsSurfaceModes[mode] ? mode : settingsModeForTab(tab);
  const allowedTabs = settingsSurfaceModes[validMode] ?? settingsSurfaceModes.app;
  const activeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0];
  const surfaceTarget = validMode === "recovery" ? "recovery" : "";
  return {
    mode: validMode,
    activeTab,
    allowedTabs,
    visibleTabCount: allowedTabs.length,
    surfaceTarget,
    copy: settingsModeCopy[validMode] ?? settingsCopy[activeTab] ?? settingsCopy.app,
  };
}

export function applySettingsSurfaceProjection(elements, projection) {
  if (elements.setupDialog) {
    elements.setupDialog.dataset.activeTab = projection.activeTab;
    elements.setupDialog.dataset.settingsMode = projection.mode;
    elements.setupDialog.dataset.settingsSurfaceTarget = projection.surfaceTarget || "";
  }
  if (elements.settingsTabsNav) {
    elements.settingsTabsNav.dataset.visibleTabs = String(projection.visibleTabCount);
  }
  if (elements.setupDialogEyebrow) {
    elements.setupDialogEyebrow.textContent = projection.copy.eyebrow;
  }
  if (elements.setupDialogTitle) {
    elements.setupDialogTitle.textContent = projection.copy.title;
  }
  if (elements.setupDialogSubtitle) {
    elements.setupDialogSubtitle.textContent = projection.copy.subtitle;
  }
  for (const button of elements.settingsTabs ?? []) {
    const tab = button.dataset.settingsTab || "";
    const active = tab === projection.activeTab;
    button.hidden = !projection.allowedTabs.includes(tab);
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of elements.settingsPanels ?? []) {
    const panelMatchesTab = panel.dataset.settingsPanel === projection.activeTab;
    const panelMatchesSurface = !projection.surfaceTarget
      || panel.dataset.settingsSurfaceTarget === projection.surfaceTarget;
    panel.hidden = !panelMatchesTab || !panelMatchesSurface;
  }
}
