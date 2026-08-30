const LOGO_HOSTS = [
  /(^|\.)espncdn\.com$/i,
  /(^|\.)steamstatic\.com$/i,
  /^steamcdn-a\.akamaihd\.net$/i,
  /^steamuserimages-a\.akamaihd\.net$/i,
  /(^|\.)dota2\.com$/i,
  /(^|\.)hltv\.org$/i,
];

export function isAllowedLogoHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && LOGO_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export function proxiedLogo(url?: string): string | undefined {
  if (!url || !isAllowedLogoHost(url)) return undefined;
  return `/api/sports/logo?u=${encodeURIComponent(url)}`;
}
