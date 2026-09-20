# Quick Start

> 5 minutes, one terminal, zero configuration required to begin. / 中文版：[quick-start.zh-CN.md](quick-start.zh-CN.md)

HIL is a local guardrail that keeps **you** the decision-maker while your coding agent stays fully autonomous. It watches for one thing: the agent *actually introducing* a technology you haven't reviewed — then it pauses that single action and hands the decision back to you.

## What you need

- Node.js ≥ 20 (`node --version`)
- Claude Code CLI working in a terminal
- That's it

## 1 · Install

```bash
npm install -g hil-guardrail
hil --version
```

## 2 · Wire it into Claude Code

```bash
hil install --scope user
```

This writes HIL's hooks into `~/.claude/settings.json` and adds a `/hil` command. It touches nothing else, and `hil uninstall --scope user` removes exactly what was written. **The terminal CLI is the verified environment** — see the note on IDE panels under Troubleshooting.

## 3 · (Optional) Use Chinese

```yaml
# ~/.hil/config.yaml
language:
  default: zh-CN
```

## 4 · (Optional) Declare your trust boundary

```bash
hil trust add postgresql --category database
hil trust add react fastapi --category library
```

Everything not in your boundary is `unknown` by default. **An empty boundary is a perfectly fine starting point**: HIL asks once per category, then stays quiet via cooldown — it does not nag on every package. You can also author [`~/.hil/trust-boundary.yaml`](../examples/trust-boundary.example.yaml) by hand.

## 5 · See it work

In a **terminal** Claude Code session, ask your agent:

```text
帮我安装 supabase 这个包 / install the supabase package
```

When the agent runs the install, the permission prompt appears **with HIL's alert**: what's being introduced, that it's outside your boundary, and four review areas (data flow, credentials, added permissions, lock-in). Then the decision is yours:

| You want to… | Do this |
|---|---|
| Allow this once | Approve the prompt — same category stays quiet for 15 min |
| Trust it permanently | `hil trust add svc:supabase` (the alert tells you the exact id) |
| Trust it for this session | `/hil trust add svc:supabase --scope session` |
| Make HIL shut up for now | `/hil mute` — undo with `/hil resume` |

Routine work — tests, refactors, debugging, `npx vitest`, `git` — never triggers anything.

## 6 · Daily commands

| Command | Purpose |
|---|---|
| `hil status` | what HIL sees right now: decisions, cooldowns, mute state |
| `hil review` | this session's decision log |
| `hil trust list` / `add` / `remove` | manage the boundary (global / `--scope project` for teams) |
| `hil mute` / `hil resume` | silence / restore interventions |
| `hil uninstall` | remove everything `install` wrote |

## Where things live

| Path | Contents |
|---|---|
| `~/.hil/trust-boundary.yaml`, `config.yaml` | your boundary & settings (plain text, yours to edit) |
| `~/.hil/hil.db` | compiled trust store (CLI-managed entries) |
| `~/.hil/state/` | ephemeral session state — **deleted when the session ends** |
| `.hil/` (in a project) | project-level boundary, shareable via the repo |

Local processing only; no network on the hot path; no telemetry. Details: [privacy & security](06-privacy-and-security.md).

## Troubleshooting

- **No prompt appeared when the agent installed something.**
  - You're probably in an **IDE-embedded panel** (e.g. the VS Code extension): those currently ignore hook permission decisions — observation works, intervention doesn't. Use the terminal CLI for full protection ([details](04-integration-claude-code.md#31-verified-integration-surface)).
  - In `dontAsk`/`bypassPermissions` modes no prompt *can* appear, so HIL denies the action with a "please ask the user first" message instead — that's the intended fallback.
  - Still nothing? `hil status` shows whether HIL recorded the crossing; set `HIL_TRACE=1` for Claude Code and check `~/.hil/trace.log`.
- **`hil: command not found`** — re-run `npm install -g hil-guardrail`, or use `npx hil-guardrail`.
- **Too quiet / too chatty?** — cooldown defaults to 15 minutes (`intervention.cooldown_minutes` in config). `hil status` shows active cooldowns.

## FAQ

- **Does it slow my agent down?** The hook runs locally in milliseconds, with no network and no LLM. If HIL ever fails, it fails open — your session is unaffected.
- **Does it read my conversations?** No. It looks at tool calls (commands, file paths) and stores only metadata. [Details](06-privacy-and-security.md).
- **Does it limit the AI?** Never. The agent can use and propose anything; HIL only surfaces *introductions* across a boundary you declared — the allow/deny call is always yours.
