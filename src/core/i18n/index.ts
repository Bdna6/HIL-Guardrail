/**
 * Locale loading (spec §28): `locales/<lang>/common.json`, English fallback,
 * `{param}` interpolation. No user-facing string is hardcoded anywhere else.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Lang } from '../config.js';
import { AVAILABLE_LANGS } from '../config.js';

export type Dictionary = Record<string, string>;

function localeRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'locales'), // dist/i18n → dist/locales
    join(here, '..', '..', 'locales'), // dist/core/i18n → dist/locales
    join(here, '..', '..', '..', 'locales'), // src/core/i18n → <root>/locales
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0] as string;
}

const cache = new Map<Lang, Dictionary>();

function loadDict(lang: Lang): Dictionary {
  const cached = cache.get(lang);
  if (cached) return cached;
  const dict: Dictionary = {};
  if (lang !== 'en') Object.assign(dict, loadDict('en')); // fallback
  try {
    const file = join(localeRoot(), lang, 'common.json');
    Object.assign(dict, JSON.parse(readFileSync(file, 'utf8')) as Dictionary);
  } catch {
    // missing locale → fallback only
  }
  cache.set(lang, dict);
  return dict;
}

export function availableLangs(): readonly Lang[] {
  return AVAILABLE_LANGS;
}

export function t(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let value = loadDict(lang)[key] ?? loadDict('en')[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

/** All keys of a locale (for parity tests). */
export function localeKeys(lang: Lang): string[] {
  return Object.keys(loadDict(lang)).sort();
}
