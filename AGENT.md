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

### Gemini 2.5 Flash as primary AI
Best price-to-performance ratio for OCR on printed text (receipts).
Natively multimodal — no separate OCR step needed. Price: ~$0.30/$2.50 per
million tokens (input/output). Claude Haiku 4.5 is configurable as fallback.
**Never use GPT-4o — outdated and significantly more expensive.**

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
and clean CVE scanning signal. Multi-stage build: Stage 1 (node:22-alpine) installs
dependencies and compiles native modules (better-sqlite3); Stage 2 (distroless) copies
only `node_modules/`, `src/` and `public/`. `.dockerignore` excludes `.env`, `Dockerfile`,
`node_modules` and `data/` from the build context.
**Important:** Since distroless has no shell, CMD must always use vector form: `["src/server.js"]`.
Cross-platform builds (M1/M2 → amd64): `docker buildx build --platform linux/amd64 .`

### PWA with offline queue
The app must be usable from a smartphone, even with a poor connection.
Photos are saved in IndexedDB when offline and automatically uploaded
once a connection is available. The app shell (HTML/CSS/JS) is fully
cached (cache-first); API calls use network-first.

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
├── Dockerfile             # Multi-stage: node:22-alpine (build) → distroless (runtime)
├── .dockerignore          # excludes .env, node_modules, data/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── package.json
├── src/
│   ├── server.js              # Express server + worker start
│   ├── db.js                  # SQLite init + schema + seed categories
│   ├── worker.js              # Job queue worker (setInterval)
│   ├── routes/
│   │   ├── receipts.js
│   │   ├── categories.js
│   │   ├── tenants.js
│   │   ├── stats.js
│   │   ├── export.js
│   │   └── settings.js
│   └── services/
│       ├── ai.js              # Gemini/Claude wrapper (shared interface)
│       └── export.js          # CSV + XLSX
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js                  # Service Worker
    ├── css/app.css
    ├── js/
    │   ├── app.js             # Router + init
    │   ├── api.js             # fetch wrapper
    │   ├── offline.js         # IndexedDB upload queue
    │   ├── charts.js          # Canvas chart rendering
    │   └── views/
    │       ├── dashboard.js
    │       ├── capture.js
    │       ├── receipts.js
    │       ├── receipt-detail.js
    │       └── settings.js
    └── icons/
```

---

## Environment variables (.env)

| Variable | Description | Default |
|---|---|---|
| `AI_PROVIDER` | `gemini` or `claude` | `gemini` |
| `GEMINI_API_KEY` | Google AI Studio API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `PORT` | HTTP port | `3000` |
| `TZ` | Timezone | `Europe/Berlin` |
| `UPLOAD_MAX_MB` | Max upload file size | `25` |
| `WORKER_INTERVAL_SEC` | Worker polling interval | `10` |

API keys can alternatively be set in the app (settings page) and are then
stored in the SQLite `settings` table. `.env` takes precedence.

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
