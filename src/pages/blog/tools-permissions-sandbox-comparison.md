---
layout: ../../layouts/PostLayout.astro
title: 08｜Tool、Permission 与 Sandbox：Agent 怎样安全地动手
description: 拆清工具定义、授权审批和执行隔离的差别，对照四个 Agent 仓库如何限制文件写入、Shell 命令与外部副作用。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Agent Security, Tool, Permission, Sandbox, Codex]
---

模型提出一个工具调用，并不意味着程序就应该立刻执行。安全设计至少要分清三件事：

- **Tool（工具）**：程序提供给模型请求的动作接口，例如读文件或运行命令。
- **Permission（权限）**：当前会话、用户或策略是否允许这次动作，是否需要等待审批。
- **Sandbox（沙箱）**：即使动作获准，进程实际能访问哪些文件、网络或系统资源。

文件快照和恢复又是第四件事：它有助于回退工作区变化，但不能替代授权或隔离。

## 四个项目的安全边界

| 项目 | 工具和权限判断 | 执行隔离或保护 | 阅读入口 |
|---|---|---|---|
| Codex CLI | 工具执行前评估权限；补丁有独立安全评估与审批要求 | 按平台启用 filesystem、network 等 sandbox policy | core/src/exec_policy.rs、core/src/apply_patch.rs、sandboxing/src/manager.rs |
| OpenCode | 工具通过定义与输入 schema 管理；Permission 请求包含 action 和 resources，用户可一次允许、持续允许或拒绝 | Shell 等动作由工具实现和权限流程控制；Git snapshot/revert 是恢复机制，不等于沙箱 | packages/core/src/tool/runtime.ts、permission.ts、packages/schema/src/permission.ts |
| QwenPaw | GuardedFunctionTool 将每次调用交给 guard engine，结果可以是 ALLOW、DENY 或 ASK | 工具执行包装器和安全规则负责拦截；工作区 Git checkpoint 用于恢复文件状态 | src/qwenpaw/runtime/tool_guard.py、security/tool_guard/、checkpoints/ |
| DeepSeek Harness | 默认 profile 装配权限策略和审批能力；可通过 profile、配置和插件调整 | sandbox-policy 统一给受限 bash、文件系统、终端调用提供策略；默认模式为 read-only | packages/bundle/base/README.zh.md、packages/sandbox/sandbox-policy/README.zh.md |

## Codex：把审批判断和操作系统隔离分开

Codex 的 exec policy 负责匹配命令与审批规则；Sandboxing crate 根据当前平台和权限配置创建受限的执行环境。补丁路径也会调用安全评估，并产生是否需要执行审批的结果。

因此，“用户同意运行命令”和“命令只能访问指定资源”是两个不同控制点。前者表达用户授权，后者由执行环境限制能力。读源码时分别追踪 core/src/exec_policy.rs、core/src/apply_patch.rs 与 sandboxing/src/manager.rs，不要只盯着审批对话框。

## OpenCode：权限请求记录具体动作与资源

OpenCode 的 Permission 请求结构包含 sessionID、action、resources 和 metadata 等字段；Reply 类型区分 once、always 和 reject。工具运行时还会校验输入 schema，再把执行能力与会话和插件能力连接起来。

它的 Snapshot 服务会保存和比较 Git 工作树快照，SessionRevert 将会话消息边界与文件快照恢复连接起来。这给用户提供回退路径，但它不会自动变成命令沙箱：权限回答“这次动作是否获准”，Snapshot 回答“之后怎样查看或恢复文件状态”。

## QwenPaw：把每次工具调用包进 GuardedFunctionTool

QwenPaw 的 GuardedFunctionTool 包装 AgentScope FunctionTool，把调用交给 tool-guard engine。guard decision 可以允许、阻止，或通过审批服务等待用户回复；request context 还能带入 session、user、channel 等信息。

这个模式的优势是可将统一策略放在工具执行边界，而不是只在提示词里提醒模型“不要做某事”。不过工具白名单、审批行为和底层系统权限仍是不同层次；检查一次 guard 通过，不代表操作系统资源因此获得了沙箱限制。

## DeepSeek Harness：以共享策略约束多种工具

DeepSeek Harness 的 sandbox-policy 文档指出，bash、filesystem 和 terminal 等受限调用共享同一份文件策略。默认模式为 read-only；部署需要写工作区时必须显式设置 workspace-write。会话选择可以跨重启保留，并在后续受限调用中生效。

安全策略是 profile/bundle 组合的一部分。读 packages/bundle/base/README.zh.md 可以先理解开箱能力，再读 packages/sandbox/sandbox-policy/README.zh.md 看模式、工作区根目录和逐会话覆盖。不要只因 profile 里加载了“sandbox”插件，就假设所有外部工具都被同一种方式约束；应逐个确认工具是否经过该策略消费者。

## 一次工具调用应该经过哪些检查

设计或审查一个工具时，可以沿这条链检查：

1. **输入检查**：参数是否符合 schema，路径和资源是否经过规范化？
2. **身份与范围**：调用来自哪个用户、会话、工作区或频道？
3. **策略判断**：允许、拒绝，还是必须等待审批？
4. **执行隔离**：获准的操作仍被限制在什么文件、网络和进程范围？
5. **副作用记录**：是否能知道工具已经开始或完成？
6. **恢复与审计**：用户能否查看变化、回退文件，或找到失败原因？

这也揭示一个常见误区：把工具说明里的“谨慎使用”当作安全边界。提示词能影响模型行为，但最终权限必须由程序执行层验证。

## 本篇小结

四个仓库都把工具执行放在 Agent 控制范围内，但策略实现不同：Codex 将 exec policy 与平台沙箱分层；OpenCode 将权限请求与 Git 快照分开；QwenPaw 用工具包装器统一触发 allow/deny/ask 决策；DeepSeek Harness 用 profile 组合可共享的沙箱策略。**授权、隔离和恢复分别回答不同问题，不能互相代替。**

### 系列导航

上一篇：[07｜Context Engineering 对比：Agent 怎样挑选要看的信息](/blog/context-engineering-for-agents/)

下一篇：[09｜Session、Checkpoint 与 Recovery：Agent 如何保存并恢复工作](/blog/agent-session-checkpoint-recovery/)

### 本文源码

- [Codex exec policy](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/exec_policy.rs)、[补丁安全检查](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/apply_patch.rs)、[沙箱管理器](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/sandboxing/src/manager.rs)
- [OpenCode 工具运行时](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/tool/runtime.ts)、[权限服务](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/permission.ts)、[权限 schema](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/schema/src/permission.ts)
- [QwenPaw GuardedFunctionTool](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime/tool_guard.py)
- [DeepSeek 基础组合包](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/bundle/base/README.zh.md)、[共享沙箱策略](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/sandbox/sandbox-policy/README.zh.md)