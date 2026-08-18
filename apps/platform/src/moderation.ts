import type { ArcadeBenchEnv } from './env';
import { sha256Hex } from './crypto';
import { ApiError } from './http';

export const CALLSIGN_POLICY_VERSION = 'general-audience-v1';
export const CALLSIGN_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
export const PLAYER_NAME_MAX_LENGTH = 16;

const REJECTED_WORDS = new Set([
  'bitch', 'cunt', 'fuck', 'hitler', 'nazi', 'nigger', 'porn', 'rape', 'shit',
]);

const LEET: Readonly<Record<string, readonly string[]>> = {
  '0': ['o'], '1': ['i', 'l'], '3': ['e'], '4': ['a', 'f'], '5': ['s'],
  '7': ['t'], '8': ['b'], '@': ['a'], '$': ['s'], '!': ['i'],
};

export interface CallsignReview {
  allowed: boolean;
  normalizedName?: string;
  category?: string;
  moderationKey?: string;
  reason?: string;
}

function scalarLength(value: string): number {
  return [...value].length;
}

function expandedTokens(token: string): Set<string> {
  let candidates = new Set(['']);
  for (const character of token) {
    const alternatives = LEET[character] ?? [character];
    const next = new Set<string>();
    for (const prefix of candidates) {
      for (const alternative of alternatives) {
        next.add(prefix + alternative);
        if (next.size >= 64) break;
      }
      if (next.size >= 64) break;
    }
    candidates = next;
  }
  return candidates;
}

function obviousRejectedTerm(value: string): boolean {
  const tokens = value.toLocaleLowerCase().split(/[^\p{L}\p{N}@$!]+/u).filter(Boolean);
  const candidates = [...tokens];
  if (tokens.length > 1 && tokens.every((token) => [...token].length === 1)) candidates.push(tokens.join(''));
  return candidates.some((token) => [...expandedTokens(token)].some((expanded) => REJECTED_WORDS.has(expanded)));
}

export function deterministicCallsignReview(candidate: unknown): CallsignReview {
  if (typeof candidate !== 'string') return { allowed: false, reason: 'Enter a callsign.' };
  const normalizedName = candidate.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalizedName) return { allowed: false, reason: 'Enter a callsign.' };
  if (scalarLength(normalizedName) > PLAYER_NAME_MAX_LENGTH) {
    return { allowed: false, reason: `Use ${PLAYER_NAME_MAX_LENGTH} characters or fewer.` };
  }
  if (!/^[\p{L}\p{N} ._'’-]+$/u.test(normalizedName)) {
    return { allowed: false, reason: 'Use letters, numbers, spaces, dots, dashes, or underscores.' };
  }
  if (/https?:|www\.|\.com\b|\.net\b|\.org\b/iu.test(normalizedName)) {
    return { allowed: false, reason: 'Links are not allowed in callsigns.' };
  }
  if (/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/u.test(normalizedName)) {
    return { allowed: false, reason: 'Invisible or directional characters are not allowed.' };
  }
  if (obviousRejectedTerm(normalizedName)) {
    return { allowed: false, reason: 'Choose a public-friendly callsign.' };
  }
  return { allowed: true, normalizedName };
}

interface ModelDecision {
  allowed: boolean;
  category: string;
}

function parseModelDecision(value: unknown): ModelDecision | undefined {
  let candidate = value;
  if (typeof candidate === 'string') {
    try { candidate = JSON.parse(candidate); } catch { return undefined; }
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
  const decision = candidate as Partial<ModelDecision>;
  const categories = new Set([
    'clean', 'profanity', 'sexual', 'hate', 'harassment', 'impersonation',
    'personal_information', 'evasive', 'uncertain',
  ]);
  if (typeof decision.allowed !== 'boolean' || !categories.has(String(decision.category))) return undefined;
  if (decision.allowed !== (decision.category === 'clean')) return undefined;
  return { allowed: decision.allowed, category: String(decision.category) };
}

export async function moderateCallsign(candidate: unknown, env: ArcadeBenchEnv): Promise<CallsignReview> {
  const local = deterministicCallsignReview(candidate);
  if (!local.allowed || !local.normalizedName) return local;
  const moderationKey = await sha256Hex(
    `${CALLSIGN_POLICY_VERSION}\0${local.normalizedName.toLocaleLowerCase()}`,
  );
  const cached = await env.DB.prepare(`
    SELECT allowed, category FROM callsign_moderation_cache
    WHERE moderation_key = ? AND policy_version = ?
  `).bind(moderationKey, CALLSIGN_POLICY_VERSION).first<{ allowed: number; category: string }>();
  if (cached) {
    return cached.allowed === 1
      ? { allowed: true, normalizedName: local.normalizedName, category: cached.category, moderationKey }
      : { allowed: false, category: cached.category, moderationKey, reason: 'Choose a public-friendly callsign.' };
  }

  let result: unknown;
  try {
    result = await env.AI.run(CALLSIGN_MODEL, {
      messages: [
        {
          role: 'system',
          content: 'Review one short player callsign for a free, general-audience arcade used by children and adults. Reject profanity, sexual content, hate, slurs, targeted harassment, impersonation, personal information, and character/spacing evasions. Reject when uncertain. Return only the requested JSON.',
        },
        { role: 'user', content: `Callsign: ${JSON.stringify(local.normalizedName)}` },
      ],
      temperature: 0,
      max_tokens: 40,
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            allowed: { type: 'boolean' },
            category: {
              type: 'string',
              enum: ['clean', 'profanity', 'sexual', 'hate', 'harassment', 'impersonation', 'personal_information', 'evasive', 'uncertain'],
            },
          },
          required: ['allowed', 'category'],
          additionalProperties: false,
        },
      },
    });
  } catch {
    throw new ApiError(503, 'Callsign review is temporarily unavailable. Try again shortly.');
  }
  const response = result && typeof result === 'object' && 'response' in result
    ? (result as { response: unknown }).response
    : undefined;
  const decision = parseModelDecision(response);
  if (!decision) throw new ApiError(503, 'Callsign review is temporarily unavailable. Try again shortly.');
  await env.DB.prepare(`
    INSERT INTO callsign_moderation_cache
      (moderation_key, policy_version, allowed, category, model, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (moderation_key) DO UPDATE SET
      policy_version = excluded.policy_version,
      allowed = excluded.allowed,
      category = excluded.category,
      model = excluded.model,
      created_at = excluded.created_at
  `).bind(
    moderationKey,
    CALLSIGN_POLICY_VERSION,
    decision.allowed ? 1 : 0,
    decision.category,
    CALLSIGN_MODEL,
    new Date().toISOString(),
  ).run();
  return decision.allowed
    ? { allowed: true, normalizedName: local.normalizedName, category: decision.category, moderationKey }
    : { allowed: false, category: decision.category, moderationKey, reason: 'Choose a public-friendly callsign.' };
}
