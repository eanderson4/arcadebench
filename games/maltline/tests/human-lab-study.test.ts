import { describe, expect, it } from 'vitest';
import {
  createP108HumanLabParticipant,
  normalizeP108HumanLabConsentEvidence,
  normalizeP108HumanLabParticipant,
  normalizeP108HumanLabStudyAssignment,
  P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
  P108_HUMAN_LAB_EXPERIENCE_STRATA,
  P108_HUMAN_LAB_VIEWPORT_WIDTH_STRATA,
} from '../src/experiments/human-lab-study';

const ASSIGNMENT = { experienceStratum: 'first-time', assignedViewportCssWidth: 700 } as const;
const PARTICIPANT = { participantCode: 'p-a1b2c3', ...ASSIGNMENT } as const;
const HUMAN_CONSENT = {
  kind: 'participant-affirmed',
  statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID,
  affirmed: true,
} as const;
const TEST_CONSENT = { kind: 'test-driver-bypass', statementId: null, affirmed: false } as const;

describe('P1-10 human-lab study identity boundaries', () => {
  it('exports fixed strata and clones/freeze-normalizes assignments', () => {
    expect(P108_HUMAN_LAB_EXPERIENCE_STRATA).toEqual(['first-time', 'informed']);
    expect(P108_HUMAN_LAB_VIEWPORT_WIDTH_STRATA).toEqual([700, 1280]);
    const source: { experienceStratum: string; assignedViewportCssWidth: number } = {
      ...ASSIGNMENT,
    };
    const normalized = normalizeP108HumanLabStudyAssignment(source);
    source.assignedViewportCssWidth = 1280;
    expect(normalized).toEqual(ASSIGNMENT);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(P108_HUMAN_LAB_EXPERIENCE_STRATA)).toBe(true);
    expect(Object.isFrozen(P108_HUMAN_LAB_VIEWPORT_WIDTH_STRATA)).toBe(true);
  });

  it.each([
    ['first-time', 700],
    ['first-time', 1280],
    ['informed', 700],
    ['informed', 1280],
  ] as const)('accepts the %s/%i assignment cell', (experienceStratum, assignedViewportCssWidth) => {
    expect(normalizeP108HumanLabStudyAssignment({ experienceStratum, assignedViewportCssWidth }))
      .toEqual({ experienceStratum, assignedViewportCssWidth });
  });

  it('creates and normalizes opaque participants bound exactly to their assignment', () => {
    const created = createP108HumanLabParticipant({ participantCode: 'p-a1b2c3',
      assignment: ASSIGNMENT });
    expect(created).toEqual(PARTICIPANT);
    expect(Object.isFrozen(created)).toBe(true);
    const source: { participantCode: string; experienceStratum: string;
      assignedViewportCssWidth: number } = { ...PARTICIPANT };
    const normalized = normalizeP108HumanLabParticipant(source, ASSIGNMENT);
    source.participantCode = 'p-changed';
    expect(normalized).toEqual(PARTICIPANT);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(() => normalizeP108HumanLabParticipant(PARTICIPANT,
      { ...ASSIGNMENT, assignedViewportCssWidth: 1280 })).toThrow(/match.*strata/u);
    expect(() => normalizeP108HumanLabParticipant(PARTICIPANT,
      { ...ASSIGNMENT, experienceStratum: 'informed' })).toThrow(/match.*strata/u);
  });

  it.each([
    '', 'p-', 'p-abc12', 'p-abcdefghijklm', 'P-ABC123', ' p-abc123', 'p-abc123 ',
    'p-ab-c123', 'p-a_b123', 'p-a.b123', 'p-a@b.com', 'p-éabc12', 'p-abc\u0000x', // privacylint-allow — intentionally invalid public test fixture.
    123, null,
  ])('rejects unsafe participant code %j without normalization', (participantCode) => {
    expect(() => createP108HumanLabParticipant({ participantCode, assignment: ASSIGNMENT }))
      .toThrow(/participantCode/u);
  });

  it('rejects invalid assignment enums, widths, missing, extra, symbol, and non-enumerable fields', () => {
    for (const experienceStratum of ['', 'new', 'First-time', 1, null]) {
      expect(() => normalizeP108HumanLabStudyAssignment({
        experienceStratum, assignedViewportCssWidth: 700,
      })).toThrow(/first-time or informed/u);
    }
    for (const assignedViewportCssWidth of [699, 701, 1279, 1281, 700.5, '700', NaN, Infinity]) {
      expect(() => normalizeP108HumanLabStudyAssignment({
        experienceStratum: 'first-time', assignedViewportCssWidth,
      })).toThrow(/exactly 700 or 1280/u);
    }
    expect(() => normalizeP108HumanLabStudyAssignment({ experienceStratum: 'first-time' }))
      .toThrow(/missing/u);
    expect(() => normalizeP108HumanLabStudyAssignment({ ...ASSIGNMENT, extra: true }))
      .toThrow(/unsupported/u);
    expect(() => normalizeP108HumanLabStudyAssignment({ ...ASSIGNMENT,
      [Symbol('extra')]: true })).toThrow(/unsupported/u);
    const hidden = { ...ASSIGNMENT };
    Object.defineProperty(hidden, 'assignedViewportCssWidth', { enumerable: false, value: 700 });
    expect(() => normalizeP108HumanLabStudyAssignment(hidden)).toThrow(/enumerable data property/u);
  });

  it('never invokes assignment, participant, or consent accessors', () => {
    let calls = 0;
    const assignment = Object.defineProperty({ assignedViewportCssWidth: 700 },
      'experienceStratum', { enumerable: true, get: () => { calls++; return 'first-time'; } });
    expect(() => normalizeP108HumanLabStudyAssignment(assignment)).toThrow(/data property/u);
    const participant = Object.defineProperty({
      experienceStratum: 'first-time', assignedViewportCssWidth: 700,
    }, 'participantCode', { enumerable: true, get: () => { calls++; return 'p-abc123'; } });
    expect(() => normalizeP108HumanLabParticipant(participant, ASSIGNMENT)).toThrow(/data property/u);
    const consent = Object.defineProperty({
      statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID, affirmed: true,
    }, 'kind', { enumerable: true, get: () => { calls++; return 'participant-affirmed'; } });
    expect(() => normalizeP108HumanLabConsentEvidence(consent, 'human')).toThrow(/data property/u);
    expect(calls).toBe(0);
  });

  it('accepts only consent evidence that exactly matches execution mode', () => {
    const human = normalizeP108HumanLabConsentEvidence(HUMAN_CONSENT, 'human');
    const testDriver = normalizeP108HumanLabConsentEvidence(TEST_CONSENT, 'test-driver');
    expect(human).toEqual(HUMAN_CONSENT);
    expect(testDriver).toEqual(TEST_CONSENT);
    expect(Object.isFrozen(human)).toBe(true);
    expect(Object.isFrozen(testDriver)).toBe(true);
    expect(() => normalizeP108HumanLabConsentEvidence(TEST_CONSENT, 'human'))
      .toThrow(/affirmative participant/u);
    expect(() => normalizeP108HumanLabConsentEvidence(HUMAN_CONSENT, 'test-driver'))
      .toThrow(/synthetic consent/u);
    expect(() => normalizeP108HumanLabConsentEvidence(HUMAN_CONSENT, 'automation'))
      .toThrow(/executionMode/u);
  });

  it('strictly rejects malformed consent evidence and isolates it from source mutation', () => {
    const source = { ...HUMAN_CONSENT };
    const normalized = normalizeP108HumanLabConsentEvidence(source, 'human');
    source.affirmed = false as true;
    expect(normalized).toEqual(HUMAN_CONSENT);
    for (const invalid of [
      { ...HUMAN_CONSENT, affirmed: false },
      { ...HUMAN_CONSENT, statementId: 'maltline-p108-local-consent-v3' },
      { ...HUMAN_CONSENT, kind: 'affirmed' },
      { kind: 'participant-affirmed', statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID },
      { ...HUMAN_CONSENT, extra: true },
      { ...HUMAN_CONSENT, [Symbol('extra')]: true },
    ]) {
      expect(() => normalizeP108HumanLabConsentEvidence(invalid, 'human')).toThrow();
    }
    const hidden = { ...HUMAN_CONSENT };
    Object.defineProperty(hidden, 'affirmed', { enumerable: false, value: true });
    expect(() => normalizeP108HumanLabConsentEvidence(hidden, 'human'))
      .toThrow(/enumerable data property/u);
  });

  it('rejects participant and creation shape deviations exactly', () => {
    expect(() => normalizeP108HumanLabParticipant({ ...PARTICIPANT, extra: true }, ASSIGNMENT))
      .toThrow(/unsupported/u);
    expect(() => normalizeP108HumanLabParticipant({
      participantCode: PARTICIPANT.participantCode,
      experienceStratum: PARTICIPANT.experienceStratum,
    }, ASSIGNMENT)).toThrow(/missing/u);
    expect(() => createP108HumanLabParticipant({ participantCode: 'p-abc123' }))
      .toThrow(/missing/u);
    expect(() => createP108HumanLabParticipant({ participantCode: 'p-abc123',
      assignment: ASSIGNMENT, extra: true })).toThrow(/unsupported/u);
  });
});
