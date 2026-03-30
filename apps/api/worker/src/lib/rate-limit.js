import { getRateLimitPolicy, ONE_HOUR_MS, RATE_LIMIT_RECORD_TTL_SECONDS } from './event-policy.js';

/**
 * Rate-limit enforcement helper.
 *
 * Strategy:
 * 1) Read prior timestamps from KV.
 * 2) Drop requests older than one hour.
 * 3) Enforce hourly cap and burst spacing.
 * 4) Persist updated timestamps.
 *
 * This function intentionally fails open on KV errors to avoid introducing a
 * hard dependency outage for recruiter-facing traffic.
 */
async function checkRateLimit(clientId, env, kv) {
  const policy = getRateLimitPolicy(env);
  if (!policy.isRateLimitEnabled) {
    return { allowed: true };
  }

  const now = Date.now();
  const rateKey = `ratelimit:${clientId}`;

  let record = {};
  try {
    const stored = await kv.get(rateKey);
    if (stored) {
      record = JSON.parse(stored);
    }
  } catch (_error) {
    return { allowed: true };
  }

  const hourAgo = now - ONE_HOUR_MS;
  const recentRequests = (record.requests || []).filter((timestampMs) => timestampMs > hourAgo);

  // Enforce maximum request volume within the hourly rolling window.
  if (recentRequests.length >= policy.hourlyLimit) {
    const resetTime = Math.ceil((recentRequests[0] + ONE_HOUR_MS - now) / 1_000);
    return { allowed: false, resetTime };
  }

  // Enforce a minimum interval between successive requests.
  const lastRequest = recentRequests[recentRequests.length - 1];
  if (lastRequest && now - lastRequest < policy.burstWindowSeconds * 1_000) {
    const resetTime = Math.ceil((policy.burstWindowSeconds * 1_000 - (now - lastRequest)) / 1_000);
    return { allowed: false, resetTime };
  }

  recentRequests.push(now);
  try {
    await kv.put(rateKey, JSON.stringify({ requests: recentRequests }), {
      expirationTtl: RATE_LIMIT_RECORD_TTL_SECONDS,
    });
  } catch (_error) {
    // Fail open for write-path issues.
  }

  return { allowed: true };
}

export { checkRateLimit };
