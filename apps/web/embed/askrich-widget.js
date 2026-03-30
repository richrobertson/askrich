(function () {
  const SCRIPT = document.currentScript;
  const API_BASE = (SCRIPT && SCRIPT.dataset.apiBase) || "https://api.myrobertson.com";
  const TITLE = (SCRIPT && SCRIPT.dataset.title) || "Ask Rich";
  const conversationHistory = [];
  const MAX_CONVERSATION_HISTORY = 20;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.textContent = TITLE;
  launcher.setAttribute("aria-label", "Open Ask Rich recruiter chat");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "askrich-widget-panel");
  launcher.style.position = "fixed";
  launcher.style.right = "16px";
  launcher.style.bottom = "16px";
  launcher.style.zIndex = "2147483647";
  launcher.style.padding = "12px 16px";
  launcher.style.border = "0";
  launcher.style.borderRadius = "999px";
  launcher.style.cursor = "pointer";
  launcher.style.font = "600 14px/1.1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  launcher.style.background = "#0f172a";
  launcher.style.color = "#ffffff";
  launcher.style.boxShadow = "0 10px 24px rgba(2, 6, 23, 0.28)";

  const panel = document.createElement("aside");
  panel.id = "askrich-widget-panel";
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "72px";
  panel.style.width = "min(420px, calc(100vw - 24px))";
  panel.style.height = "min(560px, calc(100vh - 120px))";
  panel.style.display = "none";
  panel.style.flexDirection = "column";
  panel.style.zIndex = "2147483647";
  panel.style.background = "#ffffff";
  panel.style.border = "1px solid #cbd5e1";
  panel.style.borderRadius = "14px";
  panel.style.boxShadow = "0 20px 44px rgba(2, 6, 23, 0.22)";
  panel.style.overflow = "hidden";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Ask Rich recruiter chat");

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.padding = "10px 12px";
  header.style.borderBottom = "1px solid #e2e8f0";
  header.style.font = "600 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  header.textContent = TITLE;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Close";
  closeBtn.style.border = "0";
  closeBtn.style.background = "transparent";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.font = "500 12px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.overflowY = "auto";
  body.style.padding = "10px";
  body.style.font = "400 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  body.style.background = "#f8fafc";

  const form = document.createElement("form");
  form.style.display = "flex";
  form.style.gap = "8px";
  form.style.padding = "10px";
  form.style.borderTop = "1px solid #e2e8f0";

  const input = document.createElement("input");
  input.type = "text";
  input.required = true;
  input.placeholder = "Ask about impact, migrations, or technical depth";
  input.style.flex = "1";
  input.style.padding = "10px 12px";
  input.style.border = "1px solid #cbd5e1";
  input.style.borderRadius = "8px";

  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Send";
  send.style.padding = "10px 12px";
  send.style.border = "0";
  send.style.borderRadius = "8px";
  send.style.background = "#0f172a";
  send.style.color = "#ffffff";
  send.style.cursor = "pointer";

  function pushHistory(role, content) {
    conversationHistory.push({ role, content: String(content || "") });
    if (conversationHistory.length > MAX_CONVERSATION_HISTORY) {
      conversationHistory.splice(0, conversationHistory.length - MAX_CONVERSATION_HISTORY);
    }
  }

  async function submitFeedback(eventIds, sentiment, controls) {
    const endpoint = API_BASE.replace(/\/$/, "") + "/api/feedback";
    const status = controls.status;
    const helpfulBtn = controls.helpfulBtn;
    const unhelpfulBtn = controls.unhelpfulBtn;

    helpfulBtn.disabled = true;
    unhelpfulBtn.disabled = true;
    status.textContent = "Sending...";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionEventId: eventIds.questionEventId,
          answerEventId: eventIds.answerEventId,
          sentiment,
          optionalNote: "",
        }),
      });

      if (!response.ok) {
        throw new Error("Feedback request failed");
      }

      if (sentiment === "helpful") {
        helpfulBtn.style.background = "#0f766e";
        helpfulBtn.style.color = "#ffffff";
      } else {
        unhelpfulBtn.style.background = "#b91c1c";
        unhelpfulBtn.style.color = "#ffffff";
      }

      status.textContent = "Thanks for your feedback.";
    } catch (_error) {
      helpfulBtn.disabled = false;
      unhelpfulBtn.disabled = false;
      status.textContent = "Could not submit feedback.";
    }
  }

  function appendMessage(role, text, eventIds) {
    const msg = document.createElement("div");
    msg.style.margin = "0 0 10px";
    msg.style.padding = "10px";
    msg.style.background = role === "You" ? "#dbeafe" : "#ffffff";
    msg.style.border = "1px solid #e2e8f0";
    msg.style.borderRadius = "8px";

    const roleLabel = document.createElement("strong");
    roleLabel.textContent = role + ": ";
    msg.append(roleLabel, document.createTextNode(text));

    if (
      role === "Ask Rich" &&
      eventIds &&
      eventIds.questionEventId &&
      eventIds.answerEventId
    ) {
      const controls = document.createElement("div");
      controls.style.marginTop = "8px";
      controls.style.paddingTop = "8px";
      controls.style.borderTop = "1px dashed #cbd5e1";
      controls.style.display = "flex";
      controls.style.gap = "6px";
      controls.style.alignItems = "center";

      const prompt = document.createElement("span");
      prompt.textContent = "Was this helpful?";
      prompt.style.fontSize = "12px";
      prompt.style.color = "#475569";

      const helpfulBtn = document.createElement("button");
      helpfulBtn.type = "button";
      helpfulBtn.textContent = "Yes";
      helpfulBtn.style.border = "1px solid #cbd5e1";
      helpfulBtn.style.background = "#ffffff";
      helpfulBtn.style.borderRadius = "6px";
      helpfulBtn.style.padding = "4px 8px";
      helpfulBtn.style.cursor = "pointer";

      const unhelpfulBtn = document.createElement("button");
      unhelpfulBtn.type = "button";
      unhelpfulBtn.textContent = "No";
      unhelpfulBtn.style.border = "1px solid #cbd5e1";
      unhelpfulBtn.style.background = "#ffffff";
      unhelpfulBtn.style.borderRadius = "6px";
      unhelpfulBtn.style.padding = "4px 8px";
      unhelpfulBtn.style.cursor = "pointer";

      const status = document.createElement("span");
      status.style.fontSize = "12px";
      status.style.color = "#64748b";

      helpfulBtn.addEventListener("click", function () {
        submitFeedback(eventIds, "helpful", { status, helpfulBtn, unhelpfulBtn });
      });
      unhelpfulBtn.addEventListener("click", function () {
        submitFeedback(eventIds, "unhelpful", { status, helpfulBtn, unhelpfulBtn });
      });

      controls.append(prompt, helpfulBtn, unhelpfulBtn, status);
      msg.append(controls);
    }

    body.append(msg);
    body.scrollTop = body.scrollHeight;
  }

  async function sendQuestion(question) {
    const response = await fetch(API_BASE.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, top_k: 5, history: conversationHistory }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || payload.detail || "Request failed");
    }

    return {
      answer: payload.data && payload.data.answer ? payload.data.answer : "No answer returned.",
      questionEventId: response.headers.get("X-Question-Event-ID") || "",
      answerEventId: response.headers.get("X-Answer-Event-ID") || "",
    };
  }

  launcher.addEventListener("click", function () {
    const opening = panel.style.display === "none";
    panel.style.display = opening ? "flex" : "none";
    launcher.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) {
      input.focus();
    } else {
      launcher.focus();
    }
  });

  closeBtn.addEventListener("click", function () {
    panel.style.display = "none";
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel.style.display === "flex") {
      panel.style.display = "none";
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) {
      return;
    }

    appendMessage("You", question);
    pushHistory("user", question);
    input.value = "";
    send.disabled = true;
    send.textContent = "...";

    try {
      const result = await sendQuestion(question);
      appendMessage("Ask Rich", result.answer, {
        questionEventId: result.questionEventId,
        answerEventId: result.answerEventId,
      });
      pushHistory("assistant", result.answer);
    } catch (error) {
      appendMessage("Ask Rich", "Sorry, I could not fetch a response right now.");
      if (window && window.console && error) {
        console.error(error);
      }
    } finally {
      send.disabled = false;
      send.textContent = "Send";
      input.focus();
    }
  });

  header.append(closeBtn);
  form.append(input, send);
  panel.append(header, body, form);
  document.body.append(launcher, panel);
})();
