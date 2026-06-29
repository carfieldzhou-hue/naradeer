import { expect, test } from '@playwright/test';

test('renders a nonblank interactive game canvas', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game-canvas')).toBeVisible();

  await page.locator('#start-button').click();
  await page.waitForTimeout(500);

  // Wait for game to start rendering
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10, null, { timeout: 10_000 });

  // Verify player can move (press W to walk forward, Z should decrease)
  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0);

  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);

  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);

  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.player.position.z ?? 0);
  expect(after).toBeLessThan(before);

  // Screenshot for visual reference
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-game`, {
    body: screenshot,
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
