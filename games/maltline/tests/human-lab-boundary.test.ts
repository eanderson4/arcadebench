import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { build, type Plugin } from 'vite';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const configFile = resolve(packageRoot, 'vite.config.ts');
const tsc = resolve(packageRoot, '../../node_modules/.bin/tsc');
const productionEntry = resolve(packageRoot, 'src/viewer/index.html');
const labEntry = resolve(packageRoot, 'src/viewer/human-lab.html');
const labRuntimeModules = [
  'src/viewer/human-lab.ts',
  'src/experiments/p1-08-candidates.ts',
  'src/experiments/human-lab-observation.ts',
  'src/experiments/human-lab-session.ts',
  'src/experiments/human-lab-study.ts',
  'src/experiments/human-lab-timing.ts',
] as const;
const allowedLabExperimentModules = new Set(labRuntimeModules.filter((source) => (
  source.startsWith('src/experiments/')
)));
const labOutputSentinels = [
  'maltline-human-lab-session',
  'd-combined',
] as const;
const forbiddenProductionTestingSentinels = [
  'createMaltlineResolutionHarness',
  'maltline-synthetic-resolution-harness-v1',
] as const;

function packageModule(id: string): string | null {
  const path = id.split('?', 1)[0]!;
  if (!path.startsWith(`${packageRoot}${sep}`)) return null;
  return relative(packageRoot, path).replaceAll(sep, '/');
}

async function viteGraph(input?: string): Promise<{
  modules: ReadonlySet<string>;
  outputJavaScript: string;
}> {
  const modules = new Set<string>();
  const collector = {
    name: 'maltline-human-lab-boundary',
    moduleParsed(info) {
      const normalized = packageModule(info.id);
      if (normalized !== null) modules.add(normalized);
    },
  } satisfies Plugin;
  const result = await build({
    configFile,
    logLevel: 'silent',
    plugins: [collector],
    build: input === undefined
      ? { write: false }
      : { write: false, rollupOptions: { input } },
  });
  const builds = (Array.isArray(result) ? result : [result]) as Array<{
    output: Array<{ type: string; code?: string }>;
  }>;
  return {
    modules,
    outputJavaScript: builds
      .flatMap(({ output }) => output)
      .filter(({ type }) => type === 'chunk')
      .map(({ code }) => code ?? '')
      .join('\n'),
  };
}

describe('P1-10 human-lab build boundary', () => {
  it('keeps every lab TypeScript module in the Maltline TypeScript program', () => {
    const listed = execFileSync(tsc, ['-p', 'tsconfig.json', '--listFilesOnly'], {
      cwd: packageRoot,
      encoding: 'utf8',
    });
    const programFiles = new Set(listed.trim().split(/\r?\n/u).map((file) => (
      packageModule(file)
    )).filter((file): file is string => file !== null));
    for (const source of labRuntimeModules) expect(programFiles.has(source)).toBe(true);
  });

  it('builds only the production viewer graph from the normal Vite entry', async () => {
    expect(readFileSync(productionEntry, 'utf8')).not.toContain('human-lab');
    const production = await viteGraph();

    expect(production.modules.has('src/viewer/main.ts')).toBe(true);
    for (const source of labRuntimeModules) expect(production.modules.has(source)).toBe(false);
    expect([...production.modules].filter((source) => (
      source.startsWith('src/experiments/')
      || source.startsWith('src/testing/')
      || source.startsWith('src/viewer/visual-fixtures.')
    ))).toEqual([]);
    for (const sentinel of labOutputSentinels) {
      expect(production.outputJavaScript).not.toContain(sentinel);
    }
    for (const sentinel of forbiddenProductionTestingSentinels) {
      expect(production.outputJavaScript).not.toContain(sentinel);
    }
  });

  it('builds the isolated lab graph without proof, competition, or public barrels', async () => {
    const lab = await viteGraph(labEntry);
    for (const source of labRuntimeModules) expect(lab.modules.has(source)).toBe(true);
    for (const sentinel of labOutputSentinels) expect(lab.outputJavaScript).toContain(sentinel);
    expect([...lab.modules].filter((source) => source.startsWith('src/experiments/')).sort())
      .toEqual([...allowedLabExperimentModules].sort());
    expect(lab.modules.has('src/experiments/p1-04-recovery-experiment.ts')).toBe(false);

    const forbiddenExact = new Set([
      'src/index.ts',
      'src/telemetry/index.ts',
      'src/core/proof.ts',
      'src/core/playback.ts',
      'src/viewer/main.ts',
      'src/viewer/competition-client.ts',
      'src/viewer/competition-controller.ts',
      'src/viewer/competition-panel.ts',
      'src/viewer/ranked-proof-recorder.ts',
      'src/viewer/replay-scrubber.ts',
    ]);
    const forbidden = [...lab.modules].filter((source) => (
      forbiddenExact.has(source) || source.startsWith('src/testing/')
    ));
    expect(forbidden).toEqual([]);
  });

  it('contains no graph-reachable dynamic loading, network, API, or persistent-storage escape hatch', async () => {
    const lab = await viteGraph(labEntry);
    const reachableSources = new Set(['src/viewer/human-lab.html', ...lab.modules]);
    const sources = [...reachableSources].filter((source) => (
      source.startsWith('src/') && /\.(?:css|html|ts)$/u.test(source)
    )).map((source) => ({
      source,
      text: readFileSync(resolve(packageRoot, source), 'utf8'),
    }));
    const combined = sources.map(({ source, text }) => `/* ${source} */\n${text}`).join('\n');

    expect(combined).not.toMatch(/\bimport\s*\(/u);
    expect(combined).not.toMatch(/\bfetch\s*\(/u);
    expect(combined).not.toMatch(/\b(?:XMLHttpRequest|WebSocket|EventSource)\b/u);
    expect(combined).not.toMatch(/\b(?:sendBeacon|localStorage|sessionStorage|indexedDB)\b/u);
    expect(combined).not.toMatch(/\/(?:api|cdn-cgi)\//u);
    expect(combined).not.toMatch(/from\s*['"][^'"]*(?:\/core\/(?:proof|playback)|\/testing\/|competition-|ranked-proof-recorder|replay-scrubber|\/src\/index|\/telemetry\/index)[^'"]*['"]/u);
  });
});
