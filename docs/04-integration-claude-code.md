# HIL — Claude Code Integration Strategy

> Status: M0 architecture deliverable · Based on verified research of the official Claude Code hooks/skills/plugins documentation (2026-09). No undocumented APIs are used.

## 1. Verified integration surface

Claude Code exposes a documented hook system (33 events as of this writing) that lets an external program observe and control agent activity. Facts HIL relies on:

| Fact | Detail |
|---|---|
| Observe | Hook events deliver JSON on stdin: `session_id`, `transcript_path`, `cwd`, `hook_event_name`, and per-event payloads (`tool_name`, `tool_input`, `tool_response`, `prompt`, …) |
| Pause + ask | A `PreToolUse` hook may return `hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "…" }` — the user sees the reason in the permission prompt and decides |
| Context injection | `UserPromptSubmit`, `PreToolUse`, and `Stop` hooks can inject `additionalContext` into the conversation without blocking |
| Config | Hooks are configured in `settings.json` (user / project / local scopes); matchers select tools (`Bash`, `Write`, `Edit`, …) by string or regex |
| Execution model | Matching hooks run per event, in parallel, with `${CLAUDE_PROJECT_DIR}` available; a hook timeout does **not** block the tool call (fail-open) |
| Slash commands | Custom commands/skills (`.claude/commands/*.md` / skills) can execute local scripts via `` !`command` `` blocks and are user-invocable |
| Distribution | A Claude Code plugin can bundle hooks + commands + skills for one-line install; `hooks/hooks.json` merges with user hooks |
| Not available | MCP servers **cannot** observe built-in tool calls; the transcript JSONL (`transcript_path`) has **no stable documented schema** — both are out of bounds for HIL |

## 2. Event subscription map

HIL subscribes to a minimal set. Everything else is ignored (cost + noise control).

| Event | HIL purpose |
|---|---|
| `SessionStart` | Create ephemeral session state (keyed by `session_id`) |
| `UserPromptSubmit` | Record human input as an agency signal (initiation/direction); optional informational context injection |
| `PreToolUse` | **Main gate.** Deterministic trust-boundary detection on `tool_input`; on crossing → `ask` + localized reason. Record pending decision |
| `PostToolUse` | Record what actually happened (dependency installed, files written) → update session state; confirms a user "allow" if the tool ran |
| `PostToolBatch` | Natural checkpoint for streak analysis (many decisions, no human input) |
| `Stop` | End-of-turn drift assessment; optional informational nudge via `additionalContext` |
| `SessionEnd` | Delete ephemeral session state |

## 3. Intervention mechanics

### 3.1 Trust-boundary crossing (the flagship case)

```
PreToolUse(Bash: "npm install supabase")
  → HIL resolves entity: supabase @ package-ecosystem npm, category external-service/baas
  → lookup: session → project → global scopes
  → status unknown  →  permissionDecision: "ask"
     permissionDecisionReason: localized §8-style alert
       (what's outside the boundary + review areas + Allow / Reject / Investigate)
  → user answers the permission prompt → agent proceeds or is denied
  → PostToolUse (or absence) records the outcome in session state
```

The `ask` primitive *is* the spec's "pause and return the decision" — Claude Code natively renders the prompt and enforces the human's answer. HIL never returns `deny` on its own judgment in prompting modes: an automatic veto would make HIL a restriction system, which the spec forbids.

**Non-prompting modes (fallback).** Hook input carries `permission_mode`. In `dontAsk` / `bypassPermissions` (or when the mode is missing/unknown), no prompt can be shown, so `ask` has no channel to the human. There HIL degrades to `permissionDecision: "deny"` + a reason that returns the decision to the user conversationally ("please ask the user whether to introduce X") — the same mapping the Codex adapter uses where `ask` does not exist (doc 05 §4). Cooldowns and per-entity-once semantics still apply, so a denied agent that retries is not blocked twice; the intended path is: agent asks the user → user approves → `/hil trust add <id> --scope session` → retry proceeds. This fallback is config-gated future work (`intervention.bypass_mode`); v0.1 ships it as the fixed default.

**Observed limitation (2026-09 live tests).** Terminal CLI: ✅ verified end-to-end — a trust crossing surfaced the localized `ask` prompt, and the user's "no" correctly interrupted the tool call. VS Code-embedded session: hooks fire reliably (session state proves observation works), but that harness **ignored both `ask` and `deny` decisions** — the tool ran regardless. Treat IDE-embedded runtimes as observe-only until they honor `permissionDecision`; the intervention path is real in the terminal CLI.

### 3.2 Informational / Attention levels

Low-confidence signals never block: they ride `additionalContext` on `UserPromptSubmit` or `Stop` ("I made a few assumptions about direction — worth a quick review"). The agent sees the text and naturally surfaces it to the user; no prompt storm.

### 3.3 Anti-nagging enforcement

Cooldowns and per-category dismissal live in HIL's session state: after an intervention on category X, subsequent crossings of X within the cooldown emit nothing (the earlier decision still stands). `/hil trust add <name>` and `/hil mute` change the boundary/policy instead of repeating alerts.

## 4. Deterministic signal sources (v1)

| Source | Extracted signals |
|---|---|
| `Bash`/`PowerShell` `tool_input.command` | package installs (`npm i`, `pnpm add`, `pip/pip3/install -r`, `uv add`, `poetry add`, `cargo add`, `go get`, `mvn/gradle`), service CLIs (`aws`, `gcloud`, `az`, `supabase`, `firebase`, `vercel`, `wrangler`, `kubectl`, `terraform`, `docker pull`), outbound `curl/wget` hosts |
| `Write`/`Edit` `tool_input.file_path` + diff content | dependency manifests (`package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`), service config files (`.env*`, `supabase/config.toml`, `firebase.json`, `vercel.json`, `docker-compose.yml`), infra files (`*.tf`, `Dockerfile`) |
| MCP tool names (`mcp__<server>__<tool>`) | a server appearing in tool traffic = plugin/MCP-category entity introduction |
| Filesystem anchors for scope expansion | edits far outside the areas implied by the current task context |

Each extractor is a pure function `(tool_name, tool_input) → EntityIntroduction[] | anchors`. No LLM on this path.

## 5. State & lifecycle

- **Ephemeral session state**: JSON file per `session_id` under the HIL state dir (e.g. `~/.hil/state/`), deleted on `SessionEnd`. Contains: task context digest, decision log (owner/tier), human-input log, intervention history, cooldown timers. Nothing here outlives the session by default.
- **Persistent config**: user/project Trust Boundary (SQLite + YAML, see architecture doc). Read-only on the hot path; writes only via explicit `hil trust` commands.
- **Transcripts**: never parsed (unstable schema). `transcript_path` is used only as an opaque session key input if needed.

## 6. Distribution & install

1. **v0.x — npm package + installer command.** `npm install -g human-in-the-loop` (or project-local); `hil install [--scope user|project]` idempotently writes the hook entries (pointing at the absolute CLI path, correct for the platform's shell) into `settings.json`, plus the `/hil` command files into `.claude/commands/`. `hil uninstall` removes exactly what it wrote.
2. **Later — Claude Code plugin bundle.** Package hooks + skills as a plugin (`.claude-plugin/plugin.json` + `hooks/hooks.json`), installable via `claude plugin install`. No core changes needed — only the packaging layer.

## 7. Performance & failure policy

- **Budget**: hook handler must complete in < 50 ms p95 (local file reads + pure-function matching only; no network, no LLM on this path).
- **Fail-open, always**: any HIL error → exit 0 with no output → Claude Code proceeds with its normal permission flow. HIL must never be the reason a session breaks. (Claude Code itself fail-opens on hook timeouts; HIL adopts the same stance from its side.)
- **Process model**: one short-lived process per event. State passing via the state dir. This keeps the integration zero-daemon and debuggable; a `--trace` flag logs every decision to a local file for troubleshooting.

## 8. Explicitly out of bounds

- Parsing `transcript_path` JSONL (undocumented, version-unstable).
- Using MCP servers as an observation channel (they cannot see built-in tool calls).
- `deny`ing tools from HIL's own judgment (restriction is not the product).
- Sending session content anywhere off-machine from the hook path.

## 9. Open items

- ~~Verify `ask`-prompt rendering~~ → resolved 2026-09: verified live in the terminal CLI (localized ask prompt shown, user "no" interrupted the call); ask/deny output is also contract-tested (goldens). Known gap: VS Code-embedded harnesses ignore `permissionDecision` (see §3.1).
- Decide whether `PermissionRequest` events add value beyond `PreToolUse` + `PostToolUse` inference (likely not in v1).
- Confirm minimum Claude Code version to require in docs (matchers/features used here are stable, but pin a tested version).
- Investigate whether IDE-embedded runtimes gain `permissionDecision` support (would restore the ask path there).
