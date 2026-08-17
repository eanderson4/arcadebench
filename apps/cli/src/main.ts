import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { ProtocolRegistry, RunStore, zeroUsage } from '@arcadebench/bench-core';
import type { JsonObject, RunManifest } from '@arcadebench/bench-core';
import { OpenAIResponsesDriver, runHarness } from '@arcadebench/harness';
import { partitionPlugin } from '@arcadebench/partition';

const registry = new ProtocolRegistry();
for (const protocol of partitionPlugin.protocols()) registry.register(protocol);

function help(): void {
  console.log(`ArcadeBench CLI

Usage: npm run bench -- <command>

Commands:
  list       list games and protocol generations
  doctor     validate the local benchmark environment
  run        run a model against a protocol
  replay     inspect or serve a replay (in progress)
  aggregate  aggregate a protocol generation (in progress)

Run example:
  npm run bench -- run --game partition --generation dev-0 \\
    --provider openai --model <model-id> --seed 11 --max-turns 40`);
}

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for --${name}`);
  return value;
}

async function run(): Promise<void> {
  const gameId = option('game', 'partition')!;
  const generation = option('generation', 'dev-0')!;
  const provider = option('provider', 'openai')!;
  const model = option('model');
  if (!model) throw new Error('run requires --model <model-id>');
  if (gameId !== partitionPlugin.gameId) throw new Error(`unknown game: ${gameId}`);
  if (provider !== 'openai') throw new Error(`provider adapter not installed: ${provider}`);
  const protocol = registry.resolve({ gameId, generation });
  const seed = Number(option('seed', '11'));
  const maxTurns = Number(option('max-turns', '40'));
  if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
  if (!Number.isInteger(maxTurns) || maxTurns < 1) throw new Error('--max-turns must be a positive integer');
  const runId = `${gameId}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const request: JsonObject = {};
  const reasoningEffort = option('reasoning-effort');
  if (reasoningEffort) request.reasoning = { effort: reasoningEffort };
  const manifest: RunManifest = {
    schemaVersion: 1,
    runId,
    status: 'created',
    protocol: { gameId, generation },
    model: { provider, model, label: option('label', model)!, ...(reasoningEffort ? { parameters: { reasoningEffort } } : {}) },
    source: {
      platform: { revision: process.env.ARCADEBENCH_REVISION, dirty: process.env.ARCADEBENCH_DIRTY === '1' },
      game: { revision: process.env.ARCADEBENCH_GAME_REVISION },
    },
    execution: {
      sessionKind: protocol.sessionKind,
      startedAt: new Date().toISOString(),
      host: { node: process.versions.node, platform: process.platform, arch: process.arch },
    },
    usage: zeroUsage(),
    attempts: [],
    artifacts: [],
  };
  const store = RunStore.create(resolve(option('out', 'runs')!), manifest);
  const session = await partitionPlugin.createSession(protocol, {
    runId,
    scenarioId: option('scenario', 'classic')!,
    seed,
    artifactDir: resolve(store.runDir, 'artifacts'),
  });
  const driver = new OpenAIResponsesDriver({
    model,
    instructions: partitionPlugin.systemPrompt(protocol),
    tools: partitionPlugin.tools(protocol),
    kickoff: 'The game is running now. Inspect the current field and begin developing a controller.',
    apiKey: process.env.OPENAI_API_KEY,
    ...(Object.keys(request).length > 0 ? { request } : {}),
  });
  console.log(`run=${runId} protocol=${gameId}@${generation} model=${model} seed=${seed}`);
  const result = await runHarness({ driver, session, store, maxTurns });
  console.log(JSON.stringify(result, null, 2));
  console.log(`manifest=${store.manifestPath}`);
  if (result.status !== 'complete') process.exitCode = 1;
}

function list(): void {
  for (const protocol of registry.list()) {
    console.log(`${protocol.gameId}@${protocol.generation}\t${protocol.sessionKind}\t${protocol.title}`);
  }
}

function doctor(): void {
  const problems: string[] = [];
  if (Number(process.versions.node.split('.')[0]) < 22) problems.push(`Node 22+ required; found ${process.versions.node}`);
  if (registry.list().length === 0) problems.push('no benchmark protocols registered');
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK Node ${process.versions.node}`);
  console.log(`OK ${registry.list().length} protocol generation(s) registered`);
  console.log('OK Partition continuous-session plugin loaded');
}

const command = process.argv[2] ?? 'help';
switch (command) {
  case 'help':
  case '--help':
  case '-h':
    help();
    break;
  case 'list':
    list();
    break;
  case 'doctor':
    doctor();
    break;
  case 'run':
    await run();
    break;
  case 'replay':
  case 'aggregate':
    console.error(`${command} is scaffolded but not implemented yet.`);
    process.exitCode = 2;
    break;
  default:
    console.error(`Unknown command: ${command}\n`);
    help();
    process.exitCode = 1;
}
