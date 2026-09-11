import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  SyntaxKind,
  isCallExpression,
  isExportDeclaration,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
  type Node,
  type SourceFile,
} from 'typescript/unstable/ast';
import type { Project } from 'typescript/unstable/sync';

const SOURCE_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.js', '.mjs'] as const);

export interface StaticSourceGraphPolicy {
  readonly label: string;
  readonly maximumFiles: number;
  readonly maximumBytes: number;
  /** Exact set that must be encountered by this entry's transitive closure. */
  readonly externalSpecifiers: readonly string[];
  readonly allowedViewerFiles: readonly string[];
  readonly prohibitedPathPrefixes: readonly string[];
  readonly prohibitedExactFiles: readonly string[];
  readonly prohibitedFileNames: readonly string[];
}

export interface StaticSourceGraphIdentity {
  readonly sha256: string;
  readonly fileCount: number;
  readonly files: readonly string[];
}

export interface CollectStaticSourceGraphOptions {
  readonly repositoryRoot: string;
  readonly entry: string;
  readonly project: Project;
  readonly policy: StaticSourceGraphPolicy;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizedText(value: Buffer | string): string {
  const text = typeof value === 'string'
    ? value
    : new TextDecoder('utf-8', { fatal: true }).decode(value);
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function insideRoot(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function logicalPath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/');
}

function sourceText(sourceFile: SourceFile, label: string): string {
  const value = (sourceFile as SourceFile & { text?: unknown }).text;
  if (typeof value !== 'string') {
    throw new Error(`${label} source graph cannot inspect source text in ${sourceFile.fileName}`);
  }
  return normalizedText(value);
}

function stringSpecifier(value: unknown, sourceFile: SourceFile, label: string): string {
  const specifier = typeof value === 'string'
    ? value
    : (value as Node & { text?: unknown } | undefined)?.text;
  if (typeof specifier !== 'string' || specifier.length === 0) {
    throw new Error(`${label} source graph contains an unsupported module specifier in ${sourceFile.fileName}`);
  }
  return specifier;
}

function inspectSpecifiers(
  sourceFile: SourceFile,
  policy: StaticSourceGraphPolicy,
  encounteredExternals: Set<string>,
): string[] {
  const local: string[] = [];
  const label = policy.label;
  const allowedExternals = new Set(policy.externalSpecifiers);
  const inspect = (value: unknown): void => {
    const specifier = stringSpecifier(value, sourceFile, label);
    if (specifier === 'node:module' || specifier === 'module') {
      throw new Error(`${label} source graph rejects CommonJS loader seam ${JSON.stringify(specifier)} in ${sourceFile.fileName}`);
    }
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      local.push(specifier);
      return;
    }
    if (!allowedExternals.has(specifier)) {
      throw new Error(`${label} source graph rejects unreviewed external module specifier ${JSON.stringify(specifier)} in ${sourceFile.fileName}`);
    }
    encounteredExternals.add(specifier);
  };

  const text = sourceText(sourceFile, label);
  if (/^[ \t]*\/\/\/[ \t]*<amd-(?:dependency|module)\b/mu.test(text)) {
    throw new Error(`${label} source graph rejects AMD references in ${sourceFile.fileName}`);
  }
  const references = sourceFile as SourceFile & {
    referencedFiles?: readonly { fileName?: unknown }[];
    typeReferenceDirectives?: readonly unknown[];
    libReferenceDirectives?: readonly unknown[];
    amdDependencies?: readonly unknown[];
  };
  for (const reference of references.referencedFiles ?? []) inspect(reference.fileName);
  if ((references.typeReferenceDirectives?.length ?? 0) > 0
    || (references.libReferenceDirectives?.length ?? 0) > 0
    || (references.amdDependencies?.length ?? 0) > 0) {
    throw new Error(`${label} source graph rejects untracked type, lib, or AMD references in ${sourceFile.fileName}`);
  }

  const visit = (node: Node): void => {
    if (isCallExpression(node)) {
      if (node.expression.kind === SyntaxKind.ImportKeyword) {
        throw new Error(`${label} source graph rejects dynamic import in ${sourceFile.fileName}`);
      }
      const expression = node.expression as Node & {
        text?: unknown;
        name?: { text?: unknown };
        argumentExpression?: { text?: unknown };
      };
      const loaderName = expression.kind === SyntaxKind.Identifier
        ? expression.text
        : expression.kind === SyntaxKind.PropertyAccessExpression
          ? expression.name?.text
          : expression.kind === SyntaxKind.ElementAccessExpression
            ? expression.argumentExpression?.text
            : undefined;
      if (loaderName === 'require' || loaderName === 'createRequire') {
        throw new Error(`${label} source graph rejects CommonJS/runtime module loading in ${sourceFile.fileName}`);
      }
    }
    if (node.kind === SyntaxKind.Identifier) {
      const identifier = (node as Node & { text?: unknown }).text;
      if (identifier === 'require' || identifier === 'createRequire') {
        throw new Error(`${label} source graph rejects CommonJS/runtime module loading in ${sourceFile.fileName}`);
      }
    }
    if ((isImportDeclaration(node) || isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      inspect(node.moduleSpecifier);
    }
    if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
      inspect(node.moduleReference.expression);
    }
    if (node.kind === SyntaxKind.ImportType) {
      const argument = (node as Node & { argument?: Node & { literal?: Node } }).argument;
      inspect(argument?.literal);
    }
    if (node.kind === SyntaxKind.ModuleDeclaration) {
      const name = (node as Node & { name?: Node & { text?: unknown } }).name;
      if (name?.kind === SyntaxKind.StringLiteral) inspect(name);
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return local;
}

async function resolveLocalImport(importer: string, specifier: string, label: string): Promise<string> {
  const base = resolve(dirname(importer), specifier);
  const candidates = extname(base) === ''
    ? [...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
      ...SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`))]
    : [base];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue through the closed candidate set.
    }
  }
  throw new Error(`${label} source graph cannot resolve ${JSON.stringify(specifier)}`);
}

function assertPolicy(policy: StaticSourceGraphPolicy): void {
  if (!Number.isSafeInteger(policy.maximumFiles) || policy.maximumFiles < 1
    || !Number.isSafeInteger(policy.maximumBytes) || policy.maximumBytes < 1) {
    throw new Error(`${policy.label} source graph policy bounds must be positive safe integers`);
  }
  for (const [name, values] of [
    ['external specifiers', policy.externalSpecifiers],
    ['viewer files', policy.allowedViewerFiles],
    ['path prefixes', policy.prohibitedPathPrefixes],
    ['exact files', policy.prohibitedExactFiles],
    ['file names', policy.prohibitedFileNames],
  ] as const) {
    if (new Set(values).size !== values.length || values.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new Error(`${policy.label} source graph policy ${name} must be unique nonempty strings`);
    }
  }
}

export function assertStaticSourceGraphFiles(
  files: readonly string[],
  policy: StaticSourceGraphPolicy,
): void {
  const allowedViewer = new Set(policy.allowedViewerFiles);
  for (const file of files) {
    if (file.startsWith('games/maltline/src/viewer/') && !allowedViewer.has(file)) {
      throw new Error(`${policy.label} source graph contains an unreviewed viewer dependency`);
    }
    if (policy.prohibitedPathPrefixes.some((prefix) => file.startsWith(prefix))
      || policy.prohibitedExactFiles.includes(file)
      || policy.prohibitedFileNames.some((name) => file === name || file.endsWith(`/${name}`))) {
      throw new Error(`${policy.label} source graph crosses a prohibited production, proof, competition, or human-lab boundary`);
    }
  }
}

export async function collectStaticSourceGraph(
  options: CollectStaticSourceGraphOptions,
): Promise<StaticSourceGraphIdentity> {
  assertPolicy(options.policy);
  const root = await realpath(options.repositoryRoot);
  const entryFile = await realpath(resolve(root, options.entry));
  if (!insideRoot(root, entryFile)) throw new Error(`${options.policy.label} source graph entry escapes the repository`);
  const pending = [entryFile];
  const visited = new Set<string>();
  const encounteredExternals = new Set<string>();
  const manifest: Array<readonly [string, string]> = [];
  let totalBytes = 0;

  while (pending.length > 0) {
    const file = pending.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (visited.size > options.policy.maximumFiles) {
      throw new Error(`${options.policy.label} source graph exceeds ${options.policy.maximumFiles} files`);
    }
    if (!insideRoot(root, file)) throw new Error(`${options.policy.label} source graph escapes the repository`);
    if (!SOURCE_EXTENSIONS.includes(extname(file) as typeof SOURCE_EXTENSIONS[number])) {
      throw new Error(`${options.policy.label} source graph contains an unsupported source extension`);
    }
    const sourceFile = options.project.program.getSourceFile(file);
    if (sourceFile === undefined) {
      throw new Error(`${options.policy.label} source graph file is outside the TypeScript project`);
    }
    const source = sourceText(sourceFile, options.policy.label);
    const disk = normalizedText(await readFile(file));
    if (disk !== source) {
      throw new Error(`${options.policy.label} source graph file changed during TypeScript snapshot: ${logicalPath(root, file)}`);
    }
    const byteLength = Buffer.byteLength(source);
    if (byteLength > options.policy.maximumBytes - totalBytes) {
      throw new Error(`${options.policy.label} source graph exceeds ${options.policy.maximumBytes} bytes`);
    }
    totalBytes += byteLength;
    manifest.push([logicalPath(root, file), sha256(source)]);
    for (const specifier of inspectSpecifiers(sourceFile, options.policy, encounteredExternals)) {
      const imported = await realpath(await resolveLocalImport(file, specifier, options.policy.label));
      if (!insideRoot(root, imported)) throw new Error(`${options.policy.label} source graph import escapes the repository`);
      pending.push(imported);
    }
  }

  const expectedExternal = [...options.policy.externalSpecifiers].sort();
  const actualExternal = [...encounteredExternals].sort();
  if (JSON.stringify(actualExternal) !== JSON.stringify(expectedExternal)) {
    throw new Error(`${options.policy.label} source graph external dependency set does not match its exact policy`);
  }
  manifest.sort(([left], [right]) => left.localeCompare(right, 'en'));
  const files = Object.freeze(manifest.map(([path]) => path));
  assertStaticSourceGraphFiles(files, options.policy);
  return Object.freeze({ sha256: sha256(JSON.stringify(manifest)), fileCount: files.length, files });
}
