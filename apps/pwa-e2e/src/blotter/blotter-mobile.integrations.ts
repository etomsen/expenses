import { test, expect, devices } from '@playwright/test';
import { BlotterPageObject } from './blotter.po';

// Render the blotter at a phone viewport and snapshot it. A fresh browser
// context starts with an empty PGLite DB (the data layer runs in the service
// worker), so the page deterministically settles on the empty state — making
// the screenshot stable across runs.
test.use({ ...devices['Pixel 5'] });

test('Blotter mobile snapshot', async ({ page }) => {
  const blotter = new BlotterPageObject(page);
  await blotter.goto();

  // Wait until the SW installs and PGLite (WASM) boots, then the page settles
  // on the empty state. Allow extra time for the first SW install.
  await expect(blotter.getLoading()).toBeHidden({ timeout: 30_000 });
  await expect(blotter.getEmptyState()).toBeVisible();

  await expect(page).toHaveScreenshot('blotter-mobile.png', {
    fullPage: true,
  });
});
