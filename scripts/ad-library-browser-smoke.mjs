import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Offline compatibility check. Does not contact Meta or change the crawl queue.
const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel });
try {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  await page.setContent('<!doctype html><html><body><button id="check">Verificar</button><output id="result"></output><script>document.querySelector("#check").onclick = () => document.querySelector("#result").textContent = "JavaScript OK";</script></body></html>');
  await page.getByRole('button', { name: 'Verificar' }).click();
  assert.equal(await page.locator('#result').textContent(), 'JavaScript OK');
  console.log(JSON.stringify({ browserCheck: 'passed', channel, version: browser.version(), offline: true }));
} finally {
  await browser.close();
}
