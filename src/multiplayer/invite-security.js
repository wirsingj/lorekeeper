export function isAllowedInviteHost(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return false;
  return isLoopbackHost(normalized) || isPrivateIpv4Host(normalized);
}

export function normalizeHost(host) {
  return String(host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
}

function isLoopbackHost(host) {
  if (host === "localhost" || host === "::1" || host === "127.0.0.1") {
    return true;
  }
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

function isPrivateIpv4Host(host) {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }
  const match172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  return Boolean(match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31);
}
