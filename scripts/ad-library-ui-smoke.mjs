/* global document, Image */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const base = 'http://127.0.0.1:3001';
const key = process.env.BACKEND_SERVICE_KEY;
assert.ok(key);
const id = randomUUID(), email = `adlib-ui-${id}@example.invalid`, password = randomUUID() + 'aA1!';
let userId, browser, page;
const call = async (path, method = 'GET', body) => {
  const response = await fetch(base + path, { method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => null);
  assert.ok(response.ok, `UI fixture HTTP ${response.status}`);
  return data;
};
try {
  const created = await call('/backend/auth/v1/admin/users', 'POST', { email, password });
  userId = created.user.id;
  await call('/backend/rest/v1/team_members', 'POST', { id: userId, name: 'Prueba de biblioteca', email, role: 'editor' });
  await call('/backend/rest/v1/company_team_members', 'POST', { company_id: '1790107894757', name: 'Prueba de biblioteca', email, auth_user_id: userId, roles: ['editor'] });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  page.on('response', async response => {
    if (new URL(response.url()).pathname !== '/api/ad-library' || response.ok()) return;
    const result = await response.json().catch(() => ({}));
    console.log(JSON.stringify({ libraryHttp: response.status(), error: result.error }));
  });
  await page.goto('https://144.91.92.87/equipo');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.getByRole('button', { name: 'Entrar al War Room', exact: true }).click();
  await page.getByRole('button', { name: /Bibliotecas de anuncios/ }).click();
  await page.getByRole('heading', { name: 'Bibliotecas de anuncios', exact: true }).waitFor();
  await page.locator('.adlib-ad').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Seguir marca', exact: true }).count(), 0, 'Reader must not see follow actions');
  await page.waitForFunction(() => document.querySelector('.adlib-total strong')?.textContent !== '0');
  const expectedCount = Number((await page.locator('.adlib-total strong').innerText()).replace(/\D/g, ''));
  let count = await page.locator('.adlib-ad').count();
  assert.ok(count > 0 && count <= 30);
  const firstPageCount = count;
  while (await page.getByRole('button', { name: 'Cargar más anuncios', exact: true }).count()) {
    await page.getByRole('button', { name: 'Cargar más anuncios', exact: true }).click();
    await page.waitForFunction(previous => document.querySelectorAll('.adlib-ad').length > previous, count);
    count = await page.locator('.adlib-ad').count();
  }
  assert.equal(count, expectedCount);
  const video = page.locator('.adlib-ad video').first();
  await video.waitFor();
  assert.ok(await video.getAttribute('poster'), 'Archived videos need a preview');
  await video.evaluate(element => { element.muted = true; });
  await page.getByRole('button', { name: 'Reproducir video', exact: true }).first().click();
  const playback = await video.evaluate(async element => {
    element.muted = true;
    await element.play();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('VIDEO_TIMEOUT')), 15000);
      if (element.readyState >= 2) { clearTimeout(timer); resolve(); }
      else element.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const result = { width: element.videoWidth, height: element.videoHeight, duration: element.duration };
    element.pause(); return result;
  });
  assert.ok(playback.width > 0);
  await page.getByRole('button', { name: 'Guardar anuncio', exact: true }).first().click();
  await page.getByText('Anuncio guardado en tu selección.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mis guardados', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.adlib-ad').length === 1);
  await page.getByRole('button', { name: /Ver detalle/ }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByText(/Historial de versiones ·/).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Quitar de mis guardados', exact: true }).click();
  await page.getByRole('heading', { name: 'Tu selección empieza aquí' }).waitFor();
  await page.getByRole('button', { name: 'Duración', exact: true }).click();
  await page.locator('.adlib-rank').first().waitFor();
  await page.getByRole('button', { name: 'Lanzamientos', exact: true }).click();
  await page.locator('.adlib-group-main').first().click();
  await page.locator('.adlib-duration-track').first().waitFor();
  for (const view of ['Destinos', 'Ganchos del copy']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.locator('.adlib-group-main').first().click();
    await page.locator('.adlib-ad').first().waitFor();
  }
  await page.getByRole('button', { name: 'Biblioteca', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar anuncios' }).fill('inforce_no_matching_creative_9383');
  await page.getByRole('heading', { name: 'No hay anuncios para estos filtros' }).waitFor();
  await page.getByRole('searchbox', { name: 'Buscar anuncios' }).fill('');
  await page.locator('.adlib-ad').first().waitFor();
  await page.getByRole('button', { name: 'Activos', exact: true }).click();
  await page.locator('.adlib-ad').first().waitFor();
  if (await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).count()) await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  // Diagnose the real unstarted brand, then simulate arrivals only in this browser.
  // No Meta requests, real queue changes or production ads are created by this check.
  const [collectionResponse] = await Promise.all([
    page.waitForResponse(response => response.url().includes('action=collection') && response.url().includes('brandId=')),
    page.getByRole('combobox', { name: 'Marca', exact: true }).selectOption({ label: 'Peluna pets' }),
  ]);
  const realCollection = await collectionResponse.json();
  assert.equal(realCollection.phase, 'rate_limited');
  assert.equal(realCollection.queued, true); assert.equal(realCollection.hasCompleteScan, false);
  await page.getByRole('heading', { name: 'Importación en espera', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'No hay anuncios para estos filtros' }).count(), 0);
  await page.locator('.adlib-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/checks/import-wait.png' });
  const pendingBrand = await page.getByRole('combobox', { name: 'Marca', exact: true }).inputValue();
  let finished = false, simulatedPolls = 0;
  const simulate = async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('brandId') !== pendingBrand) return route.continue();
    const action = params.get('action');
    if (action === 'collection') {
      simulatedPolls++;
      return route.fulfill({ json: { phase: finished ? 'ready' : 'running', hasCompleteScan: finished,
        revision: finished ? 'browser-fixture-completed' : 'browser-fixture-started', progress: { adsSeen: 0 } } });
    }
    if (action === 'ads') return route.fulfill({ json: { ads: finished ? [{ id: 'browser-fixture', page_name: 'Prueba solo en navegador', body: 'Anuncio recibido automáticamente', status: 'active', running_days: 1, content_hash: 'fixture', media_content_hash: 'fixture' }] : [], nextCursor: null } });
    if (action === 'insights') return route.fulfill({ json: { total: finished ? 1 : 0, active: finished ? 1 : 0, formats: [], destinations: [], hooks: [], launches: [] } });
    return route.continue();
  };
  await page.route('**/api/ad-library?**', simulate);
  await page.clock.install();
  await page.getByRole('button', { name: 'Actualizar resultados', exact: true }).click();
  await page.getByRole('heading', { name: 'Consultando anuncios', exact: true }).waitFor();
  finished = true;
  await page.clock.runFor(10_100);
  await page.getByText('Anuncio recibido automáticamente', { exact: true }).waitFor();
  assert.ok(simulatedPolls >= 2, 'Polling must detect arrivals without a manual refresh');
  assert.equal(await page.getByTestId('import-empty').count(), 0);
  await page.unroute('**/api/ad-library?**', simulate);
  await page.clock.resume();
  console.log(JSON.stringify({ realBrandImport: realCollection.phase, retryAt: realCollection.retryAt, automaticCatalogRefresh: 'passed (browser-only simulation)' }));
  await Promise.all([page.waitForResponse(response => response.url().includes('/api/ad-library?') && response.url().includes('action=ads') && response.url().includes('brandId=')), page.getByRole('combobox', { name: 'Marca', exact: true }).selectOption({ label: 'Bonapet' })]);
  await page.locator('.adlib-ad').first().waitFor();
  await page.locator('.adlib-heading').scrollIntoViewIfNeeded();
  await page.locator('.adlib-ad').evaluateAll(async cards => {
    await Promise.all(cards.slice(0, 4).map(async card => {
      const img = card.querySelector('img');
      if (img) await img.decode();
      const poster = card.querySelector('video')?.poster;
      if (poster) { const image = new Image(); image.src = poster; await image.decode(); }
    }));
  });
  await page.screenshot({ path: process.env.ADLIB_UI_SCREENSHOT || '/tmp/inforce-adlib-ui.png' });
  const responsive = [];
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.locator('.adlib').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    assert.ok(layout.scroll <= layout.client + 1, `Library overflow at ${width}: ${JSON.stringify(layout)}`);
    responsive.push({ width, ...layout });
    if (width === 320) {
      await page.getByRole('button', { name: 'Menú de Inforce', exact: true }).click();
      assert.ok(await page.locator('aside').isVisible());
      await page.getByRole('button', { name: 'Cerrar menú de Inforce', exact: true }).click();
      assert.equal(await page.locator('aside').isVisible(), false);
    }
    if (width === 375) {
      await page.screenshot({ path: '/checks/mobile.png' });
      await page.locator('.adlib-ad').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: '/checks/mobile-creative.png' });
      await page.locator('.adlib-heading').scrollIntoViewIfNeeded();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByTitle('Modo oscuro', { exact: true }).click();
  await page.screenshot({ path: '/checks/dark.png' });
  await page.getByTitle('Modo claro', { exact: true }).click();
  await page.getByRole('button', { name: 'Históricos', exact: true }).click();
  await page.getByRole('heading', { name: 'No hay anuncios para estos filtros' }).waitFor();
  assert.equal(errors.length, 0, errors.join(','));
  console.log(JSON.stringify({ ui: 'passed', firstPageCount, totalAds: count, pagination: 'passed', readerControls: 'passed', privateVideoPlayback: playback, historyFilter: 'passed', savedSelection: 'passed', views: 6, responsive, javascriptErrors: errors.length }));
} catch (error) {
  if (page) {
    console.log(JSON.stringify({ libraryState: (await page.locator('.adlib').innerText().catch(() => '')).slice(0, 3500) }));
    await page.screenshot({ path: '/checks/failure.png' }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close();
  if (userId) {
    await call(`/backend/rest/v1/company_team_members?auth_user_id=eq.${userId}`, 'DELETE');
    await call(`/backend/rest/v1/team_members?id=eq.${userId}`, 'DELETE');
    await call(`/backend/auth/v1/admin/users/${userId}`, 'DELETE');
  }
  console.log('UI test account removed');
}
