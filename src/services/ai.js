// KI-Service: Gemini / Claude / OpenAI Wrapper mit gemeinsamem Interface
'use strict';

const fs = require('fs');
const path = require('path');

// API-Keys aus DB laden (env hat Vorrang)
function getApiKeys() {
  try {
    const db = require('../db');
    const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return {
      gemini: process.env.GEMINI_API_KEY || get('gemini_api_key')?.value || null,
      claude: process.env.ANTHROPIC_API_KEY || get('anthropic_api_key')?.value || null,
      openai: process.env.OPENAI_API_KEY || get('openai_api_key')?.value || null,
    };
  } catch {
    return {
      gemini: process.env.GEMINI_API_KEY || null,
      claude: process.env.ANTHROPIC_API_KEY || null,
      openai: process.env.OPENAI_API_KEY || null,
    };
  }
}

// Ausgewähltes Modell pro Provider (env > DB > default)
function getModels() {
  try {
    const db = require('../db');
    const get = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return {
      gemini: process.env.GEMINI_MODEL || get('gemini_model')?.value || 'gemini-2.5-flash',
      claude: process.env.CLAUDE_MODEL  || get('claude_model')?.value  || 'claude-haiku-4-5-20251001',
      openai: process.env.OPENAI_MODEL  || get('openai_model')?.value  || 'gpt-5.4-mini',
    };
  } catch {
    return {
      gemini: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      claude: process.env.CLAUDE_MODEL  || 'claude-haiku-4-5-20251001',
      openai: process.env.OPENAI_MODEL  || 'gpt-5.4-mini',
    };
  }
}

function getProvider() {
  try {
    const db = require('../db');
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'ai_provider'").get();
    return process.env.AI_PROVIDER || setting?.value || 'gemini';
  } catch {
    return process.env.AI_PROVIDER || 'gemini';
  }
}

// OCR: Bild analysieren und strukturierten JSON zurückgeben
async function ocr(imagePath) {
  const provider = getProvider();
  const keys = getApiKeys();
  const models = getModels();

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
    return await ocrMitClaude(keys.claude, models.claude, base64, mimeType, prompt);
  } else if (provider === 'openai' && keys.openai) {
    return await ocrMitOpenAI(keys.openai, models.openai, base64, mimeType, prompt);
  } else if (keys.gemini) {
    return await ocrMitGemini(keys.gemini, models.gemini, base64, mimeType, prompt);
  } else {
    throw new Error('Kein KI-API-Key konfiguriert. Bitte in den Einstellungen eintragen.');
  }
}

async function ocrMitGemini(apiKey, model, base64, mimeType, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const result = await genModel.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } },
  ]);

  const text = result.response.text();
  return parseJsonAntwort(text);
}

async function ocrMitClaude(apiKey, model, base64, mimeType, prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = response.content[0].text;
  return parseJsonAntwort(text);
}

async function ocrMitOpenAI(apiKey, model, base64, mimeType, prompt) {
  const OpenAI = require('openai');
  const client = new OpenAI.default({ apiKey });

  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = response.choices[0].message.content;
  return parseJsonAntwort(text);
}

// Kategorisierung: Items einer Kategorie aus der vorhandenen Liste zuordnen
async function kategorisiere(items, kategorien) {
  const provider = getProvider();
  const keys = getApiKeys();
  const models = getModels();

  const prompt = `Assign categories to these receipt items. Use ONLY the provided category names.
Return ONLY valid JSON array, no markdown.

Categories: ${JSON.stringify(kategorien.map(k => k.name))}

Items to categorize:
${JSON.stringify(items)}

Return: [{"description": "...", "category": "..."}]
Each item must be assigned exactly one category from the list.`;

  if (provider === 'claude' && keys.claude) {
    return await kategorisiereMitClaude(keys.claude, models.claude, prompt);
  } else if (provider === 'openai' && keys.openai) {
    return await kategorisiereMitOpenAI(keys.openai, models.openai, prompt);
  } else if (keys.gemini) {
    return await kategorisiereMitGemini(keys.gemini, models.gemini, prompt);
  } else {
    throw new Error('Kein KI-API-Key konfiguriert.');
  }
}

async function kategorisiereMitGemini(apiKey, model, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ model });

  const result = await genModel.generateContent(prompt);
  const text = result.response.text();
  return parseJsonAntwort(text);
}

async function kategorisiereMitClaude(apiKey, model, prompt) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  return parseJsonAntwort(text);
}

async function kategorisiereMitOpenAI(apiKey, model, prompt) {
  const OpenAI = require('openai');
  const client = new OpenAI.default({ apiKey });

  const response = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0].message.content;
  return parseJsonAntwort(text);
}

// JSON aus KI-Antwort extrahieren (entfernt mögliche Markdown-Codeblöcke)
function parseJsonAntwort(text) {
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
