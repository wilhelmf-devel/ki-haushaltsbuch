# Claude AI – Planning Conversation

*Initial planning conversation on claude.ai, conducted before building the app with Claude Code.*
*Shows how requirements were progressively refined and turned into a structured prompt.*

---

## 👤 User

I'd like an app where I can record all my shopping receipts.
Every individual line item should be captured with quantity, unit price, and description.
Each line should also be assigned a category.
Fuel receipts and restaurant bills should also be recordable, where only the total amount needs to be captured.
It should be a kind of household budget book where I can see what I'm spending money on.

Receipts can be in different languages – mostly German or Spanish. I want to be able to compare costs across countries, but that's secondary since it can easily be solved by separating into two tenants or similar.

The app should be self-hosted – either as a small PHP app or in a Docker container.
It should be a Progressive Web App, since I want to use it from my phone.
I'd like to be able to simply take a photo of the receipt. I also need the ability to upload PDFs.
Finally – this doesn't need to work on mobile – I need the ability to manually correct or enter items.

My approach would be:
1. We should have a shared understanding of what I'm looking for
2. You should check whether apps like this already exist
3. If not, we go into more technical detail and define everything precisely enough that you can give me a good prompt for Claude Code or Codex
4. Claude Code and/or Codex build the app for me :-)

---

## 🤖 Claude

That sounds like a very practical project! I've understood your requirements well. Let me briefly summarise what you're envisioning:

**What you need: A personal household budget tracker as a PWA**

- **Core function:** Capture shopping receipts with individual line items (quantity, unit price, description, category), plus simplified capture for fuel/restaurant receipts (total amount + category only).
- **Photo/upload:** Take a photo of the receipt from your phone → automatic extraction of line items (via AI/OCR). PDF upload also supported.
- **Multi-language:** Receipts in German and Spanish, with the ability to compare expenses by country (via tenants or tags).
- **Editing:** Manual entry and correction of records (primarily on desktop).
- **Hosting:** Self-hosted, either as a PHP app or Docker container.
- **Analytics:** Overview of spending by category, time period, and optionally country.

Before going deeper into the technical side – let me quickly check whether ready-made self-hosted solutions exist that cover this.

*[Web search performed]*

**Research Results**

There are similar tools out there – but none matches your exact use case:

- **Receipt Wrangler** comes closest: self-hosted, AI-powered receipt management with OCR/AI scanning, smart categorization, and multi-user support. However, the key requirements are missing: no per-line-item capture (it records the total receipt, not individual items with quantity × price × category), no country comparison, and setup is relatively complex.
- **BudgetLens** is an open-source receipt scanner with Django/Docker that uses OpenAI for image recognition. But: cloud-dependent, no real line-item categorization.
- **Firefly III** is a full self-hosted finance manager with Docker, multi-currency, categories, and REST API – but no photo scanning and no line-item logic.

**Conclusion:** There is no ready-made solution that covers all your requirements – particularly the per-line capture with quantity/price/category per item + photo scanning + country comparison + PWA in one package.

**Recommendation: Build a custom app ✅**

Makes sense. Shall we move on to step 3?

---

## 👤 User

> Q: Which AI API do you want to use for photo/PDF scanning?

I have access to both the OpenAI APIs and the Claude APIs. Would need to check what makes the most sense right now.

> Q: How should the app be technically structured?

Whatever makes the most sense. Backend MariaDB or SQLite. Probably SQLite.

> Q: Which analytics are important to you?

CSV/Excel export, spending by category (pie/bar charts).

---

## 🤖 Claude

**AI API Recommendation: Claude Sonnet as primary, GPT-4o as fallback**

Claude has a lower hallucination rate for OCR, which matters more than raw speed for receipt capture – invented prices would be catastrophic. For structure-preserving tasks like JSON output from documents, Claude follows instructions more reliably. Additionally, data is not used for training by default – good for private financial data.

*The initial prompt (v1) was created as an artifact.*

---

## 👤 User

If it runs in Docker I don't care whether it's PHP or not. Use whatever makes the most sense.

Are you aware that GPT-4o has been obsolete for a long time? Maybe do a quick search on which current models make sense and are as cost-efficient as possible for this use case. But you're right, invented numbers would be bad. We can check at the end whether the totals match up.

Currency will always be EUR.

OCR and categorization don't need to be real-time. It's enough if the PWA saves the photo or PDF on the server first. Then the image can be processed later, and once the whole receipt is captured (or multiple receipts), the categories can be assigned – assuming it makes sense to separate those two steps.

Maybe we provide the categories upfront, so we can make meaningful reports later.

---

## 🤖 Claude

*[Web search on current AI models performed]*

**AI Model Recommendation (as of March 2026)**

For our use case – asynchronous receipt processing, no real-time requirement:

| Role | Model | Rationale |
|---|---|---|
| **Primary** | Gemini 2.5 Flash | Google's "best price-performance model", native multimodality. Price: $0.30/1M input, $2.50/1M output – 5–10× cheaper than Claude Sonnet or GPT-4o. |
| **Fallback** | Claude Haiku 4.5 | Designed for fast, cost-efficient throughput. Cheaper than Sonnet, but with Claude's low hallucination rate. |

GPT-4o is indeed outdated – the current relevant OpenAI models would be GPT-4o-mini or GPT-5, but for this use case Gemini Flash is significantly cheaper.

**Asynchronous 2-phase processing:**
- Phase 1: Save photo/PDF immediately → user gets instant feedback
- Phase 2: Background worker: OCR → then separate categorization pass

**Sum validation:** If the AI result deviates more than 2% from the total amount → notify the user.

*The updated prompt (v2) was created as an artifact.*

---

## 👤 User

For categories, I'm thinking more along the lines of: vegetables, fruit, butter, soft drinks, juices, beer, wine, spirits, spices, baked goods, cleaning products, etc.

---

## 🤖 Claude

That makes a lot of sense – you want real product categories rather than abstract spending categories. Then you can later actually see "how much am I spending on wine" or "what does meat cost me per month".

> Q: Category structure: one or two levels?

**One level, but fine-grained** (just "wine", "fruit"…) – the cleanest solution. A flat list, fine-grained – the AI assigns "wine" directly.

> Q: Categories for non-shopping receipts (fuel, restaurant)?

**Their own category** (fuel station, restaurant).

> Q: Should categories be editable/extensible?

**Yes** – `group_name` column as a display label only (no separate foreign key), no second table. Keeps the data structure simple. The AI always pulls the current category list from the DB → works even when you add new categories later.

*The final prompt (v3) was created as an artifact.*

---

## 👤 User

We should make sure there is a README or AGENT.md that precisely describes what we want and why.

---

## 🤖 Claude

Good point – an AGENT.md is particularly important with Claude Code because Claude reads it automatically and uses it as persistent context. This prevents decisions from being forgotten or made incorrectly in longer sessions or continuations.

**AGENT.md serves three functions simultaneously:**

1. **For Claude Code:** Read automatically as persistent context. Claude Code immediately knows all decisions – why SQLite, why no GPT-4o, why asynchronous processing, what the app deliberately does not do.
2. **For you:** If you want to change something in 6 months, the "why" is right there.
3. **As guardrails:** The "What this app is NOT" section prevents Claude Code from adding feature creep.

*The final prompt (v4) with AGENT.md instructions was created as an artifact. The app was then built with Claude Code – documented in `claude-code-development-session.md`.*
