export function buildCampaignAdoptionPlan({
  previousCampaignId = null,
  nextCampaignId = null,
} = {}) {
  const hadCampaign = Boolean(previousCampaignId);
  const hasNextCampaign = Boolean(nextCampaignId);
  const initialLoad = !hadCampaign && hasNextCampaign;
  const campaignChanged = hadCampaign && hasNextCampaign && previousCampaignId !== nextCampaignId;

  return {
    initialLoad,
    campaignChanged,
    resetTurnCarryover: initialLoad || campaignChanged,
    resetTurnFlow: campaignChanged,
    resetPlayLogLimit: campaignChanged,
    turnFlowResetReason: campaignChanged ? "campaign_changed" : "",
  };
}
