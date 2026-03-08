# Task: Develop a self-hosted household budget PWA for receipt capture

## Project Goal

A Progressive Web App (PWA) for capturing shopping receipts, fuel receipts, and restaurant bills as a personal household budget tracker with AI-assisted text recognition. The app runs entirely in Docker and is usable from a smartphone.

---

## Tech Stack

- **Backend:** Node.js 22 (LTS) with Express.js
- **Database:** SQLite via `better-sqlite3` (synchronous, no ORM), file at `/data/haushaltsbuch.db`
- **Frontend:** Vanilla JavaScript (ES Modules) + HTML5 + CSS3 — no framework, no build tools, no bundlers
- **PWA:** Service Worker + Web App Manifest
- **AI:** Gemini 2.5 Flash (primary, `@google/generative-ai` SDK) · Claude Haiku 4.5 as fallback (`@anthropic-ai/sdk`) — selectable via `.env`
- **Background processing:** Simple job queue in SQLite (no external message broker)
- **Export:** `xlsx` npm package for Excel, native CSV
- **Deployment:** Single Docker container, `docker-compose.yml` included

---

## Database Schema

```sql
-- Tenants (e.g. "Germany", "Spain")
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories (tenant_id NULL = global for all tenants)
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',  -- Hex color for charts
  icon TEXT                       -- Emoji, e.g. "🛒"
);

-- Receipt headers
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  receipt_date DATE NOT NULL,
  store_name TEXT,
  receipt_type TEXT NOT NULL CHECK(receipt_type IN ('itemized','fuel','restaurant','other')),
  total_amount REAL NOT NULL,    -- Total amount, always present
  notes TEXT,
  image_path TEXT,               -- Path to original upload (relative to /data/uploads/)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Line items (only for receipt_type = 'itemized')
CREATE TABLE receipt_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  manually_corrected INTEGER DEFAULT 0
);

-- Background job queue for AI processing
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,            -- 'ocr' | 'categorize'
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
  payload TEXT NOT NULL,         -- JSON
  result TEXT,                   -- JSON result from AI
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Default categories** are seeded on first start (global, tenant_id = NULL).

Categories are flat (single level) but fine-grained. For analytics there is an optional `group` column used only for display/grouping in charts, not a separate FK:

```sql
ALTER TABLE categories ADD COLUMN group_name TEXT; -- e.g. "Food", "Drinks", "Household"
```

| Name | Group | Icon | Color |
|---|---|---|---|
| Vegetables | Food | 🥦 | #4CAF50 |
| Fruit | Food | 🍎 | #8BC34A |
| Meat & Fish | Food | 🥩 | #F44336 |
| Dairy | Food | 🧀 | #FFF9C4 |
| Butter & Oils | Food | 🧈 | #FFC107 |
| Bread & Bakery | Food | 🍞 | #FF9800 |
| Frozen food | Food | 🧊 | #B3E5FC |
| Canned & dry goods | Food | 🥫 | #A1887F |
| Spices & sauces | Food | 🧂 | #FFCC02 |
| Sweets & snacks | Food | 🍫 | #E91E63 |
| Water & soft drinks | Drinks | 💧 | #03A9F4 |
| Juices | Drinks | 🍊 | #FF9800 |
| Lemonade | Drinks | 🥤 | #F06292 |
| Beer | Drinks | 🍺 | #FFC107 |
| Wine | Drinks | 🍷 | #880E4F |
| Sparkling wine | Drinks | 🥂 | #CE93D8 |
| Spirits | Drinks | 🥃 | #6D4C41 |
| Coffee & tea | Drinks | ☕ | #795548 |
| Cleaning products | Household | 🧹 | #26C6DA |
| Laundry detergent | Household | 🫧 | #4DD0E1 |
| Kitchen supplies | Household | 🍳 | #FF7043 |
| Household goods | Household | 🏠 | #78909C |
| Personal care | Drugstore | 🧴 | #AB47BC |
| Medicine | Drugstore | 💊 | #EC407A |
| Hygiene products | Drugstore | 🪥 | #7E57C2 |
| Pet food | Miscellaneous | 🐾 | #66BB6A |
| Clothing | Miscellaneous | 👕 | #42A5F5 |
| Electronics | Miscellaneous | 💻 | #607D8B |
| Fuel station | Mobility | ⛽ | #546E7A |
| Restaurant | Dining out | 🍽️ | #EF5350 |
| Café & bakery | Dining out | ☕ | #8D6E63 |
| Miscellaneous | Miscellaneous | 📦 | #9E9E9E |

**Important for AI categorization:** The categorization prompt always passes the current category list from the DB (name + group) to the AI. This way categorization works even when the user adds custom categories.

**Category management in frontend (Settings):**
- List of all categories, grouped by `group_name`
- Create new category: name, group (freetext or pick from existing), emoji, color (color picker)
- Edit/delete existing (delete only if no items assigned, otherwise warning + option "Move all items of this category → Miscellaneous")

---

## Core Concept: Asynchronous AI Processing (2 phases)

AI processing does **not** run synchronously on upload. Instead:

### Phase 1: Upload & Save (immediate, <1s)
1. User photographs/uploads a receipt
2. File is saved on server (`/data/uploads/`)
3. A `receipt` record is created with `receipt_type = 'other'`, `total_amount = 0` (placeholder)
4. A job of type `ocr` is created in the `jobs` table
5. Frontend immediately gets a success response: "Receipt saved, processing…"

### Phase 2: AI Processing (background worker)
A Node.js worker (same process, `setInterval` every 10 seconds) checks the job queue:

**OCR job** (`type: 'ocr'`):
- Sends the image/PDF to AI API
- Parses the structured JSON response
- Updates the `receipt` record + creates `receipt_items`
- Sets all items initially without category (`category_id = NULL`)
- Automatically creates a `categorize` job afterwards

**Categorization job** (`type: 'categorize'`):
- Sends all uncategorized item descriptions for a receipt as a list to AI
- Prompt passes the **available categories** as a JSON array so the AI can only choose from these
- Updates `category_id` for each item
- Validation: if AI item sum deviates from `total_amount` by more than 2% → set flag, notify user

**Why separate?**
- OCR and categorization can be re-run independently (e.g. after adding new categories)
- Categorization can also be triggered manually for multiple receipts at once ("Re-categorize all uncategorized items")

### AI Prompts

**OCR prompt** (image passed as base64):
```
Analyze this receipt image. Extract all data and return ONLY valid JSON, no markdown.

{
  "store_name": "string or null",
  "receipt_date": "YYYY-MM-DD or null",
  "receipt_type": "itemized | fuel | restaurant | other",
  "total_amount": number,
  "items": [
    {
      "description": "string (translate to German if not already)",
      "quantity": number,
      "unit_price": number,
      "total_price": number
    }
  ]
}

Rules:
- For fuel/restaurant receipts, items array can be empty
- All amounts in EUR
- Translate item descriptions to German
- If total_amount cannot be determined, use sum of items
```

**Categorization prompt** (no image, text only):
```
Assign categories to these receipt items. Use ONLY the provided category names.
Return ONLY valid JSON array, no markdown.

Categories: {JSON array of category names}

Items to categorize:
{JSON array of descriptions}

Return: [{"description": "...", "category": "..."}]
Each item must be assigned exactly one category from the list.
```

---

## API Endpoints (Express.js)

```
POST   /api/upload              – Upload file, create job, immediate response
GET    /api/receipts            – List (filter: tenant_id, from, to, type, category_id, search)
GET    /api/receipts/:id        – Single receipt with items
PUT    /api/receipts/:id        – Edit receipt (header + items)
DELETE /api/receipts/:id        – Delete receipt
POST   /api/receipts            – Create receipt manually (without upload)

GET    /api/jobs                – Current job queue (for status display in frontend)
POST   /api/jobs/retry/:id      – Restart a failed job
POST   /api/jobs/recategorize   – Re-categorize all items for a tenant (body: {tenant_id})

GET    /api/categories          – All categories (global + tenant)
POST   /api/categories          – Create category
PUT    /api/categories/:id      – Edit category
DELETE /api/categories/:id      – Delete category

GET    /api/tenants             – All tenants
POST   /api/tenants             – Create tenant
PUT    /api/tenants/:id         – Edit tenant

GET    /api/stats?tenant_id=&from=&to=  – Analytics data
GET    /api/export/csv?tenant_id=&from=&to=    – CSV download
GET    /api/export/xlsx?tenant_id=&from=&to=   – Excel download

GET    /api/settings            – Settings
POST   /api/settings            – Save settings

GET    /api/image/:filename     – Retrieve original image
```

---

## Frontend Structure (Single Page App)

**Navigation (bottom bar on mobile):**
- 📊 Overview (Dashboard)
- ➕ Capture (main CTA)
- 🧾 Receipts (list)
- ⚙️ Settings

**Views:**

### Dashboard
- Current month: total spending for the active tenant
- Pie chart: spending by category
- Bar chart: last 6 months comparison
- Badge "X receipts being processed" when jobs pending → click opens job status overlay

### Capture
3 tabs:
1. **Photo/PDF** – camera button + file upload → immediate upload → "Processing" toast
2. **Quick** – for fuel/restaurant: date, type, amount, category, note
3. **Manual** – full form with dynamic line item list

### Receipt List
- Sorted by date (newest first)
- Search field (store name, item description)
- Filters: tenant, category, type, date range
- Each entry shows: date, store, amount, type icon, status (pending/done/error)
- Click → detail view with all items, original image (if available), edit button

### Settings
- Manage tenants (CRUD)
- Manage categories (CRUD, color + emoji selectable)
- Select AI provider (Gemini / Claude)
- Enter API keys (stored in DB, not hardcoded in .env)
- "Re-categorize all uncategorized items" button

---

## PWA Requirements

- `manifest.json`: name="Haushaltsbuch", display=standalone, theme_color=#1976D2
- Icons: 192×192 and 512×512 (generated as SVG, converted to PNG via Canvas)
- **Service Worker** (Cache-First for app shell):
  - Cached: index.html, CSS, JS, icons
  - Network-First: all `/api/` calls
  - **Offline upload queue**: photos taken offline are stored in IndexedDB and automatically uploaded when online (sync via `navigator.onLine` + `online` event)
- "Add to Homescreen" prompt shown after 3rd visit

**Camera integration (smartphone):**
```html
<input type="file" accept="image/*,application/pdf" capture="environment" id="camera-input">
```
Automatically start upload directly after file selection (no extra submit button).

---

## UI/UX

- **Language:** German throughout
- **Design:** Mobile-first, dark/light mode via `prefers-color-scheme`
- **Touch-optimized:** Buttons minimum 48px, no hover-only
- **Loading indicator:** Animated spinner + text "Saving receipt…" on upload
- **Job status:** Small pulsing animation (badge) in dashboard while AI is working
- **Toast notifications:** 3 seconds, top right: success (green), error (red), info (blue)
- **Receipt card in list:** Shows red warning banner if AI total deviates >2% from actual total
- **Image viewer:** Tap on thumbnail opens original fullscreen (pinch-to-zoom)

---

## Configuration (.env)

```env
# AI provider: "gemini" or "claude"
AI_PROVIDER=gemini

GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# App
PORT=3000
NODE_ENV=production
TZ=Europe/Berlin
UPLOAD_MAX_MB=25

# Job worker interval in seconds
WORKER_INTERVAL_SEC=10
```

*Note: API keys can alternatively be set on the app's settings page and are then stored in the SQLite DB (table `settings`). `.env` takes precedence.*

---

## Docker

**Dockerfile:**
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN mkdir -p /data/uploads
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "src/server.js"]
```

**docker-compose.yml:**
```yaml
services:
  haushaltsbuch:
    build: .
    ports:
      - "8080:3000"
    volumes:
      - ./data:/data
    env_file:
      - .env
    restart: unless-stopped
```

---

## Project Structure

```
/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── src/
│   ├── server.js          # Express server + worker start
│   ├── db.js              # SQLite connection + schema init
│   ├── worker.js          # Job queue worker (setInterval)
│   ├── routes/
│   │   ├── receipts.js
│   │   ├── categories.js
│   │   ├── tenants.js
│   │   ├── stats.js
│   │   ├── export.js
│   │   └── settings.js
│   └── services/
│       ├── ai.js          # Gemini/Claude wrapper (shared interface)
│       └── export.js      # CSV + XLSX generation
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js
    ├── css/
    │   └── app.css
    ├── js/
    │   ├── app.js         # Router + init + service worker registration
    │   ├── api.js         # fetch wrapper with error handling
    │   ├── offline.js     # IndexedDB upload queue
    │   ├── charts.js      # Chart.js wrapper
    │   └── views/
    │       ├── dashboard.js
    │       ├── capture.js
    │       ├── receipts.js
    │       ├── receipt-detail.js
    │       └── settings.js
    └── icons/
        ├── icon-192.png
        └── icon-512.png
```

---

## Security & Quality

- No login (single-user, runs on local network behind router)
- File upload: only `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`
- Maximum file size: configurable via `.env`
- SQLite file is in `/data/`, not in `/public/`
- API keys are kept server-side, never sent to the frontend
- Inputs are validated server-side (express-validator or manually)
- Errors in the worker are logged and the job is set to `failed` – never silent crash

---

## Deliverable

Complete, runnable code. After `docker-compose up --build` the app should be accessible at `http://localhost:8080`. On first access a setup wizard appears (create first tenant). All code comments in German.

**Required:** First create an `AGENT.md` in the project root with the content from the separate AGENT.md document. Claude Code reads this file automatically as persistent context.
