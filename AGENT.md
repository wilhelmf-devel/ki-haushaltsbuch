# AGENT.md – Haushaltsbuch PWA

This document describes the project goal, architecture, and all design decisions made.
It serves as persistent context for AI assistants (Claude Code, Codex) and human developers.
**Read this document before making any code changes. Update it after relevant architectural decisions.**

---

## What is this?

A personal budget tracker as a self-hosted Progressive Web App (PWA). The user photographs
receipts and invoices with their smartphone; the app automatically extracts all line items using AI
and categorizes them. The goal is to see what money is spent on — at product level
(not just "Groceries" but "Wine", "Vegetables", "Meat").

---

## Why these decisions?

### Node.js instead of PHP
Docker makes the difference between PHP and Node.js irrelevant for hosting.
Node.js was chosen for better async support (job queue, AI API calls) and a
more modern ecosystem. No framework overhead — plain Express.js.

### SQLite instead of MariaDB/PostgreSQL
Single-user app for home use. SQLite needs no separate database server;
the entire system runs in a single Docker container. The database file lives
at `/data/haushaltsbuch.db` and is persisted as a Docker volume.
Migration to PostgreSQL is possible by swapping `better-sqlite3` for `pg` and adapting queries.

### AI providers and model selection
Three providers are supported. The active provider is set via `AI_PROVIDER` (env or UI):

| Provider | Default model | Notes |
|---|---|---|
| **Gemini** (default) | `gemini-2.5-flash` | Best price/performance for receipt OCR. |
| **Claude** | `claude-haiku-4-5-20251001` | Anthropic fallback. |
| **OpenAI** | `gpt-5-mini` | Fast and cheap for simple receipts. |

Model selection: `env` > `settings` DB > hardcoded default. Each provider has its own model setting
(`GEMINI_MODEL`, `CLAUDE_MODEL`, `OPENAI_MODEL`) so switching providers doesn't reset the model choice.

The settings UI shows a 🔒 badge when a key comes from `.env` — the key value is never exposed to the frontend.

### Asynchronous AI processing (2 phases)
OCR and categorization do NOT run synchronously on upload. Reasons:
- Mobile network can be slow → immediate feedback is important
- AI calls take 2–10 seconds → would block UX
- Categorization can be re-run independently (e.g. after adding new categories)

**Phase 1 (immediate):** Save file → receipt placeholder in DB → job in queue → HTTP 202 response
**Phase 2 (worker, every 10s):** OCR job → populate receipt → categorization job → categorize items

The worker runs in the same Node.js process via `setInterval`. No external message broker (Redis etc.)
since that would be unnecessary complexity for a single-user app.

### Flat categories with group
Categories are a flat list (no tree structure, no FK), but have an optional
`group_name` text field for display grouping in charts. Reason: a two-level FK structure
would make AI assignment harder and is barely needed for reporting.
The group is a display label only, not an entity.

Categories are fine-grained at product level: "Wine", "Vegetables", "Cleaning supplies" —
NOT abstract like "Groceries" or "Household". This enables meaningful reporting.

### AI categorization with fixed list
The categorization prompt always passes the current category list from the DB to the AI.
The AI may ONLY choose from these categories. Reason: prevents category sprawl
and ensures that reports remain comparable over time.

### AI sum validation
After OCR: sum of extracted items is compared to the total on the receipt.
If the sum deviates by more than 2% → visual warning in the receipt detail view.
Reason: hallucinated numbers in AI output would be the worst possible outcome
for a finance app.

### Multi-tenancy
The user lives and shops in two countries (Germany + Spain). All data is
assigned to a tenant. This allows spending to be compared per country.
Tenants share global categories (tenant_id = NULL) but can also have their own.

### EUR only
All amounts are stored in EUR. No currency conversion, no currency field
on line items. Reason: simplicity. The user shops in both countries with EUR.

### Distroless Docker image (multi-stage build)
The final Docker image is based on `gcr.io/distroless/nodejs22-debian13` instead of Alpine.
Reason: no shell, no package manager, no unnecessary binaries → minimal attack surface
and clean CVE scanning signal. Multi-stage build: Stage 1 (`node:22-slim`) installs
dependencies and compiles native modules (better-sqlite3); Stage 2 (distroless) copies
`node_modules/`, `package.json`, `src/` and `public/`. `.dockerignore` excludes `.env`,
`Dockerfile`, `node_modules` and `data/` from the build context.
**Important:** Since distroless has no shell, CMD must always use vector form: `["src/server.js"]`.
Cross-platform builds (M1/M2 → amd64): `docker buildx build --platform linux/amd64 .`

### PWA with offline queue
The app must be usable from a smartphone, even with a poor connection.
Photos are saved in IndexedDB when offline and automatically uploaded
once a connection is available. The app shell (HTML/CSS/JS) is fully
cached (cache-first); API calls use network-first.

### PWA icons
- `public/icons/icon.svg` — master icon (blue gradient, receipt with bar chart, star badge)
- `public/icons/icon-maskable.svg` — Android adaptive icon variant; all content within the
  40% safe-zone radius (r ≤ 204.8 px from center for 512×512)
- PNGs are generated via `scripts/generate-icons.mjs` (uses `sharp`)
- `manifest.json` has separate entries for `"purpose": "any"` and `"purpose": "maskable"`
- `index.html` references `apple-touch-icon.png` (180×180) for iOS home screen

### Category migration and reset
On server start, `migrateKategorien()` in `db.js` detects outdated category names and
replaces them with the current 41-entry seed list. If a migration ran, the server
automatically calls `recategorizeAll()` for all tenants so orphaned items get new
categories assigned by AI. Manually corrected items (`manually_corrected = 1`) are preserved.

A "Reset categories" button in the settings UI calls `POST /api/categories/reset`, which
deletes all global categories, re-seeds the defaults and queues all receipts for
re-categorization.

### App version endpoint
`GET /api/version` returns the version from `package.json`. The service worker uses this
on activation to detect deploys and clear stale caches automatically.

---

## What this app is NOT

- Not a multi-user system (no login, no access control)
- Not a budgeting tool (no limits, no overspending warnings)
- No bank integration (no import of bank statements)
- Not a cloud app (runs locally; data never leaves the server except for AI API calls)

---

## File structure

```
/
├── AGENT.md                   ← this document
├── README.md                  ← installation guide
├── Dockerfile                 # Multi-stage: node:22-slim (build) → distroless (runtime)
├── .dockerignore              # excludes .env, node_modules, data/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
├── scripts/
│   ├── deploy-bump.sh         # bumps patch version + git tag for deploys
│   └── generate-icons.mjs    # SVG → PNG icon generation (uses sharp)
├── docs/
│   ├── haushaltsbuch_prompt.md          # original German spec prompt
│   ├── haushaltsbuch_prompt_EN.md
│   ├── claude-ai-planning-conversation.md   # planning chat (DE)
│   ├── claude-ai-planning-conversation_EN.md
│   ├── claude-ai-planning-conversation.pdf
│   ├── claude-code-development-session.md   # dev session notes (DE)
│   └── claude-code-development-session_EN.md
├── src/
│   ├── server.js              # Express server + worker start + /api/version
│   ├── db.js                  # SQLite init + schema + seed + migrateKategorien + resetGlobaleKategorien
│   ├── worker.js              # Job queue worker (setInterval) + recategorizeAll
│   ├── routes/
│   │   ├── receipts.js
│   │   ├── categories.js      # includes POST /reset
│   │   ├── tenants.js
│   │   ├── stats.js
│   │   ├── export.js
│   │   └── settings.js
│   └── services/
│       ├── ai.js              # Gemini/Claude/OpenAI wrapper (shared interface)
│       └── export.js          # CSV + XLSX
└── public/
    ├── index.html
    ├── manifest.json          # separate any/maskable icon entries
    ├── sw.js                  # Service Worker (cache-first shell, network-first API)
    ├── css/app.css
    ├── js/
    │   ├── app.js             # Router + init
    │   ├── api.js             # fetch wrapper
    │   ├── offline.js         # IndexedDB upload queue
    │   ├── charts.js          # Canvas chart rendering (expandable legend)
    │   └── views/
    │       ├── dashboard.js
    │       ├── capture.js
    │       ├── receipts.js
    │       ├── receipt-detail.js
    │       └── settings.js    # cache-clear button + category reset button
    └── icons/
        ├── icon.svg / icon-192.png / icon-512.png
        ├── icon-maskable.svg / icon-maskable-192.png / icon-maskable-512.png
        └── apple-touch-icon.png  (180×180, iOS only)
```

---

## Environment variables (.env)

| Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `gemini`, `claude` or `openai` | `gemini` |
| `GEMINI_API_KEY` | Google AI Studio API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `GEMINI_MODEL` | Override Gemini model | `gemini-2.5-flash` |
| `CLAUDE_MODEL` | Override Claude model | `claude-haiku-4-5-20251001` |
| `OPENAI_MODEL` | Override OpenAI model | `gpt-5-mini` |
| `PORT` | HTTP port | `3000` |
| `TZ` | Timezone | `Europe/Berlin` |
| `UPLOAD_MAX_MB` | Max upload file size | `25` |
| `WORKER_INTERVAL_SEC` | Worker polling interval | `10` |

API keys and model selection can alternatively be configured in the app (settings page)
and are then stored in the SQLite `settings` table. `.env` always takes precedence.
Keys set via `.env` are shown as 🔒 in the UI but never exposed as values.

---

## AI prompts

### OCR prompt
Image is passed as base64. Response must be valid JSON, no markdown.
Item descriptions are translated to German.
Required fields: `store_name`, `receipt_date`, `receipt_type`, `total_amount`, `items[]`.

### Categorization prompt
No image. Text only. The current category names are passed as a JSON array.
The AI may ONLY use names from this list. If the AI returns an unknown
category name → fallback to "Sonstiges" (miscellaneous).

---

## Known limitations

- HEIC files: no native Node.js support — send directly to Gemini (natively supported) or convert with `sharp`.
- Multi-page PDFs: only the first page is processed (sufficient for receipts).
- Offline categorization: if offline, only the file is saved. AI runs once back online.
