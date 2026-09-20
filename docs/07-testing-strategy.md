# HIL — Testing & False-Positive/Negative Strategy

> Status: M0 architecture deliverable · Covers: testing strategy, false-positive/false-negative strategy (spec §16, §21, §27).

## 1. Why false positives are the #1 engineering risk

> "False positives are dangerous because they will make users disable HIL." (spec §27)

Every intervention must be defensible: the user should be able to ask "why did you interrupt me?" and get a concrete, evidence-based answer. The testing strategy is therefore organized around **scenario truth**: given a recorded/synthesized session, did HIL intervene exactly where it should and stay silent everywhere else?

## 2. Test layers

### 2.1 Unit tests (fast, pure)

- **Trust resolution**: scope chain (session → project → global → unknown), all five trust states, temporary expiry, category matching, slug normalization (`npm:supabase`, casing, aliases like `pg`→`postgres` where defined).
- **Signal extractors**: each extractor against a corpus of real command/manifest/config fixtures — `npm i`, `pnpm add -D`, `pip install`, `uv add`, `poetry add`, `cargo add`, `go get`, `docker pull`, `aws s3 …`, `supabase init`, `npx create-next-app`, edits to `package.json`/`pyproject.toml`/`.env`/`Dockerfile`/`*.tf`, `mcp__github__*` names. Multi-command lines (`cd x && npm i y`), subshells, `&&`/`;`/`|` chains, quoting variants, PowerShell forms.
- **Policy engine**: cooldown windows, per-category dismissal, severity gating, session mute, evidence combination (a tier-1 streak must never escalate alone; a single tier-3 crossing must).
- **State lifecycle**: create/update/prune; SessionEnd cleanup; corruption → fail-open.
- **i18n**: en and zh-CN key sets identical; all templates render with required params.

### 2.2 Adapter contract tests (golden files)

Fixed hook-input JSON fixtures (`SessionStart`, `PreToolUse` for Bash/Write/Edit, `PostToolUse`, `Stop`, `SessionEnd`) → run the hook entrypoint → assert the exact stdout JSON (or empty, for no-decision). This pins the Claude Code contract and makes upgrades auditable.

### 2.3 Scenario corpus (the heart of the strategy)

Recorded/synthesized event sequences with expected intervention counts:

| Scenario | Expected |
|---|---|
| Routine autonomous work: 30 tool calls of tests/refactor/debug | 0 interventions |
| Obvious low-consequence fix + obvious dependency | 0–1 (only if dep is out-of-boundary) |
| §8 flagship: "build a web app" → Next.js + Supabase + S3, none trusted | 1 high-importance ask at first crossing, then cooldown silence for the same categories |
| §16 drift: long autonomous streak + repeated low-information "ok/continue/go ahead" | exactly 1 escalating prompt at the Stop checkpoint |
| §17 scope expansion: "fix login bug" → auth rewrite + schema migration + new IdP | attention/high prompt anchored on the divergence pattern |
| Trusted tools only (PostgreSQL, React, FastAPI in boundary) | 0 interventions even in long streaks |
| Post-`/hil trust add`: same crossing again | 0 interventions |
| Muted session | 0 interventions |

The corpus is data (`tests/scenarios/*.json`) so new failure reports can be added as regression cases.

### 2.4 Performance tests

Hook entrypoint over the fixture set: p95 < 50 ms (CI budget, generous for CI runners), no allocation of LLM clients, no network calls (asserted by stubbing).

### 2.5 Live smoke (manual, pre-release)

`hil install` → real Claude Code session on Windows + macOS/Linux → install an out-of-boundary package → observe the ask prompt, allow, verify no repeat within cooldown, `/hil trust add`, verify silence. Checklist in `docs/` release notes.

## 3. False-positive controls (design, not just tests)

1. **Deterministic-first**: v1 fires high-importance interventions **only** on deterministic trust-boundary crossings — no heuristics at this level.
2. **No naive thresholds**: counts/time/lines are never a sole trigger (spec §16); they only modulate confidence of semantic patterns.
3. **Uncertainty downgrade**: low confidence → informational context injection, never an ask (spec §27).
4. **Cooldowns as first-class data**: every intervention records its category; same category within cooldown is silent by construction.
5. **Escalation ceiling**: at most one escalation per Stop checkpoint; prompts are rate-limited per session.
6. **The corpus gate**: any PR adding a signal must add scenarios proving it stays silent on the routine corpus.

## 4. False-negative controls

- The deterministic layer deliberately over-covers *observation* (record everything cheap) and under-covers *interruption*; misses surface later as scenario gaps, not as user harm.
- Priority areas from spec §27 get explicit scenarios: architecture, security, privacy, external services, data handling, product direction, irreversible actions, major dependency changes, strategic/creative decisions.
- Semantic-layer misses are measured on the corpus (recall per scenario class) once M4 lands.

## 5. CI

`biome check` + `tsc --noEmit` + `vitest run` (unit + adapter goldens + scenario corpus + perf budget) on windows-latest and ubuntu-latest. Locale-parity and scenario-coverage checks run as vitest assertions, so they cannot drift silently.
