const SUGGESTED_PROMPTS = [
  "What measurable outcomes did Rich drive in the Oracle CNS migration?",
  "How does Rich approach modernization tradeoffs in distributed systems?",
  "What examples show ownership and cross-team leadership?",
  "How strong is Rich in Kubernetes, Terraform, and cloud platform work?",
  "Which projects best match a staff-level backend engineering role?",
];

const telemetry = {
  sent: 0,
  received: 0,
  errors: 0,
  latencies: [],
  events: [],
};

const conversationHistory = [];
const MAX_CONVERSATION_HISTORY = 20;
const DEFAULT_HUMOR_MODE = "clean_professional";
const HUMOR_MODE_STORAGE_KEY = "askrich.humorMode";

let isRequestInFlight = false;

const MAX_TELEMETRY_LATENCIES = 100;
const MAX_TELEMETRY_EVENTS = 100;

const els = {
  form: document.querySelector("#chat-form"),
  question: document.querySelector("#question"),
  messages: document.querySelector("#messages"),
  sendBtn: document.querySelector("#send-btn"),
  promptList: document.querySelector("#prompt-list"),
  apiBase: document.querySelector("#api-base"),
  topK: document.querySelector("#top-k"),
  tone: document.querySelector("#tone"),
  humorMode: document.querySelector("#humor-mode"),
  metrics: {
    sent: document.querySelector("#metric-sent"),
    received: document.querySelector("#metric-received"),
    errors: document.querySelector("#metric-errors"),
    latency: document.querySelector("#metric-latency"),
  },
};

function nowIso() {
  return new Date().toISOString();
}

function average(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  const sum = numbers.reduce((acc, n) => acc + n, 0);
  return Math.round(sum / numbers.length);
}

function pushCapped(items, value, maxItems) {
  items.push(value);
  if (items.length > maxItems) {
    items.splice(0, items.length - maxItems);
  }
}

function getSafeCitationUrl(sourceUrl) {
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    return null;
  }

  try {
    const parsed = new URL(sourceUrl, window.location.href);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function normalizeApiBase(value) {
  const fallback = "http://127.0.0.1:8000";
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return fallback;
  }

  const withoutTrailingSlash = trimmed.replace(/\/$/, "");
  return withoutTrailingSlash.replace(/\/api\/chat$/, "") || fallback;
}

function extractApiErrorMessage(payload, status) {
  if (payload && typeof payload.error === "string" && payload.error.trim() !== "") {
    return payload.error;
  }

  if (payload && typeof payload.detail === "string" && payload.detail.trim() !== "") {
    return payload.detail;
  }

  if (payload && payload.detail !== undefined) {
    try {
      return JSON.stringify(payload.detail);
    } catch (_error) {
      return `Request failed with status ${status}`;
    }
  }

  return `Request failed with status ${status}`;
}

function pushEvent(type, payload = {}) {
  const event = { ts: nowIso(), type, payload };
  pushCapped(telemetry.events, event, MAX_TELEMETRY_EVENTS);
  try {
    localStorage.setItem("askrich.telemetry", JSON.stringify(telemetry.events));
  } catch (_error) {
    // Best-effort persistence only; continue even when storage is unavailable.
  }
}

function renderMetrics() {
  els.metrics.sent.textContent = String(telemetry.sent);
  els.metrics.received.textContent = String(telemetry.received);
  els.metrics.errors.textContent = String(telemetry.errors);
  els.metrics.latency.textContent = String(average(telemetry.latencies));
}

function appendMessage(role, text, citations = [], eventIds = {}) {
  const card = document.createElement("article");
  card.className = `message ${role}`;
  card.dataset.questionEventId = eventIds.questionEventId || "";
  card.dataset.answerEventId = eventIds.answerEventId || "";

  const roleEl = document.createElement("strong");
  roleEl.className = "role";
  roleEl.textContent = role;

  const answer = document.createElement("div");
  answer.className = "answer";
  answer.textContent = text;

  card.append(roleEl, answer);

  if (Array.isArray(citations) && citations.length > 0) {
    const details = document.createElement("details");
    details.className = "citations";

    const summary = document.createElement("summary");
    summary.textContent = `Citations (${citations.length})`;

    const list = document.createElement("ol");
    for (const citation of citations) {
      const li = document.createElement("li");
      const label = citation.title || citation.id || "Untitled source";
      const safeUrl = getSafeCitationUrl(citation.source_url);
      if (safeUrl) {
        const link = document.createElement("a");
        link.href = safeUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        li.append(link);
      } else {
        li.textContent = label;
      }

      if (typeof citation.chunk_index === "number") {
        const idx = document.createElement("span");
        idx.textContent = ` (chunk ${citation.chunk_index})`;
        li.append(idx);
      }
      list.append(li);
    }

    details.append(summary, list);
    card.append(details);
  }

  // M6: Add feedback controls for assistant messages
  if (role === "assistant" && eventIds.questionEventId && eventIds.answerEventId) {
    const feedbackDiv = document.createElement("div");
    feedbackDiv.className = "feedback-controls";

    const prompt = document.createElement("span");
    prompt.className = "feedback-prompt";
    prompt.textContent = "Was this helpful?";

    const helpfulBtn = document.createElement("button");
    helpfulBtn.type = "button";
    helpfulBtn.className = "feedback-btn";
    helpfulBtn.textContent = "👍 Yes";
    helpfulBtn.dataset.sentiment = "helpful";

    const unhelpfulBtn = document.createElement("button");
    unhelpfulBtn.type = "button";
    unhelpfulBtn.className = "feedback-btn unhelpful-btn";
    unhelpfulBtn.textContent = "👎 No";
    unhelpfulBtn.dataset.sentiment = "unhelpful";

    const status = document.createElement("span");
    status.className = "feedback-status";

    feedbackDiv.append(prompt, helpfulBtn, unhelpfulBtn, status);
    card.append(feedbackDiv);

    // Attach event listeners for feedback submission
    helpfulBtn.addEventListener("click", () => submitFeedback(card, eventIds, "helpful"));
    unhelpfulBtn.addEventListener("click", () => submitFeedback(card, eventIds, "unhelpful"));
  }

  els.messages.append(card);
  els.messages.scrollTop = els.messages.scrollHeight;

  if (role === "user" || role === "assistant") {
    pushCapped(conversationHistory, { role, content: String(text || "") }, MAX_CONVERSATION_HISTORY);
  }
}

function isLikelyProductionHost() {
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "myrobertson.com" || host === "www.myrobertson.com";
}

function isLocalApiBase(base) {
  const normalized = String(base || "").toLowerCase();
  return normalized.includes("127.0.0.1") || normalized.includes("localhost");
}

function getApiBase() {
  const localFallback = "http://127.0.0.1:8000";
  const productionFallback = "https://api.myrobertson.com";
  let stored = null;
  try {
    stored = localStorage.getItem("askrich.apiBase");
  } catch (_error) {
    stored = null;
  }

  const normalizedStored = normalizeApiBase(stored || localFallback);
  if (isLikelyProductionHost() && isLocalApiBase(normalizedStored)) {
    return productionFallback;
  }

  return normalizedStored;
}

function initApiBase() {
  const base = getApiBase();
  els.apiBase.value = base;
  try {
    localStorage.setItem("askrich.apiBase", base);
  } catch (_error) {
    // Keep working even if storage cannot be written.
  }

  // Persist on 'input' event so localStorage always stays in sync with the field value
  els.apiBase.addEventListener("input", () => {
    const trimmed = normalizeApiBase(els.apiBase.value);
    const persisted = isLikelyProductionHost() && isLocalApiBase(trimmed)
      ? "https://api.myrobertson.com"
      : trimmed || "http://127.0.0.1:8000";

    if (persisted !== trimmed) {
      els.apiBase.value = persisted;
    }

    try {
      localStorage.setItem("askrich.apiBase", persisted);
    } catch (_error) {
      // Keep working even if storage cannot be written.
    }
  });
}

function normalizeHumorMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "standard") {
    return "standard";
  }
  return DEFAULT_HUMOR_MODE;
}

function initHumorMode() {
  let storedMode = DEFAULT_HUMOR_MODE;
  try {
    storedMode = localStorage.getItem(HUMOR_MODE_STORAGE_KEY) || DEFAULT_HUMOR_MODE;
  } catch (_error) {
    storedMode = DEFAULT_HUMOR_MODE;
  }

  els.humorMode.value = normalizeHumorMode(storedMode);
  els.humorMode.addEventListener("change", () => {
    const mode = normalizeHumorMode(els.humorMode.value);
    els.humorMode.value = mode;
    try {
      localStorage.setItem(HUMOR_MODE_STORAGE_KEY, mode);
    } catch (_error) {
      // Keep working even if storage cannot be written.
    }
  });
}

function initPromptChips() {
  for (const prompt of SUGGESTED_PROMPTS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "prompt-chip";
    button.textContent = prompt;
    button.addEventListener("click", () => {
      els.question.value = prompt;
      els.question.focus();
      pushEvent("prompt_selected", { prompt });
    });
    els.promptList.append(button);
  }
}

function parseTopK() {
  const value = Number.parseInt(els.topK.value, 10);
  if (Number.isNaN(value)) {
    return undefined;
  }
  return Math.max(1, Math.min(20, value));
}

async function askQuestion(question) {
  // Use the current input field value (which is always in sync with localStorage via the input event listener)
  const base = normalizeApiBase(els.apiBase.value);
  const endpoint = `${base}/api/chat`;

  const body = {
    question,
    top_k: parseTopK(),
    history: conversationHistory,
    humor_mode: normalizeHumorMode(els.humorMode.value),
  };

  const tone = (els.tone.value || "").trim();
  if (tone) {
    body.tone = tone;
  }

  const start = performance.now();
  pushEvent("request_started", { endpoint, top_k: body.top_k });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const latencyMs = Math.round(performance.now() - start);
  pushCapped(telemetry.latencies, latencyMs, MAX_TELEMETRY_LATENCIES);
  pushEvent("request_finished", { status: response.status, latencyMs });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    const message = extractApiErrorMessage(json, response.status);
    throw new Error(message);
  }

  // M6: Extract event IDs from response headers
  const questionEventId = response.headers.get("X-Question-Event-ID") || "";
  const answerEventId = response.headers.get("X-Answer-Event-ID") || "";

  return {
    answer: json.data?.answer || "",
    citations: json.data?.citations || [],
    retrievedChunks: json.data?.retrieved_chunks || 0,
    questionEventId,
    answerEventId,
  };
}

/**
 * M6: Submit feedback for an answer
 */
async function submitFeedback(messageCard, eventIds, sentiment) {
  const base = normalizeApiBase(els.apiBase.value);
  const endpoint = `${base}/api/feedback`;
  const statusEl = messageCard.querySelector(".feedback-status");
  const buttons = messageCard.querySelectorAll(".feedback-btn");

  // Disable buttons and show pending status
  buttons.forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = "0.6";
  });
  if (statusEl) {
    statusEl.textContent = "Sending...";
    statusEl.style.color = "";
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        questionEventId: eventIds.questionEventId,
        answerEventId: eventIds.answerEventId,
        sentiment,
        optionalNote: "",
      }),
    });

    if (!response.ok) {
      throw new Error(`Feedback submission failed: ${response.status}`);
    }

    // Update button states and status
    buttons.forEach(btn => {
      if (btn.dataset.sentiment === sentiment) {
        btn.classList.add("selected");
        if (sentiment === "unhelpful") {
          btn.classList.add("unhelpful");
        }
      } else {
        btn.disabled = true;
        btn.style.opacity = "0.3";
      }
    });

    if (statusEl) {
      statusEl.textContent = "Thanks for your feedback!";
      statusEl.style.color = "";
    }

    pushEvent("feedback_submitted", { sentiment, answerEventId: eventIds.answerEventId });
  } catch (error) {
    // Re-enable buttons on error
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = "1";
    });

    if (statusEl) {
      statusEl.textContent = "Could not submit feedback";
      statusEl.style.color = "var(--danger)";
    }

    pushEvent("feedback_error", { error: error.message });
  }
}

function setFormBusy(isBusy) {
  els.sendBtn.disabled = isBusy;
  els.sendBtn.textContent = isBusy ? "Thinking..." : "Send question";
}

async function onSubmit(event) {
  event.preventDefault();
  if (isRequestInFlight) {
    return;
  }

  const question = (els.question.value || "").trim();
  if (question.length < 3) {
    appendMessage("system", "Question is too short. Please add a little more detail.");
    return;
  }

  appendMessage("user", question);
  telemetry.sent += 1;
  pushEvent("message_sent", { length: question.length });
  renderMetrics();

  els.question.value = "";
  isRequestInFlight = true;
  setFormBusy(true);

  try {
    const result = await askQuestion(question);
    telemetry.received += 1;
    pushEvent("message_received", {
      citations: result.citations.length,
      retrieved_chunks: result.retrievedChunks,
    });

    // M6: Pass event IDs to appendMessage for feedback tracking
    appendMessage("assistant", result.answer, result.citations, {
      questionEventId: result.questionEventId,
      answerEventId: result.answerEventId,
    });
  } catch (error) {
    telemetry.errors += 1;
    pushEvent("request_error", { message: error.message });

    const cardText = `Unable to get an answer right now. ${error.message}`;
    appendMessage("system", cardText);

    const cards = els.messages.querySelectorAll(".message.system .answer");
    if (cards.length > 0) {
      cards[cards.length - 1].classList.add("error-text");
    }
  } finally {
    isRequestInFlight = false;
    setFormBusy(false);
    renderMetrics();
  }
}

function bindComposerShortcuts() {
  els.question.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      if (isRequestInFlight) {
        return;
      }
      event.preventDefault();
      els.form.requestSubmit();
    }
  });
}

function init() {
  initApiBase();
  initHumorMode();
  initPromptChips();
  bindComposerShortcuts();
  els.form.addEventListener("submit", onSubmit);
  renderMetrics();

  appendMessage(
    "system",
    "Start with a prompt starter or ask directly about migration outcomes, architecture decisions, and leadership impact."
  );
}

init();
