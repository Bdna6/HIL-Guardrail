# Security Policy / 安全策略

**简体中文** · [English](SECURITY.md)

## Supported versions / 支持版本

| Version | Supported |
|---|---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reporting a vulnerability / 报告漏洞

Please report vulnerabilities privately — do **not** open a public issue.

请私下报告漏洞——**不要**开公开 issue。

- Contact: **[SECURITY CONTACT PLACEHOLDER]**
- Include: description, reproduction steps, affected version (`hil --version`), OS, and agent (Claude Code / Codex) version.
- Expect an acknowledgement within 7 days.

包含：描述、复现步骤、受影响版本（`hil --version`）、操作系统、智能体（Claude Code / Codex）版本。预计 7 天内确认。

## Scope notes / 范围说明

HIL runs locally with your user privileges — same as your coding agent. Security-relevant guarantees:

- The hook path performs **no network access** and **no LLM calls**; it reads hook stdin JSON, local config caches, and session state files only.
- HIL writes only to: `~/.hil/**`, `.hil/**` (project), and — via explicit `hil install` — Claude Code's `settings.json` and `.claude/commands/`.
- Session state contains no secrets by design (HIL never reads credentials).
- HIL is **not** a security boundary for the agent itself: it surfaces decisions, it does not sandbox or restrict. Do not use it as a substitute for the agent's own permission system.

HIL 本地运行、拥有你的用户权限——与你的编码智能体相同。与安全相关的保证：

- hook 路径**无网络访问**、**无 LLM 调用**；只读取 hook stdin JSON、本地配置缓存与会话状态文件。
- HIL 只写入：`~/.hil/**`、项目内 `.hil/**`，以及——经显式 `hil install`——Claude Code 的 `settings.json` 与 `.claude/commands/`。
- 会话状态设计上不含机密（HIL 从不读取凭据）。
- HIL **不是**智能体自身的安全边界：它呈报决策，不做沙箱或限制。不能替代智能体自身的权限系统。
