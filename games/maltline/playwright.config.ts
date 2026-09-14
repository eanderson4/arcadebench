import { defineConfig } from '@playwright/test';
import baselineManifest from './tests/visual/baseline-manifest.json' with { type: 'json' };
import { verifyMaltlineVisualBaselineFiles } from './tests/visual/baseline-contract';

// Verify every reviewed PNG before test discovery can launch a browser.
verifyMaltlineVisualBaselineFiles(
  baselineManifest,
  new URL('./tests/visual/baselines/chromium-system/', import.meta.url),
  { trustedRoot: new URL('./tests/visual/', import.meta.url) },
);

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results/visual',
  snapshotPathTemplate: '{testDir}/baselines/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      // Canvas edge antialiasing varies slightly across Linux CPU rasterizers.
      // Keep the allowance below one percent so layout/art regressions remain loud.
      maxDiffPixelRatio: 0.007,
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:5184',
    browserName: 'chromium',
    colorScheme: 'dark',
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
  projects: [
    {
      name: 'chromium-system',
    },
  ],
  webServer: {
    command: 'npm run dev:visual',
    url: 'http://127.0.0.1:5184/src/viewer/visual-fixtures.html?fixture=title',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
