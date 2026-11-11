const { expect, test } = require('@playwright/test');

test('browser integration suite passes without runtime errors', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/supabase-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.DANGOTE_SUPABASE_CONFIG = Object.freeze({ url: "", anonKey: "" });'
  }));

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

test('standards crosswalk records supplied references and open review gaps', async ({ page }) => {
  await page.goto('/');
  const crosswalk = page.locator('#standards-crosswalk-list');
  await expect(crosswalk).toContainText('IEC 60364-6:2016');
  await expect(crosswalk).toContainText('COR1:2017');
  await expect(crosswalk).toContainText('IEC 61643-11');
  await expect(crosswalk).toContainText('Load diversity');
  await expect(crosswalk).toContainText('No specific load-diversity reference was supplied');
  await expect(crosswalk).toContainText('NEMA MG 1');
});

test('tool search opens sections by name with mouse and keyboard', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.locator('#module-switcher');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#module-switcher-query')).toBeFocused();
  await page.locator('#module-switcher-query').fill('cable');
  await expect(page.locator('#module-switcher-count')).toHaveText('1 tool found');
  await expect(page.locator('#module-switcher-options button')).toHaveText('Load & Cable Sizing');
  await page.locator('#module-switcher-query').press('ArrowDown');
  await expect(page.locator('#module-switcher-options button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#module-title')).toHaveText('Load & cable sizing');
  await expect(page.locator('.nav-item[aria-current="page"]')).toHaveAttribute('data-module', 'calculators');

  await page.keyboard.press('Control+k');
  await page.locator('#module-switcher-query').fill('no matching tool');
  await expect(page.locator('#module-switcher-count')).toHaveText('No tools match that search.');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('tool search fits mobile and closes after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#open-module-switcher').click();
  await page.locator('#module-switcher-query').fill('PLC');
  await expect(page.locator('#module-switcher-options button')).toHaveText('PLC Simulator');
  const dialogBox = await page.locator('#module-switcher').boundingBox();
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(390);
  expect(dialogBox.y + dialogBox.height).toBeLessThanOrEqual(844);
  await page.locator('#module-switcher-options button').click();
  await expect(page.locator('#module-title')).toHaveText('PLC ladder logic simulator');
  await expect(page.locator('#module-switcher')).not.toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('dashboard continues at the first unfinished lesson and points to review when complete', async ({ page }) => {
  await page.goto('/');
  const continueButton = page.locator('#dashboard-continue-learning');
  await expect(continueButton).toContainText('Continue: Build a protected lighting circuit');
  await continueButton.click();
  await expect(page.locator('#module-lessons')).toHaveClass(/active/);
  await expect(page.locator('#lesson-results .lesson-card.recommended h3')).toHaveText('Build a protected lighting circuit');
  await expect(page.locator('.lesson-check[data-lesson="safe-topology"]')).toBeFocused();

  await page.evaluate(() => localStorage.setItem('dangote-academy-lessons', JSON.stringify({
    'safe-topology': { completedAt: new Date().toISOString() }
  })));
  await page.reload();
  await expect(continueButton).toContainText('Continue: Balance a three-phase schedule');
  await expect(page.locator('#lesson-results .lesson-card.recommended h3')).toHaveText('Balance a three-phase schedule');

  await page.evaluate(() => localStorage.setItem('dangote-academy-lessons', JSON.stringify({
    'safe-topology': { completedAt: new Date().toISOString() },
    'balanced-phases': { completedAt: new Date().toISOString() },
    'fault-response': { completedAt: new Date().toISOString() }
  })));
  await page.reload();
  await expect(continueButton).toHaveAttribute('data-go', 'review');
  await expect(continueButton).toContainText('Review your progress');
  await continueButton.click();
  await expect(page.locator('#module-review')).toHaveClass(/active/);
});
