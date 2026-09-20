# HIL — Privacy & Security Architecture

> Status: M0 architecture deliverable · Covers: privacy architecture (spec §24), security & dependency/license awareness (spec §9, §14).
> Privacy is a first-class architectural requirement, not a feature.

## 1. Privacy principles → concrete design

| Principle | Concrete rule in HIL |
|---|---|
| Local processing | All deterministic analysis runs in a local process. No network on the hook path. |
| Local configuration | Trust Boundary lives in `~/.hil/` and `.hil/` (project). Nothing syncs anywhere. |
| Ephemeral session state | Per-session JSON, deleted at `SessionEnd`, age-pruned as safety net. Never aggregated across sessions. |
| Minimal retention | The SQLite store holds **only** user-authored trust configuration and preferences. No activity tables exist in the schema at all. |
| User transparency | `hil status` and `hil review` show everything HIL knows about the current session. `docs/` documents every file HIL writes. |
| Explicit configuration | Behavior-changing options are opt-in (language, semantic layer, future integrations). |
| No hidden telemetry | v1 ships **zero** telemetry. If ever introduced: explicitly opt-in, documented payload, off by default — per spec §24. |
| No surveillance surface | There is no API, table, export, or report that answers "how much did a human work/participate". The product cannot degrade into one without a schema redesign, which is a deliberate friction. |

### 1.1 The anti-pattern, by name (spec §24)

```
Employee A — AI usage 4.8h — human participation 32%
Employee B — AI usage 3.1h — human participation 71%
```

This is not HIL. The data model cannot express it: there is no user-identity dimension, no aggregation layer, no participation metric. Agency dimensions (conceptual models doc) exist only inside one session's ephemeral reasoning state.

### 1.2 Semantic layer data flow (M4+)

When the optional LLM layer runs, it sends: the task-context digest, a compact decision log (titles/tiers/entities), and the specific question — **never** full transcripts, file contents, or credentials. Users can disable the layer entirely (`semantic.enabled: false`) and HIL remains fully functional for deterministic signals.

## 2. Security posture of HIL itself

- **Privilege**: HIL hook processes run with the user's privileges, same as Claude Code. HIL never elevates, never writes outside `~/.hil/`, `.hil/`, and its own install/uninstall targets (`settings.json`, `.claude/commands/`) — the latter two only via explicit `hil install`.
- **Input trust**: hook stdin JSON is parsed defensively (schema-checked, size-capped). Malformed input → fail-open, logged locally.
- **Injection resistance**: intervention text is produced from i18n templates + entity names; entity names are sanitized before rendering into permission reasons, so a malicious package name cannot smuggle control text into prompts (`permissionDecisionReason` is plain text by contract).
- **State files**: written with user-only permissions where the platform supports it; state dir contains no secrets by design (HIL never reads credentials).
- **Fail-open**: HIL errors never block the user's session (see architecture doc §9). Security of the user's workflow must not depend on HIL being healthy.

## 3. Dependency & license awareness (risk screening, not verdicts)

HIL helps humans **screen and investigate** risk (spec §9). It does not judge:

### 3.1 Factual review areas surfaced on a trust-boundary crossing

data flow · network access · credentials & who controls them · external permissions · dependency origin · supply-chain exposure · external services · data storage location · licensing · maintenance status · vendor lock-in · attack surface · privacy implications.

Presented as a checklist of questions, not assertions. HIL never says "X is unsafe" without verifiable evidence; the default claim is exactly: **"X is outside your configured trust boundary."**

### 3.2 License awareness (spec §14)

When license metadata is available for an introduced dependency (from the package registry manifest or lockfile, fetched only on demand outside the hot path), HIL reports the license class factually:

```
MIT · Apache-2.0 · BSD · GPL · AGPL · Commercial · Unknown
```

with neutral phrasing, e.g.:

> "This dependency uses GPL-3.0. Depending on how the resulting software is distributed, this may introduce licensing obligations. Consider reviewing the license before proceeding."

No license is labeled "safe" or "unsafe"; obligations depend on use and distribution, which belong to the human.

### 3.3 Extensibility

The risk-screening checklist and license classes are locale/data-driven; new areas (e.g. telemetry-in-dependency checks) can be added without touching the intervention engine.

## 4. HIL's own supply chain

- Minimal dependency budget: hot path has zero third-party dependencies (Node built-ins only: `node:sqlite`, `fs`, `path` …). CLI-side dependencies kept to a short, audited list.
- Lockfile committed; `npm audit` in CI; no post-install scripts in dependencies (CI-enforced).
- MIT license for HIL itself; copyright `BDNA6` (author-supplied; spec §13 — never invented).
