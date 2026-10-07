import { parseArgs } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ScrapeGraphPilot, pilotRequest, SCRAPEGRAPH_PILOT_CREDITS } from '../api/_lib/adLibrary/scrapeGraphPilot.js';
import { PilotBudget } from './lib/pilotBudget.mjs';

async function main() {
  const { values } = parseArgs({ options: { page: { type: 'string' }, country: { type: 'string', default: 'ALL' },
    scrolls: { type: 'string', default: '0' }, execute: { type: 'boolean', default: false },
    format: { type: 'string', default: 'markdown' }, 'page-url': { type: 'string' },
    'active-status': { type: 'string', default: 'active' },
    'check-credits': { type: 'boolean', default: false }, directory: { type: 'string' }, 'max-credits': { type: 'string' },
    attempt: { type: 'string' }, 'admin-key': { type: 'boolean', default: false } } });
  let pilot;
  if (values.execute || values['check-credits']) {
    const apiKey = values['admin-key'] ? await (await import('../api/_lib/adminOperations/scrapeGraph.js')).loadScrapeGraphKey() : process.env.SGAI_API_KEY;
    pilot = new ScrapeGraphPilot({ apiKey });
  }
  if (values['check-credits']) { console.log(JSON.stringify(await pilot.credits())); return; }
  const options = { country: values.country, scrolls: Number(values.scrolls), format: values.format,
    activeStatus: values['active-status'], pageUrl: values['page-url'] };
  const request = pilotRequest(values.page, options);
  if (!values.execute) {
    console.log(JSON.stringify({ dryRun: true, creditsPerCall: SCRAPEGRAPH_PILOT_CREDITS, request,
      note: 'No network call. Execution requires a private directory, API key and fixed credit budget.' }, null, 2));
    return;
  }
  const budget = new PilotBudget(values.directory, Number(values['max-credits']));
  const attemptId = values.attempt || randomUUID();
  const directory = resolve(values.directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const result = await pilot.run(values.page, { budget, attemptId, ...options,
    saveEvidence: evidence => writeFile(join(directory, `${attemptId}.evidence.json`), JSON.stringify(evidence), { mode: 0o600, flag: 'wx' }) });
  const output = join(directory, `${attemptId}.json`);
  await writeFile(output, JSON.stringify(result), { mode: 0o600, flag: 'wx' });
  // Private output contains evidence/media URLs; console only reports counts.
  console.log(JSON.stringify({ attemptId, requestId: result.requestId, coverage: result.coverage, complete: false,
    ads: result.ads.length, withMedia: result.withMedia, missingVideo: result.missingVideo,
    reportedTotal: result.reportedTotal, rejectedCards: result.rejectedCards, evidenceKind: result.evidenceKind, creditsReserved: result.creditsReserved,
    observedBalanceDelta: result.observedBalanceDelta, output }));
}
main().catch(error => { console.error(JSON.stringify({ error: /^(SGAI|META)_[A-Z_]+$/.test(error.message) ? error.message : 'PILOT_FAILED' })); process.exitCode = 1; });
