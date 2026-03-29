export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request, env);
    }

    if (url.pathname === "/health") {
      const backendMode = getBackendMode(env);
      const payload = {
        status: "ok",
        service: "askrich-worker-api",
        upstream_configured: Boolean(env.UPSTREAM_API_BASE),
        backend_mode: backendMode,
        response_source:
          backendMode === "upstream"
            ? "python-upstream-proxy"
            : backendMode === "openai"
              ? "worker-openai"
              : "worker-local-corpus",
      };
      return withCors(json(payload, 200), request, env);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!isAllowedOrigin(request, env)) {
        return withCors(json({ success: false, error: "Origin not allowed" }, 403), request, env);
      }

      const backendMode = getBackendMode(env);
      if (backendMode === "upstream") {
        if (!env.UPSTREAM_API_BASE) {
          return withCors(
            json(
              {
                success: false,
                error: "UPSTREAM_API_BASE is not configured for upstream mode",
              },
              500,
            ),
            request,
            env,
          );
        }

        const upstreamPath = normalizeUpstreamPath(env.UPSTREAM_CHAT_PATH || "/api/chat");
        const upstreamUrl = `${env.UPSTREAM_API_BASE.replace(/\/$/, "")}${upstreamPath}`;
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

      if (backendMode === "openai") {
        return withCors(await handleOpenAIChat(request, env), request, env);
      }

      return withCors(await handleLocalChat(request), request, env);
    }

    return withCors(json({ success: false, error: "Not found" }, 404), request, env);
  },
};

const CORPUS = [
  {
    id: "project-oracle-cns",
    title: "Oracle Customer Notification Service Migration",
    source_url: "https://www.myrobertson.com/case-studies/oracle-cns-oci-migration/",
    text: "Rich led migration of Oracle's Customer Notification Service to OCI-native architecture, improving scalability and operational readiness while supporting a $2M enterprise deal timeline.",
  },
  {
    id: "project-java17",
    title: "Java 17 Global Modernization",
    source_url: "https://www.myrobertson.com/case-studies/java-17-global-modernization/",
    text: "Rich delivered Java 8 to Java 17 modernization and multi-architecture rollout across 32 global data centers in under three months with controlled rollout and reliability safeguards.",
  },
  {
    id: "project-control-plane",
    title: "Control Plane Workflow Platform",
    source_url: "https://www.myrobertson.com/case-studies/control-plane-workflow-platform/",
    text: "Rich architected a reusable control-plane framework for durable command execution, workflow orchestration, and partition-aware asynchronous processing across multitenant services.",
  },
  {
    id: "project-starbucks",
    title: "Starbucks Platform Leadership",
    source_url: "https://www.myrobertson.com/case-studies/starbucks-loyalty-platform-integration/",
    text: "At Starbucks, Rich led backend architecture changes supporting rewards migration and platform services for more than 17 million active users, including API and integration leadership.",
  },
  {
    id: "skills-cloud",
    title: "Cloud and Platform Engineering",
    source_url: "https://www.myrobertson.com/cloud-platform-engineer.html",
    text: "Rich's strengths include cloud platforms, control planes, backend API delivery, Kubernetes operations, migration execution, and production reliability engineering.",
  },
  {
    id: "skills-distributed",
    title: "Distributed Systems Engineering",
    source_url: "https://www.myrobertson.com/distributed-systems-engineer.html",
    text: "Rich focuses on distributed systems correctness, ownership boundaries, retries, idempotency, failure handling, and reliable operation under load and partial failure.",
  },
];

function getBackendMode(env) {
  return String(env.CHAT_BACKEND_MODE || "local").trim().toLowerCase();
}

async function handleLocalChat(request) {
  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return json({ success: false, error: "Invalid JSON payload" }, 400);
  }

  const question = String(payload?.question || "").trim();
  const topK = clampTopK(payload?.top_k);
  if (question.length < 3) {
    return json({ success: false, error: "Question must be at least 3 characters" }, 400);
  }

  const ranked = rankCorpus(question).slice(0, topK);
  if (!ranked.length) {
    return json(
      buildResponse(
        "I do not have enough evidence in the deployed corpus to answer confidently yet. Try asking about Oracle migration, Java modernization, control planes, or Starbucks platform work.",
        [],
        0,
        buildResponseMeta("local", "worker-local-corpus", "local-extractive", null, null),
      ),
      200,
    );
  }

  const answer = buildAnswer(ranked);
  return json(
    buildResponse(
      answer,
      ranked,
      ranked.length,
      buildResponseMeta("local", "worker-local-corpus", "local-extractive", null, null),
    ),
    200,
  );
}

async function handleOpenAIChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return json({ success: false, error: "Invalid JSON payload" }, 400);
  }

  const question = String(payload?.question || "").trim();
  const topK = clampTopK(payload?.top_k);
  if (question.length < 3) {
    return json({ success: false, error: "Question must be at least 3 characters" }, 400);
  }

  if (!env.OPENAI_API_KEY) {
    return json({ success: false, error: "OPENAI_API_KEY is not configured" }, 500);
  }

  const ranked = rankCorpus(question).slice(0, topK);
  const model = String(env.LLM_MODEL || "gpt-4o").trim() || "gpt-4o";
  const apiBase = String(env.LLM_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");

  if (!ranked.length) {
    if (isGreetingOrIdentityQuestion(question)) {
      return json(
        buildResponse(
          "Hi, I'm Ask Rich. I can answer recruiter-focused questions about Rich Robertson's projects, architecture decisions, modernization work, and leadership impact. Try: What has Rich worked on?",
          [],
          0,
          buildResponseMeta("openai", "worker-openai", "openai-compatible", "openai", model),
        ),
        200,
      );
    }

    return json(
      buildResponse(
        "I do not have enough evidence in the deployed corpus to answer confidently yet. Try asking about Oracle migration, Java modernization, control planes, or Starbucks platform work.",
        [],
        0,
        buildResponseMeta("openai", "worker-openai", "openai-compatible", "openai", model),
      ),
      200,
    );
  }

  const evidence = ranked
    .slice(0, 5)
    .map((doc, index) => `[${index + 1}] ${doc.title} - ${doc.text}`)
    .join("\n");

  const upstreamBody = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are Ask Rich, a recruiter-facing assistant. Answer only from provided evidence. Be concise, factual, and first-person from Rich's perspective when appropriate.",
      },
      {
        role: "user",
        content: `Question: ${question}\n\nEvidence:\n${evidence}`,
      },
    ],
  };

  let openaiResponse;
  try {
    openaiResponse = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch (_error) {
    return json({ success: false, error: "OpenAI request failed" }, 502);
  }

  let openaiPayload;
  try {
    openaiPayload = await openaiResponse.json();
  } catch (_error) {
    return json({ success: false, error: "OpenAI response parse failed" }, 502);
  }

  if (!openaiResponse.ok) {
    const openaiError =
      openaiPayload?.error?.message || openaiPayload?.message || "OpenAI returned an error";
    return json({ success: false, error: openaiError }, 502);
  }

  const answer = String(openaiPayload?.choices?.[0]?.message?.content || "").trim();
  if (!answer) {
    return json({ success: false, error: "OpenAI returned an empty answer" }, 502);
  }

  return json(
    buildResponse(
      answer,
      ranked,
      ranked.length,
      buildResponseMeta("openai", "worker-openai", "openai-compatible", "openai", model),
    ),
    200,
  );
}

function isGreetingOrIdentityQuestion(question) {
  const normalized = String(question || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const greetings = new Set(["hello", "hi", "hey", "yo", "greetings"]);
  if (greetings.has(normalized)) {
    return true;
  }

  return (
    normalized.includes("what is your name") ||
    normalized.includes("who are you") ||
    normalized.includes("your name")
  );
}

function clampTopK(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 5;
  }
  return Math.min(20, Math.max(1, parsed));
}

function rankCorpus(question) {
  const qTokens = tokenize(question);
  return CORPUS.map((doc) => {
    const textTokens = tokenize(`${doc.title} ${doc.text}`);
    let score = 0;
    for (const token of qTokens) {
      if (textTokens.has(token)) {
        score += 1;
      }
    }
    return { ...doc, score };
  })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score);
}

function tokenize(text) {
  const matches = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return new Set(matches || []);
}
function buildResponse(answer, docs, retrievedChunks, responseMeta) {
  const citations = docs.map((doc, index) => ({
    id: doc.id,
    title: doc.title,
    source_url: doc.source_url,
    chunk_index: index,
  }));

  return {
    success: true,
    data: {
      answer,
      citations,
      retrieved_chunks: retrievedChunks,
      response_meta: responseMeta,
    },
  };
}

function buildResponseMeta(backendMode, answerSource, generationMode, provider, model) {
  return {
    backend_mode: backendMode,
    answer_source: answerSource,
    generation_mode: generationMode,
    llm_provider: provider,
    llm_model: model,
  };
}

function buildAnswer(rankedDocs) {
  const summary = `Based on the strongest matching evidence, Rich's profile is strongest in distributed systems, cloud platform modernization, and control-plane backend delivery.`;
  const bullets = rankedDocs.slice(0, 4).map((doc) => `- ${doc.text}`);
  return [summary, ...bullets].join("\n");
}

function normalizeUpstreamPath(path) {
  if (!path || typeof path !== "string") {
    return "/api/chat";
  }

  const trimmed = path.trim();
  if (!trimmed) {
    return "/api/chat";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

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
