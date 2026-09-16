import worker, { runScheduledMaintenance } from './worker';
import type { ArcadeBenchEnv } from './env';
import { json } from './http';

const LEGACY_MALTLINE_API = '/api/v1/games/maltline';

/**
 * Maintained production boundary: the current Maltline season uses the shared v2 cabinet
 * adapter. The unreleased generation-2 API and its schema stay disabled.
 */
export default {
  async fetch(request: Request, env: ArcadeBenchEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === LEGACY_MALTLINE_API || path.startsWith(`${LEGACY_MALTLINE_API}/`)) {
      const response = json({ error: 'This Maltline API is not available.', code: 'legacy_maltline_disabled' },
        404, { 'cache-control': 'no-store' });
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    return worker.fetch(request, env);
  },

  async scheduled(_controller: ScheduledController, env: ArcadeBenchEnv): Promise<void> {
    await runScheduledMaintenance(env, { legacyMaltlineEnabled: false });
  },
} satisfies ExportedHandler<ArcadeBenchEnv>;
