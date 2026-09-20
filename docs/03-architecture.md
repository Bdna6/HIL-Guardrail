# HIL — System Architecture

> Status: M0 architecture deliverable · Covers: system overview, module layout, event pipeline, session state, database, prompt architecture, localization, repository structure.
> Language/runtime: TypeScript on Node.js ≥ 20, ESM. Zero runtime dependencies on the hot path is a design goal.

## 1. System overview

```
┌─────────────┐   official hook events (JSON on stdin)
│ Claude Code │──────────────────────────────┐
│   (agent)   │◀─────────────────────────────┤  decision JSON on stdout
└─────────────┘                              ▼
                          ┌────────────────────────────────────┐
                          │ adapter  (src/adapters/claude-code)│
                          │  normalize event → CoreEvent       │
                          │  render decision → hook output     │
                          └───────────────┬────────────────────┘
                                          ▼
                          ┌────────────────────────────────────┐
                          │ core (src/core)                    │
                          │  signal engine (deterministic)     │
                          │  session state                     │
                          │  intervention policy               │
                          │  optional semantic layer (LLM)     │
                          └───────┬───────────────┬────────────┘
                                  ▼               ▼
                        ┌──────────────┐  ┌──────────────┐
                        │ trust store  │  │ i18n /       │
                        │ (SQLite+YAML)│  │ prompts      │
                        └──────────────┘  └──────────────┘
```

The same `core` serves any future adapter (Codex, other agents): adapters translate their native event shapes into `CoreEvent` and render `Decision` outcomes back. Core never imports adapter code.

## 2. Module layout

```
src/
  core/
    events/          CoreEvent types, classification (execution/reasoning/decision/creativity)
    trust/           Trust Boundary model: entities, categories, states, scope resolution
    signals/         deterministic extractors: commands, manifests, configs, MCP names, anchors
    state/           ephemeral session state (create/read/write/prune)
    agency/          human-agency signal bookkeeping (inputs, streaks, drift counters)
    intervention/    policy: evidence → level → cooldown → outcome; decision record
    semantic/        optional LLM layer: scope-expansion & drift assessment (triggered only)
  adapters/
    claude-code/     hook entrypoints, input parse, decision render, install/uninstall
  interface/
    cli/             `hil` command: install, trust, status, review, mute, resume, hook
  db/                SQLite access + migrations (trust store)
  i18n/              locale loading, fallback, key checking
prompts/  en/  zh-CN/        analysis & intervention prompt templates (per language)
locales/  en/  zh-CN/        UI strings for CLI + hook output (per language)
db/  migrations/             SQL migrations shipped with the package
```

## 3. Event pipeline (hot path, no LLM)

```
CoreEvent
  → signals.extract(tool, input)          pure functions, ms-level
  → trust.resolve(entities)               scope chain: session → project → global
  → state.update(decisions, humanInput)   append-only within session
  → intervention.evaluate(evidence)       rules + state + cooldowns
  → outcome ∈ { none | context(info) | ask(high) }
  → adapter renders outcome as hook JSON
```

Layered analysis follows spec §25/§26: **rules + state first; semantic (LLM) reasoning only when deterministic evidence says "worth a look"** — e.g. a drift streak formed at `Stop`, or scope-expansion anchors accumulated. The semantic layer runs asynchronously (informational level only; it never gates the hot path) and sends the minimum context needed, never full histories.

## 4. Session state model

One JSON document per `session_id`, in `~/.hil/state/<session_id>.json`, deleted at `SessionEnd` (pruned by age at startup as a safety net; `hil uninstall` purges all remaining files — a crashed session never fires `SessionEnd`):

```ts
interface SessionState {
  taskId: string;                    // session_id
  createdAt: string;
  taskContext: string;               // digest of the initiating prompt(s)
  humanInputs: HumanInputEvent[];    // timestamp, length-class, specificity heuristic
  decisions: DecisionRecord[];       // { tier, owner: human|agent, entity?, evidence }
  pendingCrossings: PendingAsk[];    // outstanding ask decisions + cooldown anchors
  interventionHistory: Intervention[]; // { level, category, at, outcome }
  cooldowns: Record<Category, number>;
  muted: { session: boolean; categories: Category[] };
  temporaryTrust: Entity[];          // session-scope grants
}
```

Default is ephemeral: nothing here is a behavioral record, nothing survives the session, nothing is aggregated across sessions. (Spec §22/§24.)

## 5. Database model

SQLite at `~/.hil/hil.db` (path overridable by `HIL_HOME`). Single concern: **the user's Trust Boundary and preferences** — never activity logs.

```
tools
------------------------------------------------
id            TEXT PK   (slug, e.g. "npm:supabase")
name          TEXT      canonical display name
category      TEXT      library|database|external_service|plugin_mcp|cli_infra|data_source|…
ecosystem     TEXT?     npm|pypi|cargo|go|…
trust_status  TEXT      unknown|reviewed|trusted|restricted|temporary
scope         TEXT      global|project
source        TEXT?     config file | cli | user
notes         TEXT?
expires_at    INTEGER?  for temporary
created_at    INTEGER
updated_at    INTEGER

meta   (schema_version, language preference)
```

- Categories are rows-of-data, not code branches — adding one is config (spec §10).
- The YAML config files are the authoring surface; the DB is the compiled lookup surface. `hil trust …` writes both consistently.
- Over-engineering is explicitly refused (spec §23): no ORM, `node:sqlite` (or a minimal driver), plain migrations.

## 6. Prompt architecture

Not one giant system prompt (spec §25). Independently replaceable components, each a small template file per language:

```
prompts/
  en/        core-system.md · decision-analysis.md · agency-analysis.md
             trust-analysis.md · risk-screening.md · intervention.md
  zh-CN/     (mirrors en/)
```

- Only the **semantic layer** uses these (M4+); the deterministic path uses `locales/` strings only.
- Templates are loaded by name + language, with `en` as fallback; missing keys are a build-time test failure, not a runtime surprise.
- Intervention *wording* (levels, trust alerts, review areas) lives in `locales/`, so even deterministic interventions are fully localizable and user-editable (spec §19/§20).

## 7. Localization architecture

- `locales/<lang>/*.json` keyed strings; loaded via `i18n.t(key, params)`; **no user-facing string is hardcoded** (spec §28).
- `language.default` + `language.available` in config; `HIL_LANG` env override; fallback chain `lang → en`.
- Adding `ja`/`ko`/`fr`/… = adding a directory + registering it in config. No core code changes.
- CI asserts: zh-CN and en key sets are identical.

## 8. Repository structure (open-source layout)

```
/
├── LICENSE  README.md  README.zh-CN.md
├── CONTRIBUTING.md  CONTRIBUTING.zh-CN.md  CODE_OF_CONDUCT.md  SECURITY.md
├── package.json  tsconfig.json  biome.json  vitest.config.ts
├── src/ … (see module layout)
├── prompts/  locales/  db/
├── docs/                     bilingual architecture docs (this set)
├── examples/
│   └── trust-boundary.example.yaml
├── tests/                    unit · fixtures (hook JSON) · scenario corpus
└── .github/
    ├── ISSUE_TEMPLATE/  PULL_REQUEST_TEMPLATE.md
    └── workflows/ci.yml       biome + tsc + vitest on windows & ubuntu
```

Copyright: `BDNA6` (supplied by the author; spec §13 — never invent).

## 9. Cross-cutting constraints

| Constraint | Rule |
|---|---|
| Performance | hook path p95 < 50 ms, local-only, no network |
| Failure | fail-open: any error → no decision, never break the session |
| Privacy | local processing; semantic layer sends minimal snippets only; no telemetry |
| Extensibility | new agent = new adapter; new category = data; new language = new locale dir |
| Simplicity | every module must be explainable against a spec section; no speculative abstraction |
