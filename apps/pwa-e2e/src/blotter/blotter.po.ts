import { Page, Locator } from '@playwright/test';

/**
 * Page object for the Blotter page (apps/pwa/src/blotter.html). Selectors use
 * semantic roles and visible text — the page is a Svelte component styled with
 * Pico, no data-testid attributes.
 */
export class BlotterPageObject {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/blotter.html');
  }

  /** The "<filter>: <total> EUR" heading. */
  getHeading(): Locator {
    return this.page.locator('main h2').first();
  }

  /** One of the period filter links: Week / 2 weeks / Month / All. */
  getPeriodLink(label: string): Locator {
    return this.page.getByRole('link', { name: label, exact: true });
  }

  getLoading(): Locator {
    return this.page.getByText('Loading expenses…');
  }

  getEmptyState(): Locator {
    return this.page.getByText('No expenses yet.');
  }

  getTable(): Locator {
    return this.page.getByRole('table');
  }
}
