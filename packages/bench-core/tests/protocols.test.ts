import { describe, expect, it } from 'vitest';
import { ProtocolRegistry } from '../src';

describe('ProtocolRegistry', () => {
  it('rejects duplicate generation identities', () => {
    const registry = new ProtocolRegistry();
    const protocol = {
      gameId: 'partition',
      generation: 'dev-0',
      title: 'Development',
      description: 'Mutable development protocol',
      sessionKind: 'continuous' as const,
      config: {},
    };
    registry.register(protocol);
    expect(() => registry.register(protocol)).toThrow(/already registered/);
  });

  it('returns defensive copies', () => {
    const registry = new ProtocolRegistry();
    registry.register({
      gameId: 'partition',
      generation: 'dev-0',
      title: 'Development',
      description: 'Mutable development protocol',
      sessionKind: 'continuous',
      config: { target: 0.75 },
    });
    const first = registry.resolve({ gameId: 'partition', generation: 'dev-0' });
    first.title = 'changed';
    expect(registry.resolve(first).title).toBe('Development');
  });
});

