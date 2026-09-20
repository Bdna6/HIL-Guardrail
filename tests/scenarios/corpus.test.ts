/**
 * Scenario corpus (docs/07 §2.3): the heart of the false-positive strategy.
 * Each scenario replays an event sequence through the real engine with an
 * isolated HIL home and asserts the exact intervention count.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { processEvent } from '../../src/core/engine';
import type { CoreEvent } from '../../src/core/events/types';
import { resolvePaths } from '../../src/core/paths';

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'hil-scen-home-'));
  project = mkdtempSync(join(tmpdir(), 'hil-scen-proj-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

let clock = 1_000_000;
const now = () => (clock += 1);

async function replay(events: CoreEvent[], config = DEFAULT_CONFIG) {
  const paths = resolvePaths(project, { HIL_HOME: home });
  const outcomes: string[] = [];
  for (const event of events) {
    const result = await processEvent(event, { paths, config, now });
    if (result.outcome.type === 'ask')
      outcomes.push(result.outcome.askables.map((a) => a.introduction.entityId).join('+'));
  }
  return outcomes;
}

const session = 'scen-1';
const S = { kind: 'session_start', sessionId: session, cwd: '.', at: 0 } as const;
const E = { kind: 'session_end', sessionId: session, at: 0 } as const;
const user = (prompt: string): CoreEvent => ({
  kind: 'user_input',
  sessionId: session,
  prompt,
  at: 0,
});
const bash = (command: string, id?: string): CoreEvent => ({
  kind: 'tool_start',
  sessionId: session,
  toolName: 'Bash',
  toolInput: { command },
  toolUseId: id,
  at: 0,
});
const turn = (): CoreEvent => ({ kind: 'turn_end', sessionId: session, at: 0 });

const ROUTINE_COMMANDS = [
  'npm test',
  'npm run lint',
  'npx vitest run tests/unit',
  'git status',
  'git diff --stat',
  'pytest -q tests/',
  'ruff check src',
  'node --version',
  'ls -la src',
  'cat package.json',
  'mkdir -p dist && npm run build',
  'curl -s https://api.github.com/rate_limit',
  'echo done',
];

describe('scenario corpus', () => {
  it('routine autonomous work: 30 tool calls, zero interventions', async () => {
    const events: CoreEvent[] = [S, user('Fix the failing test in utils')];
    for (let i = 0; i < 30; i++) {
      events.push(bash(ROUTINE_COMMANDS[i % ROUTINE_COMMANDS.length] ?? 'ls', `t${i}`));
      events.push(turn());
    }
    events.push(E);
    expect(await replay(events)).toEqual([]);
  });

  it('§8 flagship: agent builds a web app with unreviewed stack → exactly one merged ask, then silence', async () => {
    const events: CoreEvent[] = [
      S,
      user('Build a web application for tracking reading lists.'),
      {
        kind: 'tool_start',
        sessionId: session,
        toolName: 'Write',
        toolInput: {
          file_path: join(project, 'package.json'),
          content: JSON.stringify({
            dependencies: { next: '^15', react: '^19', '@supabase/supabase-js': '^2' },
          }),
        },
        toolUseId: 'w1',
        at: 0,
      },
      bash('npm install', 't1'),
      bash('npx create-next-app app --yes', 't2'),
      {
        kind: 'tool_start',
        sessionId: session,
        toolName: 'Write',
        toolInput: {
          file_path: join(project, '.env.local'),
          content: 'SUPABASE_URL=x\nSTRIPE_KEY=y\n',
        },
        toolUseId: 'w2',
        at: 0,
      },
      bash('npm install stripe @supabase/supabase-js', 't3'),
      turn(),
      user('looks good, continue'),
      bash('supabase init', 't4'),
      turn(),
      E,
    ];
    const asks = await replay(events);
    expect(asks).toHaveLength(1);
    expect(asks[0]).toContain('svc:supabase');
    expect(asks[0]).toContain('svc:next.js');
  });

  it('trusted stack: long streak with everything in the boundary → zero interventions', async () => {
    mkdirSync(join(home), { recursive: true });
    writeFileSync(
      join(home, 'trust-boundary.yaml'),
      [
        'version: 1',
        'tools:',
        '  - name: React',
        '    category: library',
        '  - name: Next.js',
        '    category: library',
        '  - name: PostgreSQL',
        '    category: database',
        '  - name: FastAPI',
        '    category: library',
      ].join('\n'),
      'utf8',
    );
    const events: CoreEvent[] = [S, user('Ship the reading list app')];
    for (let i = 0; i < 12; i++) {
      events.push(bash(`npm install react${i === 0 ? '' : ''} --no-save`, `t${i}`));
      events.push(turn());
    }
    events.push(bash('pip install fastapi psycopg2'));
    events.push(bash('docker pull postgres'));
    events.push(E);
    expect(await replay(events)).toEqual([]);
  });

  it('after hil trust add: the same crossing stays silent for the session', async () => {
    const paths = resolvePaths(project, { HIL_HOME: home });
    await processEvent(S, { paths, config: DEFAULT_CONFIG, now });
    const first = await processEvent(bash('npm install supabase', 't1'), {
      paths,
      config: DEFAULT_CONFIG,
      now,
    });
    expect(first.outcome.type).toBe('ask');

    // session-scope trust grant (what /hil trust add --scope session does)
    const statePath = join(home, 'state', `${session}.json`);
    const state = JSON.parse((await import('node:fs')).readFileSync(statePath, 'utf8'));
    state.temporaryTrust.push({ id: 'svc:supabase', status: 'trusted' });
    (await import('node:fs')).writeFileSync(statePath, JSON.stringify(state));

    const second = await processEvent(bash('npm install supabase', 't2'), {
      paths,
      config: DEFAULT_CONFIG,
      now,
    });
    expect(second.outcome.type).toBe('none');
  });

  it('muted session: zero interventions despite crossings', async () => {
    const events: CoreEvent[] = [
      S,
      user('Build it'),
      bash('npm install supabase', 't1'),
      bash('pip install pymongo', 't2'),
      bash('docker pull redis', 't3'),
      E,
    ];
    expect(await replay(events, { ...DEFAULT_CONFIG, mutedAll: true })).toEqual([]);
  });

  it('§16 drift inputs are recorded but produce zero v0.1 prompts (M4 boundary)', async () => {
    const events: CoreEvent[] = [S, user('Make the app better')];
    for (const reply of ['ok', 'continue', 'go ahead', 'looks good', '好的', '继续']) {
      events.push(user(reply));
      events.push(bash('npm install some-random-pkg-xyz'));
      events.push(turn());
    }
    // note: some-random-pkg-xyz IS a crossing (library category, one ask);
    // the drift pattern itself adds nothing in v0.1 — assert exactly one ask
    const asks = await replay(events);
    expect(asks).toHaveLength(1);
  });

  it('§17 scope expansion anchors are recorded, not interrupted (M4 boundary)', async () => {
    const events: CoreEvent[] = [
      S,
      user('Fix the login bug'),
      bash('cd auth && npm test', 't1'),
      {
        kind: 'tool_start',
        sessionId: session,
        toolName: 'Write',
        toolInput: {
          file_path: join(project, 'migrations', '001.sql'),
          content: 'ALTER TABLE users...',
        },
        toolUseId: 'w1',
        at: 0,
      },
      bash('terraform validate', 't2'),
      E,
    ];
    expect(await replay(events)).toEqual([]);
  });
});
