(function () {
  const SCRIPT = document.currentScript;
  const API_BASE = (SCRIPT && SCRIPT.dataset.apiBase) || "https://api.myrobertson.com";
  const TITLE = (SCRIPT && SCRIPT.dataset.title) || "Ask Rich";

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

  function appendMessage(role, text) {
    const msg = document.createElement("div");
    msg.style.margin = "0 0 10px";
    msg.style.padding = "10px";
    msg.style.background = role === "You" ? "#dbeafe" : "#ffffff";
    msg.style.border = "1px solid #e2e8f0";
    msg.style.borderRadius = "8px";

    const roleLabel = document.createElement("strong");
    roleLabel.textContent = role + ": ";
    msg.append(roleLabel, document.createTextNode(text));
    body.append(msg);
    body.scrollTop = body.scrollHeight;
  }

  async function sendQuestion(question) {
    const response = await fetch(API_BASE.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, top_k: 5 }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || payload.detail || "Request failed");
    }

    return payload.data && payload.data.answer ? payload.data.answer : "No answer returned.";
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
    input.value = "";
    send.disabled = true;
    send.textContent = "...";

    try {
      const answer = await sendQuestion(question);
      appendMessage("Ask Rich", answer);
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
