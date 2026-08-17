import type { ToolDefinition } from '@arcadebench/bench-core';

const inputProperties = {
  direction: { type: 'string', enum: ['up', 'down', 'left', 'right', 'idle'] },
  draw: { type: 'string', enum: ['off', 'fast', 'slow'] },
};

export const PARTITION_TOOLS: readonly ToolDefinition[] = [
  {
    name: 'get_status',
    description: 'Read a current snapshot. The game continues running before, during, and after this call.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'set_input',
    description: 'Replace the currently latched joystick input. The input remains active until another signal replaces it.',
    parameters: {
      type: 'object',
      properties: inputProperties,
      required: ['direction', 'draw'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_controller',
    description:
      'Atomically install a resident timed controller. It continues driving the Spark while you think. Steps run in order for their specified tick counts.',
    parameters: {
      type: 'object',
      properties: {
        program: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              minItems: 1,
              maxItems: 256,
              items: {
                type: 'object',
                properties: {
                  ticks: { type: 'integer', minimum: 1, maximum: 10000 },
                  input: {
                    type: 'object',
                    properties: inputProperties,
                    required: ['direction', 'draw'],
                    additionalProperties: false,
                  },
                },
                required: ['ticks', 'input'],
                additionalProperties: false,
              },
            },
            loop: { type: 'boolean' },
            fallback: {
              type: 'object',
              properties: inputProperties,
              required: ['direction', 'draw'],
              additionalProperties: false,
            },
          },
          required: ['steps'],
          additionalProperties: false,
        },
      },
      required: ['program'],
      additionalProperties: false,
    },
  },
  {
    name: 'watch_gameplay',
    description:
      'Observe an interval of an already-running game. The engine and installed controller remain active throughout the interval and after the result returns.',
    parameters: {
      type: 'object',
      properties: {
        ticks: { type: 'integer', minimum: 1, maximum: 1800 },
        sampleEveryTicks: { type: 'integer', minimum: 1, maximum: 300 },
      },
      required: ['ticks'],
      additionalProperties: false,
    },
  },
];

