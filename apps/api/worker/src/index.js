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

const PROFILE_PLATFORM_ORDER = ["linkedin", "github", "facebook"];

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

  const requestedProfiles = getRequestedProfiles(question);
  const asksForAllProfiles = isAllProfilesQuery(question);
  const isContactRequest = isContactQuery(question);
  const isSensitiveContactRequest = isSensitiveContactQuery(question);
  const isGenericProfileRequest = isProfileLinksQuery(question);

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

  const answer = buildAnswer(question, ranked);
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
  const platformSignals = [
    "github",
    "linkedin",
    "facebook",
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
  if (q.includes("facebook")) {
    requested.push("facebook");
  }

  return requested;
}

function toProfileLabel(profile) {
  if (profile === "linkedin") return "LinkedIn";
  if (profile === "github") return "GitHub";
  if (profile === "facebook") return "Facebook";
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
      "I do not share private contact details such as personal phone numbers or email addresses here.",
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
      "If you want additional profile links (for example GitHub or Facebook), ask and I can share those too.",
    ].join("\n");
  }

  if (isGenericProfileRequest) {
    return [
      "I can share specific profile links. LinkedIn is the primary contact point:",
      `- LinkedIn: ${PROFILE_LINKS.linkedin}`,
      "If you want GitHub or Facebook as well, ask for those directly.",
    ].join("\n");
  }

  return ["Here is Rich's LinkedIn profile:", `- LinkedIn: ${PROFILE_LINKS.linkedin}`].join("\n");
}

function buildAnswer(question, rankedDocs) {
  const q = String(question || "").toLowerCase();
  if (isBehavioralQuestion(q)) {
    return buildBehavioralAnswer(q, rankedDocs);
  }

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
  const includesLinkedIn = allText.includes("linkedin");
  const includesGitHub = allText.includes("github");
  const includesFacebook = allText.includes("facebook");
  const isEducationQuery = educationSignals.some((signal) => allText.includes(signal));
  const isTechnologyQuery = technologySignals.some((signal) => allText.includes(signal));

  let summary = "The strongest evidence points to deep experience in distributed systems, cloud modernization, and reliable backend platform delivery.";
  if (isProfileQuery) {
    const profileDetails = [];
    if (includesLinkedIn) {
      profileDetails.push(`LinkedIn ${PROFILE_LINKS.linkedin} (primary contact point)`);
    }
    if (includesGitHub) {
      profileDetails.push(`GitHub ${PROFILE_LINKS.github}`);
    }
    if (includesFacebook) {
      profileDetails.push(`Facebook ${PROFILE_LINKS.facebook}`);
    }

    const details = profileDetails.length
      ? profileDetails.join(", ")
      : `LinkedIn ${PROFILE_LINKS.linkedin} (primary contact point)`;
    summary = `Rich's public profile links include ${details}.`;
  } else if (isEducationQuery) {
    summary = "Rich completed two Purdue University bachelor's degrees in 2007, spanning both management and computer/information technology.";
  } else if (isTechnologyQuery) {
    summary = "Rich has used a broad technology stack over time, including modern cloud/distributed platforms and earlier Microsoft enterprise technologies.";
  }
  const bullets = rankedDocs.slice(0, 3).map((doc) => `- ${clipSentence(doc.text, 200)}`);
  return [summary, ...bullets].join("\n");
}

function isBehavioralQuestion(questionLower) {
  const signals = [
    "tell me about a time",
    "give me an example",
    "example of a time",
    "time when",
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
  return signals.some((signal) => questionLower.includes(signal));
}

function buildBehavioralAnswer(questionLower, rankedDocs) {
  const docIds = new Set(rankedDocs.map((doc) => doc.id));
  const persuasionPrompt = ["convince", "persuade", "influence", "stakeholder"].some((signal) =>
    questionLower.includes(signal),
  );

  if (persuasionPrompt && docIds.has("project-oracle-cns")) {
    return [
      "Situation: At Oracle, the Customer Notification Service needed to move to an OCI-native architecture while supporting a $2M enterprise deal timeline.",
      "Task: I needed to get cross-functional stakeholders aligned on a migration approach that improved reliability without risking delivery commitments.",
      "Action: I proposed a phased migration plan with explicit rollout checkpoints, reliability safeguards, and clear communication on tradeoffs and risk reduction.",
      "Result: We completed the migration with stronger scalability and operational readiness while staying aligned to the deal timeline.",
      "Reflection: When I need to convince people, I focus on concrete risk controls, phased execution, and business impact rather than abstract technical arguments.",
    ].join("\n");
  }

  if (persuasionPrompt && docIds.has("project-java17")) {
    return [
      "Situation: I led a Java 8 to Java 17 modernization with rollout across 32 global data centers under a tight timeline.",
      "Task: I had to align teams on a controlled migration strategy that balanced speed with production safety.",
      "Action: I drove agreement on staged rollout gates, architecture-specific validation, and reliability safeguards before each expansion step.",
      "Result: We completed the rollout in under three months with controlled delivery and operational stability.",
      "Reflection: Persuasion works best when you pair urgency with a concrete safety model and measurable checkpoints.",
    ].join("\n");
  }

  const primary = rankedDocs[0];
  const secondary = rankedDocs[1];
  const primaryText = primary ? toFirstPerson(clipSentence(primary.text, 180)) : "I do not have enough evidence to provide a strong example yet.";
  const secondaryText = secondary ? toFirstPerson(clipSentence(secondary.text, 180)) : "I focused on stakeholder alignment and execution clarity.";

  return [
    `Situation: ${primaryText}`,
    "Task: I needed to align people around a clear path to delivery while managing risk.",
    `Action: ${secondaryText}`,
    "Result: The work improved delivery confidence and execution reliability.",
    "Reflection: I am most effective when I combine clear communication, staged execution, and ownership of outcomes.",
  ].join("\n");
}

function clipSentence(text, maxLen) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function toFirstPerson(text) {
  return String(text || "")
    .replace(/Rich's/gi, "my")
    .replace(/\bRich\b/gi, "I");
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
