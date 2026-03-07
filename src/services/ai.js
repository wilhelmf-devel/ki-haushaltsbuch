// KI-Service: Gemini/Claude Wrapper mit gemeinsamem Interface
'use strict';

const fs = require('fs');
const path = require('path');

// API-Keys aus DB laden (Fallback auf env)
function getApiKeys() {
  try {
    const db = require('../db');
    const geminiKey = db.prepare("SELECT value FROM settings WHERE key = 'gemini_api_key'").get();
    const claudeKey = db.prepare("SELECT value FROM settings WHERE key = 'anthropic_api_key'").get();
    return {
      gemini: process.env.GEMINI_API_KEY || (geminiKey ? geminiKey.value : null),
      claude: process.env.ANTHROPIC_API_KEY || (claudeKey ? claudeKey.value : null),
    };
  } catch {
    return {
      gemini: process.env.GEMINI_API_KEY || null,
      claude: process.env.ANTHROPIC_API_KEY || null,
    };
  }
}

function getProvider() {
  try {
    const db = require('../db');
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get();
    return process.env.AI_PROVIDER || (setting ? setting.value : 'gemini');
  } catch {
    return process.env.AI_PROVIDER || 'gemini';
  }
}

// OCR: Bild analysieren und strukturierten JSON zurückgeben
async function ocr(imagePath) {
  const provider = getProvider();
  const keys = getApiKeys();

  const bildData = fs.readFileSync(imagePath);
  const base64 = bildData.toString('base64');
  const mimeType = ermittleMimeType(imagePath);

  const prompt = `Analyze this receipt image. Extract all data and return ONLY valid JSON, no markdown.

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
- If total_amount cannot be determined, use sum of items`;

  if (provider === 'claude' && keys.claude) {
    return await ocrMitClaude(keys.claude, base64, mimeType, prompt);
  } else if (keys.gemini) {
    return await ocrMitGemini(keys.gemini, base64, mimeType, prompt);
  } else {
    throw new Error('Kein KI-API-Key konfiguriert. Bitte in den Einstellungen eintragen.');
  }
}

async function ocrMitGemini(apiKey, base64, mimeType, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } },
  ]);

  const text = result.response.text();
  return parseJsonAntwort(text);
}

async function ocrMitClaude(apiKey, base64, mimeType, prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0].text;
  return parseJsonAntwort(text);
}

// Kategorisierung: Items einer Kategorie aus der vorhandenen Liste zuordnen
async function kategorisiere(items, kategorien) {
  const provider = getProvider();
  const keys = getApiKeys();

  const prompt = `Assign categories to these receipt items. Use ONLY the provided category names.
Return ONLY valid JSON array, no markdown.

Categories: ${JSON.stringify(kategorien.map(k => k.name))}

Items to categorize:
${JSON.stringify(items)}

Return: [{"description": "...", "category": "..."}]
Each item must be assigned exactly one category from the list.`;

  if (provider === 'claude' && keys.claude) {
    return await kategorisiereMitClaude(keys.claude, prompt);
  } else if (keys.gemini) {
    return await kategorisiereMitGemini(keys.gemini, prompt);
  } else {
    throw new Error('Kein KI-API-Key konfiguriert.');
  }
}

async function kategorisiereMitGemini(apiKey, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseJsonAntwort(text);
}

async function kategorisiereMitClaude(apiKey, prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  return parseJsonAntwort(text);
}

// JSON aus KI-Antwort extrahieren (entfernt mögliche Markdown-Codeblöcke)
function parseJsonAntwort(text) {
  // Markdown-Codeblöcke entfernen
  let bereinigt = text.trim();
  bereinigt = bereinigt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(bereinigt);
}

function ermittleMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const typen = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.pdf': 'application/pdf',
  };
  return typen[ext] || 'image/jpeg';
}

module.exports = { ocr, kategorisiere };
