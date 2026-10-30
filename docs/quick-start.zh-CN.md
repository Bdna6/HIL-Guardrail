# 快速开始

> 此页保留旧版 CLI 的使用方式。当前后台服务、模式切换和语义评估的使用与隐私边界请见[本地后台指南](10-local-runtime.zh-CN.md)。


> 5 分钟，一个终端，零配置即可上手。/ English: [quick-start.md](quick-start.md)

HIL 是一个本地护栏：让编码智能体保持完全自主的同时，**你**仍是决策者。它只盯一件事——智能体*实际引入*你未审查过的技术——然后暂停这一个动作，把决策交还给你。

## 环境要求

- Node.js ≥ 22.13（`node --version`）
- 可在终端运行的 Claude Code CLI
- 就这些

## 1 · 安装

```bash
npm install -g hil-guardrail
hil --version
```

## 2 · 接入 Claude Code

```bash
hil install --scope user
```

这一步会把 HIL 的 hooks 写入 `~/.claude/settings.json` 并添加 `/hil` 命令。除此之外不碰任何东西，`hil uninstall --scope user` 会精确移除写入的内容。**终端 CLI 是经过真机验证的环境**——IDE 面板的说明见"故障排查"。

## 3 ·（可选）使用中文

```yaml
# ~/.hil/config.yaml
language:
  default: zh-CN
```

## 4 ·（可选）声明你的信任边界

```bash
hil trust add postgresql --category database
hil trust add react fastapi --category library
```

不在边界里的东西默认为 `unknown`（未审查）。**空边界也是完全正常的起点**：HIL 每个类目只提醒一次，之后靠冷却保持安静——不会每个包都唠叨。也可以直接手写 [`~/.hil/trust-boundary.yaml`](../examples/trust-boundary.example.yaml)。

## 5 · 亲眼看它工作

在**终端**的 Claude Code 会话里，让智能体：

```text
帮我安装 supabase 这个包
```

智能体执行安装时，权限提示会**附带 HIL 的警示**：正在引入什么、它在你边界之外、以及四个审查要点（数据流、凭据、新增权限、锁定）。接下来的决策是你的：

| 你想… | 这样做 |
|---|---|
| 本次允许 | 在提示中批准——同类目 15 分钟内保持安静 |
| 永久信任 | `hil trust add svc:supabase`（警示里会给出确切 id） |
| 本会话信任 | `/hil trust add svc:supabase --scope session` |
| 让 HIL 暂时闭嘴 | `/hil mute`——`/hil resume` 恢复 |

日常工作——测试、重构、调试、`npx vitest`、`git`——永远不会触发任何东西。

## 6 · 日常命令

| 命令 | 用途 |
|---|---|
| `hil status` | HIL 眼下的状态：决策、冷却、静音 |
| `hil review` | 本会话的决策日志 |
| `hil trust list` / `add` / `remove` | 管理边界（全局 / `--scope project` 团队共享） |
| `hil mute` / `hil resume` | 静音 / 恢复干预 |
| `hil uninstall` | 移除 `install` 写入的一切 |

## 文件都在哪

| 路径 | 内容 |
|---|---|
| `~/.hil/trust-boundary.yaml`、`config.yaml` | 你的边界与设置（纯文本，随你编辑） |
| `~/.hil/hil.db` | 编译后的信任存储（CLI 管理的条目） |
| `~/.hil/state/` | 临时会话状态——**会话结束即删除** |
| `.hil/`（项目内） | 项目级边界，可随仓库共享 |

仅本地处理；热路径无网络；无遥测。详见[隐私与安全](10-local-runtime.zh-CN.md)。

## 故障排查

- **智能体安装了东西，但没弹提示。**
  - 你可能在 **IDE 内嵌面板**（如 VS Code 插件）里：这类运行时目前会忽略 hook 的权限决策——观察有效，干预无效。完整防护请用终端 CLI（[详情](09-hooks-feasibility.zh-CN.md)）。
  - 在 `dontAsk`/`bypassPermissions` 模式下本来就无法弹窗，HIL 会改为拒绝该动作并附"请先询问用户"的说明——这是设计好的降级行为。
  - 还是没有？`hil status` 能看出 HIL 是否记录了越界；给 Claude Code 设置 `HIL_TRACE=1` 后查看 `~/.hil/trace.log`。
- **`hil: command not found`** —— 重跑 `npm install -g hil-guardrail`，或用 `npx hil-guardrail`。
- **太安静 / 太吵？** —— 冷却默认 15 分钟（配置里的 `intervention.cooldown_minutes`）。`hil status` 显示生效中的冷却。

## 常见问题

- **会拖慢智能体吗？** hook 本地毫秒级运行，无网络、无 LLM。HIL 出错时一律 fail-open——会话不受影响。
- **会读我的对话吗？** 不会。它只看工具调用（命令、文件路径），且只存元数据。[详情](10-local-runtime.zh-CN.md)。
- **会限制 AI 吗？** 绝不会。智能体可以使用和提议任何东西；HIL 只呈报越过*你声明的*边界的引入——允许与否永远是你的决定。
