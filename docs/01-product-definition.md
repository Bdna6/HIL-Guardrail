# HIL — Product Definition

> Status: M0 architecture deliverable · Source of truth: `PROMPT_HIL.md`

## 1. One-liner

**HIL (Human in the Loop)** is a lightweight, AI-native **Human Agency Guardrail**: it lets coding agents (Claude Code, Codex, …) stay fully capable and autonomous, while keeping humans meaningfully involved in the decisions that matter.

## 2. The problem

Highly capable agentic AI can now choose architecture, pick dependencies, define APIs, and make product decisions in one long autonomous run. The failure mode is not bad output — it is **quiet decision-ownership transfer**:

```
Human: "Build this feature."
  → AI chooses architecture → chooses libraries → defines APIs
  → changes the data model → makes product decisions → implements everything
Human: "Looks good."
```

The user never decided against their will; they simply stopped being asked. HIL exists to notice this drift and gently return attention and decision ownership to the human.

## 3. The central question

Not *“How much work did the AI do?”* but:

> **Who is making the decisions?**

## 4. What HIL is

- A local, open-source guardrail that observes agent sessions through officially supported integration points.
- A **Trust Boundary** system: the user declares which tools/libraries/services they have reviewed; HIL alerts when the agent *actually introduces* something outside that boundary — awareness, never restriction.
- A gentle intervention system: concise, neutral, contextual prompts (informational → attention → high importance) that invite human judgment.
- Silent by default. **Silence is a feature.**

## 5. What HIL is NOT

| HIL is not | Because |
|---|---|
| an employee surveillance system | no usage hours, no participation percentages, no rankings |
| a productivity dashboard | it has no metrics surface by design |
| an "AI usage tracker" | usage volume is not the signal; decision ownership is |
| an AI-content / plagiarism detector | irrelevant to the goal |
| a tool that forces manual work | HIL invites **judgment, not labor** |
| a way to make AI less capable | the agent reasons at full capability always; HIL never injects "be more careful / ask more" style prompts |
| an allowed-tools list enforcer | the Trust Boundary never restricts what the agent may choose or recommend |
| an interrupt machine | cooldowns, severity thresholds, session/project dismissal, and `/hil mute` exist precisely to prevent nagging |

## 6. Target users

- Individual developers pairing with Claude Code / Codex daily.
- Teams that want a shared, reviewable Trust Boundary as project configuration (not employee oversight).
- Anyone who wants to stay the decision-maker as their agent's autonomy grows.

## 7. Product promises

1. **No capability reduction.** HIL never weakens the agent, never adds crude "involve the human more" prompts.
2. **Awareness, not verdicts.** HIL states facts ("X is outside your trust boundary") and review areas (data flow, credentials, licensing, lock-in). It does not declare tools "unsafe" without verifiable evidence.
3. **Local and private.** Local processing, local config, ephemeral session state, no telemetry.
4. **Respectful interruption.** Every intervention explains why it fired, is dismissible, and returns the decision — not the work — to the human.
5. **Bilingual from day one.** English + Simplified Chinese for docs, prompts, and all user-facing strings; architecture ready for more languages.

## 8. Product identity

Not *"a tool that limits AI."*

> **A tool that protects human agency in highly autonomous AI workflows.**

> AI can execute. AI can reason. AI can create.
> Humans should remain aware of and meaningfully involved in the decisions that matter.

The ideal intervention feels like:

> *"I can continue. But this is becoming your decision, not merely my task."*

## 9. Success criteria

- In routine autonomous work (tests, refactors, debugging), HIL is invisible: zero interventions.
- When the agent crosses the user's Trust Boundary (e.g. installs an unreviewed cloud SDK), the human sees one concise, neutral alert and decides with Allow / Reject / Investigate.
- In a long drift scenario (many consequential decisions + repeated low-information "looks good"), HIL raises exactly one escalating prompt — not a stream of them.
- Users describe HIL as *"it reminds me when I'm handing over decisions I should own"*, never *"it tells me how to work."*
- Uninstalling is never motivated by annoyance.

## 10. Out of scope (v1)

- Any form of productivity measurement or reporting about humans.
- Enforcement/blocking of tools by policy (Trust Boundary informs; it does not forbid).
- Centralized or hosted deployment; HIL is a local tool.
- Hard-coding any agent beyond the adapter layer.
