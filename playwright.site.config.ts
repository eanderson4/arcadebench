import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/site',
  outputDir: './test-results/site-visual',
  snapshotPathTemplate: '{testDir}/baselines/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Chrome for Testing can rasterize a few SVG edge pixels differently
      // between the local and GitHub Linux images. Keep the allowance smaller
      // than a single icon while the geometry assertions guard layout exactly.
      maxDiffPixels: 50,
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:5185',
    browserName: 'chromium',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--disable-gpu',
        '--font-render-hinting=none',
        '--force-color-profile=srgb',
        '--no-sandbox',
      ],
    },
  },
  projects: [{ name: 'chromium-site' }],
  webServer: {
    command: 'npm run build:site && node scripts/serve-built-site.mjs',
    url: 'http://127.0.0.1:5185/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
