/**
 * Event identifier utilities.
 *
 * These helpers intentionally avoid any external dependencies so they can run in
 * both local tests and Cloudflare Worker runtime without bundling friction.
 */

/**
 * Creates a compact event id in the form: `<typePrefix>_<epochMs>_<random>`.
 *
 * The `_content` argument is preserved for API compatibility with earlier call
 * sites that passed question/answer content for potential id strategies.
 */
function generateEventId(type, _content) {
  const timestamp = Date.now().toString();
  return `${type.charAt(0)}_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Small, deterministic FNV-1a style hash used for stable anonymized identifiers.
 *
 * This is not cryptographic hashing, but is enough for lightweight grouping and
 * bucketing in analytics where reversibility is not required.
 */
function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Builds an anonymized client identifier from request headers.
 *
 * Priority order keeps compatibility with common proxy header conventions.
 * Only the first `x-forwarded-for` entry is used to prevent unstable multi-hop
 * fingerprints that would reduce analytics quality.
 */
function getClientId(request) {
  let ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // If a proxy chain exists, use only the original client hop.
  ip = ip.split(',')[0].trim();

  // Include origin + user-agent to reduce collisions when IP is shared.
  const origin = request.headers.get('origin') || '';
  const userAgent = request.headers.get('user-agent') || '';

  return hashString(`${ip}|${origin}|${userAgent}`);
}

export { generateEventId, hashString, getClientId };
