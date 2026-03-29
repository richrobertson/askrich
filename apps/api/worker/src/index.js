export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    if (url.pathname === "/health") {
      const payload = {
        status: "ok",
        service: "askrich-worker-api",
        upstream_configured: Boolean(env.UPSTREAM_API_BASE),
      };
      return withCors(json(payload, 200), request, env);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!isAllowedOrigin(request, env)) {
        return withCors(json({ success: false, error: "Origin not allowed" }, 403), request, env);
      }

      if (!env.UPSTREAM_API_BASE) {
        return withCors(
          json(
            {
              success: false,
              error: "UPSTREAM_API_BASE is not configured for this environment",
            },
            500,
          ),
          request,
          env,
        );
      }

      const upstreamUrl = `${env.UPSTREAM_API_BASE.replace(/\/$/, "")}/api/chat`;
      const upstreamHeaders = {
        "content-type": "application/json",
      };
      if (env.UPSTREAM_AUTH_TOKEN) {
        upstreamHeaders["authorization"] = `Bearer ${env.UPSTREAM_AUTH_TOKEN}`;
      }
      let upstreamResponse;

      try {
        upstreamResponse = await fetch(upstreamUrl, {
          method: "POST",
          headers: upstreamHeaders,
          body: await request.text(),
        });
      } catch (_error) {
        return withCors(
          json(
            {
              success: false,
              error: "Upstream chat service unavailable",
            },
            502,
          ),
          request,
          env,
        );
      }

      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set("cache-control", "no-store");

      return withCors(
        new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          headers: responseHeaders,
        }),
        request,
        env,
      );
    }

    return withCors(json({ success: false, error: "Not found" }, 404), request, env);
  },
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get("origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (!origin) {
    return true;
  }

  if (allowed.size === 0) {
    return false;
  }

  return allowed.has(origin);
}

function parseAllowedOrigins(value) {
  const origins = new Set();
  if (!value || typeof value !== "string") {
    return origins;
  }

  for (const part of value.split(",")) {
    const origin = part.trim();
    if (origin) {
      origins.add(origin);
    }
  }
  return origins;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get("origin");
  const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (!origin) {
    headers.set("access-control-allow-origin", "*");
  } else if (allowed.size === 0 || allowed.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "origin");
  }

  headers.set("access-control-allow-methods", "POST, GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
