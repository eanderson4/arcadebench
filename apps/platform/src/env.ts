export interface ArcadeBenchEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  REPLAYS: R2Bucket;
  AI: Ai;
  API_RATE_LIMITER?: RateLimit;
  EXPENSIVE_RATE_LIMITER?: RateLimit;
  MALTLINE_ADMISSION_RATE_LIMITER: RateLimit;
  COOKIE_SIGNING_SECRET: string;
  /**
   * Optional kill switch for the shared v2 HTTP surface. Unset means enabled.
   * Scheduled retention/expiry must keep running even when this is disabled.
   */
  SHARED_PLATFORM_ENABLED?: string;
}
