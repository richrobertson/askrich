/**
 * Policy and environment parsing helpers for rate limiting and event retention.
 *
 * Centralizing policy parsing avoids duplicated `Number.parseInt` logic across
 * the request path and makes defaults explicit + testable.
 */

// Constant used in window math for hourly throttling.
const ONE_HOUR_MS = 60 * 60 * 1_000;

// KV TTL for per-client request history used by rate-limit checks.
const RATE_LIMIT_RECORD_TTL_SECONDS = 24 * 60 * 60;

/**
 * Parses positive integer input from env-like values.
 * Returns `defaultValue` when parsing fails or the value is <= 0.
 */
function parsePositiveInteger(value, defaultValue) {
  const parsedNumber = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
    return defaultValue;
  }
  return parsedNumber;
}

/**
 * Produces a normalized rate-limit policy object.
 *
 * Defaults are intentionally conservative and reflect operational expectations:
 * - hourly limit defaults to 30 requests
 * - burst window defaults to 1 second
 */
function getRateLimitPolicy(env) {
  return {
    isRateLimitEnabled: env.RATE_LIMIT_ENABLED === 'true',
    hourlyLimit: parsePositiveInteger(env.RATE_LIMIT_QPS_HOUR || '30', 30),
    burstWindowSeconds: parsePositiveInteger(env.RATE_LIMIT_BURST_SECONDS || '1', 1),
  };
}

/**
 * Computes event TTL in seconds from day-based configuration.
 *
 * The default of 90 days supports milestone-6 analytics use cases while keeping
 * retention bounded.
 */
function getEventTtlSeconds(env) {
  const days = parsePositiveInteger(env.EVENT_TTL_DAYS || '90', 90);
  return days * 24 * 60 * 60;
}

export {
  ONE_HOUR_MS,
  RATE_LIMIT_RECORD_TTL_SECONDS,
  parsePositiveInteger,
  getRateLimitPolicy,
  getEventTtlSeconds,
};
