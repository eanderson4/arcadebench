const command = process.argv[2] ?? 'help';

if (command === 'help') {
  console.log(`ArcadeBench CLI

Commands under construction:
  list       list games and frozen protocols
  run        run a model against a protocol
  replay     inspect or serve a replay
  aggregate  aggregate a protocol generation
  doctor     validate the local benchmark environment`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

