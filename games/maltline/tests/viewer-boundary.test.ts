import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

describe('Maltline production viewer boundary', () => {
  it('takes its default campaign directly from the registered authority', () => {
    const main = readFileSync(resolve(import.meta.dirname, '../src/viewer/main.ts'), 'utf8');
    expect(main).toContain("import { MALTLINE_GENERATION_2_AUTHORITY } from '../core/authority'");
    expect(main).toContain('MALTLINE_GENERATION_2_AUTHORITY.campaign');
    expect(main).not.toContain("from '../core/campaign'");
  });

  it('bundles the shared shell and fonts without fixture-only runtime code', async () => {
    const packageRoot = resolve(import.meta.dirname, '..');
    const result = await build({
      configFile: resolve(packageRoot, 'vite.config.ts'),
      logLevel: 'silent',
      build: { write: false },
    });
    const builds = (Array.isArray(result) ? result : [result]) as Array<{
      output: Array<{ type: string; code?: string }>;
    }>;
    const productionJavaScript = builds
      .flatMap((output) => output.output)
      .filter((output) => output.type === 'chunk')
      .map((output) => output.code ?? '')
      .join('\n');

    expect(productionJavaScript).toContain('maltline-shell-v2');
    expect(productionJavaScript).toContain('noto-sans-5.3.0-latin');
    expect(productionJavaScript).not.toContain('maltline-visual-fixture-runtime');
  });
});
