export interface ArcadeBenchEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  REPLAYS: R2Bucket;
  AI: Ai;
  API_RATE_LIMITER?: RateLimit;
  EXPENSIVE_RATE_LIMITER?: RateLimit;
  MALTLINE_ADMISSION_RATE_LIMITER: RateLimit;
  COOKIE_SIGNING_SECRET: string;
}
