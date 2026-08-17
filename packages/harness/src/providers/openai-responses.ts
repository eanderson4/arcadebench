import type { JsonObject, JsonValue, ToolDefinition, ToolResult } from '@arcadebench/bench-core';
import type { AgentTurn, ModelDriver } from '../model';

export interface OpenAIResponsesOptions {
  model: string;
  instructions: string;
  tools: readonly ToolDefinition[];
  kickoff: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  request?: JsonObject;
}

interface ResponseBody {
  id: string;
  output: Array<
    | { type: 'message'; content: Array<{ type: string; text?: string }> }
    | { type: 'function_call'; call_id: string; name: string; arguments: string }
    | { type: string }
  >;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

function parseArguments(raw: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return { _parseError: raw.slice(0, 500) };
  }
}

async function fetchResponse(options: OpenAIResponsesOptions, body: JsonObject): Promise<ResponseBody> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? 6;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  if (!options.apiKey) throw new Error('OPENAI_API_KEY is not set');
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/responses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
        continue;
      }
      throw error;
    }
    if (response.ok) return (await response.json()) as ResponseBody;
    const message = await response.text();
    if ([408, 409, 429, 500, 502, 503, 529].includes(response.status) && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`OpenAI Responses API returned HTTP ${response.status}: ${message.slice(0, 1000)}`);
  }
}

export class OpenAIResponsesDriver implements ModelDriver {
  readonly tools: readonly ToolDefinition[];
  private previousResponseId: string | null = null;
  private pendingUser: string[];

  constructor(private readonly options: OpenAIResponsesOptions) {
    this.tools = options.tools;
    this.pendingUser = [options.kickoff];
  }

  pushUser(message: string): void {
    this.pendingUser.push(message);
  }

  async step(results?: readonly ToolResult[]): Promise<AgentTurn> {
    const input: JsonValue[] = [];
    for (const result of results ?? []) {
      input.push({
        type: 'function_call_output',
        call_id: result.callId,
        output: JSON.stringify(result.value),
      });
    }
    for (const message of this.pendingUser) input.push({ role: 'user', content: message });
    this.pendingUser = [];

    const tools: JsonValue[] = this.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      // Some benchmark schemas intentionally contain optional telemetry fields.
      // Explicit non-strict mode keeps those schemas legal and auditable.
      strict: false,
    }));
    const body: JsonObject = {
      model: this.options.model,
      instructions: this.options.instructions,
      input,
      tools,
      store: true,
      ...(this.previousResponseId ? { previous_response_id: this.previousResponseId } : {}),
      ...(this.options.request ?? {}),
    };
    const response = await fetchResponse(this.options, body);
    this.previousResponseId = response.id;
    const text = response.output
      .filter((item): item is Extract<ResponseBody['output'][number], { type: 'message' }> => item.type === 'message')
      .flatMap((item) => item.content)
      .filter((content) => content.type === 'output_text')
      .map((content) => content.text ?? '')
      .join('\n');
    const toolCalls = response.output
      .filter((item): item is Extract<ResponseBody['output'][number], { type: 'function_call' }> => item.type === 'function_call')
      .map((item) => ({ id: item.call_id, name: item.name, arguments: parseArguments(item.arguments) }));
    return {
      text,
      toolCalls,
      usage: {
        input: response.usage?.input_tokens ?? 0,
        output: response.usage?.output_tokens ?? 0,
        cachedInput: response.usage?.input_tokens_details?.cached_tokens ?? 0,
        ...(response.usage?.output_tokens_details?.reasoning_tokens
          ? { reasoning: response.usage.output_tokens_details.reasoning_tokens }
          : {}),
      },
    };
  }
}

