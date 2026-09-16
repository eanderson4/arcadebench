const TOOLCHAIN_ROOTS = Object.freeze([
  'node_modules/tsx',
  'node_modules/typescript',
] as const);

type LockPackage = Record<string, unknown>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function dependencyNames(entry: LockPackage, field: string): readonly string[] {
  const value = entry[field];
  if (value === undefined) return [];
  return Object.keys(objectValue(value, `lock package ${field}`));
}

function resolveDependency(
  packages: Record<string, unknown>,
  issuer: string,
  dependency: string,
): string | undefined {
  let scope = issuer;
  while (true) {
    const candidate = `${scope}/node_modules/${dependency}`;
    if (packages[candidate] !== undefined) return candidate;
    const parentIndex = scope.lastIndexOf('/node_modules/');
    if (parentIndex < 0) break;
    scope = scope.slice(0, parentIndex);
  }
  const rootCandidate = `node_modules/${dependency}`;
  return packages[rootCandidate] === undefined ? undefined : rootCandidate;
}

/**
 * Returns the npm lock entries that can affect the TypeScript/tsx artifact
 * producer. Workspace records and packages outside this dependency closure do
 * not participate in Maltline artifact identity.
 */
export function artifactToolchainLockIdentity(lockfileValue: unknown): Record<string, unknown> {
  const lockfile = objectValue(lockfileValue, 'root package lock');
  const packages = objectValue(lockfile.packages, 'root package lock packages');
  const selected = new Map<string, LockPackage>();
  const pending: string[] = [...TOOLCHAIN_ROOTS];

  while (pending.length > 0) {
    const path = pending.pop()!;
    if (selected.has(path)) continue;
    const entry = objectValue(packages[path], `root package lock entry ${path}`);
    selected.set(path, entry);
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      for (const dependency of dependencyNames(entry, field)) {
        const resolved = resolveDependency(packages, path, dependency);
        if (resolved !== undefined) pending.push(resolved);
        else if (field === 'dependencies') {
          throw new Error(`root package lock is missing ${dependency}, required by ${path}`);
        }
      }
    }
  }

  return {
    lockfileVersion: lockfile.lockfileVersion,
    packages: Object.fromEntries([...selected].sort(([left], [right]) => left.localeCompare(right))),
  };
}
