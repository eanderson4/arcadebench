import type { ProtocolDefinition, ProtocolRef } from './types';

function protocolKey(ref: ProtocolRef): string {
  return `${ref.gameId}@${ref.generation}`;
}

export class ProtocolRegistry {
  private readonly entries = new Map<string, ProtocolDefinition>();

  register(protocol: ProtocolDefinition): void {
    const key = protocolKey(protocol);
    if (this.entries.has(key)) throw new Error(`protocol already registered: ${key}`);
    this.entries.set(key, structuredClone(protocol));
  }

  resolve(ref: ProtocolRef): ProtocolDefinition {
    const key = protocolKey(ref);
    const protocol = this.entries.get(key);
    if (!protocol) throw new Error(`unknown protocol: ${key}`);
    return structuredClone(protocol);
  }

  list(gameId?: string): ProtocolDefinition[] {
    return [...this.entries.values()]
      .filter((protocol) => gameId === undefined || protocol.gameId === gameId)
      .map((protocol) => structuredClone(protocol))
      .sort((a, b) => protocolKey(a).localeCompare(protocolKey(b)));
  }
}

