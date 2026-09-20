# HIL — 体系结构

> 状态：M0 架构产出 · 覆盖：系统总览、模块布局、事件管线、会话状态、数据库、提示词架构、本地化、仓库结构。
> 语言/运行时：TypeScript + Node.js ≥ 20，ESM。热路径零运行时依赖是设计目标。

## 1. 系统总览

```
┌─────────────┐   官方 hook 事件（stdin JSON）
│ Claude Code │──────────────────────────────┐
│   （智能体） │◀─────────────────────────────┤  stdout 决策 JSON
└─────────────┘                              ▼
                          ┌────────────────────────────────────┐
                          │ adapter  (src/adapters/claude-code)│
                          │  归一化事件 → CoreEvent             │
                          │  渲染决策 → hook 输出               │
                          └───────────────┬────────────────────┘
                                          ▼
                          ┌────────────────────────────────────┐
                          │ core (src/core)                    │
                          │  信号引擎（确定性）                 │
                          │  会话状态                           │
                          │  干预策略                           │
                          │  可选语义层（LLM）                  │
                          └───────┬───────────────┬────────────┘
                                  ▼               ▼
                        ┌──────────────┐  ┌──────────────┐
                        │ 信任存储      │  │ i18n /       │
                        │ (SQLite+YAML)│  │ prompts      │
                        └──────────────┘  └──────────────┘
```

同一个 `core` 服务于任何未来适配器（Codex 等）：适配器把原生事件形态翻译成 `CoreEvent`，并把 `Decision` 结果渲染回去。core 绝不 import 适配器代码。

## 2. 模块布局

```
src/
  core/
    events/          CoreEvent 类型与分类（execution/reasoning/decision/creativity）
    trust/           信任边界模型：实体、类别、状态、作用域解析
    signals/         确定性提取器：命令、清单、配置、MCP 名称、锚点
    state/           临时会话状态（建/读/写/清理）
    agency/          人类决策权信号簿记（输入、连续串、漂移计数）
    intervention/    策略：证据 → 级别 → 冷却 → 结果；决策记录
    semantic/        可选 LLM 层：范围扩张与漂移评估（仅触发式）
  adapters/
    claude-code/     hook 入口、输入解析、决策渲染、安装/卸载
  interface/
    cli/             `hil` 命令：install、trust、status、review、mute、resume、hook
  db/                SQLite 访问 + 迁移（信任存储）
  i18n/              locale 加载、回退、键校验
prompts/  en/  zh-CN/        分析与干预提示词模板（按语言）
locales/  en/  zh-CN/        CLI 与 hook 输出的界面字符串（按语言）
db/  migrations/             随包发布的 SQL 迁移
```

## 3. 事件管线（热路径，无 LLM）

```
CoreEvent
  → signals.extract(tool, input)          纯函数，毫秒级
  → trust.resolve(entities)               作用域链：session → project → global
  → state.update(decisions, humanInput)   会话内只追加
  → intervention.evaluate(evidence)       规则 + 状态 + 冷却
  → outcome ∈ { none | context(info) | ask(high) }
  → adapter 把 outcome 渲染为 hook JSON
```

分层分析遵循规范 §25/§26：**规则与状态先行；只有当确定性证据表明"值得看一眼"时才做语义（LLM）推理**——例如 `Stop` 时形成漂移串，或范围扩张锚点累积。语义层异步运行（只做 informational 级别；绝不阻塞热路径），且只发送必要的最小上下文，绝不发送完整历史。

## 4. 会话状态模型

每个 `session_id` 一个 JSON 文档，位于 `~/.hil/state/<session_id>.json`，`SessionEnd` 删除（启动时按年龄清理作为兜底；`hil uninstall` 会清空全部残留文件——崩溃的会话永远不会触发 `SessionEnd`）：

```ts
interface SessionState {
  taskId: string;                    // session_id
  createdAt: string;
  taskContext: string;               // 发起提示的摘要
  humanInputs: HumanInputEvent[];    // 时间戳、长度分级、具体度启发
  decisions: DecisionRecord[];       // { tier, owner: human|agent, entity?, evidence }
  pendingCrossings: PendingAsk[];    // 未决 ask 与冷却锚点
  interventionHistory: Intervention[]; // { level, category, at, outcome }
  cooldowns: Record<Category, number>;
  muted: { session: boolean; categories: Category[] };
  temporaryTrust: Entity[];          // 会话级授予
}
```

默认即临时：这里没有任何行为档案，任何内容不比会话存活得更久，也不跨会话聚合。（规范 §22/§24。）

## 5. 数据库模型

SQLite 位于 `~/.hil/hil.db`（路径可用 `HIL_HOME` 覆盖）。唯一职责：**用户的信任边界与偏好**——绝不是活动日志。

```
tools
------------------------------------------------
id            TEXT PK   （slug，如 "npm:supabase"）
name          TEXT      规范显示名
category      TEXT      library|database|external_service|plugin_mcp|cli_infra|data_source|…
ecosystem     TEXT?     npm|pypi|cargo|go|…
trust_status  TEXT      unknown|reviewed|trusted|restricted|temporary
scope         TEXT      global|project
source        TEXT?     配置文件 | cli | 用户
notes         TEXT?
expires_at    INTEGER?  temporary 用
created_at    INTEGER
updated_at    INTEGER

meta   （schema_version、语言偏好）
```

- 类别是数据行而非代码分支——新增类别是配置操作（规范 §10）。
- YAML 配置文件是编写面；数据库是编译后的查询面。`hil trust …` 同时一致地写两者。
- 明确拒绝过度设计（规范 §23）：不用 ORM，用 `node:sqlite`（或极简驱动）+ 朴素迁移。

## 6. 提示词架构

不做巨型系统提示（规范 §25）。组件可独立替换，每个组件是按语言组织的小模板文件：

```
prompts/
  en/        core-system.md · decision-analysis.md · agency-analysis.md
             trust-analysis.md · risk-screening.md · intervention.md
  zh-CN/     （与 en 镜像）
```

- 只有**语义层**使用它们（M4+）；确定性路径只用 `locales/` 字符串。
- 模板按名称 + 语言加载，`en` 作回退；缺失键是构建期测试失败，不是运行时意外。
- 干预*措辞*（级别、信任警示、审查要点）放在 `locales/`，因此连确定性干预也完全可本地化、可由用户编辑（规范 §19/§20）。

## 7. 本地化架构

- `locales/<lang>/*.json` 键值字符串；经 `i18n.t(key, params)` 加载；**任何用户可见字符串都不硬编码**（规范 §28）。
- 配置中 `language.default` + `language.available`；`HIL_LANG` 环境变量覆盖；回退链 `lang → en`。
- 新增 `ja`/`ko`/`fr`/… = 新增目录 + 在配置注册。核心代码零改动。
- CI 断言：zh-CN 与 en 的键集合完全一致。

## 8. 仓库结构（开源布局）

```
/
├── LICENSE  README.md  README.zh-CN.md
├── CONTRIBUTING.md  CONTRIBUTING.zh-CN.md  CODE_OF_CONDUCT.md  SECURITY.md
├── package.json  tsconfig.json  biome.json  vitest.config.ts
├── src/ …（见模块布局）
├── prompts/  locales/  db/
├── docs/                     双语架构文档（本套）
├── examples/
│   └── trust-boundary.example.yaml
├── tests/                    unit · fixtures（hook JSON）· 场景语料
└── .github/
    ├── ISSUE_TEMPLATE/  PULL_REQUEST_TEMPLATE.md
    └── workflows/ci.yml       windows 与 ubuntu 上跑 biome + tsc + vitest
```

版权：署名 `BDNA6`（作者已提供；规范 §13——绝不虚构）。

## 9. 横切约束

| 约束 | 规则 |
|---|---|
| 性能 | hook 路径 p95 < 50 ms，仅本地，无网络 |
| 失败 | fail-open：任何错误 → 不做决策，绝不破坏会话 |
| 隐私 | 本地处理；语义层只发最小片段；无遥测 |
| 可扩展 | 新智能体 = 新适配器；新类别 = 数据；新语言 = 新 locale 目录 |
| 简洁 | 每个模块都必须能对照到规范某节来解释；拒绝投机性抽象 |
