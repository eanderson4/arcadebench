import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { API } from 'typescript/unstable/sync';
import {
  collectStaticSourceGraph,
  type StaticSourceGraphPolicy,
} from '../tools/static-source-graph';

const roots: string[] = [];
const ENTRY = 'games/maltline/tools/entry.ts';
const KERNEL = 'games/maltline/src/experiments/kernel.ts';

const basePolicy = (label: string, externalSpecifiers: readonly string[]): StaticSourceGraphPolicy => ({
  label,
  maximumFiles: 16,
  maximumBytes: 16 * 1024,
  externalSpecifiers,
  allowedViewerFiles: ['games/maltline/src/viewer/viewer-input-adapter.ts'],
  prohibitedPathPrefixes: ['apps/platform/'],
  prohibitedExactFiles: ['games/maltline/src/index.ts'],
  prohibitedFileNames: [
    'proof.ts', 'verifier.ts', 'competition-client.ts', 'competition-controller.ts',
    'competition-panel.ts', 'human-lab.ts', 'human-lab-session.ts',
  ],
});

async function repository(entrySource: string, kernelSource = 'export const kernel = 1;\n'): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), 'maltline-source-graph-'));
  roots.push(root);
  const files = new Map([
    [ENTRY, entrySource],
    [KERNEL, kernelSource],
    ['games/maltline/src/core/dependency.ts', 'export const dependency = 1;\n'],
    ['games/maltline/src/core/proof.ts', 'export const proof = 1;\n'],
    ['games/maltline/src/viewer/viewer-input-adapter.ts', 'export const adapter = 1;\n'],
    ['games/maltline/tsconfig.json', JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'ESNext' }, include: ['src', 'tools'],
    })],
  ]);
  for (const [path, contents] of files) {
    const absolute = resolve(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  return root;
}

async function collect(root: string, entry: string, policy: StaticSourceGraphPolicy) {
  const config = resolve(root, 'games/maltline/tsconfig.json');
  const api = new API();
  try {
    const snapshot = api.updateSnapshot({ openProjects: [config] });
    try {
      const project = snapshot.getProjects().find(({ configFileName }) => configFileName === config);
      if (project === undefined) throw new Error('fixture TypeScript project missing');
      return await collectStaticSourceGraph({ repositoryRoot: root, entry, project, policy });
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('shared fail-closed static source graph', () => {
  it('binds normalized imported bytes, exact externals, and entry-scoped policies', async () => {
    const root = await repository(
      "import 'node:crypto';\nexport * from '../src/experiments/kernel';\n",
      "import '../core/dependency';\nimport '../viewer/viewer-input-adapter';\nexport const kernel = 1;\n",
    );
    const producer = await collect(root, ENTRY, basePolicy('producer', ['node:crypto']));
    expect(producer.files).toEqual([
      'games/maltline/src/core/dependency.ts',
      'games/maltline/src/experiments/kernel.ts',
      'games/maltline/src/viewer/viewer-input-adapter.ts',
      ENTRY,
    ]);
    expect(Object.isFrozen(producer)).toBe(true);
    expect(Object.isFrozen(producer.files)).toBe(true);
    await expect(collect(root, KERNEL, basePolicy('kernel', []))).resolves.toMatchObject({ fileCount: 3 });

    await writeFile(resolve(root, KERNEL), "import 'node:crypto';\nexport const kernel = 1;\n");
    await expect(collect(root, KERNEL, basePolicy('kernel', [])))
      .rejects.toThrow(/unreviewed external module specifier "node:crypto"/u);
    await writeFile(resolve(root, KERNEL), 'export const kernel = 1;\n');
    await expect(collect(root, ENTRY, basePolicy('producer', ['node:crypto', 'node:path'])))
      .rejects.toThrow(/external dependency set does not match its exact policy/u);
  });

  it('rejects every static bare, re-export, import-equals, import-type, and declaration bypass', async () => {
    const cases = [
      ["import '@arcadebench/maltline';\n", /unreviewed external.*@arcadebench\/maltline/u],
      ["import '@arcadebench/maltline\/verifier';\n", /unreviewed external.*@arcadebench\/maltline/u],
      ["import '@arcadebench/partition';\n", /unreviewed external.*@arcadebench\/partition/u],
      ["import '@arcadebench/not-a-workspace';\n", /unreviewed external.*@arcadebench\/not-a-workspace/u],
      ["export * from '@arcadebench/maltline';\n", /unreviewed external/u],
      ["import Maltline = require('@arcadebench/maltline');\n", /unreviewed external|runtime module/u],
      ["type Proof = import('../src/core/proof').Proof;\n", /prohibited production, proof/u],
      ["type Root = import('@arcadebench/maltline').Root;\n", /unreviewed external/u],
      ["import '#local';\n", /unreviewed external.*#local/u],
      ["import '@local/proof';\n", /unreviewed external.*@local\/proof/u],
      ["declare module '../src/core/proof' { export const value: number; }\n", /prohibited production, proof/u],
    ] as const;
    for (const [source, error] of cases) {
      const root = await repository(source);
      await expect(collect(root, ENTRY, basePolicy('fixture', [])), source).rejects.toThrow(error);
    }
  });

  it('rejects runtime loaders, dynamic imports, and untracked reference directives', async () => {
    const cases = [
      ["require('../src/core/proof');\n", /runtime module loading/u],
      ["const target = '../src/core/proof'; require(target);\n", /runtime module loading/u],
      ["require.resolve('../src/core/proof');\n", /runtime module loading/u],
      ["require['resolve']('../src/core/proof');\n", /runtime module loading/u],
      ["import { createRequire } from 'node:module'; const loader = createRequire(import.meta.url);\n", /CommonJS loader seam|runtime module/u],
      ["void import('../src/core/dependency');\n", /dynamic import/u],
      ['/// <reference types="node" />\n', /untracked type, lib, or AMD/u],
      ['/// <reference lib="es2022" />\n', /untracked type, lib, or AMD/u],
      ["/// <amd-dependency path='../src/core/proof' />\n", /AMD references/u],
    ] as const;
    for (const [source, error] of cases) {
      const root = await repository(source);
      await expect(collect(root, ENTRY, basePolicy('fixture', [])), source).rejects.toThrow(error);
    }
    const pathReference = await repository('/// <reference path="../src/core/proof.ts" />\n');
    await expect(collect(pathReference, ENTRY, basePolicy('fixture', [])))
      .rejects.toThrow(/prohibited production, proof/u);
    const ordinary = await repository(
      'const requireValue = (value: number) => value; export const value = requireValue(1);\n',
    );
    await expect(collect(ordinary, ENTRY, basePolicy('fixture', []))).resolves.toMatchObject({ fileCount: 1 });
  });

  it('rejects unresolved, escaping, prohibited, and unreviewed viewer dependencies', async () => {
    const unresolved = await repository("import './missing';\n");
    await expect(collect(unresolved, ENTRY, basePolicy('fixture', []))).rejects.toThrow(/cannot resolve/u);

    const escape = await repository("import './escape';\n");
    const outside = resolve(escape, '../outside.ts');
    await writeFile(outside, 'export const outside = 1;\n');
    await symlink(outside, resolve(escape, 'games/maltline/tools/escape.ts'));
    await expect(collect(escape, ENTRY, basePolicy('fixture', []))).rejects.toThrow(/escapes/u);
    await rm(outside, { force: true });

    const viewer = await repository("import '../src/viewer/other';\n");
    await writeFile(resolve(viewer, 'games/maltline/src/viewer/other.ts'), 'export const other = 1;\n');
    await expect(collect(viewer, ENTRY, basePolicy('fixture', [])))
      .rejects.toThrow(/unreviewed viewer dependency/u);
    const proof = await repository("import '../src/core/proof';\n");
    await expect(collect(proof, ENTRY, basePolicy('fixture', [])))
      .rejects.toThrow(/prohibited production, proof/u);
  });

  it('enforces exact file and normalized-byte ceilings', async () => {
    const bytes = await repository(`/*${'x'.repeat(16 * 1024)}*/\n`);
    await expect(collect(bytes, ENTRY, basePolicy('fixture', []))).rejects.toThrow(/exceeds 16384 bytes/u);

    const files = await repository("import '../src/core/dependency';\n");
    await expect(collect(files, ENTRY, { ...basePolicy('fixture', []), maximumFiles: 1 }))
      .rejects.toThrow(/exceeds 1 files/u);
  });
});
