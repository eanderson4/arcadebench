export const P108_HUMAN_LAB_CONSENT_STATEMENT_ID =
  'maltline-p108-local-consent-v2' as const;
export const P108_HUMAN_LAB_EXPERIENCE_STRATA =
  Object.freeze(['first-time', 'informed'] as const);
export const P108_HUMAN_LAB_VIEWPORT_WIDTH_STRATA = Object.freeze([700, 1280] as const);

export type P108HumanLabExperienceStratum =
  typeof P108_HUMAN_LAB_EXPERIENCE_STRATA[number];
export type P108HumanLabAssignedViewportCssWidth =
  typeof P108_HUMAN_LAB_VIEWPORT_WIDTH_STRATA[number];
export type P108HumanLabStudyExecutionMode = 'human' | 'test-driver';

export interface P108HumanLabStudyAssignment {
  experienceStratum: P108HumanLabExperienceStratum;
  assignedViewportCssWidth: P108HumanLabAssignedViewportCssWidth;
}

export interface P108HumanLabParticipant extends P108HumanLabStudyAssignment {
  participantCode: string;
}

export interface P108HumanLabParticipantAffirmedConsent {
  kind: 'participant-affirmed';
  statementId: typeof P108_HUMAN_LAB_CONSENT_STATEMENT_ID;
  affirmed: true;
}

export interface P108HumanLabTestDriverConsentBypass {
  kind: 'test-driver-bypass';
  statementId: null;
  affirmed: false;
}

export type P108HumanLabConsentEvidence = P108HumanLabParticipantAffirmedConsent
  | P108HumanLabTestDriverConsentBypass;

const PARTICIPANT_CODE = /^p-[a-z0-9]{6,12}$/u;

function exact(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  const allowed = new Set(keys);
  if (actual.some((key) => typeof key !== 'string' || !allowed.has(key))
    || keys.some((key) => !actual.includes(key))) {
    throw new Error(`${label} contains missing or unsupported fields`);
  }
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function experienceStratum(value: unknown, label: string): P108HumanLabExperienceStratum {
  if (value !== 'first-time' && value !== 'informed') {
    throw new Error(`${label} must be first-time or informed`);
  }
  return value;
}

function assignedWidth(value: unknown, label: string): P108HumanLabAssignedViewportCssWidth {
  if (value !== 700 && value !== 1280) {
    throw new Error(`${label} must be exactly 700 or 1280 CSS pixels`);
  }
  return value;
}

function participantCode(value: unknown): string {
  if (typeof value !== 'string' || !PARTICIPANT_CODE.test(value)) {
    throw new Error('participantCode must match p- followed by 6 through 12 lowercase letters or digits');
  }
  return value;
}

function executionMode(value: unknown): P108HumanLabStudyExecutionMode {
  if (value !== 'human' && value !== 'test-driver') {
    throw new Error('human-lab study executionMode must be human or test-driver');
  }
  return value;
}

/** Strict clone/freeze boundary for the facilitator-assigned study strata. */
export function normalizeP108HumanLabStudyAssignment(
  value: unknown,
): Readonly<P108HumanLabStudyAssignment> {
  const assignment = exact(value, ['experienceStratum', 'assignedViewportCssWidth'],
    'human-lab study assignment');
  return Object.freeze({
    experienceStratum: experienceStratum(assignment.experienceStratum,
      'study assignment.experienceStratum'),
    assignedViewportCssWidth: assignedWidth(assignment.assignedViewportCssWidth,
      'study assignment.assignedViewportCssWidth'),
  });
}

/**
 * Strictly clone a participant record and prove its strata match the separately
 * assigned study cell. The participant code is deliberately narrow and opaque.
 */
export function normalizeP108HumanLabParticipant(
  value: unknown,
  assignmentValue: unknown,
): Readonly<P108HumanLabParticipant> {
  const assignment = normalizeP108HumanLabStudyAssignment(assignmentValue);
  const participant = exact(value,
    ['participantCode', 'experienceStratum', 'assignedViewportCssWidth'],
    'human-lab participant');
  const normalized = Object.freeze({
    participantCode: participantCode(participant.participantCode),
    experienceStratum: experienceStratum(participant.experienceStratum,
      'participant.experienceStratum'),
    assignedViewportCssWidth: assignedWidth(participant.assignedViewportCssWidth,
      'participant.assignedViewportCssWidth'),
  });
  if (normalized.experienceStratum !== assignment.experienceStratum
    || normalized.assignedViewportCssWidth !== assignment.assignedViewportCssWidth) {
    throw new Error('human-lab participant must match the assigned study strata exactly');
  }
  return normalized;
}

/** Build the exact participant shape from one opaque code and a trusted assignment. */
export function createP108HumanLabParticipant(value: unknown): Readonly<P108HumanLabParticipant> {
  const creation = exact(value, ['participantCode', 'assignment'],
    'human-lab participant creation');
  const assignment = normalizeP108HumanLabStudyAssignment(creation.assignment);
  return Object.freeze({ participantCode: participantCode(creation.participantCode), ...assignment });
}

/** Strict mode-bound clone/freeze boundary for affirmative or synthetic consent evidence. */
export function normalizeP108HumanLabConsentEvidence(
  value: unknown,
  executionModeValue: unknown,
): Readonly<P108HumanLabConsentEvidence> {
  const mode = executionMode(executionModeValue);
  const evidence = exact(value, ['kind', 'statementId', 'affirmed'],
    'human-lab consent evidence');
  if (mode === 'human') {
    if (evidence.kind !== 'participant-affirmed'
      || evidence.statementId !== P108_HUMAN_LAB_CONSENT_STATEMENT_ID
      || evidence.affirmed !== true) {
      throw new Error('human execution requires affirmative participant consent evidence');
    }
    return Object.freeze({ kind: 'participant-affirmed',
      statementId: P108_HUMAN_LAB_CONSENT_STATEMENT_ID, affirmed: true });
  }
  if (evidence.kind !== 'test-driver-bypass' || evidence.statementId !== null
    || evidence.affirmed !== false) {
    throw new Error('test-driver execution requires synthetic consent-bypass evidence');
  }
  return Object.freeze({ kind: 'test-driver-bypass', statementId: null, affirmed: false });
}
