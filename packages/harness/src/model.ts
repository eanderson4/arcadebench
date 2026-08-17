import type { JsonValue, TokenUsage, ToolCall, ToolDefinition, ToolResult } from '@arcadebench/bench-core';

export interface AgentTurn {
  text: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  raw?: JsonValue;
}

export interface ModelDriver {
  readonly tools: readonly ToolDefinition[];
  step(results?: readonly ToolResult[]): Promise<AgentTurn>;
  pushUser?(message: string): void;
  close?(): Promise<void>;
}

export class ScriptedDriver implements ModelDriver {
  private index = 0;
  readonly receivedResults: ToolResult[][] = [];

  constructor(readonly tools: readonly ToolDefinition[], private readonly turns: readonly AgentTurn[]) {}

  async step(results?: readonly ToolResult[]): Promise<AgentTurn> {
    this.receivedResults.push(results ? structuredClone([...results]) : []);
    const turn = this.turns[this.index++];
    if (!turn) throw new Error('scripted model has no remaining turns');
    return structuredClone(turn);
  }
}

