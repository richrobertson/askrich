/**
 * Ask Rich Cloudflare Worker: Chat API Handler
 *
 * Runtime modes:
 * - `upstream`: proxy chat requests to an upstream API
 * - `openai`: call OpenAI directly
 * - `local`: answer from the in-repo corpus and routing rules
 *
 * Quality checks are covered by tests in `docs/testing/CANNED_RESPONSES.md`.
 * Key env vars: `CHAT_BACKEND_MODE`, `UPSTREAM_API_BASE`, `OPENAI_*`,
 * `ALLOWED_ORIGINS`, `RATE_LIMIT_*`, and `EVENT_LOGGING_ENABLED`.
 */

/**
 * Milestone 6: Rate Limiting and Event Recording
 *
 * - Rate limits are per client (`30/hour` + `1s` burst guard).
 * - Events are written as daily NDJSON records in KV with a 90-day TTL.
 * - Question/answer/feedback event IDs are used to link the request lifecycle.
 */

/**
 * Create an event ID for question/answer/feedback linkage.
 * Format: `<typePrefix>_<timestampMs>_<random6>`.
 */
function generateEventId(type, _content) {
  const timestamp = Date.now().toString();
  const baseId = `${type.charAt(0)}_${timestamp}_${Math.random().toString(36).substring(2, 8)}`;
  return baseId;
}

/**
 * Build a privacy-preserving client key from request headers.
 *
 * Uses IP header precedence (`cf-connecting-ip`, `x-forwarded-for`,
 * `x-real-ip`) and returns a one-way hash of IP + origin + user-agent.
 */
function hashString(input) {
  // FNV-1a 32-bit hash (deterministic, fast, non-reversible for this use case)
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getClientId(request) {
  let ip = request.headers.get("cf-connecting-ip") || 
           request.headers.get("x-forwarded-for") || 
           request.headers.get("x-real-ip") || 
           "unknown";
  
  ip = ip.split(",")[0].trim();
  
  const origin = request.headers.get("origin") || "";
  const userAgent = request.headers.get("user-agent") || "";

  return hashString(`${ip}|${origin}|${userAgent}`);
}

function getEventTtlSeconds(env) {
  const raw = parseInt(String(env.EVENT_TTL_DAYS || "90"), 10);
  const days = Number.isFinite(raw) && raw > 0 ? raw : 90;
  return days * 24 * 60 * 60;
}

/**
 * Enforce per-client rate limits backed by KV sliding window state.
 *
 * Returns `{ allowed: false, resetTime }` when either:
 * - hourly quota (`RATE_LIMIT_QPS_HOUR`, default 30) is exceeded, or
 * - burst interval (`RATE_LIMIT_BURST_SECONDS`, default 1) is violated.
 */
async function checkRateLimit(clientId, env, kv) {
  // Feature flag: allow disabling rate limiting in development
  if (env.RATE_LIMIT_ENABLED !== "true") {
    return { allowed: true };
  }

  // Get current time and rate limit key
  const now = Date.now();
  const rateKey = `ratelimit:${clientId}`;
  
  // Retrieve existing rate limit record for this client
  // Returns null if first request or record expired
  let record = {};
  try {
    const stored = await kv.get(rateKey);
    if (stored) {
      record = JSON.parse(stored);
    }
  } catch (_e) {
    // If KV is unavailable, fail open (allow request)
    // Ensures graceful degradation when storage fails
    return { allowed: true };
  }

  // Calculate sliding window: requests from last 60 minutes
  // Removes timestamps older than 1 hour for hourly limit check
  const hourAgo = now - (60 * 60 * 1000);
  const recentRequests = (record.requests || []).filter(t => t > hourAgo);
  
  // Check hourly rate limit (default 30 questions/hour)
  // Config: RATE_LIMIT_QPS_HOUR (questions per hour, misnaming but intentional)
  const qpsHour = parseInt(env.RATE_LIMIT_QPS_HOUR || "30", 10);
  if (recentRequests.length >= qpsHour) {
    // Client has hit hourly limit
    // Calculate when limit will reset (when oldest request ages out)
    const resetTime = Math.ceil((recentRequests[0] + 60 * 60 * 1000 - now) / 1000);
    return { allowed: false, resetTime };
  }

  // Check burst protection (minimum 1 second between requests)
  const burstSeconds = parseInt(env.RATE_LIMIT_BURST_SECONDS || "1", 10);
  if (recentRequests.length > 0) {
    const lastRequest = recentRequests[recentRequests.length - 1];
    if (now - lastRequest < (burstSeconds * 1000)) {
      const resetTime = Math.ceil((burstSeconds * 1000 - (now - lastRequest)) / 1000);
      return { allowed: false, resetTime };
    }
  }

  // Record this request in the sliding window state.
  recentRequests.push(now);
  try {
    await kv.put(rateKey, JSON.stringify({ requests: recentRequests }), { 
      expirationTtl: 24 * 60 * 60 // 24 hours to keep old timestamps
    });
  } catch (_e) {
    // If recording fails, still allow the request
  }

  return { allowed: true };
}

/**
 * Record a question event to KV store
 */
async function recordQuestionEvent(eventId, clientId, question, payload, env, kv) {
  if (env.EVENT_LOGGING_ENABLED !== "true") {
    return eventId;
  }

  try {
    const event = {
      eventId,
      type: "question",
      timestamp: new Date().toISOString(),
      clientId,
      question: question.substring(0, 2000), // Truncate for safety
      topK: payload?.top_k || 5,
      humorMode: payload?.humor_mode || "clean_professional",
    };

    const dateKey = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const kvKey = `events:${dateKey}`;
    
    // Append to daily NDJSON record
    let existing = "";
    try {
      existing = await kv.get(kvKey) || "";
    } catch (_e) {
      // OK if KV is empty
    }

    const ndjson = existing + (existing ? "\n" : "") + JSON.stringify(event);
    await kv.put(kvKey, ndjson, { expirationTtl: getEventTtlSeconds(env) });
  } catch (_e) {
    // Fail silently; event recording is non-critical
  }

  return eventId;
}

/**
 * Record an answer event to KV store
 */
async function recordAnswerEvent(eventId, questionEventId, clientId, answer, citations, latencyMs, backendMode, env, kv) {
  if (env.EVENT_LOGGING_ENABLED !== "true") {
    return eventId;
  }

  try {
    const event = {
      eventId,
      type: "answer",
      timestamp: new Date().toISOString(),
      questionEventId,
      clientId,
      answer: answer.substring(0, 4000), // Truncate for safety
      citationCount: (citations || []).length,
      answerHash: answer.substring(0, 20), // Only store prefix for deduping
      durationMs: latencyMs || 0,
      backendMode: backendMode || "local",
    };

    const dateKey = new Date().toISOString().split("T")[0];
    const kvKey = `events:${dateKey}`;
    
    let existing = "";
    try {
      existing = await kv.get(kvKey) || "";
    } catch (_e) {
      // OK if KV is empty
    }

    const ndjson = existing + (existing ? "\n" : "") + JSON.stringify(event);
    await kv.put(kvKey, ndjson, { expirationTtl: getEventTtlSeconds(env) });
  } catch (_e) {
    // Fail silently
  }

  return eventId;
}

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
        backend_mode: getBackendMode(env),
      };
      return withCors(json(payload, 200), request, env);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!isAllowedOrigin(request, env)) {
        return withCors(json({ success: false, error: "Origin not allowed" }, 403), request, env);
      }

      // M6: Generate event ID and check rate limits
      const questionEventId = generateEventId("question", `${Date.now()}`);
      const clientId = getClientId(request);
      const kv = env.EVENTS_KV;
      
      // Check rate limit and return 429 when exceeded.
      const rateCheckResult = await checkRateLimit(clientId, env, kv);
      if (!rateCheckResult.allowed) {
        // Return 429 with retry guidance
        const response = withCors(
          json(
            {
              success: false,
              error: "Rate limit exceeded. Please try again soon.",
              eventId: questionEventId,
            },
            429,
          ),
          request,
          env,
        );
        response.headers.set("Retry-After", String(rateCheckResult.resetTime || 60));
        return response;
      }

      // Get request body for logging
      const requestText = await request.text();
      let payload = {};
      try {
        payload = JSON.parse(requestText);
      } catch (_error) {
        return withCors(json({ success: false, error: "Invalid JSON payload" }, 400), request, env);
      }

      const question = String(payload?.question || "").trim();
      
      // M6: Record question event
      await recordQuestionEvent(questionEventId, clientId, question, payload, env, kv);

      // Continue with normal chat handling
      const backendMode = getBackendMode(env);
      const startTime = Date.now();
      let answerEventId = generateEventId("answer", `${Date.now()}`);
      let responseJson = null;

      try {
        if (backendMode === "upstream") {
          if (!env.UPSTREAM_API_BASE) {
            return withCors(
              json(
                {
                  success: false,
                  error: "UPSTREAM_API_BASE is not configured for upstream mode",
                  eventId: questionEventId,
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
              body: requestText,
            });
          } catch (_error) {
            return withCors(
              json(
                {
                  success: false,
                  error: "Upstream chat service unavailable",
                  eventId: questionEventId,
                },
                502,
              ),
              request,
              env,
            );
          }

          const latencyMs = Date.now() - startTime;
          const upstreamBody = await upstreamResponse.text();
          
          // Parse to get answer for event logging
          try {
            responseJson = JSON.parse(upstreamBody);
            if (responseJson.data?.answer) {
              await recordAnswerEvent(
                answerEventId,
                questionEventId,
                clientId,
                responseJson.data.answer,
                responseJson.data.citations || [],
                latencyMs,
                "upstream",
                env,
                kv,
              );
            }
          } catch (_e) {
            // Ignore parse errors for logging
          }

          const responseHeaders = new Headers(upstreamResponse.headers);
          responseHeaders.set("cache-control", "no-store");
          responseHeaders.set("X-Question-Event-ID", questionEventId);
          responseHeaders.set("X-Answer-Event-ID", answerEventId);

          const corsResponse = withCors(
            new Response(upstreamBody, {
              status: upstreamResponse.status,
              statusText: upstreamResponse.statusText,
              headers: responseHeaders,
            }),
            request,
            env,
          );
          return corsResponse;
        }

        if (backendMode === "openai") {
          const result = await handleOpenAiChat(new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: requestText,
          }), env);
          
          const latencyMs = Date.now() - startTime;
          const body = await result.text();
          
          try {
            responseJson = JSON.parse(body);
            if (responseJson.data?.answer) {
              await recordAnswerEvent(
                answerEventId,
                questionEventId,
                clientId,
                responseJson.data.answer,
                responseJson.data.citations || [],
                latencyMs,
                "openai",
                env,
                kv,
              );
            }
          } catch (_e) {
            // Ignore parse errors
          }

          const headers = new Headers(result.headers);
          headers.set("cache-control", "no-store");
          headers.set("X-Question-Event-ID", questionEventId);
          headers.set("X-Answer-Event-ID", answerEventId);
          
          return withCors(
            new Response(body, {
              status: result.status,
              statusText: result.statusText,
              headers,
            }),
            request,
            env,
          );
        }

        const result = await handleLocalChat(new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: requestText,
        }), env);

        const latencyMs = Date.now() - startTime;
        const body = await result.text();
        
        try {
          responseJson = JSON.parse(body);
          if (responseJson.data?.answer) {
            await recordAnswerEvent(
              answerEventId,
              questionEventId,
              clientId,
              responseJson.data.answer,
              responseJson.data.citations || [],
              latencyMs,
              "local",
              env,
              kv,
            );
          }
        } catch (_e) {
          // Ignore parse errors
        }

        const headers = new Headers(result.headers);
        headers.set("cache-control", "no-store");
        headers.set("X-Question-Event-ID", questionEventId);
        headers.set("X-Answer-Event-ID", answerEventId);
        
        return withCors(
          new Response(body, {
            status: result.status,
            statusText: result.statusText,
            headers,
          }),
          request,
          env,
        );
      } catch (error) {
        return withCors(
          json(
            {
              success: false,
              error: String(error?.message || "Server error"),
              eventId: questionEventId,
            },
            500,
          ),
          request,
          env,
        );
      }
    }

    if (url.pathname === "/api/feedback" && request.method === "POST") {
      if (!isAllowedOrigin(request, env)) {
        return withCors(json({ success: false, error: "Origin not allowed" }, 403), request, env);
      }

      // M6: Handle feedback submission
      let feedbackPayload = {};
      try {
        feedbackPayload = await request.json();
      } catch (_error) {
        return withCors(json({ success: false, error: "Invalid JSON payload" }, 400), request, env);
      }

      const feedbackEventId = generateEventId("feedback", `${Date.now()}`);
      const clientId = getClientId(request);
      const kv = env.EVENTS_KV;

      const questionEventId = String(feedbackPayload.questionEventId || "").trim();
      const answerEventId = String(feedbackPayload.answerEventId || "").trim();
      if (!/^q_[a-z0-9_]+$/i.test(questionEventId) || !/^a_[a-z0-9_]+$/i.test(answerEventId)) {
        return withCors(
          json({ success: false, error: "Invalid questionEventId or answerEventId" }, 400),
          request,
          env,
        );
      }

      try {
        const event = {
          eventId: feedbackEventId,
          type: "feedback",
          timestamp: new Date().toISOString(),
          questionEventId,
          answerEventId,
          clientId,
          sentiment: ["helpful", "unhelpful"].includes(feedbackPayload.sentiment)
            ? feedbackPayload.sentiment
            : "neutral",
          optionalNote: String(feedbackPayload.optionalNote || "").substring(0, 500),
        };

        const dateKey = new Date().toISOString().split("T")[0];
        const kvKey = `events:${dateKey}`;
        
        let existing = "";
        try {
          existing = await kv.get(kvKey) || "";
        } catch (_e) {
          // OK if KV is empty
        }

        const ndjson = existing + (existing ? "\n" : "") + JSON.stringify(event);
        await kv.put(kvKey, ndjson, { expirationTtl: getEventTtlSeconds(env) });
      } catch (_e) {
        // Fail silently; feedback recording is non-critical
      }

      return withCors(
        json({ success: true, eventId: feedbackEventId }, 201),
        request,
        env,
      );
    }

    return withCors(json({ success: false, error: "Not found" }, 404), request, env);
  },
};

const CORPUS = [
  {
    id: "profile-education-degrees",
    title: "Education and Degrees",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Rich holds two bachelor's degrees from Purdue University (2007): a Bachelor of Science in Management (Krannert School of Management) and a Bachelor of Science in Computer & Information Technology (College of Technology). This education history reflects both business and technical foundations.",
  },
  {
    id: "profile-academic-history",
    title: "Academic History",
    source_url: "https://www.myrobertson.com",
    text: "Academic history highlights Purdue University coursework and degree completion in both management and computer/information technology disciplines, completed in 2007.",
  },
  {
    id: "profile-internship-sfi",
    title: "Internship Experience",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Rich completed an internship with SFI through the Interns for Indiana program.",
  },
  {
    id: "profile-public-links",
    title: "Public Profiles",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Public profile links: GitHub https://github.com/richrobertson and LinkedIn https://www.linkedin.com/in/royrobertson. These can be shared when recruiters ask for social profiles, portfolio links, or professional profile URLs.",
  },
  {
    id: "profile-technologies-current",
    title: "Current Technology Stack",
    source_url: "https://github.com/richrobertson",
    text: "Recent technologies include Java, C#, JavaScript, Scala, Python, PowerShell, Bash, Kubernetes, Terraform, Istio, Prometheus, REST APIs, SQL and NoSQL systems, Azure, and Oracle Cloud Infrastructure (OCI).",
  },
  {
    id: "profile-technologies-historical",
    title: "Historical Technologies",
    source_url: "https://www.myrobertson.com",
    text: "Past technology experience includes VB.NET, SharePoint Services, .NET Compact Framework, ASP.NET, WPF, Windows Forms, InfoPath, Microsoft Access, Team Foundation Server (TFS), Hyper-V, System Center Virtual Machine Manager, Apigee, Cosmos Scope scripts, and FitNesse.",
  },
  {
    id: "profile-technologies-enterprise",
    title: "Enterprise Platform Technology History",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Across Oracle, Starbucks, Slalom, and Avanade engagements, Rich used Java platform modernization, Kubernetes traffic management, dependency injection patterns, CQRS microservices, OData APIs, Microsoft SQL Server, and cloud services on OCI and Azure.",
  },
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
    id: "profile-career-transition-rif",
    title: "Career Transition and Work Gap Context",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Rich's Oracle role was eliminated in November 2024 as part of a reduction in force (RIF). Since then, he has spent time as a full-time dad with his two children while maintaining technical momentum through engineering projects and technical writing. He is now ready for the next chapter of his career.",
  },
  {
    id: "projects-post-oracle-github",
    title: "Personal Projects and GitHub Repositories Since Nov 2024",
    source_url: "https://github.com/richrobertson",
    text: "Since November 2024, Rich has been building personal projects including Ask Rich (https://github.com/richrobertson/askrich), MyRobertson.com (https://github.com/richrobertson/myrobertson_com), homelab bootstrap (https://github.com/richrobertson/homelab_bootstrap), homelab flux (https://github.com/richrobertson/homelab_flux), homelab ansible (https://github.com/richrobertson/homelab_ansible), notification_service (https://github.com/richrobertson/notification_service), and tenure (https://github.com/richrobertson/tenure).",
  },
  {
    id: "projects-private-cloud-iac",
    title: "Infrastructure as Code Private Cloud and Distributed Storage",
    source_url: "https://github.com/richrobertson/homelab_bootstrap",
    text: "A major post-Oracle focus has been building an infrastructure-as-code private cloud using Terraform-first provisioning, Kubernetes platform operations, Vault-integrated secrets, DNS automation, and distributed storage workflows in a homelab environment.",
  },
  {
    id: "writing-published-articles",
    title: "Published Writing and Articles",
    source_url: "https://www.myrobertson.com/writing/",
    text: "Rich has published writing and blog posts including Backpressure in Distributed Systems (https://www.myrobertson.com/writing/backpressure-in-distributed-systems/), Architecting a Multitenant Control Plane (https://www.myrobertson.com/writing/architecting-a-multitenant-control-plane/), Control Plane Architecture Guide (https://www.myrobertson.com/writing/control-plane-architecture-guide/), Designing a Correct Distributed Lease Service Tenure on Raft (https://www.myrobertson.com/writing/designing-a-correct-distributed-lease-service-tenure-on-raft/), Distributed Systems Reliability (https://www.myrobertson.com/writing/distributed-systems-reliability/), API Backpressure Explained Simply (https://www.myrobertson.com/blog/api-backpressure-explained-simply.html), and What It Took to Modernize a Legacy Service Across 32 Global Regions (https://www.myrobertson.com/blog/what-it-took-to-modernize-a-legacy-service-across-32-global-regions.html).",
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

const PROFILE_LINKS = {
  github: "https://github.com/richrobertson",
  linkedin: "https://www.linkedin.com/in/royrobertson",
};

const PROFILE_PLATFORM_ORDER = ["linkedin", "github"];

const GREETING_SIGNALS = new Set([
  "hi",
  "hello",
  "hey",
  "yo",
  "hiya",
  "good morning",
  "good afternoon",
  "good evening",
  "whats up",
  "what s up",
  "sup",
]);

const HOW_ARE_YOU_SIGNALS = new Set([
  "how are you",
  "hows it going",
  "how s it going",
  "how are you doing",
  "how do you do",
]);

const THANKS_SIGNALS = new Set([
  "thanks",
  "thank you",
  "thx",
  "ty",
  "appreciate it",
]);

const WHO_ARE_YOU_SIGNALS = new Set([
  "who are you",
  "what are you",
  "what is your name",
  "what s your name",
  "whats your name",
  "your name",
  "what can you do",
  "help",
  "what do you do",
]);

const JOKE_SIGNALS = [
  "joke",
  "something funny",
  "make me laugh",
  "dad joke",
  "cloud engineer joke",
  "senior cloud engineer joke",
  "funny",
];
const AFFIRMATION_SIGNALS = new Set([
  "yes",
  "y",
  "yep",
  "yeah",
  "yup",
  "sure",
  "ok",
  "okay",
  "go ahead",
  "do it",
  "please",
  "sounds good",
]);

const OUT_OF_SCOPE_PERSONAL_SIGNALS = [
  "favorite color",
  "favourite color",
  "favorite food",
  "favourite food",
  "favorite movie",
  "favourite movie",
  "favorite song",
  "favourite song",
  "zodiac",
  "astrology",
  "horoscope",
  "birthday",
  "how old are you",
  "what is your age",
  "your age",
  "religion",
  "politics",
];

const MAX_NORMALIZED_HISTORY_TURNS = 50;
const MAX_NORMALIZED_HISTORY_CHARS = 12000;

const SUPPRESSED_UNLESS_ASKED_IDS = new Set(["profile-career-transition-rif"]);

const CAREER_BREAK_QUERY_SIGNALS = [
  "career break",
  "career gap",
  "employment gap",
  "resume gap",
  "work gap",
  "break in my career",
  "break from work",
  "break from my career",
  "time off",
  "unemployed",
  "rif",
  "layoff",
  "laid off",
  "reduction in force",
  "between jobs",
  "what have you been doing",
  "since oracle",
  "after oracle",
  "adversity",
];

/**
 * Determine which chat backend mode to use.
 *
 * Normalizes `CHAT_BACKEND_MODE` to a lowercase string and defaults to
 * `local` when unset.
 */
function getBackendMode(env) {
  return String(env.CHAT_BACKEND_MODE || "local").trim().toLowerCase();
}

function getChatCacheKv(env) {
  if (!env) {
    return null;
  }
  return env.CHAT_CACHE_KV || env.EVENTS_KV || null;
}

function isChatCacheEnabled(env) {
  if (!env) {
    return false;
  }
  const raw = String(env.CHAT_CACHE_ENABLED || "true").trim().toLowerCase();
  return raw !== "false";
}

function getChatCacheTtlSeconds(env) {
  const raw = Number.parseInt(String(env?.CHAT_CACHE_TTL_SECONDS || "300"), 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 300;
  }
  return Math.min(3600, Math.max(30, raw));
}

function buildChatCacheKey(question, topK, humorMode) {
  const normalizedQuestion = normalizeIntentText(question).slice(0, 300);
  const signature = `${normalizedQuestion}|${topK}|${humorMode}`;
  return `chatcache:v1:${hashString(signature)}`;
}

async function getCachedChatData(env, key) {
  if (!isChatCacheEnabled(env)) {
    return null;
  }
  const kv = getChatCacheKv(env);
  if (!kv || !key) {
    return null;
  }

  try {
    const raw = await kv.get(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.answer !== "string" || !Array.isArray(parsed.citations)) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

async function putCachedChatData(env, key, data) {
  if (!isChatCacheEnabled(env)) {
    return;
  }
  const kv = getChatCacheKv(env);
  if (!kv || !key || !data) {
    return;
  }

  try {
    await kv.put(key, JSON.stringify(data), {
      expirationTtl: getChatCacheTtlSeconds(env),
    });
  } catch (_error) {
    // Best effort cache write only.
  }
}

async function handleLocalChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return json({ success: false, error: "Invalid JSON payload" }, 400);
  }

  const question = String(payload?.question || "").trim();
  const humorMode = normalizeHumorMode(payload?.humor_mode);
  const resolved = resolveFollowUpQuestion(question, payload?.history);
  if (resolved.needsClarification) {
    return json(
      {
        success: true,
        data: {
          answer: buildAmbiguousAffirmationResponse(),
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const effectiveQuestion = resolved.effectiveQuestion;

  const smallTalkResponse = buildSmallTalkResponse(effectiveQuestion, { humorMode });
  if (smallTalkResponse) {
    return json(
      {
        success: true,
        data: {
          answer: smallTalkResponse,
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const outOfScopeResponse = buildOutOfScopeResponse(effectiveQuestion);
  if (outOfScopeResponse) {
    return json(
      {
        success: true,
        data: {
          answer: outOfScopeResponse,
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const topK = clampTopK(payload?.top_k);
  if (effectiveQuestion.length < 3) {
    return json({ success: false, error: "Question must be at least 3 characters" }, 400);
  }

  const requestedProfiles = getRequestedProfiles(effectiveQuestion);
  const asksForAllProfiles = isAllProfilesQuery(effectiveQuestion);
  const isContactRequest = isContactQuery(effectiveQuestion);
  const isSensitiveContactRequest = isSensitiveContactQuery(effectiveQuestion);
  const isGenericProfileRequest = isProfileLinksQuery(effectiveQuestion);

  if (
    requestedProfiles.length ||
    asksForAllProfiles ||
    isContactRequest ||
    isSensitiveContactRequest ||
    isGenericProfileRequest
  ) {
    const answer = buildProfileResponse({
      requestedProfiles,
      asksForAllProfiles,
      isContactRequest,
      isSensitiveContactRequest,
      isGenericProfileRequest,
    });

    return json(
      {
        success: true,
        data: {
          answer,
          citations: [
            {
              id: "profile-public-links",
              title: "Public Profiles",
              source_url: PROFILE_LINKS.linkedin,
              chunk_index: 0,
            },
          ],
          retrieved_chunks: 1,
        },
      },
      200,
    );
  }

  const hasConversationHistory = Array.isArray(payload?.history) && payload.history.length > 0;
  const cacheKey = !hasConversationHistory ? buildChatCacheKey(effectiveQuestion, topK, humorMode) : "";
  const cachedData = cacheKey ? await getCachedChatData(env, cacheKey) : null;
  if (cachedData) {
    return json(
      {
        success: true,
        data: cachedData,
      },
      200,
    );
  }

  const ranked = applyCareerBreakSuppression(effectiveQuestion, rankCorpus(effectiveQuestion).slice(0, topK));
  if (!ranked.length) {
    const responseData = {
      answer:
        "I do not have enough evidence in the deployed corpus to answer confidently yet. Try asking about profile links (GitHub/LinkedIn), education and degrees, technologies used, Oracle migration, Java modernization, control planes, or Starbucks platform work.",
      citations: [],
      retrieved_chunks: 0,
    };
    await putCachedChatData(env, cacheKey, responseData);
    return json(
      {
        success: true,
        data: responseData,
      },
      200,
    );
  }

  const answer = buildAnswer(effectiveQuestion, ranked);
  const citations = ranked.map((doc, index) => ({
    id: doc.id,
    title: doc.title,
    source_url: doc.source_url,
    chunk_index: index,
  }));

  const responseData = {
    answer,
    citations,
    retrieved_chunks: ranked.length,
  };
  await putCachedChatData(env, cacheKey, responseData);
  return json(
    {
      success: true,
      data: responseData,
    },
    200,
  );
}

async function handleOpenAiChat(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch (_error) {
    return json({ success: false, error: "Invalid JSON payload" }, 400);
  }

  const question = String(payload?.question || "").trim();
  const humorMode = normalizeHumorMode(payload?.humor_mode);
  const resolved = resolveFollowUpQuestion(question, payload?.history);
  if (resolved.needsClarification) {
    return json(
      {
        success: true,
        data: {
          answer: buildAmbiguousAffirmationResponse(),
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const effectiveQuestion = resolved.effectiveQuestion;

  if (effectiveQuestion.length < 3) {
    return json({ success: false, error: "Question must be at least 3 characters" }, 400);
  }

  const smallTalkResponse = buildSmallTalkResponse(effectiveQuestion, { humorMode });
  if (smallTalkResponse) {
    return json(
      {
        success: true,
        data: {
          answer: smallTalkResponse,
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const outOfScopeResponse = buildOutOfScopeResponse(effectiveQuestion);
  if (outOfScopeResponse) {
    return json(
      {
        success: true,
        data: {
          answer: outOfScopeResponse,
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const apiKey = String(env.OPENAI_API_KEY || env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    return json({ success: false, error: "OPENAI_API_KEY is not configured" }, 500);
  }

  const apiBase = String(env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = String(env.OPENAI_MODEL || "gpt-5.4").trim() || "gpt-5.4";
  const topK = clampTopK(payload?.top_k);

  const requestedProfiles = getRequestedProfiles(effectiveQuestion);
  const asksForAllProfiles = isAllProfilesQuery(effectiveQuestion);
  const isContactRequest = isContactQuery(effectiveQuestion);
  const isSensitiveContactRequest = isSensitiveContactQuery(effectiveQuestion);
  const isGenericProfileRequest = isProfileLinksQuery(effectiveQuestion);
  if (
    requestedProfiles.length ||
    asksForAllProfiles ||
    isContactRequest ||
    isSensitiveContactRequest ||
    isGenericProfileRequest
  ) {
    const answer = buildProfileResponse({
      requestedProfiles,
      asksForAllProfiles,
      isContactRequest,
      isSensitiveContactRequest,
      isGenericProfileRequest,
    });
    return json(
      {
        success: true,
        data: {
          answer,
          citations: [
            {
              id: "profile-public-links",
              title: "Public Profiles",
              source_url: PROFILE_LINKS.linkedin,
              chunk_index: 0,
            },
          ],
          retrieved_chunks: 1,
        },
      },
      200,
    );
  }

  const ranked = applyCareerBreakSuppression(effectiveQuestion, rankCorpus(effectiveQuestion).slice(0, topK));

  if (!ranked.length) {
    return json(
      {
        success: true,
        data: {
          answer:
            "I do not have enough evidence in the deployed corpus to answer confidently yet. Try asking about profile links (GitHub/LinkedIn), education and degrees, technologies used, Oracle migration, Java modernization, control planes, or Starbucks platform work.",
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const citations = ranked.map((doc, index) => ({
    id: doc.id,
    title: doc.title,
    source_url: doc.source_url,
    chunk_index: index,
  }));

  const q = effectiveQuestion.toLowerCase();
  const educationSignals = [
    "education",
    "degree",
    "degrees",
    "academic",
    "purdue",
    "bachelor",
    "school",
    "college",
    "university",
    "alma mater",
    "studied",
  ];
  const technologySignals = [
    "technology",
    "technologies",
    "tech stack",
    "stack",
    "java",
    "c#",
    "csharp",
    "python",
    "scala",
    "kubernetes",
    "terraform",
    "asp.net",
    "wpf",
    "sharepoint",
    "tfs",
  ];
  const internshipSignals = ["internship", "intern", "interns for indiana", "sfi"];

  const isEducationQuery = includesAny(q, educationSignals);
  const isTechnologyQuery = includesAny(q, technologySignals);
  const isInternshipQuery = includesAny(q, internshipSignals);

  // Keep high-precision factual paths deterministic for stability and brevity.
  if (
    isOracleCnsOutcomesQuestion(q) ||
    isEducationQuery ||
    isTechnologyQuery ||
    isTechnologyPassionQuestion(q) ||
    isInternshipQuery ||
    isShortFactualQuestion(q)
  ) {
    return json(
      {
        success: true,
        data: {
          answer: buildAnswer(effectiveQuestion, ranked),
          citations,
          retrieved_chunks: ranked.length,
        },
      },
      200,
    );
  }

  const evidence = ranked
    .map((doc, index) => `[${index + 1}] ${doc.title}\nSource: ${doc.source_url}\nEvidence: ${doc.text}`)
    .join("\n\n");

  let openAiResponse;
  try {
    openAiResponse = await fetch(`${apiBase}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are Ask Rich, a friendly recruiter-facing assistant for Rich Robertson. Never identify yourself as ChatGPT or any other AI. Rich always refers to Rich Robertson, never the Python library. Use only the provided evidence; if insufficient, say so. Do not invent projects, employers, dates, or personal details.\n\nFormat rules (follow exactly):\n1. One short summary sentence (under 20 words).\n2. Up to 3 bullet points. Each bullet is a SHORT noun phrase or verb phrase — NOT a full sentence. Under 10 words each.\n3. End with exactly one conversational follow-up question (under 15 words) that offers to go deeper on a specific aspect. No inline citation markers like [1].",
          },
          {
            role: "user",
            content: `Question:\n${effectiveQuestion}\n\nEvidence (use only this evidence):\n${evidence}`,
          },
        ],
      }),
    });
  } catch (_error) {
    return json({ success: false, error: "OpenAI service unavailable" }, 502);
  }

  const openAiPayload = await openAiResponse.json().catch(() => ({}));
  if (!openAiResponse.ok) {
    const errorMessage =
      openAiPayload?.error?.message || openAiPayload?.error || `OpenAI request failed (${openAiResponse.status})`;
    return json({ success: false, error: String(errorMessage) }, openAiResponse.status);
  }

  const answer = extractOpenAiText(openAiPayload);
  if (!answer) {
    return json({ success: false, error: "OpenAI returned no answer text" }, 502);
  }

  const normalizedAnswer = formatRecruiterAnswer(answer, 800);

  return json(
    {
      success: true,
      data: {
        answer: normalizedAnswer,
        citations,
        retrieved_chunks: ranked.length,
      },
    },
    200,
  );
}

function extractOpenAiText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
      if (part?.type === "text" && typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  const choiceText = payload?.choices?.[0]?.message?.content;
  if (typeof choiceText === "string" && choiceText.trim()) {
    return choiceText.trim();
  }

  return "";
}

function formatRecruiterAnswer(answer, maxChars) {
  let text = String(answer || "").trim();
  if (!text) {
    return "";
  }

  // Remove inline citation markers; citations are rendered separately in UI.
  text = text.replace(/\[\d+\]/g, "");
  text = text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  // If the model returns one dense paragraph, convert to summary + bullets.
  if (lines.length === 1) {
    const sentences = lines[0].split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 2) {
      const summary = sentences[0];
      // Last sentence is likely the follow-up question if it ends with ?
      const rest = sentences.slice(1);
      const followUp = rest.at(-1)?.endsWith("?") ? rest.at(-1) : null;
      const bulletSentences = followUp ? rest.slice(0, -1) : rest;
      const bullets = bulletSentences
        .slice(0, 3)
        .map((s) => `- ${s.replace(/^[-*]\s*/, "")}`);
      text = [summary, ...bullets, ...(followUp ? [followUp] : [])].join("\n");
    }
  }

  // Trim any bullet lines that are still very long (>100 chars) to keep things punchy.
  const formattedLines = text.split("\n").map((line) => {
    if (line.startsWith("- ") && line.length > 100) {
      // Truncate to nearest word boundary before 100 chars.
      return `${line.slice(0, 97).replace(/\s+\S*$/, "")}...`;
    }
    return line;
  });
  text = formattedLines.join("\n");

  return clipPreserveFormatting(text, maxChars);
}

function clipPreserveFormatting(text, maxLen) {
  const value = String(text || "").trim();
  if (value.length <= maxLen) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function clampTopK(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return 5;
  }
  return Math.min(20, Math.max(1, parsed));
}

const QUERY_EXPANSION_RULES = [
  { signal: "k8s", expansions: ["kubernetes"] },
  { signal: "platform", expansions: ["control plane", "infrastructure"] },
  { signal: "oci", expansions: ["oracle cloud", "oracle cloud infrastructure"] },
  { signal: "rif", expansions: ["reduction in force", "layoff", "career transition"] },
  { signal: "career gap", expansions: ["work gap", "career break"] },
  { signal: "github", expansions: ["repository", "repositories", "projects"] },
  { signal: "linkedin", expansions: ["profile", "professional profile"] },
];

function expandQueryTokens(question) {
  const normalized = normalizeIntentText(question);
  const expanded = tokenize(normalized);

  for (const rule of QUERY_EXPANSION_RULES) {
    if (!normalized.includes(rule.signal)) {
      continue;
    }
    for (const expansion of rule.expansions) {
      const expansionTokens = tokenize(expansion);
      for (const token of expansionTokens) {
        expanded.add(token);
      }
    }
  }

  return expanded;
}

function classifyQuestionIntent(questionLower) {
  if (isBehavioralQuestion(questionLower)) {
    return "behavioral";
  }

  if (isProfileLinksQuery(questionLower) || isContactQuery(questionLower)) {
    return "profiles";
  }

  if (isCareerBreakQuestion(questionLower)) {
    return "career_transition";
  }

  const educationSignals = ["education", "degree", "purdue", "university", "school", "college"];
  if (includesAny(questionLower, educationSignals)) {
    return "education";
  }

  const cloudSignals = ["cloud", "platform", "control plane", "oci", "kubernetes", "terraform"];
  if (includesAny(questionLower, cloudSignals)) {
    return "cloud_platform";
  }

  const technologySignals = ["technology", "tech", "java", "python", "c#", "scala", "stack"];
  if (includesAny(questionLower, technologySignals)) {
    return "technology";
  }

  const projectSignals = ["project", "oracle", "starbucks", "migration", "modernization", "outcome"];
  if (includesAny(questionLower, projectSignals)) {
    return "projects";
  }

  return "general";
}

function getIntentDocBoost(intent, doc) {
  const id = String(doc?.id || "");
  if (!id) {
    return 0;
  }

  if (intent === "profiles" && id.startsWith("profile-")) {
    return 3;
  }
  if (intent === "education" && (id.includes("education") || id.includes("academic"))) {
    return 3;
  }
  if (intent === "technology" && (id.includes("technologies") || id.includes("skills"))) {
    return 2;
  }
  if (intent === "cloud_platform" && (id.includes("control-plane") || id.includes("cloud") || id.includes("oracle"))) {
    return 2;
  }
  if (intent === "projects" && id.startsWith("project-")) {
    return 2;
  }
  if (intent === "career_transition" && id.includes("career-transition")) {
    return 4;
  }
  return 0;
}

function computePhraseOverlapScore(questionLower, docText) {
  const questionTerms = String(questionLower || "").split(/\s+/).filter(Boolean);
  if (questionTerms.length < 2) {
    return 0;
  }

  const docLower = String(docText || "").toLowerCase();
  let overlap = 0;
  for (let i = 0; i < questionTerms.length - 1; i += 1) {
    const bigram = `${questionTerms[i]} ${questionTerms[i + 1]}`;
    if (bigram.length >= 5 && docLower.includes(bigram)) {
      overlap += 1;
    }
  }
  return overlap;
}

function rerankTopDocs(questionLower, docs, topWindow = 8) {
  if (!Array.isArray(docs) || docs.length <= 1) {
    return Array.isArray(docs) ? docs : [];
  }

  const windowSize = Math.min(Math.max(2, topWindow), docs.length);
  const head = docs.slice(0, windowSize).map((doc) => {
    const phraseBoost = computePhraseOverlapScore(questionLower, `${doc.title} ${doc.text}`);
    return {
      ...doc,
      score: doc.score + phraseBoost,
    };
  });

  head.sort((a, b) => b.score - a.score);
  return [...head, ...docs.slice(windowSize)];
}

function rankCorpus(question) {
  const questionLower = normalizeIntentText(question);
  const baseTokens = tokenize(questionLower);
  const expandedTokens = expandQueryTokens(questionLower);
  const intent = classifyQuestionIntent(questionLower);

  const ranked = CORPUS.map((doc) => {
    const textTokens = tokenize(`${doc.title} ${doc.text}`);
    let lexicalScore = 0;

    for (const token of expandedTokens) {
      if (textTokens.has(token)) {
        lexicalScore += baseTokens.has(token) ? 2 : 1;
      }
    }

    const intentBoost = getIntentDocBoost(intent, doc);
    const phraseBoost = computePhraseOverlapScore(questionLower, `${doc.title} ${doc.text}`);
    const score = lexicalScore + intentBoost + phraseBoost;
    return { ...doc, score };
  })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score);

  return rerankTopDocs(questionLower, ranked, 8);
}

function tokenize(text) {
  const matches = String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  return new Set(matches || []);
}

function buildSmallTalkResponse(question, options = {}) {
  const q = normalizeIntentText(question);
  const humorMode = normalizeHumorMode(options?.humorMode);
  if (!q) {
    return null;
  }

  if (isJokeQuery(q)) {
    if (humorMode === "clean_professional") {
      return [
        "Absolutely. Here is one senior cloud engineer joke and one dad joke:",
        "- Senior cloud engineer joke: I said our Kubernetes cluster was self-healing, so finance asked if it could also fix the AWS bill.",
        "- Dad joke: I would tell you a UDP joke, but you might not get it.",
        "Want another one?",
      ].join("\n");
    }

    return [
      "Sure. Here is one cloud engineer joke and one dad joke:",
      "- Cloud engineer joke: We finally hit five nines, then someone changed one Terraform variable.",
      "- Dad joke: Why do programmers prefer dark mode? Because light attracts bugs.",
      "Want another one?",
    ].join("\n");
  }

  if (isGreetingQuery(q)) {
    if (humorMode === "clean_professional") {
      return "Hello. I can help with Rich's experience, project outcomes, technology depth, and profile links.";
    }
    return "Hi there 👋 Great to chat with you. Ask me about Rich's experience, projects, technology stack, or public profile links any time.";
  }

  if (isHowAreYouQuery(q)) {
    if (humorMode === "clean_professional") {
      return "Doing well and ready to help. I can provide a concise role-fit summary or project-specific details.";
    }
    return "I'm doing well and ready to help. If you want, I can share a quick summary of Rich's background or dive into a specific project.";
  }

  if (isThanksQuery(q)) {
    if (humorMode === "clean_professional") {
      return "You're welcome. If useful, I can follow up with Oracle outcomes, platform engineering depth, or leadership examples.";
    }
    return "You're welcome — happy to help. If you'd like, ask a follow-up about Oracle migration, platform engineering, or leadership examples.";
  }

  if (isWhoAreYouQuery(q)) {
    return "I'm Ask Rich, a chat assistant focused on Rich Robertson's background, experience, and project outcomes.";
  }

  return null;
}

function buildAmbiguousAffirmationResponse() {
  return [
    "Happy to continue.",
    "I need a little more direction to resolve 'yes'.",
    "Pick one and I will answer quickly:",
    "- API-related experience",
    "- Oracle migration outcomes",
    "- leadership examples",
  ].join("\n");
}

function resolveFollowUpQuestion(question, history) {
  const current = String(question || "").trim();
  const normalizedCurrent = normalizeIntentText(current);
  if (!isAffirmationQuery(normalizedCurrent)) {
    return { effectiveQuestion: current, needsClarification: false };
  }

  const normalizedHistory = normalizeConversationHistory(history);
  
  // Check for pending intent (e.g., "want me to X?" or "want another one?")
  const pendingIntent = extractAssistantPendingIntent(normalizedHistory);
  if (pendingIntent) {
    return { effectiveQuestion: pendingIntent, needsClarification: false };
  }

  // Check if assistant asked "want another X?" pattern - if so, repeat prior question
  const assistantAskedForAnother = doesAssistantAskForAnother(normalizedHistory);
  if (assistantAskedForAnother) {
    const fallbackUserQuestion = extractPriorUserQuestion(normalizedHistory);
    if (fallbackUserQuestion) {
      return { effectiveQuestion: fallbackUserQuestion, needsClarification: false };
    }
  }

  const fallbackUserQuestion = extractPriorUserQuestion(normalizedHistory);
  if (fallbackUserQuestion) {
    return { effectiveQuestion: fallbackUserQuestion, needsClarification: false };
  }

  return { effectiveQuestion: current, needsClarification: true };
}

function isAffirmationQuery(normalizedQuestion) {
  return AFFIRMATION_SIGNALS.has(String(normalizedQuestion || ""));
}

function normalizeConversationHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const recentHistory = history.slice(-MAX_NORMALIZED_HISTORY_TURNS);
  const normalizedNewestFirst = [];
  let totalChars = 0;

  for (let i = recentHistory.length - 1; i >= 0; i -= 1) {
    const entry = recentHistory[i];
    const role = String(entry?.role || "").toLowerCase();
    const content = String(entry?.content || entry?.text || "").trim();
    if ((role !== "assistant" && role !== "user") || content.length === 0) {
      continue;
    }

    if (totalChars + content.length > MAX_NORMALIZED_HISTORY_CHARS) {
      continue;
    }

    totalChars += content.length;
    normalizedNewestFirst.push({ role, content });
  }

  return normalizedNewestFirst.reverse();
}

function applyCareerBreakSuppression(question, docs) {
  const allowCareerBreakDoc = isCareerBreakQuestion(question);
  return (Array.isArray(docs) ? docs : []).filter(
    (doc) => allowCareerBreakDoc || !SUPPRESSED_UNLESS_ASKED_IDS.has(doc.id),
  );
}

function isCareerBreakQuestion(question) {
  const normalized = normalizeIntentText(question);
  if (!normalized) {
    return false;
  }

  return CAREER_BREAK_QUERY_SIGNALS.some((signal) => normalized.includes(signal));
}

function extractIntentFromAssistantQuestionLine(questionLine) {
  const text = String(questionLine || "").trim();
  if (!text) {
    return "";
  }

  const lower = text.toLowerCase();
  
  // Handle "Want another one?" or "Want another X?" - extract from prior question
  if (lower.includes("want another")) {
    return ""; // Return empty to signal caller should use prior question
  }
  
  const prefixes = ["want me to ", "would you like me to ", "want to "];
  for (const prefix of prefixes) {
    const start = lower.indexOf(prefix);
    if (start < 0) {
      continue;
    }

    const remainder = text.slice(start + prefix.length);
    const questionMarkIndex = remainder.indexOf("?");
    const intent = (questionMarkIndex >= 0 ? remainder.slice(0, questionMarkIndex) : remainder).trim();
    if (intent) {
      return intent;
    }
  }

  return "";
}

/**
 * Check if the most recent assistant message asks "want another" or similar
 * This is a signal that a yes/no affirmation should repeat the prior question
 */
function doesAssistantAskForAnother(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== "assistant") {
      continue;
    }

    const lower = String(item.content || "").toLowerCase();
    return lower.includes("want another") || 
           lower.includes("another one") ||
           lower.includes("want more");
  }
  return false;
}

function extractAssistantPendingIntent(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== "assistant") {
      continue;
    }

    const questionLine = extractLastQuestionLine(item.content);
    if (!questionLine) {
      continue;
    }

    const intent = extractIntentFromAssistantQuestionLine(questionLine);
    if (intent) {
      return intent;
    }
  }

  return "";
}

function extractPriorUserQuestion(history) {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== "user") {
      continue;
    }

    const normalized = normalizeIntentText(item.content);
    if (!normalized || isAffirmationQuery(normalized)) {
      continue;
    }

    return item.content;
  }

  return "";
}

function extractLastQuestionLine(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].endsWith("?")) {
      return lines[i];
    }
  }

  return "";
}

function buildOutOfScopeResponse(question) {
  const q = normalizeIntentText(question);
  if (!q) {
    return null;
  }

  const isOutOfScopePersonal = OUT_OF_SCOPE_PERSONAL_SIGNALS.some((signal) => q.includes(signal));
  if (!isOutOfScopePersonal) {
    return null;
  }

  return [
    "I do not have evidence for personal-preference questions like that.",
    "I can help with role-relevant details about Rich instead:",
    "- leadership and delivery outcomes",
    "- architecture and technology depth",
    "- project impact and interview examples",
    "Which area should I focus on?",
  ].join("\n");
}

function normalizeIntentText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGreetingQuery(questionLower) {
  return GREETING_SIGNALS.has(questionLower);
}

function isHowAreYouQuery(questionLower) {
  return HOW_ARE_YOU_SIGNALS.has(questionLower);
}

function isThanksQuery(questionLower) {
  return THANKS_SIGNALS.has(questionLower);
}

function isWhoAreYouQuery(questionLower) {
  return WHO_ARE_YOU_SIGNALS.has(questionLower);
}

function normalizeHumorMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "standard" || raw === "casual") {
    return "standard";
  }
  return "clean_professional";
}

function isJokeQuery(questionLower) {
  return JOKE_SIGNALS.some((signal) => questionLower.includes(signal));
}

function isProfileLinksQuery(question) {
  const q = String(question || "").toLowerCase();
  const platformSignals = [
    "github",
    "linkedin",
  ];
  const linkSignals = [
    "link",
    "links",
    "url",
    "urls",
  ];
  const profileLinkPhrases = [
    "profile link",
    "profile links",
    "public profile",
    "public profiles",
    "social profile",
    "social profiles",
    "social links",
    "portfolio links",
  ];

  const hasPlatformMention = platformSignals.some((signal) => q.includes(signal));
  const hasLinkIntent = linkSignals.some((signal) => q.includes(signal));
  const hasProfileLinkPhrase = profileLinkPhrases.some((signal) => q.includes(signal));

  return hasPlatformMention || hasProfileLinkPhrase || hasLinkIntent;
}

function isAllProfilesQuery(question) {
  const q = String(question || "").toLowerCase();
  const allSignals = [
    "all profiles",
    "all profile links",
    "all social",
    "social profiles",
    "public profiles",
    "profile links",
    "all links",
    "portfolio links",
  ];
  return allSignals.some((signal) => q.includes(signal));
}

function isContactQuery(question) {
  const q = String(question || "").toLowerCase();
  const contactSignals = [
    "contact",
    "reach",
    "reach out",
    "best way to connect",
    "best way to contact",
    "how can i connect",
    "how do i connect",
    "get in touch",
    "primary contact",
  ];
  return contactSignals.some((signal) => q.includes(signal));
}

function isSensitiveContactQuery(question) {
  const q = String(question || "").toLowerCase();
  const piiSignals = [
    "phone",
    "phone number",
    "mobile",
    "cell",
    "text",
    "email",
    "e-mail",
    "mail address",
    "gmail",
    "outlook",
    "personal contact",
    "home address",
    "address",
    "pii",
    "private",
    "personal info",
  ];
  const requestSignals = [
    "share",
    "give",
    "provide",
    "what is",
    "what's",
    "can i have",
    "send",
    "contact",
    "reach",
    "get",
  ];

  const hasPiiSignal = piiSignals.some((signal) => q.includes(signal));
  if (!hasPiiSignal) {
    return false;
  }

  return requestSignals.some((signal) => q.includes(signal));
}

function getRequestedProfiles(question) {
  const q = String(question || "").toLowerCase();
  const requested = [];

  if (q.includes("linkedin")) {
    requested.push("linkedin");
  }
  if (q.includes("github") || q.includes("git hub")) {
    requested.push("github");
  }
  return requested;
}

function toProfileLabel(profile) {
  if (profile === "linkedin") return "LinkedIn";
  if (profile === "github") return "GitHub";
  return profile;
}

function formatProfileLines(profiles) {
  return profiles.map((profile) => `- ${toProfileLabel(profile)}: ${PROFILE_LINKS[profile]}`);
}

function buildProfileResponse({
  requestedProfiles,
  asksForAllProfiles,
  isContactRequest,
  isSensitiveContactRequest,
  isGenericProfileRequest,
}) {
  if (isSensitiveContactRequest) {
    return [
      "I do not share private contact details in this chat.",
      "The best way to reach Rich is LinkedIn:",
      `- LinkedIn: ${PROFILE_LINKS.linkedin}`,
      "If you send a brief note there with role details and your preferred follow-up channel, he can respond appropriately.",
    ].join("\n");
  }

  if (asksForAllProfiles) {
    return ["Here are Rich's public profile links:", ...formatProfileLines(PROFILE_PLATFORM_ORDER)].join("\n");
  }

  if (requestedProfiles.length) {
    const requestedUnique = PROFILE_PLATFORM_ORDER.filter((profile) => requestedProfiles.includes(profile));
    const firstRequested = requestedUnique[0];
    const heading = requestedUnique.length === 1
      ? `Here is Rich's ${toProfileLabel(firstRequested)} profile:`
      : "Here are the requested profile links:";
    return [heading, ...formatProfileLines(requestedUnique)].join("\n");
  }

  if (isContactRequest) {
    return [
      "LinkedIn is Rich's primary contact point:",
      `- LinkedIn: ${PROFILE_LINKS.linkedin}`,
      "If you want Rich's GitHub profile as well, just ask.",
    ].join("\n");
  }

  if (isGenericProfileRequest) {
    return [
      "I can share specific profile links. LinkedIn is the primary contact point:",
      `- LinkedIn: ${PROFILE_LINKS.linkedin}`,
      "If you want Rich's GitHub profile as well, just ask.",
    ].join("\n");
  }

  return ["Here is Rich's LinkedIn profile:", `- LinkedIn: ${PROFILE_LINKS.linkedin}`].join("\n");
}

/**
 * Utility: Check if text includes any of the signal phrases.
 * Used throughout intent detection to keep signal lists DRY.
 *
 * @param {string} text - Text to search (typically lowercased question)
 * @param {string[]} signals - List of phrases to match
 * @returns {boolean} - True if any signal is found
 */
function includesAny(text, signals) {
  return signals.some((signal) => text.includes(signal));
}

/**
 * Intent detection: Oracle CNS outcomes question.
 *
 * Returns true if the user is asking about measurable results/outcomes from the
 * Oracle Customer Notification Service migration project.
 *
 * This detection enables a dedicated answer path that returns specific metrics
 * (timeline, scalability, operational readiness) without unrelated content.
 * See: docs/testing/CANNED_RESPONSES.md for test coverage.
 *
 * @param {string} questionLower - Lowercased question text
 * @returns {boolean} - True if question is about Oracle CNS outcomes
 */
function isOracleCnsOutcomesQuestion(questionLower) {
  const oracleSignals = [
    "oracle",
    "cns",
    "customer notification service",
    "notification service",
  ];
  const outcomeSignals = [
    "outcome",
    "outcomes",
    "result",
    "results",
    "impact",
    "measurable",
    "metric",
    "metrics",
    "deliver",
    "delivered",
    "achieve",
    "achieved",
    "perform",
    "performance",
    "help",
    "improve",
    "improved",
  ];

  return includesAny(questionLower, oracleSignals) && includesAny(questionLower, outcomeSignals);
}

/**
 * Intent detection: Technology passion question.
 *
 * Returns true if the user is asking about technology expertise, passion, or
 * technology stack in general terms (not specific to a project or problem).
 *
 * This detection enables a dedicated answer path to highlight technology expertise
 * without accidentally returning profile links or other unrelated content.
 *
 * Examples:
 *   - "tell me about technologies"
 *   - "what is your passion for technology"
 *   - "describe your tech expertise"
 *   - "technologies and tools you use"
 *
 * @param {string} questionLower - Lowercased question text
 * @returns {boolean} - True if question is about technology passion/expertise
 */
function isTechnologyPassionQuestion(questionLower) {
  const technologySignals = [
    "technology",
    "technologies",
    "tech",
    "tech stack",
    "tech expertise",
    "passion",
    "tools",
    "stack",
  ];
  const passionSignals = [
    "tell me about",
    "describe",
    "what is",
    "expertise",
    "passion",
    "experience with",
    "how do you",
    "do you use",
    "use",
  ];

  // Exclude specific project/problem questions (these want project-focused answers)
  const projectSignals = [
    "in the oracle",
    "in the starbucks",
    "during the",
    "for the",
    " at ",
  ];

  const hasProjectContext = projectSignals.some((signal) => questionLower.includes(signal));
  if (hasProjectContext) {
    return false;
  }

  const hasTechSignal = includesAny(questionLower, technologySignals);
  const hasPassionSignal = includesAny(questionLower, passionSignals);

  return hasTechSignal && hasPassionSignal;
}

/**
 * Intent detection: short factual question.
 *
 * These questions should return a direct summary answer only and avoid
 * retrieval bullets that can introduce unrelated context.
 *
 * Examples:
 *   - "where did you go to school?"
 *   - "what is your educational background"
 *   - "what is your tech stack"
 *
 * @param {string} questionLower - Lowercased question text
 * @returns {boolean} - True when question is likely short factual intent
 */
function isShortFactualQuestion(questionLower) {
  const normalized = String(questionLower || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }

  const shortPrefixes = [
    "what",
    "where",
    "when",
    "which",
    "who",
    "did",
    "does",
    "was",
    "were",
    "has",
    "have",
  ];

  const firstToken = normalized.split(" ")[0];
  if (!shortPrefixes.includes(firstToken)) {
    return false;
  }

  const disqualifyingSignals = [
    "tell me about",
    "describe",
    "why",
    "how",
    "example",
    "a time",
    "challenge",
    "outcome",
    "outcomes",
    "result",
    "results",
    "impact",
  ];
  if (includesAny(normalized, disqualifyingSignals)) {
    return false;
  }

  const tokenCount = normalized.split(" ").filter(Boolean).length;
  return tokenCount <= 12;
}

/**
 * Primary answer builder for local chat mode.
 *
 * Routes questions based on detected intent:
 * 1. Behavioral questions → STAR-formatted answers
 * 2. Oracle CNS outcomes → Focused metrics response
 * 3. Education queries → Degree/university info
 * 4. Technology queries → Tech stack overview
 * 5. Cloud/platform queries → Control-plane and OCI expertise
 * 6. Generic fallback → Summary + top 2 retrieved bullets
 *
 * TESTING & VALIDATION:
 *   - scripts/test_canned_responses.py: Test spec validation (7 categories, 11 test cases)
 *   - scripts/test_canned_responses_integration.py: Live worker response validation
 *   - apps/api/worker/src/index.test.js: JavaScript unit tests (40+ assertions)
 *   - docs/testing/CANNED_RESPONSES.md: Full testing guide with examples
 *
 * Quality metrics enforced by tests:
 *   - Oracle CNS outcomes: Returns $2M timeline, scalability, operational readiness (no profile links)
 *   - Profile queries: Return only profile info (no project details)
 *   - Education: Return Purdue degree (no unrelated content)
 *   - Sensitive contact: Refuse PII, redirect to LinkedIn
 *   - All answers: Stay under 600-800 characters
 *
 * @param {string} question - User's question
 * @param {object[]} rankedDocs - Retrieved docs ranked by relevance (CORPUS)
 * @returns {string} - Formatted answer text
 */
function buildAnswer(question, rankedDocs) {
  const q = String(question || "").toLowerCase();
  if (isBehavioralQuestion(q)) {
    return buildBehavioralAnswer(q, rankedDocs);
  }

  // Special-case Oracle CNS outcomes: return focused metrics, never generic intro text.
  // This prevents "What outcomes from Oracle?" from drifting into profile links or noise.
  if (isOracleCnsOutcomesQuestion(q)) {
    return [
      "For the Oracle CNS migration, the key measurable outcomes were:",
      "- Supported a $2M enterprise deal timeline while the service moved to OCI-native architecture.",
      "- Improved scalability by modernizing the service onto OCI-native patterns.",
      "- Improved operational readiness through a safer migration and rollout approach.",
    ].join("\n");
  }

  // Special-case technology passion questions: return focused tech summary, never profile links.
  // This prevents "Tell me about technologies" from being misclassified as a profile query.
  if (isTechnologyPassionQuestion(q)) {
    return [
      "Rich has broad technology expertise across modern cloud platforms and distributed systems:",
      "- Cloud & orchestration: Kubernetes, Terraform, OCI migration architecture, control-plane patterns",
      "- Distributed systems: Microservices, asynchronous messaging, eventual consistency patterns",
      "- backend platforms: Java, C#, Python, Scala across ASP.NET, SharePoint, enterprise middleware",
      "- Data & analytics: Stream processing, event sourcing, distributed tracing",
      "Rich's strength is translating platform technology into reliable business outcomes.",
    ].join("\n");
  }

  const profileSignals = [
    "github",
    "linkedin",
    "profile",
    "profiles",
    "social",
    "links",
    "url",
    "urls",
  ];
  const educationSignals = [
    "education",
    "degree",
    "degrees",
    "academic",
    "purdue",
    "bachelor",
    "school",
    "college",
    "university",
    "alma mater",
    "studied",
  ];
  const technologySignals = [
    "technology",
    "technologies",
    "tech stack",
    "stack",
    "java",
    "c#",
    "csharp",
    "python",
    "scala",
    "kubernetes",
    "terraform",
    "asp.net",
    "wpf",
    "sharepoint",
    "tfs",
  ];
  const cloudPlatformSignals = ["cloud", "platform", "control plane", "control-plane", "oci"];
  const internshipSignals = ["internship", "intern", "interns for indiana", "sfi"];

  // CRITICAL: Classify intent based on USER'S QUESTION, not retrieved document text.
  // This prevents misrouting. Example: if a doc happens to mention "LinkedIn" in passing,
  // we don't want to return a profile-links answer to a question about "What projects?"
  // See: docs/testing/CANNED_RESPONSES.md - "Answer Appropriateness" section.
  const isProfileQuery = includesAny(q, profileSignals);
  const includesLinkedIn = q.includes("linkedin");
  const includesGitHub = q.includes("github");
  const isEducationQuery = includesAny(q, educationSignals);
  const isTechnologyQuery = includesAny(q, technologySignals);
  const isCloudPlatformQuery = includesAny(q, cloudPlatformSignals);
  const isInternshipQuery = includesAny(q, internshipSignals);
  const isShortFactual = isShortFactualQuestion(q);

  let summary = "Rich's strongest evidence points to distributed systems, cloud modernization, and reliable backend platform delivery.";
  if (isProfileQuery) {
    const profileDetails = [];
    if (includesLinkedIn) {
      profileDetails.push(`LinkedIn ${PROFILE_LINKS.linkedin} (primary contact point)`);
    }
    if (includesGitHub) {
      profileDetails.push(`GitHub ${PROFILE_LINKS.github}`);
    }

    const details = profileDetails.length
      ? profileDetails.join(", ")
      : `LinkedIn ${PROFILE_LINKS.linkedin} (primary contact point)`;
    summary = `Rich's public profile links include ${details}.`;
  } else if (isEducationQuery) {
    summary = "Rich completed two Purdue University bachelor's degrees in 2007, spanning both management and computer/information technology.";
  } else if (isTechnologyQuery) {
    summary = "Rich has used a broad technology stack across modern cloud/distributed platforms and earlier Microsoft enterprise technologies.";
  } else if (isCloudPlatformQuery) {
    summary = "Rich is highly relevant for cloud platform and control-plane roles, with OCI migration leadership, Kubernetes platform operations, and reusable multitenant control-plane architecture experience.";
  } else if (isInternshipQuery) {
    summary = "Yes. Rich completed an internship with SFI through the Interns for Indiana program.";
  }

  // Short factual prompts should return only the direct summary answer.
  // This avoids unrelated retrieval spillover for simple questions.
  if (isShortFactual) {
    return summary;
  }

  // Fallback: return summary + top 2 bullets, each clipped to 180 characters.
  // Reduced from 3 bullets (200 chars) to 2 bullets (180 chars) to avoid excessive noise
  // when question intent is ambiguous. See test validation in:
  //   - apps/api/worker/src/index.test.js (buildAnswer quality constraints)
  //   - docs/testing/CANNED_RESPONSES.md (answer quality section)
  const bullets = rankedDocs.slice(0, 2).map((doc) => `- ${clipSentence(doc.text, 180)}`);
  return [summary, ...bullets].join("\n");
}

function isBehavioralQuestion(questionLower) {
  const explicitStoryPrompts = [
    "tell me about a time",
    "give me an example",
    "example of a time",
    "time when",
    "describe a time",
    "walk me through a time",
  ];
  if (explicitStoryPrompts.some((signal) => questionLower.includes(signal))) {
    return true;
  }

  const behavioralTopics = [
    "convince",
    "persuade",
    "influence",
    "disagree",
    "conflict",
    "challenge",
    "failure",
    "mistake",
    "leadership",
    "stakeholder",
  ];

  const storyIntentSignals = [
    " a time ",
    " example ",
    " when you ",
    " had to ",
    " situation ",
    " instance ",
    " how did you ",
    " have you ever ",
  ];

  const hasBehavioralTopic = behavioralTopics.some((signal) => questionLower.includes(signal));
  const hasStoryIntent = storyIntentSignals.some((signal) => questionLower.includes(signal));
  return hasBehavioralTopic && hasStoryIntent;
}

function wantsConciseBehavioralAnswer(questionLower) {
  const conciseSignals = [
    "brief",
    "concise",
    "short",
    "quick",
    "30 second",
    "60 second",
    "one minute",
    "1 minute",
  ];
  return conciseSignals.some((signal) => questionLower.includes(signal));
}

function wantsDetailedBehavioralAnswer(questionLower) {
  const detailedSignals = [
    "detailed",
    "in detail",
    "deep dive",
    "full answer",
    "long version",
    "elaborate",
  ];
  return detailedSignals.some((signal) => questionLower.includes(signal));
}

function formatStarAnswer({ situation, task, action, result, reflection, includeReflection, chatMode }) {
  if (chatMode) {
    const stLine = `${String(situation || "").trim()} ${String(task || "").trim()}`.replace(/\s+/g, " ").trim();
    const lines = [`S/T: ${stLine}`, `A: ${action}`, `R: ${result}`];
    if (includeReflection && reflection) {
      lines.push(`Why it worked: ${reflection}`);
    }
    return lines.join("\n");
  }

  const lines = [
    `Situation: ${situation}`,
    `Task: ${task}`,
    `Action: ${action}`,
    `Result: ${result}`,
  ];

  if (includeReflection && reflection) {
    lines.push(`Reflection: ${reflection}`);
  }

  return lines.join("\n");
}

function buildBehavioralAnswer(questionLower, rankedDocs) {
  const docIds = new Set(rankedDocs.map((doc) => doc.id));
  const concise = wantsConciseBehavioralAnswer(questionLower);
  const detailed = wantsDetailedBehavioralAnswer(questionLower);
  const chatMode = !detailed;
  const persuasionPrompt = ["convince", "persuade", "influence", "stakeholder"].some((signal) =>
    questionLower.includes(signal),
  );
  const adversityPrompt = [
    "adversity",
    "setback",
    "challenge",
    "hardship",
    "difficult",
    "tough",
    "resilience",
    "overcame",
    "overcome",
    "failure",
  ].some((signal) => questionLower.includes(signal));

  if (persuasionPrompt && docIds.has("project-oracle-cns")) {
    return formatStarAnswer({
      situation:
        "At Oracle, the Customer Notification Service had to move to an OCI-native architecture while supporting a $2M enterprise deal timeline.",
      task:
        "I needed cross-functional alignment on a migration approach that improved reliability without risking delivery commitments.",
      action:
        "I proposed a phased plan with rollout checkpoints, reliability safeguards, and clear communication of tradeoffs.",
      result:
        "We completed the migration with stronger scalability and operational readiness while staying aligned to the timeline.",
      reflection:
        "I get the best alignment when I pair technical decisions with concrete risk controls and business impact.",
      includeReflection: !concise && detailed,
      chatMode,
    });
  }

  if (persuasionPrompt && docIds.has("project-java17")) {
    return formatStarAnswer({
      situation:
        "I led a Java 8 to Java 17 modernization with rollout across 32 global data centers under a tight timeline.",
      task:
        "I had to align teams on a migration strategy that balanced delivery speed with production safety.",
      action:
        "I set staged rollout gates, architecture-specific validation, and reliability checks before each expansion step.",
      result:
        "We completed the rollout in under three months with controlled delivery and operational stability.",
      reflection:
        "Urgency is most persuasive when the safety model and checkpoints are explicit from day one.",
      includeReflection: !concise && detailed,
      chatMode,
    });
  }

  if (adversityPrompt && docIds.has("profile-career-transition-rif")) {
    const action = docIds.has("projects-post-oracle-github")
      ? "I treated that period like a structured rebuild, balancing family priorities while maintaining technical momentum through shipped projects, infrastructure work, and published writing."
      : "I balanced family priorities while maintaining technical momentum through disciplined daily execution, project work, and continued learning.";

    return formatStarAnswer({
      situation: "My Oracle role was eliminated in November 2024 as part of a broader reduction in force.",
      task:
        "I needed to navigate a personal and professional transition without losing momentum or clarity on my long-term direction.",
      action,
      result:
        "I stayed productive, expanded my portfolio with visible work, and came out of the transition with stronger focus and readiness for impact.",
      reflection:
        "In adversity, I focus on controllables, execute consistently, and turn uncertainty into forward progress.",
      includeReflection: !concise && detailed,
      chatMode,
    });
  }

  const primary = rankedDocs[0];
  const primaryText = primary ? toFirstPerson(clipSentence(primary.text, 180)) : "I do not have enough evidence to provide a strong example yet.";
  const genericAction = adversityPrompt
    ? "I created a concrete plan, kept communication clear, and executed in small, reliable increments to maintain momentum."
    : "I aligned stakeholders on a clear plan, defined execution checkpoints, and reduced delivery risk through staged rollout steps.";
  const genericResult = adversityPrompt
    ? "The approach turned a difficult situation into measurable progress and improved confidence for next steps."
    : "The work improved delivery confidence, execution reliability, and stakeholder alignment.";

  return formatStarAnswer({
    situation: primaryText,
    task: "I needed to align people around a clear path to delivery while managing risk.",
    action: genericAction,
    result: genericResult,
    reflection: "I am most effective when I combine clear communication, staged execution, and ownership of outcomes.",
    includeReflection: !concise && detailed,
    chatMode,
  });
}

function clipSentence(text, maxLen) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function toFirstPerson(text) {
  let result = String(text || "")
    .replace(/Rich's/gi, "my")
    .replace(/\bRich\b/gi, "I");

  // Fix common agreement issues introduced by third-person to first-person replacement.
  result = result
    .replace(/\bI holds\b/gi, "I hold")
    .replace(/\bI has\b/gi, "I have")
    .replace(/\bI is\b/gi, "I am")
    .replace(/\bI focuses\b/gi, "I focus")
    .replace(/\bI leds\b/gi, "I lead");

  return result;
}

/**
 * Normalize upstream chat path configuration.
 *
 * Ensures a usable path by trimming whitespace, defaulting to `/api/chat`,
 * and enforcing a leading slash.
 */
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

/**
 * Create a JSON response with UTF-8 content type.
 */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

/**
 * Validate request origin against configured allowlist.
 *
 * If no Origin header is present, request is allowed. If an Origin header is
 * present and allowlist is empty, request is denied.
 */
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

/**
 * Parse comma-separated origins into a Set for fast lookup.
 */
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

/**
 * Apply CORS headers to a response based on request origin and allowlist.
 */
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

// Export functions for testing
export {
  generateEventId,
  getClientId,
  checkRateLimit,
  recordQuestionEvent,
  recordAnswerEvent,
  CORPUS,
  buildAnswer,
  buildBehavioralAnswer,
  buildProfileResponse,
  buildOutOfScopeResponse,
  resolveFollowUpQuestion,
  isBehavioralQuestion,
  isOracleCnsOutcomesQuestion,
  isTechnologyPassionQuestion,
  isShortFactualQuestion,
  isProfileLinksQuery,
  isContactQuery,
  isSensitiveContactQuery,
  isAllProfilesQuery,
  buildSmallTalkResponse,
  isGreetingQuery,
  isHowAreYouQuery,
  isThanksQuery,
  isWhoAreYouQuery,
  rankCorpus,
  clipSentence,
  formatStarAnswer,
};
