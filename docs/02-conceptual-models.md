# HIL — Conceptual Models

> Status: M0 architecture deliverable · Covers: core conceptual model, Human Agency, Decision Ownership, Trust Boundary, Intervention, Scope Expansion.
> Design rule: these models power **intervention reasoning**. They are never compiled into a human "score".

## 1. Core conceptual model

HIL reasons about every observed moment of an agent session through three primitives:

```
Event        what happened (normalized tool call, message, command, file change)
Decision     a choice with consequences (which technology, which approach, which behavior)
Owner        who made it — the human (explicitly or by delegation) or the agent (assumed)
```

An **Event** becomes interesting when it implies a **Decision** whose **Owner** is the agent but whose consequence tier (below) is high. That is the entire analytical engine in one sentence; everything else refines it.

## 2. Human Agency model

Six dimensions, assessed qualitatively per session — never summed, never percentages:

| Dimension | Question |
|---|---|
| Initiation | Did the human define the problem, objective, constraints, success criteria? |
| Direction | Did the human choose direction, set priorities, resolve ambiguity, redirect goals? |
| Judgment | Did the human select among alternatives, accept/reject proposals, make trade-offs, challenge reasoning? |
| Creativity | Did the human contribute original ideas, transforms or combinations of AI-generated ideas? |
| Verification | Did the human meaningfully review important outcomes? |
| Ownership | Does the human understand what was done and consciously accept the final decision? |

Key stance (spec §37): agency ≠ activity. `Human execution 10% / AI 90%` can be extremely healthy; `50/50` can be agency-free. A small human intervention ("use Postgres, not Mongo; the other one loses data") can carry more decision significance than hundreds of lines the human typed.

## 3. Decision Ownership model

Consequence tiers (spec §5), each mapped to a default intervention posture:

| Tier | Examples | Default posture |
|---|---|---|
| 1 · Execution | run tests, format, rename, fix syntax, routine refactor | observe, never intervene |
| 2 · Reasoning | root-cause analysis, diagnosing failures, trade-off explanations | light awareness signals only if a streak forms |
| 3 · Consequential | architecture, DB/backend/frontend framework, auth, data model, API contracts, major dependencies, irreversible choices | prime intervention zone |
| 4 · Creative / Strategic | product behavior, UX direction, feature scope, algorithm invention, interaction philosophy | highest sensitivity; ownership belongs to the human by default |

The engine classifies agent activity as `execution | reasoning | decision | creativity` — never treating all model activity as equal.

## 4. Trust Boundary model

### 4.1 Entities

Anything the agent might introduce or depend on, grouped by extensible categories:

- **libraries** — React, FastAPI, PyTorch, Prisma
- **databases** — PostgreSQL, MongoDB, Redis, Supabase, Firebase
- **external services** — AWS, Stripe, Auth0, S3, OpenAI, third-party APIs
- **plugins / MCP / agent tools** — MCP servers, browser automation, filesystem tools, remote execution
- **CLI / infrastructure** — Docker, kubectl, Terraform, cloud CLIs
- **data sources** — external APIs, remote databases, third-party datasets, scraping services

New categories are data, not code — adding one must not require core changes.

### 4.2 Trust states

```
unknown     not reviewed; default state
reviewed    user examined it; no objections
trusted     user actively comfortable; never interrupts
restricted  always ask before use (NOT a ban — an explicit-confirmation requirement)
temporary   trusted for a bounded scope/time (session or expiry)
```

### 4.3 Scopes

```
global   (~/.hil/config + user db)   e.g. Python, GitHub
project  (.hil/config in repo)       e.g. React, PostgreSQL, AWS
session  (ephemeral session state)   e.g. "fine, Stripe just for tonight"
```

Lookup precedence: session → project → global → `unknown`. Composition must be explainable: `/hil trust` shows exactly which scope a decision came from.

### 4.4 The invariant

The Trust Boundary is **not an allowed-tools list**. HIL must never tell the agent "only use trusted tools" or "don't recommend untrusted libraries." The agent keeps full freedom to reason and propose. HIL acts only at the moment the agent **actually introduces, installs, connects to, configures, or depends on** an out-of-boundary entity — and even then the action is *surfaced to the human*, not blocked by policy.

## 5. Intervention model

### 5.1 Trigger evidence (spec §18) — multiple signals together, never naive thresholds

High-consequence decision in progress **and/or** unusually low human participation **and/or** accumulating agent decision authority **and/or** material scope expansion **and/or** unreviewed tool introduction **and/or** data/security/privacy/licensing/infrastructure boundary change **and/or** creative/strategic drift toward the agent.

Explicitly rejected as primary mechanisms: `N tool calls`, `N minutes`, `N lines`. These are weak proxies; context and consequence dominate.

### 5.2 Levels

| Level | Use | Tone example |
|---|---|---|
| Informational | low-confidence, tier-2 signals | "I'm making a few assumptions about the direction. Worth a quick review before I continue." |
| Attention | repeated tier-3 decisions without human input | "I've made several consequential implementation decisions without much input from you. Want to review the approach?" |
| High importance | trust-boundary crossing; tier-4 drift; irreversible actions | "The next steps involve architecture and external dependencies that were not previously reviewed. I can continue autonomously, but this is a meaningful decision point." |

### 5.3 Style rules

Concise · contextual · neutral · explains why it fired · no judgmental language · returns decision ownership. Never invites manual labor. Wording is localized (en/zh-CN) and configurable, never hardcoded.

### 5.4 Anti-nagging machinery (spec §21)

Confidence threshold per level · severity gating · per-category intervention cooldown · user override at three granularities (once / session / project) · temporary trust grants · adaptive thresholds (a category the user always approves quickly stops escalating).

## 6. Scope Expansion model

The agent materially exceeds the user's task without authorization (spec §17):

```
User: "Fix the login bug."
Agent: rewrite authentication → change DB schema → replace auth framework
     → introduce third-party identity provider
```

Detection is semantic (compare task intent vs. trajectory of decisions), assisted by deterministic anchors: edits outside implied areas, new config/services, schema migrations, new dependencies beyond the fix. Each anchor alone is weak; the model fires on the *pattern* — original request + divergence magnitude + consequence tier of the divergence.

## 7. The design question (checked continuously)

> Is HIL preserving human agency, or just measuring human activity?

Every feature is evaluated against it: if a mechanism can only be explained as measurement of humans, it does not ship.
