import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
  console.log(`[console.${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  console.log(`[pageerror] ${err.message}`);
});

await page.goto('http://127.0.0.1:5188/');

// Wait for canvas to be visible
await page.waitForSelector('#game-canvas', { timeout: 5000 });

// Click start button
await page.locator('#start-button').click();
console.log('Clicked start button');

// Wait for game to start
try {
  await page.waitForFunction(() => window.__THREE_GAME_DIAGNOSTICS__?.frame > 10, null, { timeout: 15000 });
  console.log('Game started!');
} catch (e) {
  console.log('Timeout waiting for game to start');
}

const diag = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__);
console.log('Diagnostics:', JSON.stringify(diag, null, 2));

const screenshot = await page.screenshot({ fullPage: true });
console.log(`Screenshot taken, size: ${screenshot.length} bytes`);

console.log('Console errors:', consoleErrors);

await browser.close();
