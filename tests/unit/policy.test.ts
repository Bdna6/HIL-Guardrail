import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/core/config';
import type { EntityIntroduction } from '../../src/core/events/types';
import { evaluateIntroductions } from '../../src/core/intervention/policy';
import { isLowInformation, newSessionState, recordHumanInput } from '../../src/core/state/session';
import type { ResolvedTrust } from '../../src/core/trust/entities';

function intro(
  entityId: string,
  category: EntityIntroduction['category'] = 'external_service',
): EntityIntroduction {
  return {
    entityId,
    displayName: entityId.split(':').pop() ?? entityId,
    category,
    via: 'install',
    detail: 'npm i',
  };
}

const UNKNOWN: ResolvedTrust = { status: 'unknown', scope: 'default' };

function ctx(overrides: Partial<Parameters<typeof evaluateIntroductions>[1]> = {}) {
  const state = newSessionState('s', 0);
  return {
    state,
    config: { ...DEFAULT_CONFIG },
    resolveTrust: () => UNKNOWN,
    now: 0,
    ...overrides,
  };
}

describe('intervention policy', () => {
  it('unknown entity triggers one ask', () => {
    const c = ctx();
    const outcome = evaluateIntroductions([intro('svc:supabase')], c);
    expect(outcome.type).toBe('ask');
  });

  it('trusted and reviewed never fire', () => {
    for (const status of ['trusted', 'reviewed'] as const) {
      const c = ctx({ resolveTrust: () => ({ status, scope: 'global' }) });
      expect(evaluateIntroductions([intro('svc:supabase')], c).type, status).toBe('none');
    }
  });

  it('cooldown silences the same category but not others', () => {
    const c = ctx();
    evaluateIntroductions([intro('svc:supabase', 'external_service')], c);
    const second = evaluateIntroductions([intro('svc:stripe', 'external_service')], c);
    expect(second.type).toBe('none');
    const other = evaluateIntroductions([intro('svc:mongodb', 'database')], c);
    expect(other.type).toBe('ask');
  });

  it('per-entity once: an allowed entity never re-asks this session', () => {
    const c = ctx();
    evaluateIntroductions([intro('svc:supabase')], c);
    // simulate PostToolUse resolution (user allowed)
    c.state.decidedEntities.push('svc:supabase');
    c.state.cooldowns = {};
    expect(evaluateIntroductions([intro('svc:supabase')], c).type).toBe('none');
  });

  it('session mute silences everything', () => {
    const c = ctx();
    c.state.muted.session = true;
    expect(evaluateIntroductions([intro('svc:supabase')], c).type).toBe('none');
  });

  it('config-level category mute', () => {
    const c = ctx({ config: { ...DEFAULT_CONFIG, mutedCategories: ['external_service'] } });
    expect(evaluateIntroductions([intro('svc:supabase')], c).type).toBe('none');
  });

  it('multiple askables merge into a single ask', () => {
    const c = ctx();
    const outcome = evaluateIntroductions(
      [intro('svc:supabase'), intro('npm:left-pad', 'library'), intro('svc:stripe')],
      c,
    );
    expect(outcome.type).toBe('ask');
    if (outcome.type === 'ask') expect(outcome.askables).toHaveLength(3);
    expect(c.state.interventionHistory).toHaveLength(1);
  });

  it('agent decisions are recorded even when silent', () => {
    const c = ctx({ resolveTrust: () => ({ status: 'trusted', scope: 'global' }) });
    evaluateIntroductions([intro('svc:supabase')], c);
    expect(c.state.decisions.filter((d) => d.owner === 'agent')).toHaveLength(1);
  });

  it('empty input → none', () => {
    expect(evaluateIntroductions([], ctx()).type).toBe('none');
  });
});

describe('low-information input detection (recorded for M4)', () => {
  it('recognizes low-information approvals in both languages', () => {
    for (const prompt of [
      'ok',
      'OK.',
      'yes',
      'go ahead',
      'continue',
      'looks good',
      '好的',
      '继续',
      '看起来不错',
      '嗯嗯',
      '没问题',
    ]) {
      expect(isLowInformation(prompt), prompt).toBe(true);
    }
  });

  it('does not flag substantive input', () => {
    for (const prompt of [
      'Use PostgreSQL instead of MongoDB, we lose data with the latter',
      'Change the auth to JWT and keep sessions for 30 days',
    ]) {
      expect(isLowInformation(prompt), prompt).toBe(false);
    }
  });

  it('records input classes in state', () => {
    const state = newSessionState('s', 0);
    recordHumanInput(state, 'ok', 1);
    recordHumanInput(state, 'Please use FastAPI with PostgreSQL and JWT auth for the API', 2);
    expect(state.humanInputs[0]?.lowInformation).toBe(true);
    expect(state.humanInputs[1]?.lowInformation).toBe(false);
    expect(state.taskContext.startsWith('Please use FastAPI')).toBe(true);
  });
});
