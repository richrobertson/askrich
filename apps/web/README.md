# apps/web

Milestone 4 web starter for the Ask Rich recruiter chat experience.

## Current implementation

- Recruiter-focused chat UI with conversation panel
- Suggested prompt starters for first-use guidance
- Citation rendering per assistant message
- Client-side interaction telemetry (sent/received/error counts and latency)
- API integration with `POST /api/chat`

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
- This is a milestone starter implementation. A Next.js + Cloudflare Workers app can replace this static shell in later milestone steps.
