# HIL — 测试与误报/漏报策略

> 状态：M0 架构产出 · 覆盖：测试策略、误报/漏报策略（规范 §16、§21、§27）。

## 1. 为什么误报是头号工程风险

> "误报很危险，因为它会让用户禁用 HIL。"（规范 §27）

每次干预都必须站得住脚：用户应能问"你为什么打断我？"并得到具体、有证据的回答。因此测试策略围绕**场景真值**组织：给定一段录制/合成的会话，HIL 是否恰好在应干预处干预、在其余一切地方保持静默？

## 2. 测试层次

### 2.1 单元测试（快、纯函数）

- **信任解析**：作用域链（session → project → global → unknown）、五种信任状态、temporary 过期、类别匹配、slug 规范化（`npm:supabase`、大小写、已定义别名如 `pg`→`postgres`）。
- **信号提取器**：每个提取器对一批真实命令/清单/配置样本运行——`npm i`、`pnpm add -D`、`pip install`、`uv add`、`poetry add`、`cargo add`、`go get`、`docker pull`、`aws s3 …`、`supabase init`、`npx create-next-app`，对 `package.json`/`pyproject.toml`/`.env`/`Dockerfile`/`*.tf` 的编辑，`mcp__github__*` 名称。多命令行（`cd x && npm i y`）、子 shell、`&&`/`;`/`|` 链、引号变体、PowerShell 形态。
- **策略引擎**：冷却窗口、分类目静音、严重度门槛、会话 mute、证据组合（第 1 层连续串绝不能单独升级；单次第 3 层越界必须触发）。
- **状态生命周期**：建/更/清；SessionEnd 清理；文件损坏 → fail-open。
- **i18n**：en 与 zh-CN 键集合一致；所有模板带必填参数可渲染。

### 2.2 适配器契约测试（golden 文件）

固定的 hook 输入 JSON 样本（`SessionStart`、Bash/Write/Edit 的 `PreToolUse`、`PostToolUse`、`Stop`、`SessionEnd`）→ 运行 hook 入口 → 断言精确的 stdout JSON（无决策时为空）。这钉住了 Claude Code 契约，让升级可审计。

### 2.3 场景语料（策略的核心）

录制/合成的事件序列 + 期望干预次数：

| 场景 | 期望 |
|---|---|
| 日常自主工作：30 次测试/重构/调试工具调用 | 0 次干预 |
| 明显低后果修复 + 明显依赖 | 0–1 次（仅当依赖越界） |
| §8 旗舰场景："做个 web 应用" → Next.js + Supabase + S3，均未受信 | 首次越界 1 次 high 级 ask，随后同类目冷却静默 |
| §16 漂移：长自主串 + 反复低信息量"好的/继续/go ahead" | 恰好在 Stop 检查点 1 次升级提示 |
| §17 范围扩张："修登录 bug" → 重写认证 + schema 迁移 + 新 IdP | 基于偏离模式的 attention/high 提示 |
| 只有受信工具（PostgreSQL、React、FastAPI 在边界内） | 即使长串也 0 次干预 |
| `/hil trust add` 之后：同样的越界再发生 | 0 次干预 |
| 会话被 mute | 0 次干预 |

语料是数据（`tests/scenarios/*.json`），新的故障报告都能加为回归用例。

### 2.4 性能测试

对样本集运行 hook 入口：p95 < 50 ms（CI 预算，对 CI 机器放宽），不实例化 LLM 客户端、无网络调用（stub 断言）。

### 2.5 真机冒烟（手动，发版前）

`hil install` → Windows + macOS/Linux 上真实 Claude Code 会话 → 安装越界包 → 观察 ask 提示、允许、验证冷却期内不重复、`/hil trust add`、验证静默。检查清单写入 `docs/` 发版说明。

## 3. 误报控制（设计层，不只是测试层）

1. **确定性优先**：v1 只在**确定性信任边界越界**时发出 high 级干预——这一层级不用任何启发式。
2. **拒绝朴素阈值**：计数/时间/行数绝不单独触发（规范 §16）；只调节语义模式的置信度。
3. **不确定即降级**：低置信度 → informational 上下文注入，绝不 ask（规范 §27）。
4. **冷却期是一等数据**：每次干预记录其类目；冷却期内同类目按构造即静默。
5. **升级上限**：每个 Stop 检查点至多一次升级；提示按会话限速。
6. **语料门禁**：任何新增信号的 PR 必须附场景，证明它在日常语料上保持静默。

## 4. 漏报控制

- 确定性层有意"多观察、少打断"（廉价地记录一切）；遗漏以场景缺口形式显形，而非用户损害。
- 规范 §27 点名的优先领域都有显式场景：架构、安全、隐私、外部服务、数据处理、产品方向、不可逆动作、重大依赖变更、战略/创造决策。
- 语义层上线（M4）后在语料上度量召回（按场景类）。

## 5. CI

在 windows-latest 与 ubuntu-latest 上运行 `biome check` + `tsc --noEmit` + `vitest run`（单元 + 适配器 golden + 场景语料 + 性能预算）。locale 对齐与场景覆盖作为 vitest 断言执行，不会悄悄漂移。
