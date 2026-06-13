import { applyStateEffects } from "./state-effects.js";

export function createCampaignStateStore(initialCampaign, options = {}) {
  let campaign = structuredClone(initialCampaign);
  const listeners = new Set();

  function emit(event) {
    for (const listener of listeners) {
      listener({ ...event, campaign: structuredClone(campaign) });
    }
  }

  return {
    getState() {
      return structuredClone(campaign);
    },
    replace(nextCampaign, meta = {}) {
      campaign = structuredClone(nextCampaign);
      emit({ type: "replace", source: meta.source ?? "unknown" });
      options.onChange?.(structuredClone(campaign), meta);
      return this.getState();
    },
    update(mutator, meta = {}) {
      const draft = structuredClone(campaign);
      const result = mutator(draft) ?? draft;
      campaign = result;
      emit({ type: "update", source: meta.source ?? "unknown" });
      options.onChange?.(structuredClone(campaign), meta);
      return this.getState();
    },
    applyEffects(effects, meta = {}) {
      const result = applyStateEffects(campaign, effects, meta);
      campaign = result.campaign;
      emit({ type: "effects", source: meta.source ?? "app_engine", effects: result.appliedEffects });
      options.onChange?.(structuredClone(campaign), meta);
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
