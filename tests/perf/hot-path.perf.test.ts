/**
 * Hot-path budget (docs/04 §7): the deterministic pipeline must stay far from
 * Claude Code's hook timeout. Pure-function timing here (process startup is
 * bounded by Node itself); CI runners get a generous multiplier.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import { evaluateIntroductions } from '../../src/core/intervention/policy';
import { extractFromCommand } from '../../src/core/signals/commands';
import { extractSignals } from '../../src/core/signals/index';
import { newSessionState } from '../../src/core/state/session';

const CORPUS = [
  'npm install supabase && pip install pymongo',
  'cd app && npx create-next-app@latest . --yes || echo failed',
  'npm test',
  'docker pull ghcr.io/org/app:latest',
  'git commit -m "fix: handle empty input" && git push origin main',
  'curl -s https://api.github.com/repos/openai/codex/releases | jq .[0].tag',
  'FOO=1 sudo npm install -D vitest @vitest/coverage-v8',
];

describe('hot-path performance budget', () => {
  it('extract + policy for 200 events stays under 200ms total', () => {
    const state = newSessionState('perf', 0);
    const ctx = {
      state,
      config: DEFAULT_CONFIG,
      resolveTrust: () => ({ status: 'unknown', scope: 'default' as const }),
      now: 0,
    };
    const start = performance.now();
    for (let round = 0; round < 200; round++) {
      for (const command of CORPUS) {
        const introductions = extractFromCommand(command);
        evaluateIntroductions(introductions, ctx);
      }
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('extractSignals across tool shapes is sub-millisecond on average', () => {
    const inputs: Array<[string, Record<string, unknown>]> = [
      ['Bash', { command: CORPUS[0] }],
      ['Write', { file_path: '/x/package.json', content: '{"dependencies":{"next":"^15"}}' }],
      ['mcp__github__create_issue', {}],
      ['Read', { file_path: '/x' }],
    ];
    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      for (const [tool, input] of inputs) extractSignals(tool, input);
    }
    const elapsed = performance.now() - start;
    expect(elapsed / (500 * inputs.length)).toBeLessThan(1);
  });
});
