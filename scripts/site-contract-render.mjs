import { SITE_CONTRACT } from './site-contract.mjs';

export function renderHeaders(contract = SITE_CONTRACT) {
  const sections = contract.cacheRules.map(({ path, value }) => (
    `${path}\n  Cache-Control: ${value}`
  ));
  sections.push(`/*\n${contract.securityHeaders.map(([name, value]) => `  ${name}: ${value}`).join('\n')}`);
  return `${sections.join('\n\n')}\n`;
}

export function renderRedirects(contract = SITE_CONTRACT) {
  return `${contract.redirects.map(({ from, to, status }) => `${from} ${to} ${status}`).join('\n')}\n`;
}

export function renderSitemap(contract = SITE_CONTRACT) {
  const urls = contract.routes.filter(({ indexable }) => indexable).map(({ canonical }) => (
    `  <url>\n    <loc>${canonical}</loc>\n  </url>`
  ));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function renderRobots(contract = SITE_CONTRACT) {
  return `User-agent: *\nAllow: /\n\nSitemap: https://${contract.canonicalHost}/sitemap.xml\n`;
}

export function cacheControlFor(pathname, contract = SITE_CONTRACT) {
  let value = 'public, max-age=0, must-revalidate';
  for (const rule of contract.cacheRules) {
    const matches = rule.path.endsWith('*')
      ? pathname.startsWith(rule.path.slice(0, -1))
      : pathname === rule.path;
    if (matches) value = rule.value;
  }
  return value;
}
