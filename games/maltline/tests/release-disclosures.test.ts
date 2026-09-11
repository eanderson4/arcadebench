import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import releaseAssets from '../release-assets.json' with { type: 'json' };

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const installedFontRoot = resolve(repositoryRoot, 'node_modules/@fontsource/noto-sans');
const productionEntry = resolve(packageRoot, 'src/viewer/index.html');
const embeddedMediaPattern = /data:[A-Za-z][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9!#$&^_.+-]+(?:;[A-Za-z0-9=.+-]+)*(?:;base64)?,/giu;

function packageModule(id: string): string | null {
  const path = id.split('?', 1)[0]!;
  if (!path.startsWith(`${packageRoot}${sep}`)) return null;
  return relative(packageRoot, path).replaceAll(sep, '/');
}

async function productionModules(): Promise<ReadonlySet<string>> {
  const modules = new Set<string>();
  const collector = {
    name: 'maltline-release-disclosure-graph',
    moduleParsed(info) {
      const normalized = packageModule(info.id);
      if (normalized !== null) modules.add(normalized);
    },
  } satisfies Plugin;
  await build({
    configFile: resolve(packageRoot, 'vite.config.ts'),
    logLevel: 'silent',
    plugins: [collector],
    build: { write: false },
  });
  return modules;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedText(contents: string): string {
  return contents
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[*`]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function hasOnlyReviewedInlineFavicon(contents: string): boolean {
  const embeddedMedia = contents.match(embeddedMediaPattern) ?? [];
  const iconHref = /<link rel="icon" href="([^"]+)"/u.exec(contents)?.[1];
  return embeddedMedia.length === 1 && iconHref === releaseAssets.inlineAssets[0]!.href;
}

describe('Maltline release asset and privacy disclosures', () => {
  it('publishes exact self-canonical and summary-card metadata', () => {
    const entry = readFileSync(productionEntry, 'utf8');
    expect(entry).toContain(
      '<meta name="description" content="Maltline — a shake-counter arcade game prototype for humans and machines. Slide shakes, catch jars, keep the line moving." />',
    );
    expect(entry).toContain('<meta property="og:title" content="Maltline — ArcadeBench" />');
    expect(entry).toContain(
      '<meta property="og:description" content="A shake-counter arcade game for humans and machines. Match orders, slide shakes, and catch returning jars." />',
    );
    expect(entry).toContain('<meta property="og:type" content="website" />');
    expect(entry).toContain('<meta property="og:site_name" content="ArcadeBench" />');
    expect(entry).toContain(
      '<meta property="og:url" content="https://arcadebench.org/maltline/" />',
    );
    expect(entry).toContain('<meta name="twitter:card" content="summary" />');
    expect(entry).toContain('<meta name="twitter:title" content="Maltline — ArcadeBench" />');
    expect(entry).toContain(
      '<meta name="twitter:description" content="A shake-counter arcade game for humans and machines. Match orders, slide shakes, and catch returning jars." />',
    );
    expect(entry.match(/<link rel="canonical" href="[^"]+" \/>/gu)).toEqual([
      '<link rel="canonical" href="https://arcadebench.org/maltline/" />',
    ]);
  });

  it('pins every imported Noto Sans byte and the exact upstream license notice', () => {
    expect(Object.keys(releaseAssets).sort()).toEqual(['fontBundle', 'inlineAssets', 'schemaVersion']);
    expect(releaseAssets.schemaVersion).toBe(1);
    expect(releaseAssets.inlineAssets).toEqual([{
      id: 'maltline-favicon-v1',
      element: 'link[rel=icon]',
      mediaType: 'image/svg+xml',
      href: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22><rect width=%2264%22 height=%2264%22 rx=%2212%22 fill=%22%230c2f25%22/><path d=%22M18 14h28l-3 40H21z%22 fill=%22%23f0b940%22/><path d=%22M26 9h12v25H26z%22 fill=%22%23f8f1df%22/></svg>',
    }]);
    expect(Object.keys(releaseAssets.fontBundle).sort()).toEqual([
      'files', 'id', 'license', 'notice', 'sourcePackage', 'sourceVersion',
    ]);
    expect(Object.keys(releaseAssets.fontBundle.notice).sort()).toEqual([
      'byteLength', 'publicPath', 'sha256', 'sourcePackagePath',
    ]);
    for (const file of releaseAssets.fontBundle.files) {
      expect(Object.keys(file).sort()).toEqual([
        'byteLength', 'sha256', 'sourcePackagePath', 'style', 'subset', 'weight',
      ]);
    }
    expect(releaseAssets.fontBundle).toMatchObject({
      id: 'noto-sans-5.3.0-latin',
      sourcePackage: '@fontsource/noto-sans',
      sourceVersion: '5.3.0',
      license: 'OFL-1.1',
      notice: {
        sourcePackagePath: 'LICENSE',
        publicPath: '/maltline/third-party-licenses/noto-sans-OFL-1.1.txt',
        byteLength: 4_518,
        sha256: '54ec7b5a35310ad66f9f3091426f7028484cbf9ae1ab5da30122ee412a3009e1',
      },
    });

    const installedPackage = JSON.parse(readFileSync(
      resolve(installedFontRoot, 'package.json'),
      'utf8',
    )) as { name: string; version: string; license: string };
    expect(installedPackage).toMatchObject({
      name: releaseAssets.fontBundle.sourcePackage,
      version: releaseAssets.fontBundle.sourceVersion,
      license: releaseAssets.fontBundle.license,
    });

    const fontsSource = readFileSync(resolve(packageRoot, 'src/viewer/fonts.ts'), 'utf8');
    const importedPaths = [...fontsSource.matchAll(
      /from ['"]@fontsource\/noto-sans\/(files\/[^'"]+\.woff2)\?url['"]/gu,
    )].map((match) => match[1]).sort();
    expect(importedPaths).toEqual(
      releaseAssets.fontBundle.files.map((file) => file.sourcePackagePath).sort(),
    );
    expect(releaseAssets.fontBundle.files).toEqual([
      {
        weight: 400,
        style: 'normal',
        subset: 'latin',
        sourcePackagePath: 'files/noto-sans-latin-400-normal.woff2',
        byteLength: 13_120,
        sha256: '09aee8065d25508f23a4c3d92cd777ac869c52d93fd868a88f025d888a7937d6',
      },
      {
        weight: 600,
        style: 'normal',
        subset: 'latin',
        sourcePackagePath: 'files/noto-sans-latin-600-normal.woff2',
        byteLength: 13_496,
        sha256: '79e274470d1c5a0118eb325e2ea6f2eb2a449336d7fde1a4f20a2f32fe1119ed',
      },
      {
        weight: 700,
        style: 'normal',
        subset: 'latin',
        sourcePackagePath: 'files/noto-sans-latin-700-normal.woff2',
        byteLength: 13_464,
        sha256: 'e77bfe1db912f687b0319b60de158cfada67f89c8ee4f8e2bd6020f970accbfb',
      },
      {
        weight: 800,
        style: 'normal',
        subset: 'latin',
        sourcePackagePath: 'files/noto-sans-latin-800-normal.woff2',
        byteLength: 13_656,
        sha256: 'a5650ea2e07952bc6cd44f67cea720697ac9fdc9e35f33e76ccc5004370c21a6',
      },
    ]);
    for (const file of releaseAssets.fontBundle.files) {
      const bytes = readFileSync(resolve(installedFontRoot, file.sourcePackagePath));
      expect(bytes.byteLength, file.sourcePackagePath).toBe(file.byteLength);
      expect(sha256(bytes), file.sourcePackagePath).toBe(file.sha256);
    }

    const upstreamNotice = readFileSync(resolve(installedFontRoot, 'LICENSE'));
    const publicNotice = readFileSync(resolve(
      packageRoot,
      `public/${releaseAssets.fontBundle.notice.publicPath.replace(/^\/maltline\//u, '')}`,
    ));
    expect(publicNotice.equals(upstreamNotice)).toBe(true);
    expect(publicNotice.byteLength).toBe(releaseAssets.fontBundle.notice.byteLength);
    expect(sha256(publicNotice)).toBe(releaseAssets.fontBundle.notice.sha256);
    expect(publicNotice.at(-1)).toBe(0x0a);

    const entry = readFileSync(resolve(packageRoot, 'src/viewer/index.html'), 'utf8');
    expect(entry).toContain(
      '<link rel="license" type="text/plain" href="%BASE_URL%third-party-licenses/noto-sans-OFL-1.1.txt" />',
    );
    expect(entry.match(/<link rel="icon" href="([^"]+)"/u)?.[1])
      .toBe(releaseAssets.inlineAssets[0]!.href);
    expect(hasOnlyReviewedInlineFavicon(entry)).toBe(true);
    expect(hasOnlyReviewedInlineFavicon(entry.replace(
      releaseAssets.inlineAssets[0]!.href,
      'data:image/svg+xml,<svg></svg>',
    ))).toBe(false);
  });

  it('keeps Maltline public assets on an explicit one-notice allowlist', () => {
    const publicRoot = resolve(packageRoot, 'public');
    const files = readdirSync(resolve(publicRoot, 'third-party-licenses'), { withFileTypes: true });
    expect(files.map((entry) => entry.name)).toEqual(['noto-sans-OFL-1.1.txt']);
    expect(files.every((entry) => entry.isFile() && !entry.isSymbolicLink())).toBe(true);
    expect(readdirSync(publicRoot)).toEqual(['third-party-licenses']);

    const viteConfig = readFileSync(resolve(packageRoot, 'vite.config.ts'), 'utf8');
    expect(viteConfig).toMatch(/build:\s*\{[\s\S]*?assetsInlineLimit:\s*0,/u);
    const entry = readFileSync(productionEntry, 'utf8');
    expect(entry.match(embeddedMediaPattern)).toEqual([
      'data:image/svg+xml,',
    ]);
    expect(entry.match(/<link rel="icon" href="([^"]+)"/u)?.[1])
      .toBe(releaseAssets.inlineAssets[0]!.href);

    expect('const x = "DaTa:ImAgE/pNg;BaSe64,AAAA";'.match(embeddedMediaPattern)).toEqual([
      'DaTa:ImAgE/pNg;BaSe64,',
    ]);
    expect('<img src="DATA:AUDIO/OGG;base64,AAAA">'.match(embeddedMediaPattern)).toEqual([
      'DATA:AUDIO/OGG;base64,',
    ]);
  });

  it('keeps the published policy aligned with the complete production module graph', async () => {
    const policySource = normalizedText(readFileSync(resolve(repositoryRoot, 'docs/PRIVACY.md'), 'utf8'));
    const policyPage = normalizedText(readFileSync(resolve(repositoryRoot, 'deploy/privacy.html'), 'utf8'));
    for (const statement of [
      'Ordinary gameplay',
      'A complete replay',
      'five days',
      'signed anonymous cookie',
      'does not write IP addresses into its application database',
      'only the proposed callsign',
      'Cloudflare Workers AI',
    ]) {
      expect(policySource, statement).toContain(statement);
      expect(policyPage, statement).toContain(statement);
    }

    const graph = await productionModules();
    for (const owner of [
      'src/viewer/main.ts',
      'src/viewer/competition-client.ts',
      'src/viewer/competition-controller.ts',
      'src/viewer/ranked-proof-recorder.ts',
    ]) expect(graph.has(owner), owner).toBe(true);
    const reachableSources = new Set(['src/viewer/index.html', ...graph]);
    const productionSources = [...reachableSources]
      .filter((path) => path.startsWith('src/') && /\.(?:css|html|ts)$/u.test(path))
      .map((path) => `/* ${path} */\n${readFileSync(resolve(packageRoot, path), 'utf8')}`)
      .join('\n');
    expect(productionSources).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
    expect(productionSources).not.toMatch(/\bdocument\s*\.\s*cookie\s*=/u);

    const client = readFileSync(resolve(packageRoot, 'src/viewer/competition-client.ts'), 'utf8');
    expect(client).toContain("MALTLINE_COMPETITION_API_PREFIX = '/api/v1/games/maltline'");
    expect(client).toContain("credentials: 'same-origin'");
    expect(client).toContain("{ method: 'GET' }");
    expect(client).toContain('playerName,');
    expect(client).toContain('proof,');
    expect(client).not.toMatch(/https?:\/\//u);
  });
});
