# HIL — Human in the Loop（人机回环）

**面向智能体 AI 编码工具的人类决策权护栏。**

> AI 是很好的执行者，同时也可以进行推理与创造。
> 但人应当确保自己实质参与了所有有分量的决策，不仅仅是提出想法。

[![CI](https://github.com/Bdna6/hil-guardrail/actions/workflows/ci.yml/badge.svg)](https://github.com/Bdna6/hil-guardrail/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · 简体中文

📖 **第一次用？看[快速开始](docs/quick-start.zh-CN.md)——5 分钟，一个终端，零配置。** · English: [Quick Start](docs/quick-start.md)

---

## 为什么需要它

编码智能体已经发展到可以自主在一次长运行里选架构、挑依赖、定义API、做产品决策、提出优化意见。许多个人开发者及公司员工对智能体的接受程度也愈发提高，许多个人项目或工作内容开始由智能体产出，我认为在这个过程中，**决策权的无意识的转移**了：你说"做个这个功能"，二十分钟后抬头，智能体已经选好了技术栈、数据库，甚至帮忙定义了产品行为。一切都好用，甚至还挺符合你的预期，只是这样的话，你真的参与到这个项目的开发里了吗。

HIL的存在就是察觉这种无意识的漂移，把决策权交还给你，并帮助你深度参与自己的产品构筑中去。


## HIL能做什么（目前阶段已完成的功能）

1. **信任边界（Trust Boundary）**——你声明自己审查过哪些工具、库、服务与平台（全局、按项目、或按会话）。智能体不受任何限制，也不会被告知"仅从白名单选择"。但当它*实际引入*边界外的东西——安装未审查的 SDK、接入新的云服务——HIL 会暂停这一个动作，给你一条简洁中性的警示与审查要点（数据流、凭据、许可、锁定），部分情况下也可能直接停止会话，意图将人类拉回工作流。由你决定：允许 / 拒绝 / 调查。然后一切照常继续。
2. **默认静默**——日常自主工作（测试、重构、调试）不触发任何东西。没有指标、没有仪表盘、没有参与度评分，静默是特性。
3. **不降低能力**——HIL 绝不削弱智能体，绝不注入"多问问人"的提示，在 Claude Code 上不会凭自身判断拦截工具。它把决策交还给你，且不会从智能体手里夺走决策。

## 干预实际长什么样

智能体在任务中途执行 `npm install supabase`。Claude Code 原生权限弹窗出现——附带 HIL 的理由：

```text
HIL · 信任边界提醒

智能体即将引入：supabase。
以上条目在你配置的信任边界之外（状态：unknown）。
这不是安全裁决——这是一个值得由你保留的决策点。建议快速确认：
  • 什么数据会流向或存储于该服务？
  • 凭据与密钥由谁控制？
  • 会引入哪些权限与依赖？
  • 是否存在厂商锁定、许可或迁移影响？
由你决定：允许、拒绝，或先调查。
永久信任：hil trust add supabase · 本会话静音：/hil mute
```

你通过 Claude Code 自己的权限界面作答——这就是全部交互。English alerts ship built-in (`HIL_LANG=en`)。接下来的 30 次常规工具调用保持静默。

## HIL 不是什么

HIL不是监控，也不是生产力追踪器，更不是简单的允许清单执行器。也不会发展成为"人类贡献百分比"系统。数据模型甚至无法表达这些——没有身份维度、没有聚合层、没有活动历史。

## 安装

需要 Node ≥ 22.13（内建 `node:sqlite`）与 Claude Code CLI。Windows 与 Linux 经 CI 验证。

```bash
npm install -g hil-guardrail       # 或项目级：npm install
hil install --scope user           # 把 HIL 接入 Claude Code 配置
```

然后编写你的信任边界（也可以从空开始——见下）：

```bash
hil trust add postgresql --category database
hil trust add react fastapi --category library
```

空边界 ⇒ HIL 每个类目只提醒一次（随后冷却静默），而不是每个包都唠叨。

### 卸载

```bash
hil uninstall --scope user   # 精确还原 `hil install` 写入的内容，
                             # 并清空残留的临时会话状态
```

## 工作原理

```
Claude Code ──官方 hooks──▶ hil hook（本地，<50ms，无网络、无 LLM）
                              │ 确定性信号提取
                              │ 信任查找：session → project → global
                              │ 策略：冷却、单实体一次、静音
                              ▼
                        越界？──▶ 一条本地化警示 → 由你决定
                        否则  ──▶ 静默
```

- **适配器架构**：`core` 与具体智能体无关；`adapters/claude-code` 现已交付，`adapters/codex` 已完成调研并排期（见 [docs/05](docs/05-integration-codex.zh-CN.md)）。
- **fail-open**：HIL 出错或变慢时，你的会话与没有装它时完全一样。
- **本地与隐私**：全部本地处理。会话状态临时化——会话结束即删除、按年龄清理、卸载时清空。永远没有遥测。

## 命令

| 命令 | 用途 |
|---|---|
| `hil install` / `hil uninstall` | 接入 / 移除 Claude Code hooks（user、project 或 local 作用域） |
| `hil trust add <名称…>` / `hil trust remove <名称>` | 管理信任边界（`--category`、`--scope project`、`--scope session`） |
| `hil trust list` | 查看边界及每个条目的来源 |
| `hil status` | 当前会话：决策、冷却、静音状态 |
| `hil review` | 本会话的决策日志 |
| `hil mute` / `hil resume` | 静音 / 恢复干预 |

在 Claude Code 中也可以用 `/hil <命令>`。

## 语言 / Language

英文与简体中文是一等公民：文档、CLI 输出、干预文案全部双语。在 `~/.hil/config.yaml` 设置 `language.default: zh-CN`，或用 `HIL_LANG` 覆盖。

```yaml
# ~/.hil/config.yaml
language:
  default: zh-CN    # 或 en
intervention:
  cooldown_minutes: 15
```

## 文档

双语文档见 [docs/](docs/README.md)：产品定义、概念模型（Human Agency、Decision Ownership、Trust Boundary）、体系结构、集成策略、隐私与安全、测试策略、路线图。

## 状态

- **v0.1.0** —— Claude Code 适配器：确定性信任边界护栏（本版本）
- v0.2.x —— 可选的触发式语义层（漂移 / 范围扩张意识）
- v0.3.x —— Codex 适配器
- 见[路线图](docs/08-roadmap-and-risks.zh-CN.md)。

## 参与贡献

项目正处于早期快速迭代期——接口与行为都还不是最终形态。欢迎提 issue（缺陷、误报/漏报、想法）；待形态稳定后会开放贡献指南与 PR 流程。每次改动都要过同一道问题：*这是在保护人类决策权，还是在度量人类活动？*

## 许可

[MIT](LICENSE) · © 2026 BDNA6
