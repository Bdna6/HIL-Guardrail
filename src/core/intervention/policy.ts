/**
 * Intervention policy (spec §18–§21): silent by default; ask only on
 * deterministic trust-boundary crossings; cooldowns, per-entity-once and mute
 * guard against nagging. v0.1 has a single high-importance level (`ask`) —
 * informational/attention levels arrive with the semantic layer (M4).
 */

import type { HilConfig } from '../config.js';
import type { EntityIntroduction } from '../events/types.js';
import type { SessionState } from '../state/session.js';
import { hasDecided, isCategoryInCooldown, setCooldown } from '../state/session.js';
import type { Category, ResolvedTrust } from '../trust/entities.js';

export type Outcome = { type: 'none' } | { type: 'ask'; askables: Askable[] };

export interface Askable {
  introduction: EntityIntroduction;
  trust: ResolvedTrust;
}

export interface PolicyContext {
  state: SessionState;
  config: HilConfig;
  resolveTrust: (introduction: EntityIntroduction) => ResolvedTrust;
  now: number;
  /** Tool identity of the current event, for pending-crossing bookkeeping. */
  toolName?: string;
  toolUseId?: string;
}

function isMuted(category: Category, ctx: PolicyContext): boolean {
  if (ctx.state.muted.session) return true;
  if (ctx.state.muted.categories.includes(category)) return true;
  if (ctx.config.mutedAll) return true;
  if (ctx.config.mutedCategories.includes(category)) return true;
  return false;
}

/**
 * Evaluate introductions for this event. Trust status decides everything:
 * `trusted`/`reviewed` (and unexpired `temporary`) never fire; `unknown` and
 * `restricted` fire once per entity per session, bounded by category cooldown.
 */
export function evaluateIntroductions(
  introductions: EntityIntroduction[],
  ctx: PolicyContext,
): Outcome {
  if (introductions.length === 0) return { type: 'none' };

  const seen = new Set<string>();
  const askables: Askable[] = [];

  for (const introduction of introductions) {
    if (seen.has(introduction.entityId)) continue;
    seen.add(introduction.entityId);

    // Record the agent decision regardless of outcome (state, not judgment)
    ctx.state.decisions.push({
      at: ctx.now,
      owner: 'agent',
      category: introduction.category,
      entityId: introduction.entityId,
      summary:
        `agent introduces ${introduction.displayName} (${introduction.via}): ${introduction.detail}`.slice(
          0,
          300,
        ),
    });

    if (isMuted(introduction.category, ctx)) continue;
    if (hasDecided(ctx.state, introduction.entityId)) continue;

    const trust = ctx.resolveTrust(introduction);
    if (trust.status === 'trusted' || trust.status === 'reviewed') continue;
    if (trust.status === 'temporary') continue; // unexpired (resolve skips expired)

    if (isCategoryInCooldown(ctx.state, introduction.category, ctx.now)) continue;
    askables.push({ introduction, trust });
  }

  if (askables.length === 0) return { type: 'none' };

  // restricted first, then unknown — the strongest case leads the prompt
  askables.sort(
    (a, b) =>
      (a.trust.status === 'restricted' ? -1 : 0) - (b.trust.status === 'restricted' ? -1 : 0),
  );

  const categories = [...new Set(askables.map((a) => a.introduction.category))];
  const cooldownUntil = ctx.now + ctx.config.cooldownMinutes * 60_000;
  for (const category of categories) setCooldown(ctx.state, category, cooldownUntil);

  ctx.state.interventionHistory.push({
    at: ctx.now,
    level: 'high',
    category: categories[0] ?? 'library',
    entityIds: askables.map((a) => a.introduction.entityId),
  });
  for (const askable of askables) {
    ctx.state.pendingCrossings.push({
      entityId: askable.introduction.entityId,
      displayName: askable.introduction.displayName,
      category: askable.introduction.category,
      toolName: ctx.toolName ?? '',
      toolUseId: ctx.toolUseId,
      askedAt: ctx.now,
    });
  }

  return { type: 'ask', askables };
}
