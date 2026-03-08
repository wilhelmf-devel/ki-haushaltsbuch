# Claude AI – Planungskonversation

*Initiales Planungsgespräch auf claude.ai vor dem eigentlichen Bau der App mit Claude Code.*
*Zeigt wie Anforderungen schrittweise präzisiert und in einen strukturierten Prompt überführt wurden.*

---

## 👤 User

Ich hätte gerne eine App mit der ich alle meine Einkaufsrechnungen erfassen kann.
Jeder einzelne Posten soll mit Menge, Einzelpreis, Beschreibung erfasst werden.
Dann soll jeder dieser Zeilen auch eine Kategorie zugewiesen werden.
Ebenso sollten hier Tank- und Restaurantrechnungen mit erfasst werden, wobei hier jeweils nur der Gesamtbetrag aufgenommen werden muss.
Es soll eine Art Haushaltsbuch werden, mit der ich sehen kann wofür ich wie viel Geld ausgebe.

Die Rechnungen können in unterschiedlichen Sprachen sein. Meist Deutsch oder Spanisch. Ich will hier meine Kosten in den unterschiedlichen Ländern vergleichen können, das ist aber nebensächlich da man das einfach durch Trennen in zwei Tenants oder ähnlich lösen kann.

Die Anwendung soll selbst gehostet werden. Entweder als kleine PHP-App oder in einem Docker-Container.
Es sollte eine Progressive Web App sein, da ich sie vom Handy aus bedienen möchte.
Hier möchte ich die Möglichkeit haben einfach ein Foto von der Rechnung zu machen. Ich brauche aber die Möglichkeit PDFs hochzuladen.
Schließlich – das muss aber nicht am Handy funktionieren – brauche ich die Möglichkeit händisch Einträge zu korrigieren oder vorzunehmen.

Meine Vorgehensweise wäre jetzt wie folgt:
1. Wir sollten ein gemeinsames Verständnis davon haben was ich suche
2. Du solltest überprüfen ob es solche Apps bereits gibt
3. Falls nicht gehen wir etwas mehr ins technische Detail und definieren alles so genau, sodass Du mir einen guten Prompt für Claude Code oder Codex geben kannst.
4. Claude Code und/oder Codex bauen mir die App :-)

---

## 🤖 Claude

Das klingt nach einem sehr praktischen Projekt! Ich habe deine Anforderungen gut verstanden. Lass mich kurz zusammenfassen, was du dir vorstellst:

**Was du brauchst: Ein persönliches Haushaltsbuch als PWA**

- **Kernfunktion:** Erfassung von Einkaufsrechnungen mit einzelnen Positionen (Menge, Einzelpreis, Beschreibung, Kategorie) sowie vereinfachte Erfassung für Tank- und Restaurantrechnungen (nur Gesamtbetrag + Kategorie).
- **Foto/Upload:** Vom Handy ein Foto der Rechnung machen → automatische Erkennung der Positionen (via KI/OCR). PDF-Upload ebenfalls möglich.
- **Mehrsprachigkeit:** Rechnungen auf Deutsch und Spanisch, mit der Möglichkeit Ausgaben nach Land/Region zu vergleichen (über Mandanten oder Tags).
- **Bearbeitung:** Manuelles Erfassen und Korrigieren von Einträgen (primär am Desktop).
- **Hosting:** Self-hosted, entweder als PHP-App oder Docker-Container.
- **Auswertung:** Übersicht, wofür wie viel Geld ausgegeben wird (nach Kategorie, Zeitraum, evtl. Land).

Bevor wir tiefer ins Technische gehen – lass mich kurz recherchieren, ob es bereits fertige Self-hosted Lösungen gibt, die das abdecken.

*[Web-Suche durchgeführt]*

**Ergebnis der Recherche**

Es gibt durchaus ähnliche Tools – keines trifft aber exakt deinen Use Case:

- **Receipt Wrangler** kommt am nächsten: Self-hosted, AI-gestütztes Receipt-Management mit OCR/KI-Scan, Smart Categorization und Multi-User-Support. Allerdings fehlen die zentralen Punkte: keine Einzelposten-Erfassung pro Zeile (es erfasst den Gesamtbon, nicht einzelne Artikel mit Menge × Preis × Kategorie), kein Ländervergleich, und das Setup ist relativ komplex.
- **BudgetLens** ist ein Open-Source Receipt-Scanner mit Django/Docker, der OpenAI für Bilderkennung nutzt. Aber: Cloud-abhängig, keine echte Einzelposten-Kategorisierung.
- **Firefly III** ist ein vollständiger Self-hosted Finanzmanager mit Docker, Multi-Currency, Kategorien und REST API – aber ohne Foto-Scan und ohne Einzelposten-Logik.

**Fazit:** Es gibt keine fertige Lösung, die all deine Anforderungen abdeckt – insbesondere die zeilenweise Erfassung mit Menge/Preis/Kategorie pro Artikel + FotoScan + Ländervergleich + PWA in einem Package.

**Empfehlung: Eigene App bauen ✅**

Das macht Sinn. Sollen wir jetzt zu Schritt 3 übergehen?

---

## 👤 User

> Q: Welche KI-API möchtest du für den Foto/PDF-Scan verwenden?

Mir stehen die OpenAI APIs als auch die Claude APIs zur Verfügung. Hier müsste man prüfen was aktuell am sinnvollsten ist.

> Q: Wie soll die App technisch aufgebaut sein?

Was am sinnvollsten ist. Backend MariaDB oder SQLite. Wahrscheinlich SQLite.

> Q: Welche Auswertungen sind dir wichtig?

Export als CSV/Excel, Ausgaben nach Kategorie (Kuchen/Balken).

---

## 🤖 Claude

**KI-API Empfehlung: Claude Sonnet als primär, GPT-4o als Fallback**

Claude hat bei OCR eine niedrigere Halluzinationsrate, was für Rechnungserfassung wichtiger ist als rohe Geschwindigkeit – erfundene Preise wären fatal. Bei strukturerhaltenden Aufgaben wie JSON-Ausgabe aus Dokumenten folgt Claude Anweisungen zuverlässiger. Außerdem werden Daten standardmäßig nicht für Training verwendet – gut für private Finanzdaten.

*Der initiale Prompt (v1) wurde als Artefakt erstellt.*

---

## 👤 User

Wenn es in Docker läuft ist mir es egal ob es PHP ist oder nicht. Hier das sinnvollste verwenden.

Ist Dir bewusst dass GPT-4o schon lange obsolete ist? Vielleicht hier kurz mal eine Recherche machen welche Modelle sinnvoll sind und für den Anwendungsfall möglichst kosteneffizient. Aber richtig, erfundene Zahlen wären schlecht. Man kann am Schluss noch mal nachprüfen ob die Summe übereinstimmt.

Currency wird immer EUR sein.

Das OCR und die Kategorisierung müssen nicht realtime sein. Reicht wenn die PWA das Foto erstmal erfasst oder die PDF und auf dem Server speichert. Dann kann später das Image verarbeitet werden und dann später wenn die ganze Rechnung erfasst ist können die Kategorien zugeordnet werden, sofern es Sinn macht die zwei Dinge zu trennen.

Ggf. gibt man die Kategorien vor, damit man nachher sinnvolle Auswertungen machen kann.

---

## 🤖 Claude

*[Web-Suche zu aktuellen KI-Modellen durchgeführt]*

**KI-Modell Empfehlung (Stand März 2026)**

Für unseren Use Case – asynchrone Rechnungsverarbeitung, kein Realtime-Zwang:

| Rolle | Modell | Begründung |
|---|---|---|
| **Primär** | Gemini 2.5 Flash | Googles "bestes Modell in Sachen Preis-Leistung", native Multimodalität. Preis: $0.30/1M Input, $2.50/1M Output – 5–10× günstiger als Claude Sonnet oder GPT-4o. |
| **Fallback** | Claude Haiku 4.5 | Auf schnellen, kosteneffizienten Durchsatz ausgelegt. Günstiger als Sonnet, aber mit Claude's niedriger Halluzinationsrate. |

GPT-4o ist tatsächlich veraltet – die aktuellen relevanten OpenAI-Modelle wären GPT-4o-mini oder GPT-5, aber bei diesem Use Case schlägt Gemini Flash sie preislich deutlich.

**Asynchrone 2-Phasen-Verarbeitung:**
- Phase 1: Foto/PDF sofort speichern → Nutzer bekommt direkt Rückmeldung
- Phase 2: Worker im Hintergrund: OCR → danach separat Kategorisierung

**Summen-Validierung:** Weicht KI-Ergebnis mehr als 2% vom Gesamtbetrag ab → Nutzer wird informiert.

*Der aktualisierte Prompt (v2) wurde als Artefakt erstellt.*

---

## 👤 User

Bei den Kategorien wäre es mehr so wie: Gemüse, Obst, Butter, Limonaden, Säfte, Bier, Wein, Spirituosen, Gewürze, Brotwaren, Reinigungsmittel etc.

---

## 🤖 Claude

Das macht sehr viel Sinn – du willst echte Produktkategorien statt abstrakte Ausgaben-Kategorien. Dann kannst du später wirklich sehen "was gebe ich für Wein aus" oder "wie viel kostet mich Fleisch pro Monat".

> Q: Kategorie-Struktur: Eine oder zwei Ebenen?

**Eine Ebene, aber feingranular** (nur Wein, Obst…) — die sauberste Lösung. Eine flache Liste, feingranular – die KI ordnet direkt "Wein" zu.

> Q: Kategorien für nicht-Einkaufsrechnungen (Tank, Restaurant)?

**Eigene Hauptkategorie** (Tankstelle, Restaurant).

> Q: Sollen die Kategorien editierbar/erweiterbar sein?

**Ja** – `group_name`-Spalte nur als Anzeigelabel (kein eigener Fremdschlüssel), keine zweite Tabelle. Hält die Datenstruktur einfach. Die KI zieht immer die aktuelle Kategorienliste aus der DB → funktioniert auch wenn du später neue Kategorien hinzufügst.

*Der finale Prompt (v3) wurde als Artefakt erstellt.*

---

## 👤 User

Wir sollten sicherstellen, dass eine README oder AGENT.md vorhanden ist, die genau beschreibt was wir warum wollen.

---

## 🤖 Claude

Guter Punkt – eine AGENT.md ist bei Claude Code besonders wichtig, weil Claude sie automatisch liest und als dauerhaften Kontext nutzt. Das verhindert, dass bei längeren Sessions oder Fortsetzungen Entscheidungen vergessen oder falsch getroffen werden.

**Die AGENT.md erfüllt drei Funktionen gleichzeitig:**

1. **Für Claude Code:** Wird automatisch als persistenter Kontext gelesen. Claude Code kennt sofort alle Entscheidungen – warum SQLite, warum kein GPT-4o, warum asynchrone Verarbeitung, was die App bewusst nicht kann.
2. **Für dich:** Falls du in 6 Monaten etwas ändern willst, steht das "Warum" direkt dabei.
3. **Als Leitplanke:** Der Abschnitt "Was diese App NICHT ist" verhindert, dass Claude Code Feature-Creep betreibt.

*Der finale Prompt (v4) mit AGENT.md-Anweisung wurde als Artefakt erstellt. Danach wurde die App mit Claude Code gebaut – dokumentiert in `claude-code-development-session.md`.*
