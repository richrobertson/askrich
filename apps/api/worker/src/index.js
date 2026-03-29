/**
 * Ask Rich Cloudflare Worker: Chat API Handler
 *
 * This worker handles two modes:
 * 1. UPSTREAM mode: Proxies requests to a retrieval-backed API (e.g., FastAPI server)
 * 2. LOCAL mode: Serves canned responses from hardcoded CORPUS and rules
 *
 * QUALITY ASSURANCE:
 *   The local mode contains hardcoded response paths for specific question types.
 *   These are extensively tested to ensure focused, concise, and safe answers.
 *
 *   Test suites (see docs/testing/CANNED_RESPONSES.md):
 *     - scripts/test_canned_responses.py: Specification validation
 *     - scripts/test_canned_responses_integration.py: Live worker response validation
 *     - src/index.test.js: JavaScript unit tests (40+ assertions)
 *
 *   Response quality guarantees:
 *     - Oracle CNS outcomes questions → focused metrics (not profile link noise)
 *     - Profile queries → profile links only (no project details)
 *     - Education queries → degree info (no unrelated content)
 *     - Sensitive contact → refuse PII, redirect to LinkedIn
 *     - All fallback answers → stay under 600-800 characters
 *
 * KEY FUNCTIONS:
 *   - buildAnswer(): Routes questions based on intent (behavioral, outcomes, education, etc.)
 *   - buildProfileResponse(): Handles profile/contact queries
 *   - buildBehavioralAnswer(): Returns STAR-formatted answers for behavioral questions
 *   - rankCorpus(): Token-based relevance ranking of CORPUS documents
 *   - isOracleCnsOutcomesQuestion(): Intent detection for Oracle outcomes
 *
 * DOCUMENTATION & CROSSLINKS:
 *   - docs/testing/CANNED_RESPONSES.md: Complete testing guide
 *   - docs/architecture.md: System design overview
 *   - README.md: Quality assurance section
 *   - apps/api/worker/package.json: Test dependencies
 *
 * ENVIRONMENT:
 *   - CHAT_BACKEND_MODE: "upstream" or "local" (defaults to "local")
 *   - UPSTREAM_API_BASE: Base URL for upstream (e.g., http://127.0.0.1:8000)
 *   - ALLOWED_ORIGINS: CORS whitelist (comma-separated)
 */

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
      "- Backend platforms: Java, C#, Python, Scala across ASP.NET, SharePoint, enterprise middleware",
      "- Data & analytics: Stream processing, event sourcing, distributed tracing",
      "Rich's strength is translating platform technology into reliable business outcomes.",
    ].join("\n");
  }

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
  const cloudPlatformSignals = ["cloud", "platform", "control plane", "control-plane", "kubernetes", "oci"];

  // CRITICAL: Classify intent based on USER'S QUESTION, not retrieved document text.
  // This prevents misrouting. Example: if a doc happens to mention "LinkedIn" in passing,
  // we don't want to return a profile-links answer to a question about "What projects?"
  // See: docs/testing/CANNED_RESPONSES.md - "Answer Appropriateness" section.
  const isProfileQuery = includesAny(q, profileSignals);
  const includesLinkedIn = q.includes("linkedin");
  const includesGitHub = q.includes("github");
  const includesFacebook = q.includes("facebook");
  const isEducationQuery = includesAny(q, educationSignals);
  const isTechnologyQuery = includesAny(q, technologySignals);
  const isCloudPlatformQuery = includesAny(q, cloudPlatformSignals);

  let summary = "Rich's strongest evidence points to distributed systems, cloud modernization, and reliable backend platform delivery.";
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
    summary = "Rich has used a broad technology stack across modern cloud/distributed platforms and earlier Microsoft enterprise technologies.";
  } else if (isCloudPlatformQuery) {
    summary = "Rich is highly relevant for cloud platform and control-plane roles, with OCI migration leadership, Kubernetes platform operations, and reusable multitenant control-plane architecture experience.";
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

// Export functions for testing
export {
  CORPUS,
  buildAnswer,
  buildBehavioralAnswer,
  buildProfileResponse,
  isBehavioralQuestion,
  isOracleCnsOutcomesQuestion,
  isTechnologyPassionQuestion,
  isProfileLinksQuery,
  isContactQuery,
  isSensitiveContactQuery,
  isAllProfilesQuery,
  rankCorpus,
  clipSentence,
  formatStarAnswer,
};
