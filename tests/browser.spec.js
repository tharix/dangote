const { expect, test } = require('@playwright/test');

test('browser integration suite passes without runtime errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/tests/browser-test.html');
  await expect(page.locator('#results[data-complete="true"]')).toBeAttached({ timeout: 30000 });

  const results = await page.locator('#results li').evaluateAll(items =>
    items.map(item => item.textContent)
  );
  expect(results.length).toBeGreaterThan(0);
  expect(results.filter(result => result.startsWith('FAIL:'))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('auth callbacks reject query-string verification tokens', async ({ page }) => {
  const verificationRequests = [];
  const assetReferers = [];
  await page.route('**/supabase-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.DANGOTE_SUPABASE_CONFIG = Object.freeze({ url: "https://academy-test.supabase.co", anonKey: "test-key" });'
  }));
  page.on('request', request => {
    if (request.url().includes('/auth/v1/verify')) verificationRequests.push(request.url());
    if (request.url().endsWith('.css') || request.url().endsWith('.js')) {
      assetReferers.push(request.headers().referer);
    }
  });

  await page.goto('/?token_hash=must-not-be-sent&type=invite');
  await expect(page).not.toHaveURL(/token_hash/);
  expect(verificationRequests).toEqual([]);
  expect(assetReferers.every(referer => !referer)).toBe(true);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});
