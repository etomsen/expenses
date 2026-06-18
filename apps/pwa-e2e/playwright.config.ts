import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { join } from 'node:path';

// For CI, you may want to set BASE_URL to the deployed application.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4300';
const isCI = !!process.env['CI'];

// Resolve the config path from workspaceRoot instead of __filename: nx's plugin
// loads this file as an ES module (no __filename), while Playwright loads it as
// CommonJS (no import.meta) — a workspaceRoot-based path works under both.
const configPath = join(workspaceRoot, 'apps/pwa-e2e/playwright.config.ts');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  ...nxE2EPreset(configPath, { testDir: './src' }),
  testMatch: '**/*.integrations.ts',
  outputDir: '../../dist/pwa-e2e/test-results',
  preserveOutput: 'failures-only',
  retries: isCI ? 1 : 0,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: '../../dist/pwa-e2e/playwright-report',
        open: 'never',
      },
    ],
    ['junit', { outputFile: '../../dist/pwa-e2e/junit.xml' }],
  ],
  expect: {
    toHaveScreenshot: {
      pathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
    },
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: isCI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: isCI ? 'only-on-failure' : 'off',
    video: isCI ? 'retain-on-failure' : 'off',
    // Unlike most apps, this PWA's data layer IS the service worker (PGLite
    // runs there and answers /api/*), so service workers must be allowed.
    serviceWorkers: 'allow',
  },
  /**
   * Build the PWA and serve the static dist with http-server. `pwa:preview`
   * depends on `pwa:build` (vendor -> copy -> templater), so the served app
   * shell always matches the source.
   */
  webServer: {
    command: 'npx nx run pwa:preview',
    url: baseURL,
    // true (not !isCI): nx starts pwa:preview as the e2e task's continuous
    // dependency, and Playwright reuses it instead of racing a second server.
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
