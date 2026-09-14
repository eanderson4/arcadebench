import notoSans400Url from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff2?url';
import notoSans600Url from '@fontsource/noto-sans/files/noto-sans-latin-600-normal.woff2?url';
import notoSans700Url from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff2?url';
import notoSans800Url from '@fontsource/noto-sans/files/noto-sans-latin-800-normal.woff2?url';

export const MALTLINE_FONT_FAMILY = 'Maltline UI';
export const MALTLINE_FONT_BUNDLE = 'noto-sans-5.3.0-latin';

const REQUIRED_FONT_CHECKS = [
  `400 16px "${MALTLINE_FONT_FAMILY}"`,
  `600 16px "${MALTLINE_FONT_FAMILY}"`,
  `700 16px "${MALTLINE_FONT_FAMILY}"`,
  `800 24px "${MALTLINE_FONT_FAMILY}"`,
] as const;

export const MALTLINE_FONT_LOAD_TIMEOUT_MS = 3_000;

export interface MaltlineFontPreparationResult {
  status: 'ready' | 'fallback';
  diagnostic: string | null;
}

export interface MaltlineFontPreparationOptions {
  timeoutMs?: number;
}

function installDefinitions(documentRef: Document): void {
  if (documentRef.querySelector('[data-maltline-font-definitions]')) return;
  const style = documentRef.createElement('style');
  style.dataset.maltlineFontDefinitions = MALTLINE_FONT_BUNDLE;
  style.textContent = `
    @font-face { font-family: "${MALTLINE_FONT_FAMILY}"; src: url("${notoSans400Url}") format("woff2"); font-style: normal; font-weight: 400; font-display: block; }
    @font-face { font-family: "${MALTLINE_FONT_FAMILY}"; src: url("${notoSans600Url}") format("woff2"); font-style: normal; font-weight: 600; font-display: block; }
    @font-face { font-family: "${MALTLINE_FONT_FAMILY}"; src: url("${notoSans700Url}") format("woff2"); font-style: normal; font-weight: 700; font-display: block; }
    @font-face { font-family: "${MALTLINE_FONT_FAMILY}"; src: url("${notoSans800Url}") format("woff2"); font-style: normal; font-weight: 800; font-display: block; }
  `;
  documentRef.head.append(style);
}

function diagnosticMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadRequiredFonts(documentRef: Document, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms while loading ${MALTLINE_FONT_BUNDLE}`)),
      timeoutMs,
    );
  });
  try {
    const loadedFonts = await Promise.race([
      Promise.all(REQUIRED_FONT_CHECKS.map((descriptor) => documentRef.fonts.load(descriptor))),
      timedOut,
    ]);
    if (loadedFonts.some((faces) => faces.length === 0)) {
      throw new Error(`Required Maltline font bundle failed to load: ${MALTLINE_FONT_BUNDLE}`);
    }
    await Promise.race([documentRef.fonts.ready, timedOut]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Installs and verifies the exact font bundle used by both viewer entry points.
 * Failure is diagnosed but non-fatal so the production viewer remains playable
 * with its system-font fallback. Visual fixtures may choose to reject fallback.
 */
export async function prepareMaltlineFonts(
  documentRef: Document = document,
  options: MaltlineFontPreparationOptions = {},
): Promise<MaltlineFontPreparationResult> {
  documentRef.documentElement.dataset.maltlineFontBundle = MALTLINE_FONT_BUNDLE;
  documentRef.documentElement.dataset.maltlineFontsReady = 'false';
  delete documentRef.documentElement.dataset.maltlineFontDiagnostic;
  try {
    installDefinitions(documentRef);
    await loadRequiredFonts(documentRef, options.timeoutMs ?? MALTLINE_FONT_LOAD_TIMEOUT_MS);
    documentRef.documentElement.dataset.maltlineFontsReady = 'true';
    return { status: 'ready', diagnostic: null };
  } catch (error: unknown) {
    const diagnostic = diagnosticMessage(error);
    documentRef.querySelector('[data-maltline-font-definitions]')?.remove();
    documentRef.documentElement.dataset.maltlineFontsReady = 'fallback';
    documentRef.documentElement.dataset.maltlineFontDiagnostic = diagnostic;
    return { status: 'fallback', diagnostic };
  }
}
