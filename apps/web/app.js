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

function appendMessage(role, text, citations = []) {
  const card = document.createElement("article");
  card.className = `message ${role}`;

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

  els.messages.append(card);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function getApiBase() {
  const fallback = "http://127.0.0.1:8000";
  let stored = null;
  try {
    stored = localStorage.getItem("askrich.apiBase");
  } catch (_error) {
    stored = null;
  }
  return (stored || fallback).replace(/\/$/, "");
}

function initApiBase() {
  const base = getApiBase();
  els.apiBase.value = base;
  // Persist on 'input' event so localStorage always stays in sync with the field value
  els.apiBase.addEventListener("input", () => {
    const trimmed = (els.apiBase.value || "").trim().replace(/\/$/, "");
    try {
      localStorage.setItem("askrich.apiBase", trimmed || "http://127.0.0.1:8000");
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
  const base = (els.apiBase.value || "").trim().replace(/\/$/, "") || "http://127.0.0.1:8000";
  const endpoint = `${base}/api/chat`;

  const body = {
    question,
    top_k: parseTopK(),
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

  return {
    answer: json.data?.answer || "",
    citations: json.data?.citations || [],
    retrievedChunks: json.data?.retrieved_chunks || 0,
  };
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

    appendMessage("assistant", result.answer, result.citations);
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
