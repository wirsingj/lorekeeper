export const defaultPlayLogVisibleLimit = 240;
export const playLogPageSize = 120;

export function buildPlayLogProjection(messages = [], { visibleLimit = defaultPlayLogVisibleLimit } = {}) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const limit = Math.max(1, Number(visibleLimit) || defaultPlayLogVisibleLimit);
  const hiddenCount = Math.max(0, safeMessages.length - limit);
  return {
    totalCount: safeMessages.length,
    visibleLimit: limit,
    hiddenCount,
    hasEarlierMessages: hiddenCount > 0,
    nextVisibleLimit: limit + playLogPageSize,
    visibleMessages: hiddenCount > 0 ? safeMessages.slice(hiddenCount) : safeMessages,
  };
}
