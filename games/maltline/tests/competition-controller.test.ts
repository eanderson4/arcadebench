import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MaltlineCompetitionApiError } from '../src/viewer/competition-client';
import {
  classifyMaltlineSubmissionFailure,
  maltlineCompetitionServicesEnabled,
} from '../src/viewer/competition-controller';

describe('Maltline competition service admission', () => {
  it('enables same-origin competition services on deployed hosts', () => {
    expect(maltlineCompetitionServicesEnabled({
      hostname: 'arcadebench.example',
      search: '',
    }, false)).toBe(true);
  });

  it.each(['localhost', 'maltline.localhost', '127.0.0.1', '::1'])(
    'keeps ordinary local sessions hermetic on %s',
    (hostname) => {
      expect(maltlineCompetitionServicesEnabled({ hostname, search: '' }, true)).toBe(false);
      expect(maltlineCompetitionServicesEnabled({
        hostname,
        search: '?ranked=preview',
      }, false)).toBe(false);
    },
  );

  it('allows an explicit development-only preview on localhost', () => {
    expect(maltlineCompetitionServicesEnabled({
      hostname: '127.0.0.1',
      search: '?fixture=title&ranked=preview',
    }, true)).toBe(true);
  });

  it('keeps proof and competition lifecycle state memory-only', () => {
    const sources = [
      'competition-controller.ts',
      'competition-client.ts',
      'ranked-proof-recorder.ts',
      'main.ts',
    ].map((file) => readFileSync(resolve(import.meta.dirname, `../src/viewer/${file}`), 'utf8'));
    for (const source of sources) {
      expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
    }
  });

  it('keeps moderated callsigns editable, makes terminal client errors final, and retries transient failures', () => {
    expect(classifyMaltlineSubmissionFailure(
      new MaltlineCompetitionApiError(400, 'moderated', 'maltline_callsign_rejected'),
      200,
      'EDIT ME',
    )).toEqual({
      proofIneligible: false,
      submission: {
        kind: 'eligible',
        score: 200,
        initialCallsign: 'EDIT ME',
        errorMessage: 'That callsign was not accepted. Edit it and try again.',
      },
    });

    for (const error of [
      new MaltlineCompetitionApiError(400, 'invalid proof', 'maltline_proof_invalid'),
      new MaltlineCompetitionApiError(400, 'uncoded malformed request'),
      ...[401, 403, 409, 410, 422].map(
        (status) => new MaltlineCompetitionApiError(status, 'terminal'),
      ),
    ]) {
      expect(classifyMaltlineSubmissionFailure(
        error,
        200,
        'NO RETRY',
      )).toMatchObject({
        proofIneligible: true,
        submission: { kind: 'ineligible' },
      });
    }

    for (const error of [
      new MaltlineCompetitionApiError(429, 'slow down'),
      new MaltlineCompetitionApiError(503, 'offline'),
      new TypeError('network'),
    ]) {
      expect(classifyMaltlineSubmissionFailure(error, 200, 'RETRY')).toEqual({
        proofIneligible: false,
        submission: {
          kind: 'error',
          score: 200,
          callsign: 'RETRY',
          message: 'The line judge did not confirm the run. Your proof is still available for another try.',
        },
      });
    }
  });
});
