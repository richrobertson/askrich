/**
 * HTTP response and CORS utilities for Worker handlers.
 *
 * Keeping response helpers in one module reduces duplicated header logic and
 * makes origin policy behavior straightforward to test.
 */

/**
 * Normalizes an upstream path value into a safe leading-slash path.
 */
function normalizeUpstreamPath(path) {
  if (!path || typeof path !== 'string') {
    return '/api/chat';
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return '/api/chat';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Creates a JSON response with UTF-8 content type.
 */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

/**
 * Parses `ALLOWED_ORIGINS` env var into a deduplicated Set.
 */
function parseAllowedOrigins(value) {
  const origins = new Set();
  if (!value || typeof value !== 'string') {
    return origins;
  }

  for (const part of value.split(',')) {
    const origin = part.trim();
    if (origin) {
      origins.add(origin);
    }
  }
  return origins;
}

/**
 * Determines whether request origin is allowed for API access.
 */
function isAllowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  // Non-browser/server calls with no origin are treated as allowed.
  if (!origin) {
    return true;
  }

  // When allow-list is empty, explicit browser origin calls are rejected.
  if (allowed.size === 0) {
    return false;
  }

  return allowed.has(origin);
}

/**
 * Applies CORS headers to a response while preserving status/body.
 */
function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (!origin) {
    headers.set('access-control-allow-origin', '*');
  } else if (allowed.has(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'origin');
  }

  headers.set('access-control-allow-methods', 'POST, GET, OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');
  headers.set('access-control-max-age', '86400');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export { normalizeUpstreamPath, json, parseAllowedOrigins, isAllowedOrigin, withCors };
