# KI-Haushaltsbuch

> ⚠️ **Work in progress.** This is a personal side project, actively developed but not production-ready. Expect rough edges.

A self-hosted personal budget tracker as a Progressive Web App (PWA). Take a photo of a receipt with your phone — the app uses AI to automatically extract every line item and categorize it. See exactly where your money goes, not just "Groceries" but "Wine", "Vegetables", "Meat".

## Screenshots

<p align="center">
  <img src="docs/screenshots/dashboard.jpg" width="270" alt="Dashboard – spending by category">
  <img src="docs/screenshots/receipts-list.jpg" width="270" alt="Receipts list">
  <img src="docs/screenshots/capture.jpg" width="270" alt="Capture – photo upload">
</p>

*Dashboard with category breakdown · Receipt list with AI-extracted line items · Photo capture with instant upload*

## Features

- 📷 **Scan receipts** — photo, PDF, HEIC all supported
- 🤖 **AI extraction** — Gemini 2.5 Flash-Lite reads store name, date, and every line item
- 🏷️ **Auto-categorization** — items are mapped to your category list automatically
- 📊 **Dashboard** — spending by category (pie chart) and month-over-month (bar chart)
- ✈️ **Multi-tenant** — separate books for different countries or contexts (e.g. Germany / Spain)
- 📥 **Export** — CSV and Excel download
- 📱 **PWA** — installable on iPhone and Android, works offline with upload queue
- 🌙 **Dark mode** — follows system preference
- 🔐 **Optional auth** — reverse-proxy-based user management with per-tenant access control

## Requirements

- Docker & Docker Compose
- A [Google AI Studio](https://aistudio.google.com/) API key (free tier available)

## Quick start

```bash
# 1. Copy config and add your API key
cp .env.example .env
# Edit .env: set GEMINI_API_KEY=...

# 2. Build and run
docker-compose up --build

# 3. Open in browser
# http://localhost:8080
```

On first launch a setup wizard asks you to create your first tenant (e.g. "Germany").

## Security

By default the app has **no authentication**. Anyone who can reach the port can see and modify all data.

| Deployment | Safe? |
|---|---|
| Behind your home router (local network only) | ✅ |
| Behind a VPN | ✅ |
| Behind a reverse proxy with authentication | ✅ |
| Direct exposure to the public internet | ❌ |

### Optional: Reverse-proxy authentication

The app supports an optional authentication layer that integrates with any reverse proxy (nginx, Traefik, Caddy …). When enabled, the proxy handles login and forwards the username via a configurable HTTP header.

To activate, set in `.env`:
```
AUTH_HEADER=X-Forwarded-User
AUTH_ADMINS=alice,bob
```

- When `AUTH_HEADER` is set, requests without that header receive `403 Forbidden`.
- Users only see the tenants assigned to them.
- Admins (listed in `AUTH_ADMINS`) have access to a user management page to assign tenants to users.
- New users can create their own tenant on first login.
- **When `AUTH_HEADER` is not set**, the app behaves exactly as before — no access control.

## AI providers

Three providers are supported. Select the active provider in `.env` or in the app under **Settings**.
Keys can be set in `.env` or in the app (`.env` takes precedence).

### Gemini (default — recommended)
Get a key at [Google AI Studio](https://aistudio.google.com/) — free tier is sufficient for personal use.
```
GEMINI_API_KEY=your-key-here
AI_PROVIDER=gemini
# Optional: GEMINI_MODEL=gemini-2.5-flash-lite  (default)
```

### Claude
Get a key at [Anthropic Console](https://console.anthropic.com/).
```
ANTHROPIC_API_KEY=your-key-here
AI_PROVIDER=claude
# Optional: CLAUDE_MODEL=claude-haiku-4-5-20251001  (default)
```

### OpenAI
Get a key at [OpenAI Platform](https://platform.openai.com/api-keys).
```
OPENAI_API_KEY=your-key-here
AI_PROVIDER=openai
# Optional: OPENAI_MODEL=gpt-5.4-mini  (default)
```

## Data persistence

The SQLite database and uploaded images live in `./data/` on the host (Docker volume). They survive container restarts and rebuilds.

**Backup:** copy `./data/haushaltsbuch.db` and `./data/uploads/`.

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `gemini`, `claude`, or `openai` | `gemini` |
| `GEMINI_API_KEY` | Google AI Studio key | — |
| `ANTHROPIC_API_KEY` | Anthropic key | — |
| `OPENAI_API_KEY` | OpenAI key | — |
| `GEMINI_MODEL` | Override Gemini model | `gemini-2.5-flash-lite` |
| `CLAUDE_MODEL` | Override Claude model | `claude-haiku-4-5-20251001` |
| `OPENAI_MODEL` | Override OpenAI model | `gpt-5.4-mini` |
| `AUTH_HEADER` | HTTP header carrying the username (enables auth) | — |
| `AUTH_ADMINS` | Comma-separated list of admin usernames | — |
| `PORT` | HTTP port inside container | `3000` |
| `TZ` | Timezone | `Europe/Berlin` |
| `UPLOAD_MAX_MB` | Max upload file size | `25` |
| `WORKER_INTERVAL_SEC` | AI worker polling interval | `10` |

## Install as PWA

- **iOS**: Safari → Share → "Add to Home Screen"
- **Android**: Chrome → Menu → "Install app"

## Architecture overview

```
Upload → HTTP 202 (instant)
              ↓
       SQLite job queue
              ↓  (worker polls every 10s)
       AI OCR job → AI categorization job
              ↓
       Receipt + line items stored in SQLite
```

Single Docker container. No external services. All AI calls are the only data leaving your server.

## License

[MIT](LICENSE) — feel free to use, fork, and adapt for your own needs.

---

*Personal project by Florian Wilhelm · Built with the assistance of [Claude Sonnet 4.6](https://www.anthropic.com/claude)*

*This project is also an experiment: the entire app — architecture, backend, frontend, and Docker setup — was developed in collaboration with Claude, without writing a single line of code manually. It explores what's possible when AI takes on the full implementation from a rough idea.*
