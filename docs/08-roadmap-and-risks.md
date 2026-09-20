# HIL — Roadmap & Risks

> Status: M0 architecture deliverable · Covers: development roadmap, technical & product risks, requirements traceability to spec §36.

## 1. Roadmap

Milestones are value-ordered: every milestone ends with something verifiable. "Research-gated" items proceed only after their gate resolves.

| M | Deliverable | Acceptance | Target |
|---|---|---|---|
| **M0** Architecture & research | Bilingual docs 01–08; Claude Code + Codex capability research; TS toolchain | §36's 20 design items covered (§3 below) | **done** |
| **M1** Open-source scaffolding | LICENSE (MIT, placeholder holder), bilingual README/CONTRIBUTING, COC, SECURITY, `.github/` (templates + CI), examples, `hil --help` skeleton | CI green on windows+ubuntu; en/zh README parity | next |
| **M2** Core domain | Trust Boundary (entities, 5 states, 3 scopes), YAML+SQLite store, ephemeral SessionState, i18n skeleton (en/zh) | Unit tests: scope chain, states, slug matching (`pip install pymongo` → crossing), locale parity | |
| **M3** Claude Code adapter | Deterministic signal engine (commands/manifests/config/MCP names), intervention policy (cooldown/levels/mute), `PreToolUse` → `ask` flow, `/hil` commands, `hil install` | Live Claude Code session: out-of-boundary install → localized ask → allow → cooldown silence; routine work → zero interventions; scenario corpus green | **v0.1.0** |
| **M4** Semantic layer (optional, trigger-only) | `prompts/` per language; drift & scope-expansion assessment at `Stop` checkpoints; minimal-context LLM calls | §16 scenario → exactly one escalating prompt; healthy-flow corpus → zero prompts; semantic layer disableable | v0.2.x |
| **M5** Codex adapter | `src/adapters/codex` per doc 05 (deny+reason mapping), `hil install --target codex` incl. `/hooks` trust guidance | Same scenario corpus passing through the Codex adapter (rendering-mapped); research gate: hooks-in-exec verified or dropped | v0.3.x |
| Later | Claude Code plugin packaging; app-server wrapper mode; additional languages (ja/ko/…); license-awareness fetch; plugin/MCP-category starter pack | — | backlog |

Explicitly deferred (not on any milestone until justified): license metadata fetching (M4+), adaptive thresholds, telemetry of any kind (only if opt-in and documented, per spec §24).

## 2. Risks

### 2.1 Technical

| Risk | Impact | Mitigation |
|---|---|---|
| False positives annoy users into uninstalling | fatal for adoption | deterministic-only high-level interventions in v1; uncertainty → informational; scenario corpus gate on every signal PR (doc 07) |
| Hook latency degrades the agent experience | high | < 50 ms p95 budget, local-only hot path, fail-open; perf tests in CI |
| Upstream interface churn (Claude Code / Codex hook schemas) | medium | adapter contract tests pin the exact JSON; adapters are the only code touching native formats |
| Codex lacks `ask` (deny is stronger than HIL's philosophy) | medium | documented honestly; reason wording returns decision to user; cooldown prevents deny-loops; `PermissionRequest` fall-through preferred when available (doc 05 §4) |
| Command parsing misses install variants (false negatives) | low–medium | observation-only cost is low; corpus grows from real usage; misses surface as scenario gaps, not user harm |
| Windows shell diversity (cmd/PowerShell/git-bash forms) | medium | fixtures for all three forms in unit corpus from day one (dev machine is Windows) |
| SQLite/Node version coupling (`node:sqlite` availability) | low | Node ≥ 20 gate; fallback driver decision at M2 if needed |

### 2.2 Product

| Risk | Impact | Mitigation |
|---|---|---|
| Feature requests drift HIL toward surveillance ("just add a participation metric") | existential (identity) | schema has no identity/aggregation dimension; every PR checked against the design question (doc 02 §7); refuse in review with pointer to spec §24 |
| Trust-boundary authoring friction ("empty by default → everything alerts") | high | empty boundary ⇒ v1 behavior is ask-once-per-category with cooldown, not nagging; starter templates; `hil trust add` from the alert itself |
| Users perceive HIL as "limiting the AI" | high | README leads with identity (doc 01 §8); agent-facing text never degrades capability; deny never used on Claude Code |
| Bilingual maintenance divergence | medium | en is authoritative; CI enforces locale key parity; zh-CN drift treated as a bug |
| Scope creep (agent-specific features leaking into core) | medium | core imports nothing adapter-specific (architecture doc §1); review rule |

## 3. Requirements traceability — spec §36's 20 design items

| # | Spec §36 item | Where |
|---|---|---|
| 1 | Product definition | doc 01 |
| 2 | Core conceptual model | doc 02 §1 |
| 3 | Human Agency model | doc 02 §2 |
| 4 | Decision Ownership model | doc 02 §3 |
| 5 | Trust Boundary model | doc 02 §4 |
| 6 | Intervention model | doc 02 §5 |
| 7 | Scope expansion model | doc 02 §6 |
| 8 | Session state model | doc 03 §4 |
| 9 | Database model | doc 03 §5 |
| 10 | Prompt architecture | doc 03 §6 |
| 11 | Localization architecture | doc 03 §7 |
| 12 | Claude Code integration strategy | doc 04 |
| 13 | Codex integration strategy | doc 05 |
| 14 | Privacy architecture | doc 06 §1 |
| 15 | Security & dependency awareness | doc 06 §2–4 |
| 16 | Open-source repository structure | doc 03 §8 |
| 17 | Testing strategy | doc 07 §2 |
| 18 | False-positive/negative strategy | doc 07 §3–4 |
| 19 | Development roadmap | this doc §1 |
| 20 | Technical & product risks | this doc §2 |

Ongoing evaluation duty (spec §37/§38): every milestone review re-answers *"Is HIL preserving human agency, or measuring human activity?"* before shipping.
