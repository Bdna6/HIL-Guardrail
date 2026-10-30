import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { handleHook } from '../adapters/claude-code/index.js';
import { extractSignals } from '../core/signals/index.js';
import { isLowInformation } from '../core/state/session.js';
import { version } from '../index.js';
import { assess, semanticConfigured } from './semantic.js';
import { atomicJson, type Mode, type RuntimeConfig, readJson, runtimeDir } from './store.js';

export interface NativeInput {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  permission_mode?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  prompt?: string;
  last_assistant_message?: string;
  stop_hook_active?: boolean;
}
interface Pending {
  key: string;
  kind: 'study' | 'scope' | 'review' | 'resource';
  question: string;
  at: number;
}
export interface RuntimeSession {
  id: string;
  cwd: string;
  mode: Mode;
  revision: number;
  lastSeen: number;
  objective: string;
  studyDone: boolean;
  changed: boolean;
  pending?: Pending;
  acknowledged: string[];
  lastAnswer?: 'model-reviewed' | 'user-responded-unverified';
  warning?: string;
}
const context = (event: string, text: string) =>
  JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
const deny = (reason: string) =>
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
function isMutation(input: NativeInput): boolean {
  if (['Write', 'Edit', 'MultiEdit'].includes(input.tool_name ?? '')) return true;
  if (!['Bash', 'PowerShell', 'Shell'].includes(input.tool_name ?? '')) return false;
  const command = String(input.tool_input?.command ?? '');
  return command
    .split(/&&|\|\||;|\n/)
    .some(
      (part) =>
        !/^\s*(?:hil\s+(?:status|runtime\s+status)|(?:node\s+[^;&|]*main\.js)\s+(?:status|runtime\s+status)|pwd\b|ls\b|rg\b|cat\b|Get-Content\b|git\s+(?:status|diff|log)\b|npm\s+(?:test|run\s+(?:test|lint))\b)/i.test(
          part,
        ),
    );
}
export class RuntimeEngine {
  sessions: Record<string, RuntimeSession>;
  constructor(public config: RuntimeConfig) {
    this.sessions =
      readJson<Record<string, RuntimeSession>>(join(runtimeDir(), 'sessions.json')) ?? {};
  }
  persist(): void {
    const cutoff = Date.now() - 48 * 3600_000;
    for (const [id, s] of Object.entries(this.sessions))
      if (s.lastSeen < cutoff) delete this.sessions[id];
    atomicJson(join(runtimeDir(), 'sessions.json'), this.sessions);
  }
  status() {
    return {
      running: true,
      enabled: this.config.enabled,
      mode: this.config.mode,
      version,
      revision: this.config.revision,
      semantic: semanticConfigured() ? 'configured' : 'not-configured',
      sessions: Object.values(this.sessions).map((s) => ({
        id: s.id,
        cwd: s.cwd,
        mode: s.mode,
        revision: s.revision,
        lastSeen: s.lastSeen,
        pending: s.pending?.kind,
        lastAnswer: s.lastAnswer,
        warning: s.warning,
      })),
    };
  }
  private instructions(session: RuntimeSession): string {
    const c = this.config,
      p = c.policies[session.mode];
    return `HIL runtime facts (local service, not inferred by the model): ${JSON.stringify({ running: true, enabled: c.enabled, mode: session.mode, version, revision: session.revision, configuredMode: c.mode, semantic: semanticConfigured() ? 'configured' : 'not-configured' })}.
If the user asks HIL status/mode/version, report these facts exactly, including disabled or degraded state. Do not confuse HIL enablement with the Claude model/provider. Answer in the user's language. HIL remains in this CLI conversation, not a web chat.
${
  !c.enabled
    ? 'HIL interventions are disabled. Do not impose HIL learning or review checks.'
    : `Mode ${session.mode}. ${session.mode === 'build' ? 'Preserve the human objective and avoid unnecessary dependencies, cloud services, accounts or scope expansion. Explain simpler alternatives before consequential choices.' : session.mode === 'work' ? 'Before delivery, trace important facts to sources, disclose assumptions and ask the human to verify consequential results. Never label unverified claims as checked.' : 'Start with the learner’s attempt, then hints and partial explanations. Ask contextual prediction/transfer questions. Do not immediately deliver a complete solution. Evaluate the answer meaningfully in the original conversation; do not treat acknowledgment as understanding.'}
Policies: ${JSON.stringify(p)}. ${p.scope ? 'Compare consequential changes with the task objective before proceeding.' : ''} ${p.handover ? 'Before finishing, summarize decisions and concrete verification/understanding checks.' : ''}
Objective: ${JSON.stringify(c.goal || session.objective)}. ${session.pending ? `Outstanding checkpoint: ${JSON.stringify(session.pending.question)}. Ask this question and WAIT for the human. Do not retry denied tools or answer the challenge on their behalf.` : ''}
An allowed tool or user response is authorization, not proof of understanding. Semantic assessments are limited evidence, never a competence score.`
}`;
  }
  async handle(input: NativeInput): Promise<string> {
    if (typeof input.session_id !== 'string' || input.session_id.length > 200) return '';
    const id = input.session_id,
      event = input.hook_event_name ?? '',
      now = Date.now();
    if (event === 'SessionEnd') {
      delete this.sessions[id];
      this.persist();
      await handleHook(JSON.stringify(input), { skipRuntime: true });
      return '';
    }
    let s = Object.hasOwn(this.sessions, id) ? this.sessions[id] : undefined;
    if (!s) {
      s = {
        id,
        cwd: typeof input.cwd === 'string' ? input.cwd : '.',
        mode: this.config.mode,
        revision: this.config.revision,
        lastSeen: now,
        objective: '',
        studyDone: false,
        changed: false,
        acknowledged: [],
      };
      this.sessions[id] = s;
    }
    s.lastSeen = now;
    try {
      if (event === 'SessionStart' || event === 'UserPromptSubmit') {
        // Runtime facts refresh on user turns; global off is effective for every event.
        if (s.mode !== this.config.mode) {
          s.mode = this.config.mode;
          s.studyDone = false;
          s.pending = undefined;
          s.acknowledged = [];
        }
        s.revision = this.config.revision;
        const prompt = input.prompt?.trim() ?? '';
        const statusOnly =
          /^(?:.*HIL.*(?:模式|状态|版本|开启|启动|mode|status|version|enabled).*)$/iu.test(prompt);
        if (prompt && !s.objective && !statusOnly && !isLowInformation(prompt))
          s.objective = prompt.slice(0, 1000);
        if (event === 'UserPromptSubmit' && s.pending && this.config.enabled && !statusOnly) {
          if (isLowInformation(prompt) || !prompt) {
            s.warning = 'A substantive response is still needed.';
          } else {
            try {
              const result = await assess({
                purpose: 'review-answer',
                objective: this.config.goal || s.objective,
                question: s.pending.question,
                answer: prompt.slice(0, 3000),
              });
              if (result && !result.understood) {
                s.pending.question = result.question || s.pending.question;
                s.warning = result.reason;
              } else {
                s.lastAnswer = result ? 'model-reviewed' : 'user-responded-unverified';
                if (s.pending.kind === 'study') s.studyDone = true;
                s.acknowledged.push(s.pending.key);
                s.acknowledged = s.acknowledged.slice(-100);
                s.pending = undefined;
                s.warning = undefined;
              }
            } catch {
              s.warning =
                'Semantic assessment unavailable; checkpoint remains pending. Do not claim understanding.';
            }
          }
        }
        await handleHook(JSON.stringify(input), {
          skipRuntime: true,
          suppressInterventions: !this.config.enabled,
        });
        return context(
          event,
          `${this.instructions(s)}${s.warning ? `\nHIL notice: ${s.warning}` : ''}`,
        );
      }
      if (!this.config.enabled) return '';
      const policy = this.config.policies[s.mode];
      if (event === 'PreToolUse') {
        const tool = input.tool_name ?? '',
          args = input.tool_input ?? {};
        const mutating = isMutation(input);
        const key = createHash('sha256')
          .update(tool + JSON.stringify(args))
          .digest('hex');
        if (mutating && s.pending)
          return deny(
            `HIL · ${s.pending.question}\n请在原对话等待用户回答；不要重复执行或替用户作答。${s.warning ?? ''}`,
          );
        if (mutating && s.mode === 'study' && policy.handover && !s.studyDone && s.objective) {
          s.pending = {
            key,
            kind: 'study',
            question: `在实现前，请先描述你的思路：准备怎样完成“${s.objective.slice(0, 150)}”？关键输入、输出与验证方法是什么？`,
            at: now,
          };
          return deny(
            `HIL · Study checkpoint\n${s.pending.question}\n请向用户提问并等待回答，然后再执行。`,
          );
        }
        if (mutating && policy.scope && !s.acknowledged.includes(key)) {
          const signals = extractSignals(tool, args);
          const relevant =
            signals.anchors.length > 0 ||
            signals.introductions.length > 0 ||
            ['Write', 'Edit', 'MultiEdit'].includes(tool);
          if (relevant) {
            try {
              // Never send environment files or credential values to the optional assessor.
              const file = String(args.file_path ?? '');
              const evidence = /\.env(?:\.|$)|credentials|secrets/i.test(file)
                ? { file, content: '[redacted credential surface]' }
                : {
                    toolInput: JSON.stringify(args)
                      .replace(
                        /((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s"',;]+/gi,
                        '$1[redacted]',
                      )
                      .slice(0, 6000),
                  };
              const decision = await assess({
                purpose: 'scope',
                objective: this.config.goal || s.objective,
                tool,
                evidence,
              });
              if (decision?.scopeExpanded) {
                s.pending = {
                  key,
                  kind: 'scope',
                  question:
                    decision.question ||
                    `此变更超出原目标：${decision.reason}。你希望采用还是保留原范围？`,
                  at: now,
                };
                return deny(`HIL · Scope review\n${s.pending.question}`);
              }
            } catch {
              s.warning =
                'Semantic scope analysis unavailable; deterministic trust checks remain active.';
            }
          }
        }
        const output = (
          await handleHook(JSON.stringify(input), {
            skipRuntime: true,
            suppressInterventions: !policy.resources,
          })
        ).stdout;
        if (output) {
          const decision = JSON.parse(output).hookSpecificOutput;
          if (decision?.permissionDecision === 'deny')
            s.pending = {
              key,
              kind: 'resource',
              question: decision.permissionDecisionReason,
              at: now,
            };
        }
        return output;
      }
      if (event === 'PostToolUse') {
        if (isMutation(input)) s.changed = true;
        return (await handleHook(JSON.stringify(input), { skipRuntime: true })).stdout;
      }
      if (event === 'Stop' && policy.handover && s.changed && !input.stop_hook_active) {
        s.changed = false;
        if (!s.pending)
          s.pending = {
            key: `review-${now}`,
            kind: 'review',
            question:
              s.mode === 'study'
                ? '请用自己的话解释刚完成部分的数据流，并预测一个条件改变时的结果。'
                : '请说明刚完成成果的关键假设、证据来源，以及你将亲自验证的一个具体步骤。',
            at: now,
          };
        return JSON.stringify({
          decision: 'block',
          reason: `HIL · ${s.pending.question} 请结合当前项目提一个具体问题，等待用户回答；不要代答或继续调用工具。`,
        });
      }
      return '';
    } finally {
      this.persist();
    }
  }
}
