const DEFAULT_COOLDOWN_MS = 15 * 60_000;

// This pause is used only after all configured routes have been exhausted.
export function sourceCooldownMs(env = process.env) {
  const seconds = Number(env.ADLIB_RATE_LIMIT_COOLDOWN_SECONDS);
  return Number.isInteger(seconds) && seconds >= 60 && seconds <= 3600
    ? seconds * 1000 : DEFAULT_COOLDOWN_MS;
}

export function rateLimitDelayMs(error) {
  return Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > 0
    ? Math.ceil(error.retryAfterMs) : sourceCooldownMs();
}

export function metaRateLimitError(retryAfterMs) {
  const error = new Error('META_RATE_LIMITED');
  error.retryAfterMs = rateLimitDelayMs({ retryAfterMs });
  return error;
}
