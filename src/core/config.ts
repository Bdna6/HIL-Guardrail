/**
 * Runtime configuration. Authoring surface is YAML (`~/.hil/config.yaml`,
 * `.hil/config.yaml` — project wins); the hot path reads the compiled cache
 * (`cache/config.json`) and only falls back to compilation when stale.
 */
import type { Category } from './trust/entities.js';

export type Lang = 'en' | 'zh-CN';

export const AVAILABLE_LANGS: readonly Lang[] = ['en', 'zh-CN'];

export interface HilConfig {
  language: Lang;
  cooldownMinutes: number;
  mutedAll: boolean;
  mutedCategories: Category[];
  semanticEnabled: boolean;
}

export const DEFAULT_CONFIG: HilConfig = {
  language: 'en',
  cooldownMinutes: 15,
  mutedAll: false,
  mutedCategories: [],
  semanticEnabled: false,
};

export function normalizeLang(value: string | undefined): Lang {
  if (value === 'zh-CN' || value === 'zh-cn' || value === 'zh') return 'zh-CN';
  return 'en';
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh-CN';
}

/** Shape of the compiled config cache. */
export interface CompiledConfig extends HilConfig {
  updatedAt: number;
}
