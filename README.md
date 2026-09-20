# HIL — Human in the Loop

**A Human Agency Guardrail for agentic AI coding tools.**

> AI can execute. AI can reason. AI can create.
> Humans should remain aware of and meaningfully involved in the decisions that matter.

[![CI](https://github.com/Bdna6/hil-guardrail/actions/workflows/ci.yml/badge.svg)](https://github.com/Bdna6/hil-guardrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

English · [简体中文](README.zh-CN.md)

📖 **New here? Try the [Quick Start](docs/quick-start.md) — 5 minutes, one terminal, zero config.** · 中文版：[快速开始](docs/quick-start.zh-CN.md)

---

## Why

Coding agents can now autonomously pick the architecture, choose dependencies, define APIs, make product decisions, and propose optimizations — all in one long run. Individual developers and company teams alike are embracing agents at a growing pace, and more and more personal projects and day-to-day work are now produced by them. In my view, what happens in this process is an **unconscious transfer of decision ownership**: you say "build this feature", look up twenty minutes later, and the agent has chosen the stack, the database, even the product behavior. Everything works — it may even match what you expected. But then: did you actually take part in building your own project?

HIL exists to notice that unconscious drift — to hand decision ownership back to you, and to help you stay deeply engaged in building your own product.

## What HIL can do (features shipped at the current stage)

1. **Trust Boundary** — you declare which tools, libraries, services, and platforms you have reviewed (globally, per project, or per session). The agent is never restricted and never told to "pick only from a whitelist". But when it *actually introduces* something outside your boundary — installing an unreviewed SDK, wiring in a new cloud service — HIL pauses that one action and shows you a concise, neutral alert with review areas (data flow, credentials, licensing, lock-in); in some cases it may also interrupt the run outright, pulling the human back into the workflow. You decide: allow / reject / investigate. Then everything continues as usual.
2. **Silence by default** — routine autonomous work (tests, refactors, debugging) triggers nothing. No metrics, no dashboards, no participation scores. Silence is a feature.
3. **No capability reduction** — HIL never weakens the agent and never injects "ask the human more" prompts; on Claude Code it does not block tools on its own judgment. It returns decisions to you — without taking them away from the agent.

## What an intervention looks like

The agent decides to `npm install supabase` mid-task. Claude Code's native permission prompt appears — carrying HIL's reason:

```text
HIL · Trust Boundary

The agent is about to introduce: supabase.
This is outside your configured trust boundary (status: unknown).
This is not a safety verdict — it is a decision worth keeping with you. Quick review areas:
  • What data flows to, or is stored by, this service?
  • Who controls the credentials and keys?
  • What permissions and dependencies does it add?
  • Any vendor lock-in, licensing, or migration implications?
Your call: allow, reject, or investigate first.
Trust permanently: hil trust add supabase · Silence this session: /hil mute
```

You answer through Claude Code's own permission UI — that's the entire interaction. 简体中文提示同样内置(`HIL_LANG=zh-CN`)。The next 30 routine tool calls stay silent.

## What HIL is NOT

HIL is not surveillance, not a productivity tracker, and not a mere allowlist enforcer — nor will it ever grow into a "human contribution percentage" system. The data model cannot even express those: there is no identity dimension, no aggregation layer, no activity history.

## Install

Requires Node ≥ 20 and the Claude Code CLI. Windows and Linux are CI-tested.

```bash
npm install -g hil-guardrail       # or: npm install (project-local)
hil install --scope user           # wires HIL into Claude Code settings
```

Then author your trust boundary (or start empty — see below):

```bash
hil trust add postgresql --category database
hil trust add react fastapi --category library
```

Empty boundary ⇒ HIL asks once per category (then stays quiet via cooldown), rather than nagging on every package.

### Uninstall

```bash
hil uninstall --scope user   # removes exactly what `hil install` wrote,
                             # and purges leftover ephemeral session state
```

## How it works

```
Claude Code ──official hooks──▶ hil hook (local, <50ms, no network, no LLM)
                                  │ deterministic signal extraction
                                  │ trust lookup: session → project → global
                                  │ policy: cooldowns, per-entity once, mute
                                  ▼
                          crossing? ──▶ one localized alert → you decide
                          otherwise  ──▶ silence
```

- **Adapter-based**: `core` is agent-agnostic; `adapters/claude-code` ships now, `adapters/codex` is researched and scheduled (see [docs/05](docs/05-integration-codex.md)).
- **Fail-open**: if HIL errors or is slow, your session proceeds exactly as without it.
- **Local & private**: all processing is local. Session state is ephemeral — deleted at session end, pruned by age, and purged on uninstall. No telemetry, ever.

## Commands

| Command | Purpose |
|---|---|
| `hil install` / `hil uninstall` | wire / unwire Claude Code hooks (user, project, or local scope) |
| `hil trust add <name…>` / `hil trust remove <name>` | manage your Trust Boundary (`--category`, `--scope project`, `--scope session`) |
| `hil trust list` | show the boundary and where each entry came from |
| `hil status` | current session: decisions, cooldowns, muted state |
| `hil review` | this session's decision log |
| `hil mute` / `hil resume` | silence / restore interventions |

In Claude Code, `/hil <command>` works too.

## Language / 语言

English and 简体中文 are first-class: docs, CLI output, and intervention texts all ship in both. Set `language.default: zh-CN` in `~/.hil/config.yaml` or via `HIL_LANG`.

```yaml
# ~/.hil/config.yaml
language:
  default: en        # or zh-CN
intervention:
  cooldown_minutes: 15
```

## Documentation

Bilingual architecture docs live in [docs/](docs/README.md): product definition, conceptual models (Human Agency, Decision Ownership, Trust Boundary), system architecture, integration strategies, privacy & security, testing strategy, roadmap.

## Status

- **v0.1.0** — Claude Code adapter: deterministic Trust Boundary guardrail (this release)
- v0.2.x — optional trigger-only semantic layer (drift / scope-expansion awareness)
- v0.3.x — Codex adapter
- See the [roadmap](docs/08-roadmap-and-risks.md).

## Contributing

This project is in early, fast-moving iteration — the interface and behavior are not final yet. Issue reports (bugs, false positives/negatives, ideas) are very welcome; a contribution guide and PR process will arrive once the shape settles. Every change is checked against one question: *is this preserving human agency, or measuring human activity?*

## License

[MIT](LICENSE) · © 2026 BDNA6
