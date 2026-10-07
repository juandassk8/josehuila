import { mkdir, open, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Private, append-only journal for the manual pilot; not a production billing system.
// Exclusive per-directory lock protects concurrent CLI runs and survives crashes.
export class PilotBudget {
  constructor(directory, maxCredits) {
    if (!directory || !Number.isInteger(maxCredits) || maxCredits < 1 || maxCredits > 1000) throw new Error('SGAI_BUDGET_INVALID');
    this.directory = resolve(directory); this.maxCredits = maxCredits;
  }

  async append(entry, validate) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const lockPath = join(this.directory, 'pilot.lock');
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('SGAI_BUDGET_LOCKED'); throw error; }
    let journal;
    try {
      const path = join(this.directory, 'budget.ndjson');
      let raw = '';
      try { raw = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (raw && !raw.endsWith('\n')) throw new Error('SGAI_BUDGET_CORRUPT');
      let entries;
      try { entries = raw.split('\n').filter(Boolean).map(line => JSON.parse(line)); }
      catch { throw new Error('SGAI_BUDGET_CORRUPT'); }
      validate(entries);
      journal = await open(path, 'a', 0o600);
      await journal.writeFile(JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n');
      await journal.sync();
    } finally {
      await journal?.close();
      await lock.close();
      // Delete only the exact lock we created, never a directory or data journal.
      const { unlink } = await import('node:fs/promises');
      await unlink(lockPath);
    }
  }

  async reserve(id, credits, scope) {
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || !Number.isInteger(credits) || credits < 1) throw new Error('SGAI_BUDGET_INVALID');
    await this.append({ kind: 'reserve', id, credits, scope, maxCredits: this.maxCredits }, entries => {
      const reservations = entries.filter(entry => entry.kind === 'reserve');
      if (reservations.some(entry => entry.id === id)) throw new Error('SGAI_ATTEMPT_ALREADY_RESERVED');
      if (reservations.some(entry => entry.maxCredits !== this.maxCredits)) throw new Error('SGAI_BUDGET_CHANGED');
      const spent = reservations.reduce((sum, entry) => sum + entry.credits, 0);
      if (!Number.isFinite(spent) || spent + credits > this.maxCredits) throw new Error('SGAI_BUDGET_EXHAUSTED');
    });
  }

  async record(id, result) {
    await this.append({ kind: 'result', id, ...result }, entries => {
      if (!entries.some(entry => entry.kind === 'reserve' && entry.id === id)) throw new Error('SGAI_RESERVATION_MISSING');
    });
  }
}
