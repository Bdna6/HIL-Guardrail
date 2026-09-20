import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePaths } from '../../src/core/paths';
import { catalogLookup, normalizeEntity } from '../../src/core/trust/entities';
import { buildIndex, resolve } from '../../src/core/trust/resolve';
import { compileCaches, readTrustSnapshot } from '../../src/core/trust/store';
import { closeDb, listTools, openDb, upsertTool } from '../../src/db/db';

describe('entity normalization', () => {
  it('unifies ecosystem variants through the catalog', () => {
    expect(normalizeEntity('pg', 'npm').id).toBe('svc:postgresql');
    expect(normalizeEntity('psycopg2', 'pypi').id).toBe('svc:postgresql');
    expect(normalizeEntity('postgres', 'docker').id).toBe('svc:postgresql');
    expect(normalizeEntity('wrangler', undefined).id).toBe('svc:cloudflare');
    expect(normalizeEntity('@supabase/supabase-js', 'npm').id).toBe('svc:supabase');
  });

  it('scopes unknown packages to their ecosystem', () => {
    const n = normalizeEntity('left-pad', 'npm');
    expect(n.id).toBe('npm:left-pad');
    expect(n.category).toBe('library');
    expect(normalizeEntity('Pkg==1.0', 'pypi').id).toBe('pypi:pkg');
  });

  it('accepts fully-qualified ids (for `hil trust add` matching)', () => {
    expect(normalizeEntity('mcp:github').id).toBe('mcp:github');
    expect(normalizeEntity('svc:supabase').id).toBe('svc:supabase');
    expect(normalizeEntity('mcp:github').category).toBe('plugin_mcp');
  });

  it('strips versions and handles casing', () => {
    expect(normalizeEntity('Stripe', undefined).id).toBe('svc:stripe');
    expect(normalizeEntity('react@19.0.0', 'npm').id).toBe('svc:react');
  });

  it('catalog covers the documented example stack', () => {
    for (const name of [
      'supabase',
      'firebase',
      'mongodb',
      'redis',
      'prisma',
      'next',
      'kubernetes',
    ]) {
      expect(catalogLookup(name)).toBeDefined();
    }
  });
});

describe('scope resolution (session → project → global → unknown)', () => {
  const now = 1_000_000;
  const globalIndex = buildIndex([
    {
      id: 'svc:postgresql',
      name: 'PostgreSQL',
      category: 'database',
      status: 'trusted',
      scope: 'global',
      source: 'config',
    },
  ]);
  const projectIndex = buildIndex([
    {
      id: 'svc:postgresql',
      name: 'PostgreSQL',
      category: 'database',
      status: 'restricted',
      scope: 'project',
      source: 'config',
    },
    {
      id: 'npm:react',
      name: 'react',
      category: 'library',
      status: 'reviewed',
      scope: 'project',
      source: 'config',
    },
  ]);

  it('project overrides global', () => {
    expect(
      resolve(
        'postgres',
        undefined,
        { session: [], project: projectIndex, global: globalIndex },
        now,
      ).status,
    ).toBe('restricted');
  });

  it('session overrides project', () => {
    const r = resolve(
      'postgres',
      undefined,
      {
        session: [{ id: 'svc:postgresql', status: 'trusted' }],
        project: projectIndex,
        global: globalIndex,
      },
      now,
    );
    expect(r.status).toBe('trusted');
    expect(r.scope).toBe('session');
  });

  it('falls through to global when project has no entry', () => {
    expect(
      resolve(
        'psycopg2',
        'pypi',
        { session: [], project: buildIndex([]), global: globalIndex },
        now,
      ).status,
    ).toBe('trusted');
  });

  it('reviewed silences, unknown is the default', () => {
    expect(resolve('react', 'npm', { session: [], project: projectIndex }, now).status).toBe(
      'reviewed',
    );
    expect(resolve('left-pad', 'npm', { session: [] }, now).status).toBe('unknown');
  });

  it('expired temporary falls through', () => {
    const expired = buildIndex([
      {
        id: 'svc:stripe',
        name: 'Stripe',
        category: 'external_service',
        status: 'temporary',
        scope: 'session' as const,
        source: 'config' as const,
        expiresAt: now - 1,
      },
    ]);
    expect(resolve('stripe', undefined, { session: [], project: expired }, now).status).toBe(
      'unknown',
    );
  });

  it('bare-name fallback matches ecosystem signal ids', () => {
    // user ran `hil trust add left-pad` → svc:left-pad; signal is npm:left-pad
    const index = buildIndex([
      {
        id: 'svc:left-pad',
        name: 'left-pad',
        category: 'library',
        status: 'trusted',
        scope: 'global',
        source: 'cli',
      },
    ]);
    expect(resolve('left-pad', 'npm', { session: [], global: index }, now).status).toBe('trusted');
  });
});

describe('store compilation (yaml + sqlite → snapshot)', () => {
  it('merges YAML and DB rows with YAML winning on collisions', async () => {
    const home = mkdtempSync(join(tmpdir(), 'hil-home-'));
    const project = mkdtempSync(join(tmpdir(), 'hil-proj-'));
    mkdirSync(join(home), { recursive: true });
    writeFileSync(
      join(home, 'trust-boundary.yaml'),
      [
        'version: 1',
        'tools:',
        '  - name: PostgreSQL',
        '    category: database',
        '    status: trusted',
        '  - name: obscure-pkg',
        '    ecosystem: pypi',
      ].join('\n'),
      'utf8',
    );

    const dbFile = join(home, 'hil.db');
    const db = openDb(dbFile);
    upsertTool(db, {
      id: 'pypi:obscure-pkg', // same id the YAML entry compiles to → collision
      name: 'obscure-pkg',
      category: 'library',
      trustStatus: 'restricted',
      scope: 'global',
    });
    upsertTool(db, {
      id: 'svc:redis',
      name: 'Redis',
      category: 'database',
      trustStatus: 'reviewed',
      scope: 'global',
    });
    closeDb(db);
    expect(listTools(openDb(dbFile)).length).toBe(2);

    const paths = resolvePaths(project, { HIL_HOME: home });
    const { global } = await compileCaches(paths);
    const ids = global.entities.map((e) => `${e.id}:${e.status}`).sort();
    expect(ids).toContain('svc:postgresql:trusted');
    expect(ids).toContain('svc:redis:reviewed');
    // YAML (explicit human intent) wins over the CLI row on the same id
    expect(ids).toContain('pypi:obscure-pkg:trusted');

    const reread = readTrustSnapshot(paths.globalTrustCache);
    expect(reread?.entities.length).toBe(3);
  });
});
