# apps/web

Milestone 3/4 web implementation for the Ask Rich recruiter chat experience.

## Current implementation

- Recruiter-focused chat UI with conversation panel
- Suggested prompt starters for first-use guidance
- Citation rendering per assistant message
- Client-side interaction telemetry (sent/received/error counts and latency)
- API integration with `POST /api/chat`
- Cloudflare asset deployment config via `wrangler.toml`
- Embeddable site widget at `embed/askrich-widget.js`

## Run locally

1. Start the API in `apps/api` (default base URL: `http://127.0.0.1:8000`).
2. Serve this folder as static files:

```bash
cd apps/web
python -m http.server 3000
```

3. Open `http://127.0.0.1:3000`.

## Notes

- API base URL is editable in the UI and persisted in local storage.
- This static shell can be deployed as Worker assets while a future Next.js migration remains optional.

## Embedding on www.myrobertson.com

Include the widget script on any page:

```html
<script
	src="/apps/web/embed/askrich-widget.js"
	data-api-base="https://api.myrobertson.com"
	data-title="Ask Rich"
></script>
```

The widget opens a recruiter-focused chat panel and calls `POST /api/chat` on the configured API base.
