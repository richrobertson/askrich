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

      return withCors(await handleLocalChat(request), request, env);
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
    id: "profile-public-links",
    title: "Public Profiles",
    source_url: "https://www.linkedin.com/in/royrobertson",
    text: "Public profile links: GitHub https://github.com/richrobertson, LinkedIn https://www.linkedin.com/in/royrobertson, and Facebook https://www.facebook.com/rich.r.robertson/. These can be shared when recruiters ask for social profiles, portfolio links, or professional profile URLs.",
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
  facebook: "https://www.facebook.com/rich.r.robertson/",
};

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

  if (isProfileLinksQuery(question)) {
    return json(
      {
        success: true,
        data: {
          answer: [
            "Here are Rich's public profile links:",
            `- GitHub: ${PROFILE_LINKS.github}`,
            `- LinkedIn: ${PROFILE_LINKS.linkedin}`,
            `- Facebook: ${PROFILE_LINKS.facebook}`,
          ].join("\n"),
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

  const ranked = rankCorpus(question).slice(0, topK);
  if (!ranked.length) {
    return json(
      {
        success: true,
        data: {
          answer:
            "I do not have enough evidence in the deployed corpus to answer confidently yet. Try asking about profile links (GitHub/LinkedIn/Facebook), education and degrees, technologies used, Oracle migration, Java modernization, control planes, or Starbucks platform work.",
          citations: [],
          retrieved_chunks: 0,
        },
      },
      200,
    );
  }

  const answer = buildAnswer(ranked);
  const citations = ranked.map((doc, index) => ({
    id: doc.id,
    title: doc.title,
    source_url: doc.source_url,
    chunk_index: index,
  }));

  return json(
    {
      success: true,
      data: {
        answer,
        citations,
        retrieved_chunks: ranked.length,
      },
    },
    200,
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

function isProfileLinksQuery(question) {
  const q = String(question || "").toLowerCase();
  const signals = [
    "github",
    "linkedin",
    "facebook",
    "social",
    "profile",
    "profiles",
    "link",
    "links",
    "url",
    "urls",
  ];

  return signals.some((signal) => q.includes(signal));
}

function buildAnswer(rankedDocs) {
  const allText = rankedDocs.map((doc) => `${doc.title} ${doc.text}`).join(" ").toLowerCase();
  const profileSignals = [
    "github",
    "linkedin",
    "facebook",
    "profile",
    "profiles",
    "social",
    "links",
    "url",
    "urls",
  ];
  const educationSignals = ["education", "degree", "degrees", "academic", "purdue", "bachelor"];
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
  const isProfileQuery = profileSignals.some((signal) => allText.includes(signal));
  const isEducationQuery = educationSignals.some((signal) => allText.includes(signal));
  const isTechnologyQuery = technologySignals.some((signal) => allText.includes(signal));

  let summary = "Based on the strongest matching evidence, Rich's profile is strongest in distributed systems, cloud platform modernization, and control-plane backend delivery.";
  if (isProfileQuery) {
    summary = "Based on the strongest matching evidence, Rich's public profiles are: GitHub https://github.com/richrobertson, LinkedIn https://www.linkedin.com/in/royrobertson, and Facebook https://www.facebook.com/rich.r.robertson/.";
  } else if (isEducationQuery) {
    summary = "Based on the strongest matching evidence, Rich completed two Purdue University bachelor's degrees in 2007, spanning both management and computer/information technology.";
  } else if (isTechnologyQuery) {
    summary = "Based on the strongest matching evidence, Rich has used a broad technology stack over time, including modern cloud/distributed platforms and earlier Microsoft enterprise technologies.";
  }
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
