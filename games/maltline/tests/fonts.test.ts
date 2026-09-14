import { describe, expect, it } from 'vitest';
import { prepareMaltlineFonts } from '../src/viewer/fonts';

interface FakeFontDocument {
  document: Document;
  dataset: Record<string, string>;
  appendedStyles: Array<{ textContent: string }>;
}

function fakeFontDocument(
  load: (descriptor: string) => Promise<readonly FontFace[]>,
  ready: Promise<unknown> = Promise.resolve(),
): FakeFontDocument {
  const dataset: Record<string, string> = {};
  const appendedStyles: Array<{ textContent: string }> = [];
  const document = {
    documentElement: { dataset },
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { append: (style: { textContent: string }) => appendedStyles.push(style) },
    fonts: { load, ready },
  } as unknown as Document;
  return { document, dataset, appendedStyles };
}

describe('Maltline font preparation', () => {
  it('reports the verified bundled font path', async () => {
    const fixture = fakeFontDocument(async () => [{} as FontFace]);
    await expect(prepareMaltlineFonts(fixture.document, { timeoutMs: 50 })).resolves.toEqual({
      status: 'ready',
      diagnostic: null,
    });
    expect(fixture.dataset.maltlineFontsReady).toBe('true');
    expect(fixture.dataset.maltlineFontDiagnostic).toBeUndefined();
    expect(fixture.appendedStyles).toHaveLength(1);
  });

  it('falls back with a diagnosis when a font request rejects', async () => {
    const fixture = fakeFontDocument(async () => {
      throw new Error('font request blocked');
    });
    await expect(prepareMaltlineFonts(fixture.document, { timeoutMs: 50 })).resolves.toEqual({
      status: 'fallback',
      diagnostic: 'font request blocked',
    });
    expect(fixture.dataset.maltlineFontsReady).toBe('fallback');
    expect(fixture.dataset.maltlineFontDiagnostic).toBe('font request blocked');
  });

  it('falls back within the configured timeout when font loading never settles', async () => {
    const pending = new Promise<readonly FontFace[]>(() => undefined);
    const fixture = fakeFontDocument(() => pending, new Promise(() => undefined));
    const result = await prepareMaltlineFonts(fixture.document, { timeoutMs: 5 });
    expect(result.status).toBe('fallback');
    expect(result.diagnostic).toMatch(/Timed out after 5ms/);
    expect(fixture.dataset.maltlineFontsReady).toBe('fallback');
  });

  it('falls back when the browser resolves without the requested faces', async () => {
    const fixture = fakeFontDocument(async () => []);
    const result = await prepareMaltlineFonts(fixture.document, { timeoutMs: 50 });
    expect(result).toMatchObject({ status: 'fallback' });
    expect(result.diagnostic).toMatch(/failed to load/);
  });
});
