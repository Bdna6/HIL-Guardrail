# HIL — Human in the Loop

**Let AI execute. Keep understanding, judgment, and responsibility with you.**

English · [简体中文](README.zh-CN.md) · [Local runtime guide](docs/10-local-runtime.zh-CN.md)

HIL is a local background collaboration guardrail. Its web console manages settings; work, questions, and learning stay in the original CLI or IDE. HIL helps people delegate to AI intentionally: define what AI may do, identify the decisions, checks, and thinking people should retain, and support that participation at meaningful checkpoints.

HIL assumes people voluntarily choose it to improve work and learning. Preventing users from opening an unconnected tool is outside the product's focus.

## Why HIL

- **Building:** beginners may accept dependencies, permissions, and cloud services they do not need or understand. A local app can quietly become a complex hosted system.
- **Working:** convenience can displace verification, until unchecked AI output causes a consequential mistake.
- **Learning:** delegating an entire assignment produces answers without thinking practice. Progressive hints and understanding challenges help preserve that practice.

The question is not how much work a human performed, but whether they were informed, made necessary judgments, and understood and verified the results they own.

## Product direction

| Mode | Goal | Typical checkpoint |
| --- | --- | --- |
| Build | Control scope and understand technical choices | Explain dependencies, services, and scope changes before confirmation |
| Work | Make conclusions and deliverables verifiable | Trace sources, check assumptions, verify key results |
| Study | Preserve thinking and build understanding | Attempt first, receive hints, explain, predict, and apply to variations |

Trust boundaries expand into **delegation boundaries**:

1. **Resources:** which libraries, services, permissions, and data connections may AI introduce?
2. **Scope:** which requirements and design choices may AI change independently?
3. **Responsibility:** which judgments, checks, and thinking remain with the person?

Trusting a tool does not mean the project needs it or the user understands its consequences. Unfamiliar dependencies are not automatically unsafe; present evidence and implications rather than unsupported safety verdicts.

```text
Intent and delegation agreement → staged AI work → explain consequential choices
    → human decision / verification / understanding challenge → review and handover
```

Challenges are one intervention, not the default for every task. Understanding checks cannot replace factual verification or tests, or conclusively establish competence.

## Implementation status

| Capability | Status |
| --- | --- |
| Claude Code hooks adapter | Implemented; deterministic command, file, and MCP signals |
| Trust configuration | Implemented; scopes, cooldown, mute, bilingual alerts |
| Web dashboard | Independent interactive demo; Build/Work/Study, per-mode settings, appearance, sample Usage and open-source components |
| Local service connecting web to Claude Code | Implemented; `/local` controls, persistent policies and runtime facts |
| Production accounts and server authentication | Planned |
| Semantic scope and answer assessment | Optional provider-backed checks implemented; durable project memory remains planned |
| Codex hooks adapter | Planned; requires validation against current official interfaces |

See the [documentation index](docs/README.md) for setup and adapter research. Current behavior is defined by the implementation and tests. Source version is `0.2.0`; this does not imply publication to npm.

## Run the local runtime

```powershell
npm install
npm run build
npm run hil -- install --scope user
npm run hil -- start --port 4174
```

Open **http://127.0.0.1:4174/local/dashboard** for real mode, enablement and policy configuration. Ask Claude Code for HIL's mode, enabled state and version: native hooks supply authoritative facts on every user turn. Open a new Claude Code session after first installation; subsequent mode changes apply on the next user message, while disabling applies to subsequent tool events immediately.

Default startup uses local rules and human checkpoints. Append `--semantic claude` only with a configured API endpoint, model and key to enable extra billed assessments. **Claude account/subscription login and OAuth credentials cannot be reused for this evaluator.** Optional `--direct` bypasses proxies; omit it when a proxy is required.

Use `npm run hil -- runtime status` or `npm run hil -- stop`. The local service does not require cloud authentication. `/demo/*` remains isolated fictional data; `npm run dashboard` still serves only the static frontend, normally on port 4173.

See [the local runtime guide (Chinese)](docs/10-local-runtime.zh-CN.md) for CC Switch, semantic configuration, storage, limitations, and validation. Native Claude Code 2.1.92 status delivery and a GLM scope assessment were tested; a DeepSeek-native session has not been claimed as tested.

## How HIL will participate in CLI work

The architecture is a **local companion + web console + tool adapters**. The current console configures machine-wide mode and goals; each session records the revision it has loaded; adapters receive events and apply supported context and checkpoints through official interfaces.

- **Companion mode:** retain the CLI with explanations, operation checkpoints, and review.
- **Learning mode:** adapters supply learning agreements and checkpoints; users attempt, receive hints, and answer in their original CLI/IDE. No web Agent workspace.

Current flow: save settings, load mode facts on the next user turn, and continue in the original tool. First hook installation requires a new session. Browser save does not establish CLI activation. Approvals, understanding assessment, and output presentation are separate capabilities to validate per adapter. End-of-turn checks do not establish control over answers already displayed.

## Legacy npm CLI guardrail

This is the earlier npm guardrail entry point, not proof that the local runtime has been published to npm. New users should use the source installation above. Requires Node ≥ 22.13 and Claude Code CLI.

```bash
npm install -g hil-guardrail
hil install --scope user
hil trust add postgresql --category database
hil trust add react fastapi --category library
```

HIL provides localized review prompts when an agent introduces entities outside the configured boundary. Depending on permission mode, the adapter requests confirmation or denies the current operation with a reason. Successful execution is not evidence of human understanding.

| Command | Purpose |
| --- | --- |
| `hil install` / `hil uninstall` | Add/remove Claude Code hooks |
| `hil trust add` / `hil trust remove` / `hil trust list` | Manage trust boundaries |
| `hil status` / `hil review` | Inspect session state and decisions |
| `hil mute` / `hil resume` | Silence/restore legacy trust alerts; use the local web switch for overall runtime enablement |

Deterministic rules run locally without telemetry and keep ephemeral session state. Enabled semantic analysis sends minimal task, operation and answer snippets to the configured provider; common credential patterns are redacted, without a guarantee that all sensitive data can be detected.

## Latest research

See the [background hooks feasibility report (Chinese)](docs/09-hooks-feasibility.zh-CN.md), dated 2026-10-30. It prioritizes Claude Code, then Codex hooks, with Gemini CLI and OpenCode as later candidates, distinguishing documented interfaces from designs and unverified behavior.

## Implementation boundaries

- Summary, context and acknowledgment preferences are Agent instructions, not separate hard gates.
- Enforced checkpoints cover identified resources, participation before Study implementation, and review after changes. Semantic scope and understanding checks require a separately configured evaluator.
- Without evaluation, substantive replies record participation/authorization rather than understanding. Model compliance and assessments are not guaranteed.
- Per-project web modes, cloud accounts/sync, durable project memory, real Usage statistics and Codex integration remain unimplemented.

## Next steps

1. Validate modes, explanations, and checkpoints with beginners.
2. Expand real-session compatibility testing across Claude Code versions and DeepSeek.
3. Improve semantic assessment accuracy, false-positive handling and project evidence.
4. Implement production authentication and opt-in project memory.
5. Add Codex hooks; prepare a repeatable competition demo and user evaluation.

HIL is not employee surveillance, participation ranking, or a human-contribution percentage system. Evaluate whether it helps users notice choices, verify results, explain and own outcomes, while keeping interruptions reasonable.

## Development and license

```bash
npm install
npm run check
```

The native HTML/CSS/JavaScript frontend is independent of the TypeScript CLI. See [CONTRIBUTING.md](CONTRIBUTING.md).

[MIT](LICENSE) · © 2026 BDNA6
