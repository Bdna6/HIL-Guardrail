import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { localeKeys, t } from '../../src/core/i18n';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('locale parity (en ⇄ zh-CN)', () => {
  it('both locales expose identical key sets', () => {
    const en = JSON.parse(
      readFileSync(join(root, 'locales', 'en', 'common.json'), 'utf8'),
    ) as Record<string, string>;
    const zh = JSON.parse(
      readFileSync(join(root, 'locales', 'zh-CN', 'common.json'), 'utf8'),
    ) as Record<string, string>;
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zh).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('loader reports identical key sets', () => {
    expect(localeKeys('zh-CN')).toEqual(localeKeys('en'));
    expect(localeKeys('en').length).toBeGreaterThan(30);
  });
});

describe('interpolation and fallback', () => {
  it('interpolates params', () => {
    const rendered = t('en', 'cli.trust.added', {
      name: 'PostgreSQL',
      status: 'trusted',
      category: 'database',
      scope: 'global',
    });
    expect(rendered).toContain('PostgreSQL');
    expect(rendered).toContain('trusted');
    expect(rendered).not.toContain('{name}');
  });

  it('zh-CN renders the trust crossing alert', () => {
    const body = t('zh-CN', 'intervention.trustCrossing.body', {
      entities: 'Supabase',
      status: 'unknown',
      first: 'svc:supabase',
    });
    expect(body).toContain('信任边界');
    expect(body).toContain('Supabase');
    expect(body).not.toContain('{entities}');
  });

  it('missing key falls back to the key itself (never crashes)', () => {
    expect(t('en', 'no.such.key')).toBe('no.such.key');
  });

  it('placeholders are consistent across languages', () => {
    const en = JSON.parse(
      readFileSync(join(root, 'locales', 'en', 'common.json'), 'utf8'),
    ) as Record<string, string>;
    const zh = JSON.parse(
      readFileSync(join(root, 'locales', 'zh-CN', 'common.json'), 'utf8'),
    ) as Record<string, string>;
    const paramsOf = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',');
    for (const [key, value] of Object.entries(en)) {
      expect(paramsOf(zh[key] ?? ''), key).toBe(paramsOf(value));
    }
  });
});
