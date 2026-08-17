import { describe, expect, it } from 'vitest';
import { OpenAIResponsesDriver } from '../src';

describe('OpenAIResponsesDriver', () => {
  it('continues a tool conversation with call-linked outputs', async () => {
    const bodies: unknown[] = [];
    let request = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      request++;
      return new Response(
        JSON.stringify(
          request === 1
            ? {
                id: 'response-1',
                output: [{ type: 'function_call', call_id: 'call-1', name: 'observe', arguments: '{}' }],
                usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 2 } },
              }
            : {
                id: 'response-2',
                output: [{ type: 'message', content: [{ type: 'output_text', text: 'done' }] }],
                usage: { input_tokens: 8, output_tokens: 1 },
              },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const driver = new OpenAIResponsesDriver({
      model: 'test-model',
      instructions: 'play',
      kickoff: 'begin',
      apiKey: 'test-key',
      fetchImpl,
      tools: [{ name: 'observe', description: 'observe', parameters: { type: 'object', properties: {} } }],
    });
    const first = await driver.step();
    expect(first.toolCalls[0]?.name).toBe('observe');
    const second = await driver.step([{ callId: 'call-1', name: 'observe', value: { tick: 10 } }]);
    expect(second.text).toBe('done');
    expect(bodies[1]).toMatchObject({
      previous_response_id: 'response-1',
      input: [{ type: 'function_call_output', call_id: 'call-1', output: '{"tick":10}' }],
    });
  });
});

