# HIL — Claude Code 集成策略

> 状态：M0 架构产出 · 基于对 Claude Code 官方 hooks/skills/plugins 文档的核实调研（2026-09）。不使用任何未文档化 API。

## 1. 已核实的集成面

Claude Code 提供文档化的 hook 体系（本文撰写时共 33 种事件），允许外部程序观察并控制智能体活动。HIL 依赖的事实：

| 事实 | 细节 |
|---|---|
| 观察 | Hook 事件经 stdin 传入 JSON：`session_id`、`transcript_path`、`cwd`、`hook_event_name` 及各事件专属字段（`tool_name`、`tool_input`、`tool_response`、`prompt` 等） |
| 暂停并询问 | `PreToolUse` hook 可返回 `hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: "…" }`——用户在权限提示中看到原因并做出决定 |
| 注入上下文 | `UserPromptSubmit`、`PreToolUse`、`Stop` hook 可通过 `additionalContext` 向会话注入文本而不阻塞 |
| 配置 | hooks 配置在 `settings.json`（user / project / local 三种作用域）；matcher 按字符串或正则选择工具（`Bash`、`Write`、`Edit` 等） |
| 执行模型 | 匹配的 hook 按事件触发、并行运行，可用 `${CLAUDE_PROJECT_DIR}`；hook 超时**不会**阻塞工具调用（fail-open） |
| 斜杠命令 | 自定义命令/skills（`.claude/commands/*.md` / skills）可通过 `` !`command` `` 块执行本地脚本，可设为仅用户触发 |
| 分发 | Claude Code 插件可打包 hooks + commands + skills 实现一行安装；`hooks/hooks.json` 与用户 hooks 合并 |
| 不可用 | MCP 服务器**无法**观察内置工具调用；会话转录 JSONL（`transcript_path`）**没有稳定的文档化 schema**——两者都对 HIL 关闭 |

## 2. 事件订阅表

HIL 只订阅最小集合，其余一律忽略（控制成本与噪音）。

| 事件 | HIL 用途 |
|---|---|
| `SessionStart` | 创建临时会话状态（以 `session_id` 为键） |
| `UserPromptSubmit` | 将人类输入记为决策权信号（发起/导向）；可选注入提示性上下文 |
| `PreToolUse` | **主闸门。** 对 `tool_input` 做确定性信任边界检测；越界 → `ask` + 本地化理由。记录待定决策 |
| `PostToolUse` | 记录实际发生的事（依赖装了、文件写了）→ 更新会话状态；工具运行即近似确认用户选择了"允许" |
| `PostToolBatch` | 连续决策串分析（多次决策、无人类输入）的自然检查点 |
| `Stop` | 回合结束时的漂移评估；可选经 `additionalContext` 发出提示 |
| `SessionEnd` | 删除临时会话状态 |

## 3. 干预机制

### 3.1 信任边界越界（旗舰场景）

```
PreToolUse(Bash: "npm install supabase")
  → HIL 解析实体：supabase，npm 生态，类别 external-service/baas
  → 查找顺序：session → project → global
  → 状态 unknown  →  permissionDecision: "ask"
     permissionDecisionReason: 本地化的 §8 风格警示
       （什么越界了 + 审查要点 + Allow / Reject / Investigate）
  → 用户在权限提示中作答 → 智能体继续或被拒
  → PostToolUse（或其缺席）把结果记入会话状态
```

`ask` 原语*正是*规范所说的"暂停并交还决策"——Claude Code 原生渲染提示并执行人类的答复。在可弹窗模式下，HIL 绝不凭自身判断返回 `deny`：自动否决会让 HIL 变成限制系统，规范明令禁止。

**非弹窗模式（降级）。** hook 输入携带 `permission_mode`。在 `dontAsk` / `bypassPermissions`（或模式缺失/未知）下无法弹窗，`ask` 失去到达人类的通道。此时 HIL 降级为 `permissionDecision: "deny"` + 以对话方式交还决策的理由（"请先询问用户是否引入 X"）——与 Codex 适配器在没有 `ask` 时的映射一致（文档 05 §4）。冷却与单实体一次语义仍然生效，被拒后重试不会被二次拦截；预期路径是：智能体询问用户 → 用户同意 → `/hil trust add <id> --scope session` → 重试放行。该降级未来可用 `intervention.bypass_mode` 配置；v0.1 作为固定默认值。

**实测结论（2026-09 真机验证）。** 终端 CLI：✅ 端到端验证通过——信任越界弹出本地化 `ask` 提示，用户选择"no"后工具调用被正确拦截。VS Code 内嵌会话：hooks 可靠触发（会话状态证明观察链路正常），但该运行时**同时忽略了 `ask` 与 `deny` 决策**——工具照常执行。在内嵌运行时支持 `permissionDecision` 之前应将其视为"仅可观察"；终端 CLI 中的干预路径真实有效。

### 3.2 Informational / Attention 级别

低置信度信号绝不阻塞：它们借 `UserPromptSubmit` 或 `Stop` 的 `additionalContext` 传递（"我对方向做了几个假设——值得快速看一眼"）。智能体看到文本后自然转达给用户；不会形成提示风暴。

### 3.3 防骚扰执行

冷却期与分类目静音存于 HIL 会话状态：对类别 X 干预后，冷却期内 X 的后续越界不再发声（此前的决定仍然有效）。`/hil trust add <name>` 与 `/hil mute` 修改的是边界/策略，而不是重复警示。

## 4. 确定性信号源（v1）

| 来源 | 提取的信号 |
|---|---|
| `Bash`/`PowerShell` 的 `tool_input.command` | 包安装（`npm i`、`pnpm add`、`pip/pip3/install -r`、`uv add`、`poetry add`、`cargo add`、`go get`、`mvn/gradle`）、服务 CLI（`aws`、`gcloud`、`az`、`supabase`、`firebase`、`vercel`、`wrangler`、`kubectl`、`terraform`、`docker pull`）、出站 `curl/wget` 主机 |
| `Write`/`Edit` 的 `tool_input.file_path` 与变更内容 | 依赖清单（`package.json`、`requirements.txt`、`pyproject.toml`、`go.mod`、`Cargo.toml`、`pom.xml`、`build.gradle`）、服务配置（`.env*`、`supabase/config.toml`、`firebase.json`、`vercel.json`、`docker-compose.yml`）、基础设施文件（`*.tf`、`Dockerfile`） |
| MCP 工具名（`mcp__<server>__<tool>`） | 工具流量中出现新 server = plugin/MCP 类别实体引入 |
| 范围扩张的文件系统锚点 | 远离当前任务语境所隐含范围的编辑 |

每个提取器都是纯函数 `(tool_name, tool_input) → EntityIntroduction[] | anchors`。此路径上无 LLM。

## 5. 状态与生命周期

- **临时会话状态**：每个 `session_id` 一个 JSON 文件，位于 HIL 状态目录（如 `~/.hil/state/`），`SessionEnd` 时删除。内容：任务语境摘要、决策日志（归属/层级）、人类输入日志、干预历史、冷却计时器。默认不比会话活得更久。
- **持久配置**：用户/项目的信任边界（SQLite + YAML，见体系结构文档）。热路径只读；只有显式 `hil trust` 命令才写入。
- **会话转录**：绝不解析（schema 不稳定）。`transcript_path` 只作为不透明的会话键输入。

## 6. 分发与安装

1. **v0.x —— npm 包 + 安装命令。** `npm install -g human-in-the-loop`（或项目级安装）；`hil install [--scope user|project]` 幂等地把 hook 条目（指向 CLI 绝对路径、适配平台 shell）写入 `settings.json`，并把 `/hil` 命令文件放入 `.claude/commands/`。`hil uninstall` 只删除自己写入的内容。
2. **后续 —— Claude Code 插件包。** 把 hooks + skills 打包为插件（`.claude-plugin/plugin.json` + `hooks/hooks.json`），`claude plugin install` 安装。核心无需改动——只有打包层变化。

## 7. 性能与失败策略

- **预算**：hook 处理器 p95 < 50 ms（只做本地文件读取 + 纯函数匹配；此路径无网络、无 LLM）。
- **永远 fail-open**：HIL 任何出错 → exit 0 且无输出 → Claude Code 按正常权限流程继续。HIL 绝不能成为会话中断的原因。（Claude Code 对 hook 超时本身就是 fail-open；HIL 从自己一侧采取同样立场。）
- **进程模型**：每事件一个短命进程，状态经状态目录传递。集成零守护进程、可调试；`--trace` 标志把每个决定记录到本地文件以便排查。

## 8. 明确禁止

- 解析 `transcript_path` JSONL（未文档化、跨版本不稳定）。
- 用 MCP 服务器作观察通道（它看不到内置工具调用）。
- HIL 凭自身判断 `deny` 工具（限制不是这个产品）。
- 从 hook 路径把会话内容发往本机之外的任何地方。

## 9. 待定项

- ~~验证 `ask` 提示渲染~~ → 2026-09 已解决：终端 CLI 真机验证通过（本地化 ask 提示弹出，用户选"no"后调用被拦截）；ask/deny 输出另由 golden 契约测试锁定。已知缺口：VS Code 内嵌运行时忽略 `permissionDecision`（见 §3.1）。
- 判断 `PermissionRequest` 事件相对 `PreToolUse` + `PostToolUse` 推断是否还有增量价值（v1 大概率不需要）。
- 在文档中确定要求的最小 Claude Code 版本（所用 matcher/特性均稳定，但仍需钉住一个测试过的版本）。
- 调查 IDE 内嵌运行时是否将支持 `permissionDecision`（将恢复其 ask 路径）。
