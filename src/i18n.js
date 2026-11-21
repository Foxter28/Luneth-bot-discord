/**
 * Minimal per-user i18n: t(userId, key, params).
 * Master dictionary = en.json; other locales fall back to English per key.
 * ponytail: no pluralization engine — use {n} params ("day(s)") until a locale truly needs it.
 */
const db = require('./database');
const en = require('./locales/en.json');
const id = require('./locales/id.json');

const LOCALES = { en, id };
const cache = new Map(); // userId -> lang, loaded lazily

const LANG_LABELS = { en: '🇬🇧 English', id: '🇮🇩 Bahasa Indonesia' };

function resolve(lang, key, params) {
  let str = LOCALES[lang]?.[key] ?? en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, String(v));
  }
  return str;
}

/** Sync translate using the cached lang (safe before loadUserLang). */
function tSync(userId, key, params) {
  return resolve(cache.get(userId) || 'en', key, params);
}

/** Async translate: ensures the user's lang is loaded, then translates. */
async function t(userId, key, params) {
  if (!cache.has(userId)) {
    const lang = await db.getUserLang(userId);
    cache.set(userId, lang);
  }
  return resolve(cache.get(userId), key, params);
}

/** Number formatting per locale (1,000 vs 1.000). */
function fmtNum(userId, n) {
  return Number(n).toLocaleString(cache.get(userId) === 'id' ? 'id-ID' : 'en-US');
}

async function setUserLang(userId, lang) {
  await db.setUserLang(userId, lang);
  cache.set(userId, lang);
}

module.exports = { t, tSync, fmtNum, setUserLang, LANG_LABELS };
