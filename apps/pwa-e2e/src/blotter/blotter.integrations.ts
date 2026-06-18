import { test, expect } from '@playwright/test';
import { BlotterPageObject } from './blotter.po';

test('Blotter page happy path', async ({ page }) => {
  const blotter = new BlotterPageObject(page);
  await blotter.goto();

  await test.step('should show the total heading', async () => {
    await expect(blotter.getHeading()).toContainText('EUR');
  });

  await test.step('should show the period filters', async () => {
    await expect(blotter.getPeriodLink('Week')).toBeVisible();
    await expect(blotter.getPeriodLink('2 weeks')).toBeVisible();
    await expect(blotter.getPeriodLink('Month')).toBeVisible();
    await expect(blotter.getPeriodLink('All')).toBeVisible();
  });

  await test.step('should finish loading from the service-worker DB', async () => {
    // The data layer is PGLite running in the service worker; a fresh browser
    // context starts with an empty DB, so the page settles on the empty state.
    // Allow extra time for the SW to install and PGLite (WASM) to boot.
    await expect(blotter.getLoading()).toBeHidden({ timeout: 30_000 });
    await expect(blotter.getEmptyState()).toBeVisible();
  });
});
