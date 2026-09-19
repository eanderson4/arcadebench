import type { BlockshopStage, BrickMaterial, BrickSpec, PowerKind } from '../core/types';

const LEGEND: Readonly<Record<string, { material: BrickMaterial; hits: number; power: PowerKind | null }>> = {
  '1': { material: 'paint', hits: 1, power: null },
  '2': { material: 'hardwood', hits: 2, power: null },
  X: { material: 'steel', hits: 99, power: null },
  W: { material: 'paint', hits: 1, power: 'wide' },
  O: { material: 'paint', hits: 1, power: 'slow' },
  M: { material: 'paint', hits: 1, power: 'multi' },
  G: { material: 'hardwood', hits: 2, power: 'sticky' },
  H: { material: 'hardwood', hits: 2, power: 'heavy' },
  E: { material: 'hardwood', hits: 2, power: 'extra' },
};

function parseLayout(stageId: string, rows: readonly string[]): BrickSpec[] {
  const bricks: BrickSpec[] = [];
  rows.forEach((row, rowIndex) => {
    [...row].forEach((cell, column) => {
      const rule = LEGEND[cell];
      if (!rule) return;
      bricks.push({
        id: `${stageId}-${rowIndex}-${column}`,
        column,
        row: rowIndex,
        ...rule,
      });
    });
  });
  return bricks;
}

function stage(
  number: number,
  id: string,
  title: string,
  lesson: string,
  accent: string,
  ballSpeed: number,
  rows: readonly string[],
): BlockshopStage {
  return { id, number, title, lesson, accent, ballSpeed, bricks: parseLayout(id, rows) };
}

export const BLOCKSHOP_STAGES: readonly BlockshopStage[] = [
  stage(1, 'first-cut', 'First Cut', 'Clear the painted blocks. Keep the bearing above the tray.', '#ef6a47', 10, [
    '.11111111.',
    '11.1111.11',
    '..111111..',
  ]),
  stage(2, 'wide-load', 'Wide Load', 'The arrow widens the tray. The +1 tag adds another ball.', '#f2bd3f', 10, [
    '.11111111.',
    '11.1111.11',
    '..11WE11..',
  ]),
  stage(3, 'hard-grain', 'Hard Grain', 'Dark hardwood needs two hits. The wave tag slows every ball.', '#68a879', 11, [
    '.22111122.',
    '11.2222.11',
    '..11OO11..',
  ]),
  stage(4, 'split-shift', 'Split Shift', 'The ×3 tag puts three bearings in play at once.', '#4f86c6', 11, [
    '.11111111.',
    '11XX11XX11',
    '..11MM11..',
  ]),
  stage(5, 'steel-rack', 'Steel Rack', 'Steel never breaks. Use it to reach the extra-ball tag.', '#d45e88', 12, [
    'X.111111.X',
    '11X1111X11',
    '..11EE11..',
  ]),
  stage(6, 'glue-bench', 'Glue Bench', 'Glue catches the next return. Press Action to choose the release.', '#9c6bc3', 13, [
    '.22111122.',
    '11X1111X11',
    '..11GG11..',
  ]),
  stage(7, 'heavy-duty', 'Heavy Duty', 'The diamond tag drives straight through breakable blocks.', '#eb8245', 14, [
    '.22222222.',
    '11X2222X11',
    '..11HH11..',
  ]),
  stage(8, 'closing-bell', 'Closing Bell', 'Every material and every tool. Empty the final rack.', '#315b67', 16, [
    'X11111111X',
    '.2X1111X2.',
    '11.1111.11',
    '..HWMOGE..',
  ]),
];

export function blockshopStage(stageId: string): BlockshopStage {
  const found = BLOCKSHOP_STAGES.find((candidate) => candidate.id === stageId);
  if (!found) throw new Error(`Unknown Blockshop stage: ${stageId}`);
  return found;
}
