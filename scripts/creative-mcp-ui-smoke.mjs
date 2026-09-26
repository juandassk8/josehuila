// Browser-only fixtures; no production API, database, storage or external requests.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('.backups/creative-mcp-ui');
await mkdir(`${output}/empty-env`, { recursive: true });
const fixturePlugin = { name: 'creative-ui-fixture', configureServer(server) { server.middlewares.use(async (req, res, next) => {
  if (!req.url.startsWith('/__creative-proof')) return next();
  const consent = req.url.startsWith('/__creative-proof-consent');
  const html = `<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import '/src/index.css';
    import {ThemeProvider} from '/src/lib/theme.jsx';
    import ${consent ? 'CreativeConnect' : '{CreativeImagesPage}'} from '/src/team/creative_images/${consent ? 'CreativeConnect' : 'CreativeImagesPage'}.jsx';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ThemeProvider,null,React.createElement(${consent ? 'CreativeConnect' : 'CreativeImagesPage'})));
  </script></body></html>`;
  res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html));
}); } };
const vite = await createServer({ configFile: false, envDir: `${output}/empty-env`, plugins: [react(), fixturePlugin], server: { host: '127.0.0.1', port: 4179, strictPort: true } });
let browser, page;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  page = await browser.newPage();
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('Fixture page error:', e.message); });
  let disconnected = false, lastConsent;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname.startsWith('/backend/')) return json({ access_token: 'fixture', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'fixture-user' } });
    if (url.pathname === '/api/creative-images') {
      const action = url.searchParams.get('action');
      if (action === 'companies') return json({ companies: [{ id: 'company-a', name: 'Empresa de prueba' }], mcp_url: 'https://inforce.example/api/creative-mcp' });
      if (action === 'disconnect') { disconnected = true; return json({ disconnected: true }); }
      return json({ images: [], connections: disconnected ? [] : [{ id: 'test-connection' }], mcp_url: 'https://inforce.example/api/creative-mcp' });
    }
    if (url.pathname === '/api/creative-mcp-auth') {
      if (url.searchParams.get('action') === 'inspect') return json({ scope: 'creatives:read creatives:write' });
      lastConsent = route.request().postDataJSON();
      return json({ redirect: 'http://127.0.0.1:4179/__authorized' });
    }
    if (url.pathname === '/__authorized') return route.fulfill({ status:200, contentType:'text/html',body:'Conexión simulada autorizada' });
    return route.continue();
  });
  for (const width of [1440, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('http://127.0.0.1:4179/__creative-proof');
    await page.getByText('Tu primera pieza empieza con una referencia').waitFor();
    assert.equal(await page.locator('.creative-images').evaluate(el => el.scrollWidth <= el.clientWidth), true, `overflow ${width}`);
    await page.screenshot({ path: `${output}/gallery-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Desconectar mi cuenta' }).click();
  await page.getByText('Tu conexión con esta empresa quedó revocada.').waitFor();
  const request = Buffer.from(JSON.stringify({ client_id: 'fixture' })).toString('base64url');
  await page.goto(`http://127.0.0.1:4179/__creative-proof-consent?request=${request}`);
  await page.getByRole('button', { name: 'Autorizar esta empresa' }).waitFor();
  await page.screenshot({ path: `${output}/consent-320.png`, fullPage:true });
  await page.getByRole('button', { name:'Autorizar esta empresa' }).click();
  await page.waitForURL('**/__authorized'); assert.equal(lastConsent.companyId, 'company-a');
  assert.deepEqual(errors, []);
  console.log('PASS: fixture-only gallery 1440/768/375/320, no overflow, disconnect and consent. No external API calls.');
} catch (error) {
  if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); console.error(await page.locator('body').innerText()); }
  throw error;
} finally { await browser?.close(); await vite.close(); }
