export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ArcadeBenchEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  REPLAYS: R2Bucket;
  AI: Ai;
  API_RATE_LIMITER?: RateLimiter;
  EXPENSIVE_RATE_LIMITER?: RateLimiter;
  COOKIE_SIGNING_SECRET: string;
}
