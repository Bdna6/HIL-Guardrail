# HIL 后台 hooks 适配器可行性调研

调研日期：2026-10-30。产品前提：用户自愿启用 HIL，日常操作始终在原 CLI / IDE 中完成；网页仅负责登录、模式与细节设置，不托管 Agent。

## 结论与证据等级

**方向可行，优先做 Claude Code，再做 Codex 的独立 hooks 适配器。无需为当前目标构建网页 Agent、包装原生终端或优先接入 app-server。**

本报告区分三个层次：

- **官方已说明：**能找到明确的生命周期事件或返回协议。
- **HIL 设计推论：**利用这些接口可以实现的架构，尚未证明端到端可靠性。
- **待实测：**版本、IDE、模型供应商与操作系统组合中的实际行为。

本次没有修改用户的 Claude Code / Codex 配置，没有调用付费模型。只执行了本机 `codex --version` 与 `codex --help`：检测到 `codex-cli 0.165.0-alpha.1.2`，属于 alpha，不能作为稳定版本兼容性证明。当前 PATH 未找到 `claude`，不等于机器未安装 VS Code 扩展。**本报告没有声称完成真实 Agent 会话验证，也没有确定最低支持版本。**

## 官方接口核对

| 工具 | 原地接入路径 | 对 HIL 的判断 | 依据 |
| --- | --- | --- | --- |
| Claude Code | 生命周期 hooks，终端 / IDE 扩展 | 第一优先；复用现有适配器 | [Hooks reference](https://code.claude.com/docs/en/hooks)、[VS Code](https://code.claude.com/docs/en/vs-code) |
| Codex | 独立 hooks 配置与返回协议 | 第二优先；无需改用网页会话 | [Hooks](https://learn.chatgpt.com/docs/hooks) |
| Gemini CLI | `SessionStart`、`BeforeAgent`、`BeforeTool` 等 | 有明确扩展点，作为后续候选 | [Hooks reference](https://geminicli.com/docs/hooks/reference/) |
| OpenCode | 插件工具钩子与会话事件 | 有插件路径；需按具体主版本适配 | [Plugins](https://opencode.ai/docs/plugins/) |

### Claude Code

官方说明 hooks 在终端和 IDE 扩展中触发。`SessionStart`、`UserPromptSubmit` 可提供上下文，`PreToolUse` 可作操作决策，`Stop` 可要求继续；`ask` 与 `deny` 的含义不同。`MessageDisplay` 只改显示，不是完整输出闸门；`Stop` 也不能收回已经显示的答案。[官方协议](https://code.claude.com/docs/en/hooks)

**设计推论：**启动时加载模式；输入时补充当前检查点；关键写入前按状态提醒或拒绝该动作；由 Agent 在原对话中提问，用户下一轮回答后更新状态。不让 hook 直接读取终端用户输入，也不让 hook 阻塞等待数分钟的人工回答。

VS Code 的权限 UI、Windows 与 WSL、第三方模型的工具行为，仍需分别测试。即使宿主支持同名 hook，最终交互也不能假定逐像素一致。VS Code 文档还列出了查看会话 hooks 的入口与相应版本条件。[VS Code 文档](https://code.claude.com/docs/en/vs-code)

### Codex

官方提供 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PostToolUse`、`Stop` 等事件。配置可放在 `hooks.json` 或 `config.toml`；非托管 hooks 要通过 `/hooks` 审查信任。`PreToolUse` 支持允许/拒绝，但不支持 `ask`；不支持的输出可能使 hook 失败并继续操作。托管 WebSearch 等不在本地工具覆盖范围。[官方协议与工具覆盖](https://learn.chatgpt.com/docs/hooks)

**设计推论：**共享 HIL 领域模型，独立实现 Codex 输入解析与输出渲染。需要人类参与时使用宿主支持的反馈，并在必要时拒绝当前操作；这不是原生审批弹窗的等价替代。只有宿主本来发出审批请求时，`PermissionRequest` 才是对应通道。

现有 `docs/05` 属于历史调研；不应据此判断具体版本仍然支持或不支持某能力。本报告调整的是产品路线：Codex 优先 hooks，app-server 不再是实现学习模式的前提。`codex exec`、VS Code 扩展与 CLI 的行为仍应独立验证，不能由一个入口推断所有入口。

### 其他 CLI

Gemini CLI 官方列出 `BeforeAgent` 上下文和 `BeforeTool` 拒绝操作等扩展点；其 hook 超时以毫秒配置，不能复制其他工具以秒为单位的配置。[Gemini CLI 参考](https://geminicli.com/docs/hooks/reference/)

OpenCode 官方插件示例使用 `tool.execute.before` 修改输入，也演示通过抛出异常拒绝读取文件。其插件接口应按安装的主版本验证，不能把 V1 示例直接当成所有版本的协议。[OpenCode 插件文档](https://opencode.ai/docs/plugins/)

二者本次仅完成官方资料核对，不列入第一阶段交付承诺。

## 哪些目标能落地，哪些仍是模型能力问题

| HIL 目标 | 可行性与条件 |
| --- | --- |
| 网页选模式，重启后加载 | 可设计；还需本地持久配置、会话快照与适配器确认 |
| 关闭网页继续运行 | 可设计；后台进程与配置不能依赖网页标签页存活 |
| 关键安装/写文件前提醒 | 有相应工具扩展点；覆盖率和权限模式需实测 |
| 保持在原 CLI / IDE 作答 | 可设计；通过模型可见上下文与原生对话完成，不开网页答题 |
| 识别“本地需求被改成云端” | hook 只提供证据入口；语义判断和误报控制需另行实现 |
| 根据回答评价理解 | 需要独立的评估设计和模型；回答长度、点击允许不能当作理解证据 |
| 理解后允许下一步关键操作 | 可以用检查点状态约束受覆盖操作；需处理重试、改写和过期授权 |
| 所有答案都在理解后才显示 | 不能作为跨工具 hooks 的统一保证；这与是否考虑主动绕过无关 |

**“后台围墙”是协作策略护栏，不是覆盖所有进程、网络和自然语言输出的操作系统沙箱。** 用户无需主动绕过，也可能遇到模型提前在文字回复中给出答案、特殊工具未覆盖或 hook 失败等正常边界。产品应如实显示降级状态。

## 与 CC Switch / 自定义模型的关系

建议把模型连接与 HIL 规则分开：模型配置工具负责供应商和凭据；HIL 负责宿主 hooks 与自己的配置。本次未验证 CC Switch 的具体版本，不承诺切换供应商后必然保留 hooks。

必须实测：

1. 切换供应商是否覆盖、迁移或改变 Claude Code 的 settings / 配置目录；安装器只合并自己的条目。
2. 第三方模型能否使用宿主工具、理解拒绝原因、暂停等待用户以及遵循学习约定。
3. HIL 的语义评估使用哪个模型、谁承担费用、会发送什么上下文；不能默认继承用户模型凭据。
4. 模型切换后重新连接自检，区分“宿主 hook 已触发”与“模型行为符合预期”。

## 建议架构（尚未实现）

```text
网页：登录 / 模式 / 细节
           ↓ 经本地配对授权写配置
本地后台：持久配置 + 版本号 + 会话快照 + 检查点状态
           ↕ 有界本地 RPC / 本地只读快照
工具适配器：事件归一化 → 规则判断 → 宿主专用返回
           ↕
原生 CLI / VS Code：工作、提问、回答、继续
```

建议的会话规则：

- 保存配置生成新的 `revision`，先显示“已保存，等待新会话”。
- 新 `session_id` 首次连接时固定一份模式快照，回报 `session_id / revision / mode / adapterVersion`，控制台才能显示“已确认生效”。
- 同一会话的 compact、resume 与子任务沿用该快照，不因再次触发 `SessionStart` 而偷偷切换。明确结束会话后启动新会话，才加载新配置；具体 resume 行为需提供清楚说明。
- 配置应持久在本地后台，网页关闭、账户会话过期不应让已启动的任务突然改变模式。账户登录与本机后台运行是两件事。
- 单次放行绑定检查点、操作摘要和有效期；不要因为某命令执行过就认定用户理解或永久授权。
- 不把所有 hook 都设置为后台异步：执行前的策略决策需要同步返回，耗时语义分析放在明确检查点，超时有界。
- 后台不可用时使用已确认的本地快照或明确降级提示；不能继续显示“正在保护”。是否停止特定操作应由已配置策略决定。
- 远程 SSH、WSL、容器中的 Agent 需要同环境适配器及明确连接方案，不能把不同环境的 `localhost` 当作同一进程。

## 实现前的验证矩阵

在独立测试目录与隔离配置中执行，不改用户日常配置，不自动跳过宿主 hook 信任。

| 用例 | 预期证据 |
| --- | --- |
| 构建 → 学习 → 新会话 | 新会话确认新 revision，旧会话保持原模式 |
| compact / resume / 子任务 | 模式不会意外重置或跨会话串扰 |
| 关键写入触发检查点 | 动作未执行；原对话出现解释或问题 |
| 用户回答后继续 | 仅正确关联的检查点状态改变，不以工具成功代替理解 |
| 常规测试与调试 | 保持静默，记录真实端到端延迟 |
| 重试、拒绝、静音 | 无无限拒绝循环、无重复挑战风暴 |
| 后台退出、超时、坏 JSON | 展示真实降级状态，符合预定失败策略 |
| Claude 终端 / VS Code | 各自记录版本、权限模式与用户可见行为 |
| Codex 终端及其他入口 | 分别确认 hook 覆盖与信任行为 |
| CC Switch + 自定义模型 | 核实配置保留、工具调用、等待用户和提示遵循 |

下一步建议只打通一个最小闭环：**Claude Code 新会话读取模式 → 原对话中的学习检查点 → 用户回答 → 受控操作继续**。通过后再扩展 Codex，随后才考虑 Gemini CLI / OpenCode。
