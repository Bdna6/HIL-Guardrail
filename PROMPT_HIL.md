# Human in the Loop (HIL)

## Project Vision

I want to build an open-source project called **Human in the Loop (HIL)**.

HIL is designed for people who work with highly capable AI coding and reasoning agents such as:

* Claude Code
* Codex
* and other agentic AI systems in the future

The goal of this project is **not** to reduce AI usage.

The goal is **not** to make the AI intentionally less capable.

The goal is **not** to monitor employees, measure productivity, or quantify how much work a person performs.

The core goal is:

> **Allow AI to remain as capable and autonomous as possible, while keeping humans meaningfully involved in important decisions, judgment, creativity, and risk awareness.**

HIL should not feel like a traditional monitoring system.

It should feel like a lightweight, AI-native **Human Agency Guardrail**.

The central question is not:

> How much work did the AI do?

The central question is:

> **Who is making the decisions?**

---

# 1. Core Philosophy

AI may:

* write large amounts of code
* run tests
* debug
* refactor
* inspect a codebase
* search documentation
* generate alternatives
* create files
* modify architecture
* execute commands
* perform complex multi-step tasks

None of these are inherently problematic.

The important issue is whether the human gradually stops contributing meaningful:

* intent
* direction
* judgment
* creativity
* risk awareness
* ownership

while the AI continues making increasingly consequential decisions on the human's behalf.

Therefore:

> **Keep humans deciding, not necessarily executing.**

Human involvement should not mean that humans must manually write code or perform repetitive work.

For example, this is a healthy workflow:

```text
Human defines the objective
        ↓
AI analyzes the problem
        ↓
AI generates multiple solutions
        ↓
Human selects a direction
        ↓
AI implements it
        ↓
AI tests and debugs
        ↓
Human reviews the consequential result
```

By contrast, this may represent a Human-in-the-Loop failure mode:

```text
Human: "Build this feature."
        ↓
AI chooses architecture
        ↓
AI chooses libraries
        ↓
AI defines APIs
        ↓
AI changes the data model
        ↓
AI changes business logic
        ↓
AI makes product decisions
        ↓
AI implements everything
        ↓
Human: "Looks good."
```

The second workflow may still produce excellent technical output, but meaningful human decision ownership has become very low.

HIL should detect this kind of pattern and gently return attention and decision-making to the human when appropriate.

---

# 2. What HIL Is NOT

Do not turn HIL into:

* an employee surveillance system
* a productivity monitoring dashboard
* an AI usage tracker
* a "human contribution percentage" system
* an employee ranking system
* an AI-content detector
* a plagiarism detector
* a tool that forces humans to write code manually
* a system that intentionally makes AI worse
* a system that creates artificial work for humans
* a system that interrupts the user constantly
* a system that assumes more AI usage means less human contribution
* a system that restricts an AI agent to a predefined list of tools

Do not optimize for "maximum human activity."

Optimize for:

> **Meaningful Human Agency.**

---

# 3. Human Agency Model

HIL should establish a conceptual model of **Human Agency**.

Do not immediately turn this into a numerical score.

The model should instead reason about several dimensions.

## Human Initiation

Did the human meaningfully define:

* the problem
* the objective
* the constraints
* the expected outcome
* the success criteria

## Human Direction

Did the human:

* choose a direction
* establish priorities
* provide domain knowledge
* resolve ambiguity
* redefine goals when necessary

## Human Judgment

Did the human:

* select among alternatives
* accept or reject proposals
* validate important assumptions
* make trade-offs
* challenge the AI's reasoning

## Human Creativity

Did the human contribute:

* original ideas
* conceptual direction
* product behavior
* novel approaches
* transformations of AI-generated ideas
* combinations or reinterpretations of suggestions

## Human Verification

Did the human meaningfully review important outcomes?

## Human Ownership

Does the human understand what the AI has done and consciously accept the consequences of the final decision?

These concepts should primarily be used for **intervention reasoning**, not employee scoring.

---

# 4. Do Not Reduce AI Capability

This requirement is fundamental.

Never instruct the AI agent to:

* become less intelligent
* intentionally stop solving problems
* intentionally avoid making safe decisions
* ask unnecessary clarification questions
* force the human to manually perform tasks
* artificially distribute trivial work to humans

Do not add prompts such as:

> "You should involve the human more often."

That is too crude and will degrade the user experience.

Instead:

> **AI autonomy is desirable. Unnoticed transfer of consequential decision-making is what matters.**

The AI should continue operating at full capability unless there is a meaningful reason to return a decision to the human.

---

# 5. Decision Ownership

The core analytical concept should be **Decision Ownership**.

Not all AI actions have the same consequence.

## Low-consequence execution

Examples:

* run tests
* format code
* rename variables
* update imports
* fix obvious syntax errors
* execute known commands
* perform routine refactoring
* install an obvious dependency for a clearly specified purpose

These usually require little or no intervention.

## Reasoning

Examples:

* identify the root cause of a bug
* inspect unfamiliar code
* diagnose a test failure
* analyze implementation choices
* explain technical trade-offs

These may require moderate human awareness depending on context.

## Consequential decisions

Examples:

* architecture selection
* database selection
* backend framework
* frontend framework
* authentication architecture
* data model
* API contracts
* security architecture
* major dependency choices
* irreversible implementation choices
* significant product behavior

These deserve greater attention.

## Creative / Strategic Decisions

Examples:

* defining product behavior
* determining UX direction
* inventing an algorithm
* deciding feature scope
* creating a new concept
* defining an interaction philosophy
* choosing major product trade-offs

These should be treated as particularly important Human Agency areas.

HIL should therefore distinguish between:

```text
AI execution
AI reasoning
AI decision
AI creativity
```

rather than treating all model activity equally.

---

# 6. New Core Mechanism: User-Defined Trust Boundary

HIL should introduce a second major concept:

> **Trust Boundary**

A user should be able to explicitly define which tools, libraries, services, frameworks, platforms, databases, plugins, and technologies they have reviewed and are comfortable using.

For example:

```yaml
trusted_tools:
  languages:
    - Python
    - TypeScript

  frameworks:
    - FastAPI
    - React

  databases:
    - PostgreSQL
    - SQLite

  package_ecosystems:
    - npm
    - PyPI

  external_services:
    - GitHub
    - OpenAI
```

A user may also add richer metadata:

```yaml
tool:
  name: PostgreSQL
  category: database
  trust_level: reviewed
  notes: "Approved for internal development"
```

However, **Trust Boundary is not an Allowed Tools List.**

This is a critical distinction.

HIL must NOT tell the coding agent:

> "You may only use tools from the trusted list."

HIL must NOT tell the coding agent:

> "Do not recommend libraries outside the trusted list."

The coding agent should continue to reason normally and may recommend or use technologies outside the user's trust boundary.

The purpose of the Trust Boundary is awareness, not restriction.

---

# 7. Trust Boundary Crossing

Suppose the user has configured:

```text
PostgreSQL
React
FastAPI
SQLite
```

as trusted technologies.

The AI agent is still allowed to propose:

```text
MongoDB
Supabase
Firebase
Next.js
Redis
Prisma
```

However, when HIL detects that the agent is **actually introducing, installing, connecting to, configuring, or depending upon** something outside the user's trust boundary, HIL should intervene.

Conceptually:

```text
User
 ↓
Agent
 ↓
Agent freely chooses a tool
 ↓
HIL detects trust-boundary crossing
 ↓
HIL pauses or interrupts consequential action
 ↓
Human receives a concise risk-awareness prompt
 ↓
Human reviews
 ↓
Allow / Reject / Investigate
 ↓
Agent continues
```

Do not automatically block the tool.

Do not force the AI to choose an alternative from the user's trusted list.

Do not make the agent artificially conservative.

Instead:

> **Return awareness and decision ownership to the human.**

---

# 8. Example Trust-Boundary Intervention

For example, suppose the user asks:

> "Build a web application."

The coding agent decides to use:

```text
Frontend: Next.js
Backend: Supabase
Database: PostgreSQL
Authentication: Supabase Auth
Storage: S3
Analytics: Third-party SaaS
```

If these technologies have not been reviewed by the user, HIL should not silently allow the AI to proceed without awareness.

A possible intervention:

> **Trust Boundary Alert**
>
> The current implementation is introducing Supabase, which is outside your configured trust boundary.
>
> I am not blocking this approach. However, this introduces an external platform and may affect application data, authentication, infrastructure, and long-term dependency decisions.
>
> Before continuing, consider checking:
>
> * What data will be sent to the service?
> * Where will the data be stored?
> * Who controls the credentials?
> * What external permissions are required?
> * What dependencies are being introduced?
> * Are there vendor lock-in or migration implications?
>
> Continue / Review / Reject

The wording should remain neutral.

HIL should not automatically claim that the tool is unsafe.

Instead:

> **HIL identifies that the tool is outside the user's previously declared trust boundary.**

---

# 9. Risk Awareness, Not Risk Verdicts

Avoid statements such as:

> "This library is unsafe."

unless HIL has reliable, verifiable evidence supporting a specific claim.

Prefer:

> "This dependency is outside your configured trust boundary."

Then provide factual areas for review:

* data flow
* network access
* credentials
* permissions
* dependency origin
* supply-chain exposure
* external services
* data storage
* licensing
* maintenance status
* vendor lock-in
* attack surface
* privacy implications

HIL should help humans **screen and investigate risk**.

It should not make the final judgment for them.

---

# 10. Trust Boundary Scope

The Trust Boundary should support more than libraries.

It should be capable of representing:

## Libraries

```text
React
FastAPI
PyTorch
Prisma
```

## Databases

```text
PostgreSQL
MongoDB
Redis
Supabase
Firebase
```

## External Services

```text
AWS
Stripe
Auth0
S3
OpenAI
third-party APIs
```

## Plugins / MCP / Agent Tools

```text
MCP servers
browser automation tools
filesystem tools
third-party agent plugins
remote execution services
```

## CLI / Infrastructure Tools

```text
Docker
kubectl
Terraform
cloud CLIs
curl
```

## Data Sources

```text
external APIs
remote databases
third-party datasets
web scraping services
```

The architecture should be extensible so additional tool categories can be introduced later.

---

# 11. Trust States

Trust should not be represented only as yes/no.

Consider states such as:

```text
unknown
reviewed
trusted
restricted
temporary
```

Example:

```yaml
PostgreSQL:
  status: trusted

Redis:
  status: reviewed

Supabase:
  status: unknown

Firebase:
  status: restricted
```

The exact semantics should be designed carefully.

A "restricted" tool should not necessarily mean permanent prohibition.

It may simply mean:

> "Always require explicit human confirmation before use."

---

# 12. Trust Scope

Trust configuration should support different scopes.

For example:

```text
Global trust boundary
Project trust boundary
Session trust boundary
```

Example:

```text
Global:
    Python
    GitHub

Project:
    React
    PostgreSQL
    AWS

Session:
    Stripe
```

The architecture should make these scopes composable and understandable.

---

# 13. License Awareness

HIL itself should be properly initialized as an open-source project.

Use:

> **MIT License**

unless a concrete technical dependency makes that incompatible.

The coding agent should create and configure the appropriate project files, including:

* `LICENSE`
* SPDX license identifier
* README license section
* package metadata where applicable
* appropriate copyright / attribution placeholders
* open-source repository boilerplate

Do not invent the copyright holder's name.

Use an explicit placeholder where user information is required.

---

# 14. Dependency License Awareness

HIL may eventually include license awareness for introduced dependencies.

For example:

```text
MIT
Apache-2.0
BSD
GPL
AGPL
Commercial
Unknown
```

However, do not treat a license as inherently "safe" or "unsafe."

Instead, HIL should provide factual information and explain that a dependency may introduce licensing obligations depending on how the software is used and distributed.

For example:

> "This dependency uses GPL-3.0. Depending on how the resulting software is distributed, this may introduce licensing obligations. Consider reviewing the license before proceeding."

The human remains responsible for the decision.

---

# 15. Creative Agency

Creativity must be treated as a first-class concern.

Do not assume that humans need to manually generate every idea.

A healthy creative workflow may look like:

```text
Human defines intent
        ↓
AI generates possibilities
        ↓
Human selects / rejects
        ↓
AI develops the selected direction
        ↓
Human redirects / combines / transforms
        ↓
AI executes
        ↓
Human evaluates
```

A human can retain substantial creative agency even if most raw material was generated by AI.

Therefore HIL should reason about:

> **Creative Ownership**

rather than percentage of AI-generated content.

A small human intervention can carry much more creative significance than hundreds of lines of AI-generated text.

---

# 16. Detecting Reduced Human Agency

HIL should detect patterns such as:

```text
many consecutive AI actions
+
few meaningful human inputs
+
increasing decision consequence
+
AI resolving important ambiguity
+
AI expanding scope
+
human repeatedly giving low-information approvals
```

Potential signals may include:

* long sequences of autonomous agent activity
* multiple consequential decisions without explicit human direction
* repeated "yes", "continue", "go ahead", or similar low-information confirmations
* progressive scope expansion by the agent
* AI resolving major ambiguities without human input
* AI independently determining creative or strategic direction
* AI making architecture or product changes without explicit review
* human accepting proposals without meaningful evaluation

However:

**Do not rely primarily on simplistic thresholds.**

Examples such as:

```text
5 tool calls = warning
10 minutes = warning
100 lines = warning
```

are weak proxies.

Context and consequence matter more.

---

# 17. Scope Expansion

HIL should detect when an AI agent expands the scope of the user's task.

For example:

User:

> "Fix the login bug."

Agent then decides to:

```text
rewrite authentication
change database schema
replace the auth framework
redesign user permissions
introduce a third-party identity provider
```

Even if each individual step is technically reasonable, the agent has moved beyond the original task.

HIL should be able to recognize:

> **The scope of the task has materially expanded without explicit human authorization.**

This may justify intervention.

---

# 18. Intervention Policy

HIL should be:

> **Silent by default.**

Intervene only when there is sufficient evidence that:

* a high-consequence decision is being made
* human participation has become unusually low
* the agent is accumulating decision authority
* the task is expanding materially
* an unknown or unreviewed tool is being introduced
* important data, security, privacy, licensing, or infrastructure boundaries are changing
* creative or strategic ownership is drifting toward the agent

The system should consider multiple signals together.

Avoid rigid thresholds as the primary decision mechanism.

---

# 19. Intervention Style

Interventions should:

* be concise
* be contextual
* be neutral
* respect the user's autonomy
* explain why the interruption occurred
* avoid judgmental language
* encourage awareness
* return decision ownership to the human

Bad:

> "You have used too much AI. Please write the next part yourself."

Bad:

> "For Human in the Loop compliance, you must implement this manually."

Bad:

> "You need to do more work."

Good:

> "I'm making several consequential architectural decisions in a row. Before I commit further, I'd like your view on the direction."

Good:

> "The original request leaves an important product behavior undefined. I can make a reasonable choice, but this appears to be a decision worth keeping with you."

Good:

> "This dependency is outside your configured trust boundary. I can continue, but this changes the project's dependency and data surface and deserves a quick review."

The key principle is:

> **Invite judgment, not manual labor.**

---

# 20. Example Intervention Levels

Consider supporting multiple levels.

### Informational

```text
I’m making a few assumptions about the direction. Worth a quick review before I continue.
```

### Attention

```text
I’ve made several consequential implementation decisions without much input from you. Do you want to review the approach before I proceed?
```

### High Importance

```text
The next steps involve architecture and external dependencies that were not previously reviewed. I can continue autonomously, but this is a meaningful decision point.
```

The exact wording should be localized and configurable.

---

# 21. Do Not Interrupt Repeatedly

Repeated intervention will destroy the product.

Support mechanisms such as:

* confidence threshold
* severity
* intervention cooldown
* user override
* session-level dismissal
* project-level policy
* temporary trust
* adaptive thresholds

Consider allowing commands such as:

```text
/hil status
/hil trust
/hil trust add PostgreSQL
/hil trust remove Firebase
/hil review
/hil mute
/hil resume
```

The exact CLI design can be determined during architecture work.

---

# 22. Session State

HIL should maintain a lightweight state representation for the active agent session.

For example:

```python
HumanAgencyState(
    task_context,
    human_intent,
    current_decisions,
    decision_consequence,
    human_participation,
    trust_boundary,
    unknown_tools,
    intervention_history
)
```

The state should answer:

> What is happening in this task?

> What decisions have been made?

> Which decisions were made by the human?

> Which decisions were assumed by the agent?

> Has the agent expanded the scope?

> Has the agent crossed a trust boundary?

The default architecture should favor:

* session-local state
* ephemeral state
* minimal persistence

Avoid unnecessary long-term behavioral records.

---

# 23. Database

HIL should include a local database for persistent user configuration.

SQLite is a reasonable default.

The database is **not** intended to record employee productivity.

Its primary role is to store user-defined configuration such as:

* trusted tools
* libraries
* services
* frameworks
* databases
* plugins
* package ecosystems
* license preferences
* trust status
* scope
* notes
* configuration metadata
* language preference

Potential conceptual schema:

```text
tools
----------------------------
id
name
type
ecosystem
trust_status
scope
notes
created_at
updated_at
```

The exact schema should be designed to remain extensible.

Do not over-engineer the database.

---

# 24. Privacy Architecture

Privacy is a first-class architectural requirement.

The default design should favor:

* local processing
* local configuration
* ephemeral session state
* minimal retention
* user transparency
* explicit configuration
* no hidden telemetry
* no employee surveillance

Do not create a centralized database such as:

```text
Employee A
AI usage: 4.8 hours
Human participation: 32%
Employee B
AI usage: 3.1 hours
Human participation: 71%
```

That is not the product.

The database should primarily preserve:

> **User-defined Trust Configuration and local operational state.**

If telemetry is ever introduced, it should be explicitly opt-in and clearly documented.

---

# 25. Prompt Architecture

Do not implement HIL as one giant system prompt.

Split the logic into components such as:

```text
core system prompt
decision analysis prompt
human agency analysis prompt
trust boundary analysis prompt
risk screening prompt
intervention prompt
```

Different components should be independently replaceable.

Avoid sending the full interaction history to an additional LLM for every event.

Use a layered approach such as:

```text
deterministic signals
+
local state
+
semantic analysis when necessary
```

This should reduce latency, cost, and unnecessary model calls.

---

# 26. Deterministic vs LLM Reasoning

Use deterministic logic where exactness is available.

Potential deterministic signals:

* tool identity
* package name
* package manager
* plugin identity
* MCP server identity
* external network access
* new dependency introduction
* permission changes
* credential access
* filesystem scope
* command type
* license metadata
* trust boundary membership
* intervention cooldown
* configuration state

Use LLM-based reasoning where semantic context is necessary:

* Is the AI making a consequential decision?
* Has the agent materially expanded scope?
* Is the current change creative or strategic?
* Is human input meaningful or merely confirmatory?
* Is the AI assuming an important ambiguity?
* Has decision ownership shifted toward the agent?
* Should the system intervene?

The overall architecture can be:

```text
Rules
  +
State
  +
Semantic reasoning
  =
Intervention decision
```

---

# 27. False Positives and False Negatives

False positives are dangerous because they will make users disable HIL.

Examples:

* unnecessary interruptions
* warnings for trivial actions
* warnings during routine debugging
* treating every dependency as a risk event

Therefore:

> **Silence is a feature.**

False negatives are also important because HIL may fail to detect meaningful decision transfer.

Pay particular attention to:

* architecture
* security
* privacy
* external services
* data handling
* product direction
* irreversible actions
* major dependency changes
* strategic or creative decisions

Design the system to explicitly reason about uncertainty.

When confidence is low, prefer lightweight informational prompts over strong interruptions.

---

# 28. Language Support

From the beginning, HIL must support:

> **English + Simplified Chinese**

The following must have both English and Chinese versions:

* README
* system prompts
* intervention prompts
* architecture documentation
* configuration documentation
* contributor documentation
* user documentation

Recommended structure:

```text
README.md
README.zh-CN.md

docs/
    architecture.md
    architecture.zh-CN.md
```

Prompts should also be separated by language:

```text
prompts/
    en/
    zh-CN/
```

Localization resources:

```text
locales/
    en/
    zh-CN/
```

The language system must be designed so future languages can be added without changing the core architecture.

Potential future languages:

```text
ja
ko
fr
de
es
```

The prompt system should support a configurable language setting, for example:

```yaml
language:
  default: en

  available:
    - en
    - zh-CN
```

The exact format can be improved during implementation.

Do not hardcode user-facing strings throughout the source code.

---

# 29. Plugin Architecture

The project should be designed as an extensible integration layer for agentic coding tools.

Do not tightly couple the core logic to Claude Code.

The architecture should conceptually separate:

```text
core
    ↓
adapter / integration layer
    ↓
Claude Code
Codex
Future Agents
```

Potential structure:

```text
core/
    context/
    state/
    decision/
    agency/
    trust/
    intervention/
    privacy/

adapters/
    claude_code/
    codex/

prompts/
    en/
    zh-CN/

locales/
    en/
    zh-CN/

database/
    migrations/
    models/

interface/
    cli/
```

The exact implementation should be determined after investigating the extension capabilities and event interfaces of the target agents.

---

# 30. Claude Code and Codex

Research the current supported integration mechanisms for:

* Claude Code
* Codex

Do not assume undocumented APIs.

Determine what can actually be observed or intercepted, such as:

* user messages
* assistant responses
* tool calls
* tool results
* command execution
* filesystem changes
* dependency installation
* permission requests

The architecture should be based on the real supported interfaces available at implementation time.

Do not invent extension APIs.

---

# 31. Open-Source Project Setup

Initialize the project as a professional open-source repository.

At minimum, consider:

```text
LICENSE
README.md
README.zh-CN.md
CONTRIBUTING.md
CONTRIBUTING.zh-CN.md
CODE_OF_CONDUCT.md
SECURITY.md

docs/
tests/
examples/

.github/
    ISSUE_TEMPLATE/
    PULL_REQUEST_TEMPLATE.md
    workflows/
```

Also include:

* project configuration
* development setup
* test configuration
* linting / formatting configuration
* example configuration
* example Trust Boundary
* development instructions
* architecture documentation

Use the MIT license unless actual dependency constraints require another approach.

Do not invent copyright information.

---

# 32. Open-Source Registration / Initialization

As part of project initialization, prepare the repository so that it can be published as an open-source project under the MIT License.

Create the necessary license and repository metadata files.

Where platform-specific CLI or GitHub setup is appropriate, determine whether it can be performed through the available environment.

Do not claim that a repository has been published, registered, or pushed to a remote service unless the action has actually been completed.

If credentials, repository ownership, or remote URLs are required, clearly identify them as user-provided configuration.

---

# 33. User Experience

HIL should feel almost invisible during normal work.

Ideal interaction:

```text
Human + AI
    ↓
Normal autonomous work
    ↓
HIL remains silent
    ↓
Normal autonomous work
    ↓
AI begins taking over consequential decisions
    ↓
HIL intervenes
    ↓
Human reviews
    ↓
AI continues normally
```

A healthy user reaction should be:

> "It isn't telling me how to work."

Instead:

> "It reminds me when I am starting to hand over decisions that I should probably still own."

---

# 34. Product Identity

The product should not be positioned as:

> "A tool that limits AI."

It should be positioned as:

> **A tool that protects human agency in highly autonomous AI workflows.**

Possible conceptual language:

> **AI can execute.**
>
> **AI can reason.**
>
> **AI can create.**
>
> **Humans should remain aware of and meaningfully involved in the decisions that matter.**

---

# 35. Long-Term Direction

Do not artificially constrain the architecture to the first implementation.

HIL should be capable of evolving into a general:

> **Human Agency Layer for Agentic AI**

Potential future integrations include:

* Claude Code
* Codex
* IDE agents
* browser agents
* research agents
* writing agents
* design agents
* workflow agents
* autonomous software agents

Potential future features include:

* configurable intervention policies
* project-specific decision boundaries
* explicit human checkpoints
* creative-work modes
* high-risk action modes
* tool and dependency awareness
* license awareness
* security awareness
* privacy-aware intervention
* local models
* user-defined autonomy policies

---

# 36. Development Approach

Do not immediately start writing a large amount of code.

First develop a coherent product and technical architecture.

Start by producing:

1. Product definition
2. Core conceptual model
3. Human Agency model
4. Decision Ownership model
5. Trust Boundary model
6. Intervention model
7. Scope expansion model
8. Session state model
9. Database model
10. Prompt architecture
11. Localization architecture
12. Claude Code integration strategy
13. Codex integration strategy
14. Privacy architecture
15. Security and dependency awareness architecture
16. Open-source repository structure
17. Testing strategy
18. False-positive / false-negative strategy
19. Development roadmap
20. Technical and product risks

Then identify the minimum primitives required for a functioning implementation.

Do not artificially limit future extensibility.

However, avoid unnecessary complexity that has no current product value.

---

# 37. Important Design Question

Throughout the design process, repeatedly evaluate:

> **Is HIL actually preserving human agency, or is it simply measuring human activity?**

These are not the same.

For example:

```text
Human execution: 10%
AI execution:    90%
```

does not automatically mean low human involvement.

The human may still be responsible for:

* defining the objective
* choosing the architecture
* selecting among alternatives
* setting constraints
* evaluating results
* accepting trade-offs

Conversely:

```text
Human execution: 50%
AI execution:    50%
```

does not automatically mean strong human agency.

The human may be performing mechanical tasks while the AI makes all important decisions.

Therefore:

> **Do not optimize for how much the human works.**
>
> **Optimize for whether the human remains meaningfully involved in the decisions that matter.**

---

# 38. Final Principle

The entire project should continuously be evaluated against the following principles:

> **The purpose of Human in the Loop is not to reduce what AI can do.**

> **The purpose is not to measure how much humans work.**

> **The purpose is not to monitor employees.**

> **The purpose is not to make AI artificially weaker.**

> **The purpose is to preserve human agency, judgment, creativity, awareness, and ownership as AI becomes increasingly autonomous.**

Trust Boundary follows exactly the same philosophy:

> **Do not restrict what AI is allowed to choose. Make humans aware when AI crosses a boundary they have not consciously reviewed and accepted.**

The ideal HIL intervention should feel like this:

> **"I can continue. But this is becoming your decision, not merely my task."**

That is the core idea of Human in the Loop.
