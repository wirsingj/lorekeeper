import { validateCampaign } from "../campaign-state/schema.js";

export function createCampaignBundle(campaign) {
  const errors = validateCampaign(campaign);
  if (errors.length > 0) {
    throw new Error(`Cannot bundle invalid campaign: ${errors.join(" ")}`);
  }

  return {
    bundleVersion: "0.1.0",
    exportedAt: new Date().toISOString(),
    campaign,
    attachments: [],
  };
}

export function serializeCampaignBundle(bundle) {
  return JSON.stringify(bundle, null, 2);
}

export function parseCampaignBundle(text) {
  const bundle = JSON.parse(text);
  const errors = validateCampaign(bundle.campaign);

  if (errors.length > 0) {
    throw new Error(`Invalid campaign bundle: ${errors.join(" ")}`);
  }

  return bundle;
}

