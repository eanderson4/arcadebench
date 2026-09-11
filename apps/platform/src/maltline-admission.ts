import { hmac } from './crypto';
import type { ArcadeBenchEnv } from './env';
import { ApiError } from './http';

export type MaltlineAdmissionClass = 'board-read' | 'proof-read' | 'ranked-write';

const RETRY_AFTER_SECONDS = 60;
const NETWORK_ADDRESS = /^[0-9a-f:.]{2,64}$/iu;

function networkAddress(request: Request): string {
  const candidate = request.headers.get('cf-connecting-ip')?.trim();
  if (!candidate || !NETWORK_ADDRESS.test(candidate)) {
    throw new ApiError(503, 'Maltline ranked services are temporarily unavailable.');
  }
  return candidate.toLowerCase();
}

export async function maltlineAdmissionKey(
  request: Request,
  admissionClass: MaltlineAdmissionClass,
  secret: string,
): Promise<string> {
  if (secret.length < 32) {
    throw new ApiError(503, 'Maltline ranked services are temporarily unavailable.');
  }
  const digest = await hmac(networkAddress(request), secret);
  return `maltline:${admissionClass}:${digest}`;
}

export async function admitMaltlineExpensiveRequest(
  request: Request,
  env: Pick<ArcadeBenchEnv, 'COOKIE_SIGNING_SECRET' | 'MALTLINE_ADMISSION_RATE_LIMITER'>,
  admissionClass: MaltlineAdmissionClass,
): Promise<void> {
  const limiter = env.MALTLINE_ADMISSION_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') {
    throw new ApiError(503, 'Maltline ranked services are temporarily unavailable.');
  }

  let success: boolean;
  try {
    ({ success } = await limiter.limit({
      key: await maltlineAdmissionKey(request, admissionClass, env.COOKIE_SIGNING_SECRET),
    }));
  } catch {
    throw new ApiError(503, 'Maltline ranked services are temporarily unavailable.');
  }
  if (!success) {
    throw new ApiError(
      429,
      'Maltline is handling too many requests from this network. Try again in a minute.',
      undefined,
      { 'retry-after': String(RETRY_AFTER_SECONDS) },
    );
  }
}
