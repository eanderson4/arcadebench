export type CanonicalValue = null | boolean | number | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export const MAX_CANONICAL_JSON_DEPTH = 64;

export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

function dataProperty(object: object, key: PropertyKey, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw new CanonicalJsonError(`${label} must be an enumerable data property.`);
  }
  return descriptor.value;
}

function serializeCanonical(value: unknown, ancestors: Set<object>, depth: number): string {
  if (depth > MAX_CANONICAL_JSON_DEPTH) {
    throw new CanonicalJsonError(
      `Canonical JSON exceeds the maximum depth of ${MAX_CANONICAL_JSON_DEPTH}.`,
    );
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError('Canonical JSON numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError('Canonical JSON contains an unsupported value.');
  }
  if (ancestors.has(value)) {
    throw new CanonicalJsonError('Canonical JSON must not contain cycles.');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const expectedKeys = new Set<PropertyKey>([
        ...Array.from({ length: value.length }, (_unused, index) => String(index)),
        'length',
      ]);
      if (Reflect.ownKeys(value).some((key) => !expectedKeys.has(key))) {
        throw new CanonicalJsonError('Canonical JSON arrays must not contain extra properties.');
      }
      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        items.push(serializeCanonical(
          dataProperty(value, String(index), `Canonical JSON array item ${index}`),
          ancestors,
          depth + 1,
        ));
      }
      return `[${items.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalJsonError('Canonical JSON objects must use plain object prototypes.');
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      throw new CanonicalJsonError('Canonical JSON objects must not contain symbol keys.');
    }
    return `{${(keys as string[]).sort().map((key) => (
      `${JSON.stringify(key)}:${serializeCanonical(
        dataProperty(value, key, `Canonical JSON property ${key}`),
        ancestors,
        depth + 1,
      )}`
    )).join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * JSON with recursively sorted object keys. The runtime boundary rejects
 * accessors, cycles, exotic prototypes, non-finite numbers, and excessive
 * nesting before any caller-controlled property value is read.
 */
export function canonicalJson(value: CanonicalValue): string {
  return serializeCanonical(value, new Set<object>(), 0);
}

/** Stable FNV-1a/64 digest of canonical UTF-8 JSON. This is an identity, not a security hash. */
export function fingerprintCanonical(value: CanonicalValue): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonicalJson(value))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

/** Stable lowercase SHA-256 of canonical UTF-8 JSON in Node and Workers. */
export async function sha256Canonical(value: CanonicalValue): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
