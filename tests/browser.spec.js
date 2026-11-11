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

test('verification practice saves checklist progress without implying a pass', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="verification"]').click();
  await page.locator('#verification-checks input[value="scope"]').check();
  await expect(page.locator('#verification-progress')).toHaveText('1 / 6');
  await expect(page.locator('#verification-summary')).toContainText('1 of 6 prompts reviewed');
  await page.reload();
  await page.locator('.nav-item[data-module="verification"]').click();
  await expect(page.locator('#verification-checks input[value="scope"]')).toBeChecked();
  for (const checkbox of await page.locator('#verification-checks input').all()) await checkbox.check();
  await expect(page.locator('#verification-summary')).toContainText('checklist completion only');
  await expect(page.locator('#verification-summary')).not.toContainText('passed verification');
  await page.locator('#verification-reset').click();
  await expect(page.locator('#verification-progress')).toHaveText('0 / 6');
});

test('protection concept check compares entered ratings and invalidates stale output', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="protection-coordination"]').click();
  await page.locator('#coordination-form button[type="submit"]').click();
  await expect(page.locator('#coordination-result')).toContainText('Nominal rating order shown');
  await expect(page.locator('#coordination-result')).toContainText('at least the illustrative fault-level');
  await expect(page.locator('#coordination-result')).toContainText('selectivity');
  await page.locator('#coord-upstream').fill('10');
  await expect(page.locator('#coordination-result')).toContainText('Inputs changed');
  await page.locator('#coordination-form button[type="submit"]').click();
  await expect(page.locator('#coordination-result')).toContainText('Review nominal rating order');
});

test('single-line builder edits and restores a constrained classroom diagram', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="single-line"]').click();
  const canvas = page.locator('#single-line-canvas');
  await expect(canvas).toContainText('Supply');
  await expect(page.locator('#single-line-status')).toContainText('not a technical validation');
  await page.locator('#single-line-component').selectOption('transformer');
  await page.locator('#single-line-add').click();
  await expect(canvas).toContainText('Transformer');
  await expect(canvas.locator('svg')).toHaveAttribute('aria-label', /Transformer/);
  await page.reload();
  await page.locator('.nav-item[data-module="single-line"]').click();
  await expect(canvas).toContainText('Transformer');
  await page.locator('#single-line-remove').click();
  await expect(canvas).not.toContainText('Transformer');
  await page.locator('#single-line-reset').click();
  await expect(canvas).not.toContainText('Transformer');
  const backupValidation = await page.evaluate(() => {
    const backup = window.createWorkspaceBackup();
    const includesDiagram = Object.hasOwn(backup.storage, 'dangote-academy-single-line');
    backup.storage['dangote-academy-single-line'] = '["supply","unknown"]';
    try {
      window.validateWorkspaceBackup(backup);
      return { includesDiagram, rejectsInvalidDiagram: false };
    } catch {
      return { includesDiagram, rejectsInvalidDiagram: true };
    }
  });
  expect(backupValidation).toEqual({ includesDiagram: true, rejectsInvalidDiagram: true });
});

test('motor starter simulation handles start, overload reset, and star-delta transition', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="motor-starter"]').click();
  await page.locator('#starter-start').click();
  await expect(page.locator('#starter-state')).toHaveText(/Direct-on-line/);
  await page.locator('#starter-overload').click();
  await expect(page.locator('#starter-state')).toContainText('simulated overload');
  await expect(page.locator('#starter-run-indicator')).toHaveText('Motor command: off');
  await page.locator('#starter-reset-overload').click();
  await page.locator('#starter-mode').selectOption('star-delta');
  await page.locator('#starter-start').click();
  await expect(page.locator('#starter-stage-indicator')).toHaveText('Sequence: star');
  await page.locator('#starter-transition').click();
  await expect(page.locator('#starter-stage-indicator')).toHaveText('Sequence: delta');
  await expect(page.locator('#starter-state')).toContainText('delta stage');
});

test('renewables estimate reports expected classroom energy calculations', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="renewables"]').click();
  await page.locator('#renewables-form button[type="submit"]').click();
  await expect(page.locator('#renewables-result')).toContainText('1.48 kW');
  await expect(page.locator('#renewables-result')).toContainText('6.25 kWh');
  await expect(page.locator('#renewables-result')).toContainText('130 Ah');
  await page.locator('#renew-system-yield').fill('0.5');
  await expect(page.locator('#renewables-result')).toContainText('Inputs changed');
  await page.locator('#renewables-form button[type="submit"]').click();
  await expect(page.locator('#renewables-result')).toContainText('2.22 kW');
});

test('learning paths open their suggested modules and new labs fit mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#menu-toggle').click();
  await page.locator('.nav-item[data-module="learning-paths"]').click();
  await expect(page.locator('.learning-path-card')).toHaveCount(3);
  await page.locator('.learning-path-card').nth(1).locator('button').click();
  await expect(page.locator('#module-calculators')).toHaveClass(/active/);
  await page.locator('#menu-toggle').click();
  await page.locator('.nav-item[data-module="renewables"]').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const formWidth = await page.locator('#renewables-form').evaluate(element => element.scrollWidth > element.clientWidth);
  expect(formWidth).toBe(false);
});

test('dashboard recent project action reopens the saved project workspace', async ({ page }) => {
  await page.goto('/');
  await page.locator('.nav-item[data-module="boq"]').click();
  await page.locator('#project-name').fill('Learning path sample');
  await page.locator('#save-project').click();
  await expect(page.locator('#dashboard-activity')).toContainText('Project saved: Learning path sample');
  await page.locator('.nav-item[data-module="dashboard"]').click();
  await page.locator('.dashboard-open-project').click();
  await expect(page.locator('#module-boq')).toHaveClass(/active/);
  await expect(page.locator('#project-name')).toHaveValue('Learning path sample');
  await expect(page.locator('#project-list')).toHaveValue('Learning path sample');
});
