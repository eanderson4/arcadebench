import { describe, expect, it } from 'vitest';
import { MALTLINE_CABINET_AUTHORITY as legacy } from '../src/core/cabinet-authority';
import { MALTLINE_CURRENT_CABINET_AUTHORITY as current, MALTLINE_CABINET_2_CONFIGURATION,
  resolveMaltlineCabinetAuthority } from '../src/core/cabinet-authorities';
import { MALTLINE_GENERATION_2_AUTHORITY } from '../src/core/authority';
import { sha256Canonical } from '../src/core/fingerprint';
import { buildMaltlineCabinetProof, verifyMaltlineCabinetProof } from '../src/core/cabinet-proof';
import { cabinetReplays } from './support/cabinet-fixtures';

const challenge = { runId: 'run_progression', nonce: 23 };

describe('versioned cabinet progression', () => {
  it('pins the new authority while preserving both older campaign snapshots', async () => {
    expect(await sha256Canonical(MALTLINE_CABINET_2_CONFIGURATION)).toBe(current.configurationSha256);
    expect(resolveMaltlineCabinetAuthority('cabinet-2')).toBe(current);
    expect(resolveMaltlineCabinetAuthority('cabinet-1')).toBe(legacy);
    expect(resolveMaltlineCabinetAuthority('cabinet-3')).toBeNull();
    expect(current.campaign[2]).toMatchObject({ lanes: 3, stations: ['vanilla', 'chocolate'] });
    expect(current.campaign[3]).toMatchObject({ lanes: 3, stations: ['vanilla', 'chocolate', 'strawberry'] });
    expect(legacy.campaign[2]!.stations).toHaveLength(3);
    expect(MALTLINE_GENERATION_2_AUTHORITY.campaign[2]!.stations).toHaveLength(3);
    expect(Object.isFrozen(current.campaign[2]!.stations)).toBe(true);
    for (const index of [0, 1, 3, 4, 5, 6, 7]) expect(current.campaign[index]).toEqual(legacy.campaign[index]);
    expect(current.authorityId).not.toBe(legacy.authorityId);
    expect(current.seasonId).not.toBe(legacy.seasonId);
  });

  it('verifies all eight current stages with authoritative carryover and retains old proof verification', () => {
    const oldReplays = cabinetReplays(true);
    const oldProof = buildMaltlineCabinetProof(oldReplays, challenge);
    expect(verifyMaltlineCabinetProof(oldProof, challenge).summary).toMatchObject({ completed: true, totalTicks: 21662, score: 36255 });
    const replays = cabinetReplays(true, current);
    const proof = buildMaltlineCabinetProof(replays, challenge, current.gameVersion);
    const verified = verifyMaltlineCabinetProof(proof, challenge, current.gameVersion);
    expect(proof.gameVersion).toBe('cabinet-2');
    expect(verified.summary).toMatchObject({ completed: true, stageReached: 8, stagesCleared: 8,
      score: replays.at(-1)!.finalState.score, lives: replays.at(-1)!.finalState.lives });
    expect(verified.summary.totalTicks).toBe(replays.reduce((sum, replay) => sum + replay.ticks.length, 0));
    expect(() => buildMaltlineCabinetProof(oldReplays, challenge, current.gameVersion)).toThrow(/scenario/);
    expect(() => buildMaltlineCabinetProof(replays, challenge, legacy.gameVersion)).toThrow(/scenario/);
  });

  it('rejects cross-version ranked challenges even when Stage 1 inputs are identical', () => {
    const replays = cabinetReplays(false);
    const oldProof = buildMaltlineCabinetProof(replays, challenge);
    const newProof = buildMaltlineCabinetProof(replays, challenge, current.gameVersion);
    expect(() => verifyMaltlineCabinetProof(oldProof, challenge, current.gameVersion)).toThrow(/authority or version/);
    expect(() => verifyMaltlineCabinetProof(newProof, challenge, legacy.gameVersion)).toThrow(/authority or version/);
    expect(() => verifyMaltlineCabinetProof({ ...newProof, authorityId: legacy.authorityId }, challenge)).toThrow(/authority or version/);
    expect(verifyMaltlineCabinetProof(oldProof, challenge).summary).toEqual(verifyMaltlineCabinetProof(newProof, challenge).summary);
  });
});
