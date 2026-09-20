/**
 * Outcome → Claude Code hook stdout. An `ask` on PreToolUse becomes
 * `permissionDecision: "ask"` + a localized reason: Claude Code renders its
 * native permission prompt, the human decides, the agent proceeds.
 *
 * In permission modes where no prompt can be shown (`dontAsk`,
 * `bypassPermissions`, or an unknown/missing mode), `ask` has no channel to
 * the human — the only reliable voice is `deny` + a reason that returns the
 * decision to the user conversationally (the same mapping as the Codex
 * adapter, docs/05 §4). Cooldowns still prevent deny-loops.
 */

import type { Lang } from '../../core/config.js';
import { t } from '../../core/i18n/index.js';
import type { Outcome } from '../../core/intervention/policy.js';

/** Modes in which Claude Code will actually render a permission prompt. */
const PROMPTING_MODES = new Set(['default', 'plan', 'acceptEdits', 'auto']);

function reason(outcome: Extract<Outcome, { type: 'ask' }>, lang: Lang, denied: boolean): string {
  const names = outcome.askables.map((a) => a.introduction.displayName);
  const entities =
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} (+${names.length - 3})`;
  const status = outcome.askables[0]?.trust.status ?? 'unknown';
  const first = outcome.askables[0]?.introduction.entityId ?? '';
  const title = t(
    lang,
    denied ? 'intervention.trustCrossingDenied.title' : 'intervention.trustCrossing.title',
  );
  const body = t(
    lang,
    denied ? 'intervention.trustCrossingDenied.body' : 'intervention.trustCrossing.body',
    { entities, status, first },
  );
  return `${title}\n\n${body}`;
}

export function renderAskReason(outcome: Extract<Outcome, { type: 'ask' }>, lang: Lang): string {
  return reason(outcome, lang, false);
}

/** Returns the exact stdout string for a hook response ('' = no decision). */
export function renderHookOutput(
  hookEventName: string,
  outcome: Outcome,
  lang: Lang,
  permissionMode?: string,
): string {
  if (hookEventName === 'PreToolUse' && outcome.type === 'ask') {
    const canPrompt = permissionMode !== undefined && PROMPTING_MODES.has(permissionMode);
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: canPrompt ? 'ask' : 'deny',
        permissionDecisionReason: reason(outcome, lang, !canPrompt),
      },
    });
  }
  return '';
}
