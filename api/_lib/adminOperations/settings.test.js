import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, collectionDelayMs, readSettings, validateSettings } from './settings.js';
import { readRuntime, safeHeartbeat } from './runtime.js';
import { publishHeartbeat } from '../../../services/ad-library/adminHeartbeat.mjs';
import { processCrawlJob } from '../../../services/ad-library/worker.mjs';
import { scheduleDueBrands } from '../../../services/ad-library/scheduler.mjs';
import { canAccessView } from '../../../src/team/lib/permissions.js';

describe('administration permissions and settings', () => {
  it.each(['member', 'editor', undefined])('ignores admin view overrides for %s', role => {
    expect(canAccessView({ role, access_overrides: { administracion: true } }, 'administracion')).toBe(false);
  });
  it('rejects disabled admins and accepts active admins', () => {
    expect(canAccessView({ role: 'admin', active: false }, 'administracion')).toBe(false);
    expect(canAccessView({ role: 'admin', active: true }, 'administracion')).toBe(true);
  });
  it.each([{ changes_hours: 0 }, { changes_hours: 169 }, { quiet_hours: 2 }, { enabled: 'false' },
    { error_hours: 25 }, { changes_hours: 1.5 }, { proxy: 'secret' }, { constructor: 'unexpected' }])('rejects unsafe/ambiguous settings %j', patch => {
    expect(() => validateSettings({ ...DEFAULT_SETTINGS, ...patch })).toThrow('INVALID_SETTINGS');
  });
  it('fails closed when settings cannot be read', async () => {
    const query = { select: () => query, eq: () => query, single: async () => ({ error: { message: 'sensitive db detail' } }) };
    await expect(readSettings({ from: () => query })).rejects.toThrow('ADMIN_SETTINGS_UNAVAILABLE');
  });
  it('uses the chosen cadence for changes, quiet scans and ordinary failures', () => {
    const settings = { ...DEFAULT_SETTINGS, changes_hours: 3, quiet_hours: 12, error_hours: 2 };
    expect(collectionDelayMs(settings, { changedAds: 1 })).toBe(3 * 3600000);
    expect(collectionDelayMs(settings)).toBe(12 * 3600000);
    expect(collectionDelayMs(settings, { failed: true })).toBe(2 * 3600000);
  });
});

describe('runtime and scheduled configuration', () => {
  it('reads application signals through an explicit connection when BullMQ has no client', async () => {
    const at=new Date().toISOString();
    const queue={getJobCounts:async()=>({active:0}),getWorkersCount:async()=>1,isPaused:async()=>false,getRateLimitTtl:async()=>0};
    const redis={get:vi.fn(async()=>JSON.stringify({at,revision:1,settingsAvailable:true,proxyStatusAvailable:true,proxyRevision:2}))};
    const runtime=await readRuntime({crawlFactory:()=>queue,mediaFactory:()=>queue,redisFactory:()=>redis});
    expect(queue.client).toBeUndefined();expect(runtime.worker.proxyRevision).toBe(2);expect(runtime.scheduler.settingsAvailable).toBe(true);
  });
  it('keeps a queued job without crawling while paused and resumes with the next read', async () => {
    const crawl = vi.fn(async () => ({ adsSeen: 3 })), worker = { rateLimit: vi.fn() };
    const loadSettings = vi.fn().mockResolvedValueOnce({ ...DEFAULT_SETTINGS, enabled: false }).mockResolvedValueOnce(DEFAULT_SETTINGS);
    const job = { data: { brandId: 'test' }, updateProgress: vi.fn() };
    await expect(processCrawlJob(job, worker, { crawl, loadSettings })).rejects.toThrow('bullmq:rateLimitExceeded');
    expect(worker.rateLimit).toHaveBeenCalledWith(30_000);
    expect(crawl).not.toHaveBeenCalled();
    await processCrawlJob(job, worker, { crawl, loadSettings, loadProxies: async () => ({proxies:[]}) });
    expect(crawl).toHaveBeenCalledWith('test', expect.objectContaining({ settings: DEFAULT_SETTINGS }));
  });
  it('does not run jobs or schedule brands when settings fail', async () => {
    const loadSettings = async () => { throw new Error('ADMIN_SETTINGS_UNAVAILABLE'); };
    const crawl = vi.fn(), rpc = vi.fn();
    await expect(processCrawlJob({}, {}, { crawl, loadSettings })).rejects.toThrow('ADMIN_SETTINGS_UNAVAILABLE');
    await expect(scheduleDueBrands({ rpc }, { loadSettings })).rejects.toThrow('ADMIN_SETTINGS_UNAVAILABLE');
    expect(crawl).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it('only schedules due brands while enabled', async () => {
    const client = { rpc: vi.fn(async () => ({ data: [{ id: 'a' }, { id: 'b' }] })) }, enqueue = vi.fn();
    expect(await scheduleDueBrands(client, { loadSettings: async () => ({ enabled: false }), enqueue })).toBe(0);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(await scheduleDueBrands(client, { loadSettings: async () => DEFAULT_SETTINGS, enqueue, scheduleRequests: async () => 0 })).toBe(2);
    expect(enqueue.mock.calls).toEqual([['a'], ['b']]);
  });
  it('heartbeat never publishes credentials and reports shared proxy cooldowns', async () => {
    const redis = { set: vi.fn(), pttl: vi.fn(async () => 60000) };
    await publishHeartbeat('worker', redis, { loadSettings: async () => ({ revision: 4 }),
      loadProxies: async () => ({revision:2,proxies:[{server:'http://private.example:8888',username:'secret-user',password:'secret-pass'}]}), env: {
      ADLIB_PROXY_SERVER: 'http://private.example:8888', ADLIB_PROXY_USERNAME: 'secret-user', ADLIB_PROXY_PASSWORD: 'secret-pass',
      ADLIB_SCRAPLING_ENABLED: 'true', ADLIB_SCRAPLING_TOKEN: 'secret-token', ADLIB_SCRAPLING_URL: 'http://127.0.0.1:3081', SGAI_API_KEY: 'secret-api',
    } });
    const payload = redis.set.mock.calls[0][1];
    expect(payload).not.toMatch(/secret|private\.example/);
    expect(JSON.parse(payload)).toMatchObject({ revision: 4, settingsAvailable: true, scraplingConfigured: true });
    expect(JSON.parse(payload).proxies[0].retryAt).toBeTruthy();
    expect(redis.set.mock.calls[0].slice(-2)).toEqual(['EX', 90]);
  });
  it('does not expose unexpected heartbeat fields or accept stale signals', () => {
    const raw = JSON.stringify({ at: new Date().toISOString(), revision: 2, token: 'secret',
      proxies: [{ server: 'private', password: 'secret' }], settingsAvailable: true });
    expect(JSON.stringify(safeHeartbeat(raw))).not.toMatch(/secret|private|password|token/);
    expect(safeHeartbeat(raw, Date.now() + 180000)).toBeNull();
    expect(safeHeartbeat('broken')).toBeNull();
  });
  it('reports every configured proxy without secrets, bounded to ten routes',()=>{
    const result=safeHeartbeat(JSON.stringify({at:new Date().toISOString(),proxies:Array.from({length:12},()=>({password:'hidden',retryAt:null}))}));
    expect(result.proxies).toHaveLength(10);expect(result.proxies[2].label).toBe('Respaldo 2');
    expect(JSON.stringify(result)).not.toContain('hidden');
  });
});
