/**
 * Agent-agnostic event model. Adapters translate their native hook payloads
 * into these; core never sees a Claude Code / Codex specific shape.
 */
import type { Category } from '../trust/entities.js';

export type CoreEvent =
  | { kind: 'session_start'; sessionId: string; cwd: string; at: number }
  | { kind: 'user_input'; sessionId: string; prompt: string; at: number }
  | {
      kind: 'tool_start';
      sessionId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      toolUseId?: string;
      at: number;
    }
  | {
      kind: 'tool_end';
      sessionId: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      toolResponse?: unknown;
      toolUseId?: string;
      at: number;
    }
  | { kind: 'turn_end'; sessionId: string; at: number }
  | { kind: 'session_end'; sessionId: string; at: number };

export type IntroductionVia = 'install' | 'manifest' | 'mcp' | 'service_cli';

/**
 * A concrete, deterministic observation that the agent is *actually*
 * introducing/depending on an entity — the spec §7 trigger ("actually
 * introducing, installing, connecting to, configuring, or depending upon").
 */
export interface EntityIntroduction {
  entityId: string;
  displayName: string;
  category: Category;
  ecosystem?: string;
  via: IntroductionVia;
  /** Short factual context, e.g. the originating command line. */
  detail: string;
}

/** Observational anchor (recorded, never intervenes on its own in v0.1). */
export interface SignalAnchor {
  kind:
    | 'env_file'
    | 'infra_file'
    | 'manifest_edit_unparsed'
    | 'service_cli_usage'
    | 'outbound_request'
    | 'mcp_usage';
  detail: string;
}
