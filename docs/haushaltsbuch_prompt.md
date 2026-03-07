# Aufgabe: Entwickle eine selbst-gehostete Haushaltsbuch-PWA zur Rechnungserfassung

## Projektziel
Eine Progressive Web App (PWA) zum Erfassen von Einkaufsrechnungen, Tankbelegen und Restaurantrechnungen als persönliches Haushaltsbuch mit KI-gestützter Texterkennung. Die App läuft komplett in Docker und ist vom Smartphone aus bedienbar.

---

## Tech Stack

- **Backend:** Node.js 22 (LTS) mit Express.js
- **Datenbank:** SQLite via `better-sqlite3` (synchron, kein ORM), Datei unter `/data/haushaltsbuch.db`
- **Frontend:** Vanilla JavaScript (ES Modules) + HTML5 + CSS3 — kein Framework, keine Build-Tools, keine Bundler
- **PWA:** Service Worker + Web App Manifest
- **KI:** Gemini 2.5 Flash (primär, `@google/generative-ai` SDK) · Claude Haiku 4.5 als Fallback (`@anthropic-ai/sdk`) — auswählbar per `.env`
- **Hintergrundverarbeitung:** Einfache Job-Queue in SQLite (kein externer Message Broker)
- **Export:** `xlsx` npm-Paket für Excel, natives CSV
- **Deployment:** Einzelner Docker Container, `docker-compose.yml` mitliefern

---

## Datenbankschema

```sql
-- Mandanten (z.B. "Deutschland", "Spanien")
CREATE TABLE tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Kategorien (tenant_id NULL = global für alle Mandanten)
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#888888',  -- Hex-Farbe für Charts
  icon TEXT                       -- Emoji, z.B. "🛒"
);

-- Rechnungsköpfe
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  receipt_date DATE NOT NULL,
  store_name TEXT,
  receipt_type TEXT NOT NULL CHECK(receipt_type IN ('itemized','fuel','restaurant','other')),
  total_amount REAL NOT NULL,    -- Gesamtbetrag, immer vorhanden
  notes TEXT,
  image_path TEXT,               -- Pfad zum Original-Upload (relativ zu /data/uploads/)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Einzelpositionen (nur für receipt_type = 'itemized')
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

-- Hintergrund-Job-Queue für KI-Verarbeitung
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,            -- 'ocr' | 'categorize'
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
  payload TEXT NOT NULL,         -- JSON
  result TEXT,                   -- JSON Ergebnis der KI
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Standard-Kategorien** beim ersten Start anlegen (global, tenant_id = NULL).

Kategorien sind flach (eine Ebene), aber feingranular. Für Auswertungen gibt es eine optionale `group`-Spalte die nur zur Anzeige/Gruppierung in Charts dient, aber kein eigener FK ist:

```sql
ALTER TABLE categories ADD COLUMN group_name TEXT; -- z.B. "Lebensmittel", "Getränke", "Haushalt"
```

| Name | Gruppe | Icon | Farbe |
|---|---|---|---|
| Gemüse | Lebensmittel | 🥦 | #4CAF50 |
| Obst | Lebensmittel | 🍎 | #8BC34A |
| Fleisch & Fisch | Lebensmittel | 🥩 | #F44336 |
| Milchprodukte | Lebensmittel | 🧀 | #FFF9C4 |
| Butter & Öle | Lebensmittel | 🧈 | #FFC107 |
| Brot & Backwaren | Lebensmittel | 🍞 | #FF9800 |
| Tiefkühlkost | Lebensmittel | 🧊 | #B3E5FC |
| Konserven & Trockenware | Lebensmittel | 🥫 | #A1887F |
| Gewürze & Saucen | Lebensmittel | 🧂 | #FFCC02 |
| Süßwaren & Snacks | Lebensmittel | 🍫 | #E91E63 |
| Wasser & Softdrinks | Getränke | 💧 | #03A9F4 |
| Säfte | Getränke | 🍊 | #FF9800 |
| Limonaden | Getränke | 🥤 | #F06292 |
| Bier | Getränke | 🍺 | #FFC107 |
| Wein | Getränke | 🍷 | #880E4F |
| Sekt & Champagner | Getränke | 🥂 | #CE93D8 |
| Spirituosen | Getränke | 🥃 | #6D4C41 |
| Kaffee & Tee | Getränke | ☕ | #795548 |
| Reinigungsmittel | Haushalt | 🧹 | #26C6DA |
| Waschmittel | Haushalt | 🫧 | #4DD0E1 |
| Küchenbedarf | Haushalt | 🍳 | #FF7043 |
| Haushaltswaren | Haushalt | 🏠 | #78909C |
| Körperpflege | Drogerie | 🧴 | #AB47BC |
| Medikamente | Drogerie | 💊 | #EC407A |
| Hygieneartikel | Drogerie | 🪥 | #7E57C2 |
| Tiernahrung | Sonstiges | 🐾 | #66BB6A |
| Kleidung | Sonstiges | 👕 | #42A5F5 |
| Elektronik | Sonstiges | 💻 | #607D8B |
| Tankstelle | Mobilität | ⛽ | #546E7A |
| Restaurant | Ausgehen | 🍽️ | #EF5350 |
| Café & Bäckerei | Ausgehen | ☕ | #8D6E63 |
| Sonstiges | Sonstiges | 📦 | #9E9E9E |

**Wichtig für KI-Kategorisierung:** Der Kategorisierungs-Prompt gibt der KI immer die aktuelle Kategorienliste aus der DB (Name + Gruppe) mit. So funktioniert die Zuordnung auch wenn der Nutzer eigene Kategorien hinzufügt.

**Kategorieverwaltung im Frontend (Einstellungen):**
- Liste aller Kategorien, gruppiert nach `group_name`
- Neue Kategorie anlegen: Name, Gruppe (Freitext oder aus bestehenden wählen), Emoji, Farbe (Color Picker)
- Bestehende editieren / löschen (Löschen nur wenn keine Items zugeordnet sind, sonst Warnung + Option "Alle Items dieser Kategorie → Sonstiges verschieben")

---

## Kernkonzept: Asynchrone KI-Verarbeitung (2-Phasen)

Die KI-Verarbeitung läuft **nicht** synchron beim Upload. Stattdessen:

### Phase 1: Upload & Speichern (sofort, <1s)
1. Nutzer fotografiert/lädt Rechnung hoch
2. Datei wird auf Server gespeichert (`/data/uploads/`)
3. Ein `receipt`-Eintrag wird mit `receipt_type = 'other'`, `total_amount = 0` angelegt (Platzhalter)
4. Ein Job vom Typ `ocr` wird in der `jobs`-Tabelle angelegt
5. Frontend bekommt sofort eine Erfolgsrückmeldung: "Rechnung gespeichert, wird verarbeitet..."

### Phase 2: KI-Verarbeitung (Hintergrund, Worker)
Ein Node.js Worker (gleicher Prozess, `setInterval` alle 10 Sekunden) prüft die Job-Queue und:

**OCR-Job** (`type: 'ocr'`):
- Sendet das Bild/PDF an KI-API
- Parst die strukturierte JSON-Antwort
- Aktualisiert den `receipt`-Datensatz + legt `receipt_items` an
- Setzt alle Items zunächst ohne Kategorie (`category_id = NULL`)
- Legt danach automatisch einen `categorize`-Job an

**Kategorisierungs-Job** (`type: 'categorize'`):
- Sendet alle unkategorisierten Item-Beschreibungen eines Receipts als Liste an KI
- Prompt gibt die **vorhandenen Kategorien** als JSON-Array mit, damit die KI nur aus diesen wählen kann
- Aktualisiert `category_id` für jede Position
- Validierung: Kann KI-Summe der Items von `total_amount` um mehr als 2% ab? → Flag setzen, Nutzer informieren

**Warum getrennt?**
- OCR und Kategorisierung können unabhängig wiederholt werden (z.B. nach Hinzufügen neuer Kategorien)
- Kategorisierung kann auch manuell für mehrere Receipts auf einmal angestoßen werden ("Alle unkategorisierten Positionen neu kategorisieren")

### KI-Prompts

**OCR-Prompt** (Bild wird als base64 mitgegeben):
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

**Kategorisierungs-Prompt** (kein Bild, nur Text):
```
Assign categories to these receipt items. Use ONLY the provided category names.
Return ONLY valid JSON array, no markdown.

Categories: {JSON-Array der Kategorienamen}

Items to categorize:
{JSON-Array der Beschreibungen}

Return: [{"description": "...", "category": "..."}]
Each item must be assigned exactly one category from the list.
```

---

## API-Endpoints (Express.js)

```
POST   /api/upload              – Datei hochladen, Job anlegen, sofortige Antwort
GET    /api/receipts            – Liste (filter: tenant_id, from, to, type, category_id, search)
GET    /api/receipts/:id        – Einzelbeleg mit Items
PUT    /api/receipts/:id        – Beleg editieren (Kopfdaten + Items)
DELETE /api/receipts/:id        – Beleg löschen
POST   /api/receipts            – Beleg manuell anlegen (ohne Upload)

GET    /api/jobs                – Aktuelle Job-Queue (für Statusanzeige im Frontend)
POST   /api/jobs/retry/:id      – Fehlgeschlagenen Job neu starten
POST   /api/jobs/recategorize   – Alle Items eines Tenants neu kategorisieren (body: {tenant_id})

GET    /api/categories          – Alle Kategorien (global + tenant)
POST   /api/categories          – Kategorie anlegen
PUT    /api/categories/:id      – Kategorie bearbeiten
DELETE /api/categories/:id      – Kategorie löschen

GET    /api/tenants             – Alle Mandanten
POST   /api/tenants             – Mandant anlegen
PUT    /api/tenants/:id         – Mandant bearbeiten

GET    /api/stats?tenant_id=&from=&to=  – Auswertungsdaten
GET    /api/export/csv?tenant_id=&from=&to=    – CSV-Download
GET    /api/export/xlsx?tenant_id=&from=&to=   – Excel-Download

GET    /api/settings            – Einstellungen
POST   /api/settings            – Einstellungen speichern

GET    /api/image/:filename     – Originalbild abrufen
```

---

## Frontend-Struktur (Single Page App)

**Navigation (Bottom Bar auf Mobile):**
- 📊 Übersicht (Dashboard)
- ➕ Erfassen (Haupt-CTA)
- 🧾 Belege (Liste)
- ⚙️ Einstellungen

**Views:**

### Dashboard
- Aktueller Monat: Gesamtausgaben des aktiven Mandanten
- Kuchendiagramm: Ausgaben nach Kategorie (Chart.js, kein CDN – inline oder kleines Bundle)
- Balkendiagramm: Letzte 6 Monate im Vergleich
- Badge "X Belege werden verarbeitet" wenn Jobs pending → Klick öffnet Job-Status-Overlay

### Erfassen
3 Tabs:
1. **Foto/PDF** – Kamera-Button + Datei-Upload → sofortiger Upload → "Wird verarbeitet"-Toast
2. **Schnell** – Für Tank/Restaurant: Datum, Typ, Betrag, Kategorie, Notiz
3. **Manuell** – Vollformular mit dynamischer Positionsliste

### Belege-Liste
- Sortiert nach Datum (neueste zuerst)
- Suchfeld (Store-Name, Item-Beschreibung)
- Filter: Mandant, Kategorie, Typ, Zeitraum
- Jeder Eintrag zeigt: Datum, Store, Betrag, Typ-Icon, Status (pending/done/error)
- Klick → Detailansicht mit allen Items, Original-Bild (falls vorhanden), Edit-Button

### Einstellungen
- Mandanten verwalten (CRUD)
- Kategorien verwalten (CRUD, Farbe + Emoji wählbar)
- KI-Anbieter auswählen (Gemini / Claude)
- API-Keys eintragen (werden in DB gespeichert, nicht in .env hardcoded)
- "Alle unkategorisierten Positionen neu kategorisieren"-Button

---

## PWA-Anforderungen

- `manifest.json`: name="Haushaltsbuch", display=standalone, theme_color=#1976D2
- Icons: 192x192 und 512x512 (als SVG generiert, in PNG umgewandelt via Canvas)
- **Service Worker** (Cache-First für App-Shell):
  - Cached: index.html, CSS, JS, Icons
  - Network-First: alle `/api/`-Aufrufe
  - **Offline-Upload-Queue**: Fotos die offline gemacht wurden, in IndexedDB speichern und automatisch senden wenn online (sync über `navigator.onLine` + `online`-Event)
- "Add to Homescreen"-Prompt nach 3. Besuch anzeigen

**Kamera-Integration (Smartphone):**
```html
<input type="file" accept="image/*,application/pdf" capture="environment" id="camera-input">
```
Direkt nach Dateiauswahl automatisch Upload starten (kein extra Submit-Button).

---

## UI/UX

- **Sprache:** Deutsch durchgehend
- **Design:** Mobile-First, Dark/Light Mode via `prefers-color-scheme`
- **Touch-optimiert:** Buttons min. 48px, kein Hover-only
- **Ladeindikator:** Beim Upload ein animierter Spinner + Text "Rechnung wird gespeichert..."
- **Job-Status:** Kleine Pulsier-Animation (Badge) im Dashboard wenn KI noch arbeitet
- **Toast-Notifications:** 3 Sekunden, oben rechts: Erfolg (grün), Fehler (rot), Info (blau)
- **Beleg-Karte in Liste:** Zeigt roten Hinweis-Banner wenn KI-Summe von Gesamtbetrag >2% abweicht
- **Bild-Viewer:** Tap auf Thumbnail öffnet Original in Fullscreen (pinch-to-zoom)

---

## Konfiguration (.env)

```env
# KI-Anbieter: "gemini" oder "claude"
AI_PROVIDER=gemini

GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# App
PORT=3000
NODE_ENV=production
TZ=Europe/Berlin
UPLOAD_MAX_MB=25

# Job Worker Intervall in Sekunden
WORKER_INTERVAL_SEC=10
```

*Hinweis: API-Keys können alternativ in der App-Einstellungsseite gesetzt werden und werden dann in der SQLite-DB gespeichert (Tabelle `settings`). .env hat Vorrang.*

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

## Projektstruktur

```
/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── package.json
├── src/
│   ├── server.js          # Express-Server + Worker-Start
│   ├── db.js              # SQLite-Verbindung + Schema-Init
│   ├── worker.js          # Job-Queue-Worker (setInterval)
│   ├── routes/
│   │   ├── receipts.js
│   │   ├── categories.js
│   │   ├── tenants.js
│   │   ├── stats.js
│   │   ├── export.js
│   │   └── settings.js
│   └── services/
│       ├── ai.js          # Gemini/Claude Wrapper (gemeinsames Interface)
│       └── export.js      # CSV + XLSX Generierung
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js
    ├── css/
    │   └── app.css
    ├── js/
    │   ├── app.js         # Router + Init + ServiceWorker-Registrierung
    │   ├── api.js         # fetch-Wrapper mit Fehlerbehandlung
    │   ├── offline.js     # IndexedDB Upload-Queue
    │   ├── charts.js      # Chart.js Wrapper
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

## Sicherheit & Qualität

- Kein Login (Single-User, läuft im lokalen Netzwerk hinter Router)
- Datei-Upload: Nur `image/jpeg`, `image/png`, `image/heic`, `image/webp`, `application/pdf`
- Max. Dateigröße: konfigurierbar via `.env`
- SQLite-Datei liegt in `/data/`, nicht in `/public/`
- API-Keys werden serverseitig gehalten, nie ans Frontend gesendet
- Eingaben werden serverseitig validiert (express-validator oder manuell)
- Fehler im Worker werden geloggt und der Job auf `failed` gesetzt – nie stiller Absturz

---

## Lieferbares

Vollständiger, lauffähiger Code. Nach `docker-compose up --build` soll die App unter `http://localhost:8080` erreichbar sein. Beim ersten Aufruf erscheint ein Setup-Assistent (ersten Mandanten anlegen). Alle Kommentare im Code auf Deutsch.

**Zwingend erforderlich:** Erstelle als erstes eine `AGENT.md` im Projektwurzel mit dem Inhalt aus dem separaten AGENT.md-Dokument (siehe unten). Claude Code liest diese Datei automatisch als persistenten Kontext.
