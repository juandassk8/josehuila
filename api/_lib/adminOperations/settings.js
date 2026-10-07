import { serviceClient } from '../auth.js';

export const DEFAULT_SETTINGS = Object.freeze({ enabled: true, changes_hours: 6, quiet_hours: 24,
  error_hours: 6, scrapling_enabled: true });
export const SETTINGS_COLUMNS = 'enabled,changes_hours,quiet_hours,error_hours,scrapling_enabled,revision,updated_at,updated_by';

export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))
    || Object.keys(DEFAULT_SETTINGS).some(key => !Object.hasOwn(value, key))) throw new Error('INVALID_SETTINGS');
  for (const key of ['enabled', 'scrapling_enabled']) if (typeof value[key] !== 'boolean') throw new Error('INVALID_SETTINGS');
  for (const [key, max] of [['changes_hours', 168], ['quiet_hours', 168], ['error_hours', 24]]) {
    if (!Number.isInteger(value[key]) || value[key] < 1 || value[key] > max) throw new Error('INVALID_SETTINGS');
  }
  if (value.quiet_hours < value.changes_hours) throw new Error('INVALID_SETTINGS');
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, value[key]]));
}

// Fail closed if the migration/database is unavailable. No silent default can undo a pause.
export async function readSettings(client = serviceClient()) {
  const result = await client.from('admin_collection_settings').select(SETTINGS_COLUMNS).eq('id', true).single();
  if (result.error || !result.data) throw new Error('ADMIN_SETTINGS_UNAVAILABLE');
  const row = result.data;
  return { ...validateSettings(Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, row[key]]))),
    revision: row.revision, updated_at: row.updated_at, updated_by: row.updated_by };
}

export function collectionDelayMs(settings, { newAds = 0, changedAds = 0, failed = false } = {}) {
  return (failed ? settings.error_hours : newAds + changedAds > 0 ? settings.changes_hours : settings.quiet_hours) * 3_600_000;
}
