import { describe, expect, it } from 'vitest';
import {
  PARTITION_CAMPAIGN_SEED,
  asciiMask,
  cloneCampaignLevel,
  createPartitionCampaign,
  getCampaignLevel,
  listCampaignLevels,
  playableCellCount,
  spawnDeterministicAnomalies,
  validateCampaign,
  validateLevel,
  wallLine,
  wallsAroundMask,
} from '../src/levels';

describe('Partition level-authoring toolbox', () => {
  it('scales ASCII silhouettes and outlines only their playable frontier', () => {
    const board = asciiMask([
      '....',
      '.##.',
      '....',
    ], 2);

    expect(board).toMatchObject({ width: 8, height: 6 });
    expect(board.blockedCells).toHaveLength(8);
    expect(new Set(board.blockedCells).size).toBe(board.blockedCells.length);
    expect(wallsAroundMask(board)).toHaveLength(12);
  });

  it('rejects malformed ASCII and non-axis-aligned walls', () => {
    expect(() => asciiMask(['...', '..'])).toThrow(/same width/);
    expect(() => asciiMask(['...'], 0)).toThrow(/positive integer/);
    expect(() => wallLine({ x: 0, y: 0 }, { x: 2, y: 1 })).toThrow(/axis-aligned/);
  });

  it('spawns deterministic, moving anomalies only in playable cells', () => {
    const board = asciiMask([
      '.....',
      '.###.',
      '.....',
    ]);
    const options = {
      seed: 42,
      count: 5,
      width: board.width,
      height: board.height,
      blockedCells: board.blockedCells,
      speed: [0.1, 0.2] as const,
    };
    const first = spawnDeterministicAnomalies(options);
    const second = spawnDeterministicAnomalies(options);

    expect(first).toEqual(second);
    expect(new Set(first.map((anomaly) => `${Math.floor(anomaly.position[0])},${Math.floor(anomaly.position[1])}`)).size).toBe(5);
    for (const anomaly of first) {
      const [x, y] = anomaly.position;
      expect(board.blockedCells).not.toContain(Math.floor(y) * board.width + Math.floor(x));
      expect(Math.hypot(...anomaly.velocity)).toBeGreaterThanOrEqual(0.1);
      expect(Math.hypot(...anomaly.velocity)).toBeLessThanOrEqual(0.2);
    }
  });
});

describe('Partition campaign catalog', () => {
  const campaign = createPartitionCampaign();

  it('contains twenty ordered, uniquely identified levels across four even tiers', () => {
    expect(campaign).toHaveLength(20);
    expect(campaign.map((level) => level.metadata.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(new Set(campaign.map((level) => level.scenario.id)).size).toBe(20);
    expect(new Set(campaign.map((level) => level.metadata.title)).size).toBe(20);
    expect(Object.fromEntries(['easy', 'medium', 'hard', 'impossible'].map((tier) => [
      tier,
      campaign.filter((level) => level.metadata.tier === tier).length,
    ]))).toEqual({ easy: 5, medium: 5, hard: 5, impossible: 5 });
    expect(validateCampaign(campaign)).toMatchObject({ valid: true, errors: [] });
  });

  it('validates every authored level and reports its exact playable cell count', () => {
    for (const level of campaign) {
      const validation = validateLevel(level);
      expect(validation.errors, level.scenario.id).toEqual([]);
      expect(validation.valid).toBe(true);
      expect(validation.playableCellCount).toBe(
        level.scenario.width * level.scenario.height - level.scenario.blockedCells.length,
      );
      expect(playableCellCount(level.scenario)).toBe(validation.playableCellCount);
      expect(validation.playableCellCount).toBeGreaterThan(200);
    }
  });

  it('keeps every spawn inside a distinct playable cell with a valid velocity', () => {
    for (const level of campaign) {
      const blocked = new Set(level.scenario.blockedCells);
      const occupied = new Set<string>();
      for (const anomaly of level.scenario.anomalies) {
        const [x, y] = anomaly.position;
        const cellX = Math.floor(x);
        const cellY = Math.floor(y);
        expect(x, level.scenario.id).toBeGreaterThanOrEqual(0);
        expect(x, level.scenario.id).toBeLessThan(level.scenario.width);
        expect(y, level.scenario.id).toBeGreaterThanOrEqual(0);
        expect(y, level.scenario.id).toBeLessThan(level.scenario.height);
        expect(blocked.has(cellY * level.scenario.width + cellX), level.scenario.id).toBe(false);
        expect(occupied.has(`${cellX},${cellY}`), level.scenario.id).toBe(false);
        occupied.add(`${cellX},${cellY}`);
        expect(Math.hypot(...anomaly.velocity), level.scenario.id).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic for a campaign seed while preserving authored geometry across seeds', () => {
    expect(createPartitionCampaign(PARTITION_CAMPAIGN_SEED)).toEqual(createPartitionCampaign(PARTITION_CAMPAIGN_SEED));
    const alternate = createPartitionCampaign(PARTITION_CAMPAIGN_SEED + 1);
    expect(alternate[0]?.scenario.anomalies).not.toEqual(campaign[0]?.scenario.anomalies);
    expect(alternate.map((level) => level.metadata)).toEqual(campaign.map((level) => level.metadata));
    expect(alternate.map((level) => level.scenario.blockedCells)).toEqual(
      campaign.map((level) => level.scenario.blockedCells),
    );
    expect(alternate.map((level) => level.scenario.initialWalls)).toEqual(
      campaign.map((level) => level.scenario.initialWalls),
    );
  });

  it('supports number, id, slug, and tier lookup without exposing mutable catalog state', () => {
    expect(getCampaignLevel(9)?.metadata.title).toBe('Hollow Core');
    expect(getCampaignLevel('partition-09-hollow-core')?.metadata.number).toBe(9);
    expect(getCampaignLevel('hollow-core')?.metadata.number).toBe(9);
    expect(getCampaignLevel('missing')).toBeUndefined();
    expect(listCampaignLevels('hard')).toHaveLength(5);

    const fetched = getCampaignLevel(1)!;
    fetched.scenario.blockedCells.push(0);
    fetched.metadata.features.push('mutation');
    expect(getCampaignLevel(1)).toEqual(cloneCampaignLevel(campaign[0]!));
  });

  it('reports invalid authored data with actionable errors', () => {
    const invalid = cloneCampaignLevel(campaign[0]!);
    invalid.scenario.anomalies[0]!.position = [-1, 2];
    invalid.scenario.sparkStart = { x: 3, y: 3 };
    invalid.scenario.blockedCells.push(0, 0);
    const result = validateLevel(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/outside the board/);
    expect(result.errors.join(' ')).toMatch(/Spark must start/);
    expect(result.errors.join(' ')).toMatch(/duplicated/);
    expect(validateCampaign([])).toMatchObject({ valid: false, errors: ['A campaign needs at least one level.'] });
  });
});
