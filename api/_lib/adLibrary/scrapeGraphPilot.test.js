import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScrapeGraphPilot, inspectPilotResponse, pilotRequest } from './scrapeGraphPilot.js';
import { PilotBudget } from '../../../scripts/lib/pilotBudget.mjs';

const pageId = '123456';
const pageUrl = 'https://www.facebook.com/examplebrand';
const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', ...headers },
});
const html = (id = pageId) => `<script type="application/json">${JSON.stringify({ data: { ad_library_main: {
  search_results_connection: { edges: [{ node: { ad_archive_id: '98765', page_id: id, is_active: true,
    snapshot: { body: { text: 'Evidence' } } } }], page_info: { has_next_page: false } },
} } })}</script>`;
const payload = content => ({ id: 'request-123', results: { html: { data: [content] } } });
const budget = () => ({ reserve: vi.fn(async () => {}), record: vi.fn(async () => {}) });

describe('ScrapeGraph paid pilot', () => {
  it('does one billable request, checks balances, and never certifies a snapshot as a full scan', async () => {
    const allowance = budget();
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ remaining: 20, used: 0 }))
      .mockImplementationOnce(async (url, options) => {
        expect(allowance.reserve).toHaveBeenCalledWith('attempt-123', 1, { pageId, request: expect.any(Object) });
        expect(url).toBe('https://v2-api.scrapegraphai.com/api/scrape');
        expect(options.redirect).toBe('error');
        expect(JSON.parse(options.body)).toMatchObject({ formats: [{ type: 'html', mode: 'normal' }], fetchConfig: { mode: 'auto', stealth: false, scrolls: 0, wait: 0 } });
        return response(payload(html()));
      }).mockResolvedValueOnce(response({ remaining: 19, used: 1 }));
    const saveEvidence = vi.fn();
    const result = await new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).run(pageId, { budget: allowance, attemptId: 'attempt-123', format: 'html', saveEvidence });
    expect(result.ads).toHaveLength(1);
    expect(result).toMatchObject({ complete: false, coverage: 'partial', observedBalanceDelta: 1 });
    expect(saveEvidence).toHaveBeenCalledWith(expect.objectContaining({ payload: payload(html()), pageId }));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(allowance.record).toHaveBeenCalledWith('attempt-123', expect.objectContaining({ status: 'received' }));
  });
  it('does not turn arbitrary text or empty HTML into validated ads or a zero-ad complete scan', () => {
    const result = inspectPilotResponse(payload('<div>123456 has 50 active ads</div>'), pageId);
    expect(result).toMatchObject({ ads: [], complete: false, coverage: 'unverified', evidenceBatches: 0 });
    expect(() => inspectPilotResponse(payload(html('888888')), pageId)).toThrow('META_PAGE_MISMATCH');
  });
  it.each([401, 402, 403, 429, 500])('does not reserve or retry after credit-check HTTP %s', async status => {
    const allowance = budget(), fetchImpl = vi.fn(async () => response({}, status));
    await expect(new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).run(pageId, { budget: allowance, attemptId: 'attempt-123', pageUrl })).rejects.toThrow();
    expect(allowance.reserve).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('retains the reservation after an uncertain paid timeout and never retries automatically', async () => {
    const allowance = budget(), fetchImpl = vi.fn().mockResolvedValueOnce(response({ remaining: 20 }))
      .mockRejectedValueOnce(new Error('secret transport detail'));
    await expect(new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).run(pageId, { budget: allowance, attemptId: 'attempt-123', pageUrl })).rejects.toThrow('SGAI_TRANSPORT_FAILED');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(allowance.record).toHaveBeenCalledWith('attempt-123', { status: 'failed_or_uncertain', errorCode: 'SGAI_TRANSPORT_FAILED' });
  });
  it('rejects arbitrary targets, invalid budgets and limits before making a paid request', async () => {
    for (const bad of ['https://example.com', '123', '../private']) expect(() => pilotRequest(bad)).toThrow();
    expect(() => pilotRequest(pageId, { scrolls: 101 })).toThrow();
    const fetchImpl = vi.fn();
    await expect(new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).run(pageId, { pageUrl })).rejects.toThrow('SGAI_BUDGET_REQUIRED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('reports Retry-After without a retry or leaking provider error details', async () => {
    const fetchImpl = vi.fn(async () => response({ error: { message: 'private account' } }, 429, { 'retry-after': '120' }));
    await expect(new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).credits()).rejects.toMatchObject({ message: 'SGAI_RATE_LIMITED', retryAfterMs: 120000 });
  });
  it('retains evidence and the reservation when parsing fails, without another extraction', async () => {
    const allowance = budget(), saveEvidence = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({ remaining: 5 }))
      .mockResolvedValueOnce(response({ id: 'bad-response', results: { markdown: { data: 123 } } }));
    await expect(new ScrapeGraphPilot({ apiKey: 'test-key', fetchImpl }).run(pageId,
      { pageUrl, budget: allowance, attemptId: 'attempt-123', saveEvidence })).rejects.toThrow('SGAI_RESPONSE_INVALID');
    expect(saveEvidence).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(allowance.record).toHaveBeenCalledWith('attempt-123', expect.objectContaining({ status: 'failed_or_uncertain' }));
  });
  it('rejects unconfirmed page identities before spending and keeps filters explicit', async () => {
    expect(() => pilotRequest(pageId)).toThrow('SGAI_PAGE_IDENTITY_REQUIRED');
    const request = pilotRequest(pageId, { pageUrl, country: 'CO', activeStatus: 'all' });
    const url = new URL(request.url);
    expect(url.searchParams.get('view_all_page_id')).toBe(pageId);
    expect(url.searchParams.get('active_status')).toBe('all');
    expect(url.searchParams.get('country')).toBe('CO');
    expect(request.formats[0].type).toBe('markdown');
  });
});

describe('durable pilot budget', () => {
  it('prevents duplicate charges, concurrent overspending and budget changes across restarts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'inforce-sgai-test-'));
    try {
      const first = new PilotBudget(directory, 6), second = new PilotBudget(directory, 6);
      const outcomes = await Promise.allSettled([first.reserve('attempt-one', 6, {}), second.reserve('attempt-two', 6, {})]);
      expect(outcomes.filter(item => item.status === 'fulfilled')).toHaveLength(1);
      await expect(new PilotBudget(directory, 6).reserve('attempt-new', 6, {})).rejects.toThrow('SGAI_BUDGET_EXHAUSTED');
      await expect(new PilotBudget(directory, 12).reserve('attempt-new', 6, {})).rejects.toThrow('SGAI_BUDGET_CHANGED');
      const entry = JSON.parse((await readFile(join(directory, 'budget.ndjson'), 'utf8')).trim());
      await expect(first.reserve(entry.id, 6, {})).rejects.toThrow('SGAI_ATTEMPT_ALREADY_RESERVED');
      await first.record(entry.id, { status: 'failed_or_uncertain' });
      await expect(second.reserve('attempt-three', 6, {})).rejects.toThrow('SGAI_BUDGET_EXHAUSTED');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
