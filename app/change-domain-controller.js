export function normalizeChangeDomain(domain) {
  if (domain === "party_member" || domain === "player_character") {
    return "party";
  }
  return domain;
}
