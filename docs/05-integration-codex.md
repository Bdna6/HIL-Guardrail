# HIL — Codex Integration Research & Strategy

> Status: M0 research deliverable (2026-09) · Sources: official docs now hosted at `learn.chatgpt.com/docs` (former `developers.openai.com/codex`), the `openai/codex` repo/releases. Every capability claim below was verified against current documentation; speculation is marked.
> Codex status at research time: stable CLI v0.154.0 (2026-09-09).

## 1. Executive summary

| Capability | Verdict |
|---|---|
| Observe agent actions (per tool call) | ✅ **Yes — hooks** (`PostToolUse`, `Stop`, …), same architecture family as Claude Code |
| Pause + let the human decide | ⚠️ **Partially — with different semantics than Claude Code** (see §4) |
| Mid-run approvals in non-interactive mode | ❌ Not available (`codex exec` has no approval events) |
| MCP as observation/approval channel | ❌ Not possible; `codex mcp-server` removed 2026-09-05 |
| `notify` as control channel | ❌ Fire-and-forget, whole-turn granularity only (`agent-turn-complete`) |
| Full bidirectional control | ✅ app-server JSON-RPC incl. `requestApproval` — but officially experimental |

**Decision: the Codex adapter is architecture-compatible with the Claude Code adapter** (hooks, stdin JSON, fail-open, trust-boundary gating). It ships as M5 after the Claude Code path is proven, with the pause-semantics mapping of §4.

## 2. The hooks system (primary integration path)

Codex ships lifecycle hooks (since v0.128.0, 2026-04; async + MCP-tool handlers v0.148.0; `Interrupt` event v0.150.0):

- **Config**: `~/.codex/hooks.json`, project `.codex/hooks.json` (needs project trust), or inline `[hooks]` in `config.toml`. Event → matcher group (regex on tool name) → handlers (`command` or `mcp_tool`, with `timeout`, `async`).
- **Events**: `PreToolUse`, `PermissionRequest`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`/`PostCompact`, `Interrupt`, `SubagentStart`.
- **Input**: one JSON object on stdin — `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `permission_mode`, `turn_id`, plus per-event fields (`tool_name`, `tool_input`, `tool_response`, `prompt`, `last_assistant_message`). Hookable tools include shell and `apply_patch` (aliases `Edit`/`Write`) and MCP tools; hosted tools (WebSearch) are not hookable.
- **Trust**: non-managed hooks must be explicitly trusted (hash-bound, via `/hooks` in the CLI). HIL's installer must document this step; it cannot and must not bypass it.
- **Fail-open**: invalid/unsupported hook output marks the hook failed and the call proceeds. Same stance HIL already takes. Default timeout 600 s (SessionEnd/Interrupt: 3 s).

**Output contract:**

| Event | Output | Notes |
|---|---|---|
| `PreToolUse` | `hookSpecificOutput.permissionDecision: "allow" \| "deny"` + `permissionDecisionReason` + optional `updatedInput` (legacy `{"decision":"block","reason"}` accepted) | **`"ask"` is NOT supported** |
| `PermissionRequest` | `decision.behavior: "allow" \| "deny"` | no decision → falls through to Codex's own approval prompt; any `deny` wins; `updatedPermissions`/`interrupt` fail closed |
| `PostToolUse` | `decision: "block"` + reason | replaces tool result with feedback (command already ran) |
| `Stop`/`SubagentStop` | `decision: "block"` + reason | continues the turn with reason as prompt |
| `UserPromptSubmit` | can reject a prompt before sending | |

## 3. Other mechanisms (why they are not the primary path)

- **`notify`** (`config.toml`, user-level): external program receives one JSON argument, currently only `agent-turn-complete` (`thread-id`, `turn-id`, `cwd`, `input-messages`, `last-assistant-message`). No veto, no per-action granularity. Usable at most as a coarse "turn ended" ping. Not used by HIL v1.
- **`codex exec --json`**: clean JSONL event stream (`thread.started`, `item.*` with `command_execution`, `file_change`, `mcp_tool_call`, `agent_message`, …) — a first-class **observe** path for wrapper deployments, but no approval events mid-run. Not the primary path (HIL integrates the user's normal TUI workflow, not a wrapper).
- **SDKs**: TS `@openai/codex-sdk` (wraps `codex exec`) and Python `openai-codex` (wraps app-server) expose the same item coverage, but no documented approval-decision callback. Reserved for a future "HIL-driven Codex" mode.
- **App-server** (`codex app-server`): JSON-RPC with server-initiated approval requests (`item/commandExecution/requestApproval` with `availableDecisions`: `accept`, `acceptForSession`, `decline`, `cancel`, …). The richest control surface (the VS Code extension's model) — but the command/WS transport is officially experimental. Candidate for a later "wrapper mode", not v1.
- **Rollout files** (`~/.codex/sessions/**/rollout-*.jsonl`): exist, tail-able, but the schema is undocumented and unsupported (open community question). Out of bounds, same as Claude Code transcripts.

## 4. Pause-semantics mapping (the key design difference)

Claude Code's `ask` hands the decision to the human via the native permission prompt. Codex hooks cannot do that — HIL must return `allow` or `deny` itself. HIL's Codex mapping:

| HIL outcome | Claude Code | Codex adapter |
|---|---|---|
| none | no output | no output |
| informational context | `additionalContext` | `PostToolUse`/`Stop` `block` with a soft informational reason (feeds the text back as prompt) — used sparingly |
| high (trust crossing) | `permissionDecision: "ask"` + reason → human decides in native prompt | `permissionDecision: "deny"` + localized reason instructing the agent: *"the user has not reviewed this; ask the user before introducing it"* → the decision returns to the human conversationally |

Consequences and mitigations:

- Deny+reason is one notch stronger than ask (the action does not run on first attempt). To stay faithful to "awareness, not restriction", the reason is phrased as returning the decision to the user, not as a verdict; and cooldowns prevent deny-loops (after the user says "fine, use it" — `hil trust add` or session temporary trust — the same crossing never fires again).
- If Codex itself would show an approval prompt anyway (`approval_policy: on-request`), the `PermissionRequest` hook's no-decision fall-through gives the human the native prompt — preferred when available.
- The deny mapping is documented honestly in the README so users understand the difference between adapters.

## 5. Adapter design (M5)

```
src/adapters/codex/
  hooks-entry.ts      stdin JSON → CoreEvent (shared normalizer family with claude-code)
  render.ts           Decision → hook output JSON
  install.ts          write ~/.codex/hooks.json (or project .codex/hooks.json) + guide /hooks trust
```

- Same `core`, same trust store, same locales. Adapter differences are confined to: event field names (minor), matcher config, output rendering, and the pause mapping of §4.
- Event subscription mirrors the Claude Code map (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `SessionEnd`).

## 6. Out of bounds / open questions

- Do command hooks fire in `codex exec` mode? Not documented — must be verified empirically before any wrapper claims (tracked in roadmap).
- Rollout JSONL schema: undocumented — never parsed.
- Minimum supported Codex version for hooks: pin at M5 against the then-current stable.
- App-server wrapper mode: revisited after v1 ships, gated on the experimental label being lifted or explicitly accepted by users.
