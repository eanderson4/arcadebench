function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const SITE_CONTRACT = deepFreeze({
  schemaVersion: 1,
  canonicalHost: 'arcadebench.org',
  wranglerAssets: {
    directory: './dist/site',
    binding: 'ASSETS',
    run_worker_first: true,
    html_handling: 'auto-trailing-slash',
    not_found_handling: '404-page',
  },
  wranglerRoutes: [
    { pattern: 'arcadebench.org', custom_domain: true },
    { pattern: 'www.arcadebench.org', custom_domain: true },
  ],
  routes: [
    { pathname: '/', output: 'index.html', source: 'deploy/index.html', canonical: 'https://arcadebench.org/', indexable: true, social: true },
    { pathname: '/partition/', output: 'partition/index.html', source: 'games/partition/dist/src/viewer/index.html', canonical: 'https://arcadebench.org/partition/', indexable: true, social: true },
    { pathname: '/maltline/', output: 'maltline/index.html', source: 'games/maltline/dist/src/viewer/index.html', canonical: 'https://arcadebench.org/maltline/', indexable: true, social: true },
    { pathname: '/privacy/', output: 'privacy/index.html', source: 'deploy/privacy.html', canonical: 'https://arcadebench.org/privacy/', indexable: true, social: false },
    { pathname: '/terms/', output: 'terms/index.html', source: 'deploy/terms.html', canonical: 'https://arcadebench.org/terms/', indexable: true, social: false },
    { pathname: '/sms/', output: 'sms/index.html', source: 'deploy/sms.html', canonical: 'https://arcadebench.org/sms/', indexable: false, social: false },
  ],
  notFound: { output: '404.html', source: 'deploy/404.html' },
  staticFiles: [
    { output: 'arcade.css', source: 'deploy/arcade.css' },
    { output: 'favicon.svg', source: 'games/partition/dist/favicon.svg' },
    { output: 'math-vs-vibes-badge.svg', source: 'games/partition/dist/math-vs-vibes-badge.svg' },
    { output: 'maltline/third-party-licenses/noto-sans-OFL-1.1.txt', source: 'games/maltline/dist/third-party-licenses/noto-sans-OFL-1.1.txt' },
    { output: 'llms.txt', source: 'deploy/llms.txt' },
    { output: 'robots.txt', source: 'deploy/robots.txt' },
    { output: 'sitemap.xml', source: 'deploy/sitemap.xml' },
    { output: '_headers', source: 'deploy/_headers' },
    { output: '_redirects', source: 'deploy/_redirects' },
  ],
  assetGroups: [
    {
      id: 'partition',
      source: 'games/partition/dist/assets',
      output: 'assets',
      referenceSources: ['partition/index.html'],
      referencePrefix: '/assets/',
      files: [
        { expression: '^index-[A-Za-z0-9_-]+\\.js$', count: 1 },
        { expression: '^index-[A-Za-z0-9_-]+\\.css$', count: 1 },
      ],
    },
    {
      id: 'maltline',
      source: 'games/maltline/dist/assets',
      output: 'maltline/assets',
      referenceSources: ['maltline/index.html', 'maltline/assets/*.css', 'maltline/assets/*.js'],
      referencePrefix: '/maltline/assets/',
      files: [
        { expression: '^index-[A-Za-z0-9_-]+\\.js$', count: 1 },
        { expression: '^index-[A-Za-z0-9_-]+\\.css$', count: 1 },
        { expression: '^noto-sans-latin-400-normal-[A-Za-z0-9_-]+\\.woff2$', count: 1 },
        { expression: '^noto-sans-latin-600-normal-[A-Za-z0-9_-]+\\.woff2$', count: 1 },
        { expression: '^noto-sans-latin-700-normal-[A-Za-z0-9_-]+\\.woff2$', count: 1 },
        { expression: '^noto-sans-latin-800-normal-[A-Za-z0-9_-]+\\.woff2$', count: 1 },
      ],
    },
  ],
  redirects: [
    { from: '/src/viewer', to: '/partition/', status: 301 },
    { from: '/src/viewer/', to: '/partition/', status: 301 },
    { from: '/src/viewer/index.html', to: '/partition/', status: 301 },
  ],
  cacheRules: [
    { path: '/assets/*', value: 'public, max-age=31536000, immutable' },
    { path: '/maltline/assets/*', value: 'public, max-age=31536000, immutable' },
    { path: '/arcade.css', value: 'public, max-age=0, must-revalidate' },
    { path: '/favicon.svg', value: 'public, max-age=0, must-revalidate' },
    { path: '/math-vs-vibes-badge.svg', value: 'public, max-age=0, must-revalidate' },
    { path: '/', value: 'public, max-age=0, must-revalidate' },
    { path: '/partition/', value: 'public, max-age=0, must-revalidate' },
    { path: '/maltline/', value: 'public, max-age=0, must-revalidate' },
    { path: '/privacy/', value: 'public, max-age=0, must-revalidate' },
    { path: '/terms/', value: 'public, max-age=0, must-revalidate' },
    { path: '/sms/', value: 'public, max-age=0, must-revalidate' },
    { path: '/404.html', value: 'no-store' },
    { path: '/robots.txt', value: 'public, max-age=0, must-revalidate' },
    { path: '/sitemap.xml', value: 'public, max-age=0, must-revalidate' },
    { path: '/llms.txt', value: 'public, max-age=0, must-revalidate' },
  ],
  securityHeaders: [
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['X-Content-Type-Options', 'nosniff'],
    ['X-Frame-Options', 'SAMEORIGIN'],
    ['Permissions-Policy', 'camera=(), geolocation=(), microphone=()'],
    ['Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; media-src 'self'"],
  ],
  limits: {
    maximumFiles: 40,
    maximumTotalBytes: 2 * 1024 * 1024,
    maximumBytesByExtension: {
      '': 32 * 1024,
      '.css': 256 * 1024,
      '.html': 128 * 1024,
      '.js': 512 * 1024,
      '.svg': 128 * 1024,
      '.txt': 128 * 1024,
      '.woff2': 64 * 1024,
      '.xml': 32 * 1024,
    },
  },
});
