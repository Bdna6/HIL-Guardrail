# HIL — Codex 集成调研与策略

> 状态：M0 调研产出（2026-09）· 来源：官方文档现托管于 `learn.chatgpt.com/docs`（原 `developers.openai.com/codex`）、`openai/codex` 仓库与 releases。下述每项能力主张均对照当前文档核实；推测内容已标注。
> 调研时点 Codex 状态：稳定版 CLI v0.154.0（2026-09-09）。

## 1. 摘要

| 能力 | 结论 |
|---|---|
| 观察智能体动作（每次工具调用） | ✅ **可以——hooks**（`PostToolUse`、`Stop` 等），与 Claude Code 同一架构家族 |
| 暂停并让人类决定 | ⚠️ **部分可行——但语义与 Claude Code 不同**（见 §4） |
| 非交互模式的中途审批 | ❌ 不可用（`codex exec` 无审批事件） |
| MCP 作观察/审批通道 | ❌ 不可能；`codex mcp-server` 已于 2026-09-05 移除 |
| `notify` 作控制通道 | ❌ 即发即忘，仅整回合粒度（`agent-turn-complete`） |
| 完整双向控制 | ✅ app-server JSON-RPC，含 `requestApproval`——但官方标注实验性 |

**决策：Codex 适配器与 Claude Code 适配器在架构上兼容**（hooks、stdin JSON、fail-open、信任边界闸门）。在 Claude Code 路径验证之后作为 M5 交付，暂停语义映射见 §4。

## 2. hooks 体系（主集成路径）

Codex 已提供生命周期 hooks（v0.128.0 起，2026-04；异步 + MCP 工具处理器 v0.148.0；`Interrupt` 事件 v0.150.0）：

- **配置**：`~/.codex/hooks.json`、项目 `.codex/hooks.json`（需项目信任）、或 `config.toml` 内联 `[hooks]`。事件 → matcher 组（对工具名的正则）→ 处理器（`command` 或 `mcp_tool`，含 `timeout`、`async`）。
- **事件**：`PreToolUse`、`PermissionRequest`、`PostToolUse`、`UserPromptSubmit`、`Stop`、`SubagentStop`、`SessionStart`、`SessionEnd`、`PreCompact`/`PostCompact`、`Interrupt`、`SubagentStart`。
- **输入**：stdin 单个 JSON 对象——`session_id`、`transcript_path`、`cwd`、`hook_event_name`、`permission_mode`、`turn_id`，加各事件专属字段（`tool_name`、`tool_input`、`tool_response`、`prompt`、`last_assistant_message`）。可挂钩的工具包括 shell 与 `apply_patch`（别名 `Edit`/`Write`）及 MCP 工具；托管工具（WebSearch）不可挂钩。
- **信任**：非托管 hooks 必须显式信任（哈希绑定，经 CLI 的 `/hooks`）。HIL 的安装器必须把这一步写进文档；不能也不得绕过。
- **fail-open**：非法/不支持的 hook 输出会被判定为 hook 失败，调用继续执行。与 HIL 已有立场一致。默认超时 600 秒（SessionEnd/Interrupt：3 秒）。

**输出契约：**

| 事件 | 输出 | 说明 |
|---|---|---|
| `PreToolUse` | `hookSpecificOutput.permissionDecision: "allow" \| "deny"` + `permissionDecisionReason` + 可选 `updatedInput`（兼容旧式 `{"decision":"block","reason"}`） | **不支持 `"ask"`** |
| `PermissionRequest` | `decision.behavior: "allow" \| "deny"` | 无决策 → 落入 Codex 自身的审批提示；任何 `deny` 优先；`updatedPermissions`/`interrupt` 目前 fail-closed |
| `PostToolUse` | `decision: "block"` + reason | 以反馈替换工具结果（命令已执行） |
| `Stop`/`SubagentStop` | `decision: "block"` + reason | 以 reason 作为新提示继续回合 |
| `UserPromptSubmit` | 可在发送前拒绝提示 | |

## 3. 其他机制（为何不是主路径）

- **`notify`**（`config.toml`，用户级）：外部程序收到单个 JSON 参数，目前仅 `agent-turn-complete`（`thread-id`、`turn-id`、`cwd`、`input-messages`、`last-assistant-message`）。无否决权、无逐动作粒度。至多做粗粒度"回合结束"信号。HIL v1 不使用。
- **`codex exec --json`**：干净的 JSONL 事件流（`thread.started`、`item.*` 含 `command_execution`、`file_change`、`mcp_tool_call`、`agent_message`……）——对包装式部署是一等**观察**路径，但运行中无审批事件。不是主路径（HIL 集成的是用户日常 TUI 工作流，不是包装器）。
- **SDK**：TS `@openai/codex-sdk`（包装 `codex exec`）与 Python `openai-codex`（包装 app-server）暴露相同的 item 覆盖，但没有文档化的审批决策回调。留给未来的"HIL 驱动 Codex"模式。
- **App-server**（`codex app-server`）：JSON-RPC，服务器主动发起审批请求（`item/commandExecution/requestApproval`，`availableDecisions`：`accept`、`acceptForSession`、`decline`、`cancel` 等）。最丰富的控制面（VS Code 扩展同款）——但命令/WS 传输官方标注实验性。候选的后续"包装模式"，非 v1。
- **Rollout 文件**（`~/.codex/sessions/**/rollout-*.jsonl`）：存在、可 tail，但 schema 未文档化且不受支持（社区悬而未决）。与 Claude Code 转录同样列为禁区。

## 4. 暂停语义映射（关键设计差异）

Claude Code 的 `ask` 通过原生权限提示把决策交给人。Codex hooks 做不到——HIL 必须自己返回 `allow` 或 `deny`。HIL 的 Codex 映射：

| HIL 结果 | Claude Code | Codex 适配器 |
|---|---|---|
| 无 | 无输出 | 无输出 |
| 提示性上下文 | `additionalContext` | `PostToolUse`/`Stop` 的 `block` + 软性提示 reason（文本作为提示回灌）——节制使用 |
| high（信任越界） | `permissionDecision: "ask"` + 理由 → 人在原生提示中决定 | `permissionDecision: "deny"` + 本地化理由，指示智能体：*"用户尚未审查此项；引入前先询问用户"* → 决策以对话方式回到人类手中 |

后果与缓解：

- deny+reason 比 ask 强一档（动作首次不会执行）。为忠于"意识而非限制"，理由措辞是"把决策交还用户"而非裁决；冷却期防止 deny 循环（用户说"行，用它"之后——`hil trust add` 或会话级临时信任——同一越界不再触发）。
- 若 Codex 本来就会弹审批提示（`approval_policy: on-request`），`PermissionRequest` hook 的无决策落空会让用户看到原生提示——可用时优先。
- deny 映射会在 README 中如实说明，让用户理解两个适配器的差异。

## 5. 适配器设计（M5）

```
src/adapters/codex/
  hooks-entry.ts      stdin JSON → CoreEvent（与 claude-code 共享归一化器家族）
  render.ts           Decision → hook 输出 JSON
  install.ts          写 ~/.codex/hooks.json（或项目 .codex/hooks.json）+ 指引 /hooks 信任
```

- 同一个 `core`、同一个信任存储、同一套 locales。适配器差异仅限：事件字段名（少量）、matcher 配置、输出渲染、§4 的暂停映射。
- 事件订阅镜像 Claude Code 的订阅表（`SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop`、`SessionEnd`）。

## 6. 禁区 / 待解问题

- `codex exec` 模式下 command hooks 是否触发？未文档化——任何包装器主张之前必须实测（列入路线图）。
- Rollout JSONL schema：未文档化——绝不解析。
- hooks 支持的最小 Codex 版本：M5 时对照当时稳定版钉住。
- App-server 包装模式：v1 发布后再评估，取决于实验性标签是否摘除或用户是否明确接受。
