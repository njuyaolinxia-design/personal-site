---
layout: ../../layouts/PostLayout.astro
title: 01｜Agent Harness 全景：四个开源项目各自负责什么
description: 用 Codex、OpenCode、QwenPaw 和 DeepSeek Harness 四份真实代码，认识模型外面的 Agent 运行层、工具、上下文、状态与安全边界。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Agent Harness, Codex, OpenCode, QwenPaw, DeepSeek Harness]
---

本系列用四个开源仓库学习 Agent 工程：Codex CLI、OpenCode、QwenPaw 和 DeepSeek Harness。它们都能让模型使用工具，但要解决的问题不同。本篇先把全景画出来，后续再从各自源码和具体机制逐层深入。

这里的 **Harness** 是一个便于讨论的总称：模型周围那层负责接收任务、准备上下文、安排工具、保存状态、执行权限策略并向用户交付结果的程序。它不是这四个项目共同采用的官方产品分类，也不是某一个模型。一个简化流程是：

**用户任务 → 入口与会话 → 上下文 → 模型请求 → 工具执行与权限判断 → 结果和状态保存**

模型负责根据输入生成内容或提出工具调用；Harness 决定它能看到哪些上下文、能调用哪些工具、怎样执行动作，以及如何恢复一次中断的任务。

## 四个项目的定位

| 项目 | 主要解决的问题 | 主要入口 | 代码中特别值得学习的设计 |
|---|---|---|---|
| [Codex CLI](https://github.com/njuyaolinxia-design/codex) | 怎样让本地终端 Agent 在代码仓库里完成开发任务 | CLI、终端界面、非交互命令 | Rust core、会话轮次、工具权限与本地沙箱 |
| [OpenCode](https://github.com/njuyaolinxia-design/opencode) | 怎样提供一套完整的 AI 编程产品 | CLI、TUI、网页和桌面 | 多入口共享会话、模型、工具和权限能力 |
| [QwenPaw](https://github.com/njuyaolinxia-design/QwenPaw) | 怎样搭建能接入多个聊天渠道的个人助手 | 本机 Web、TUI、聊天频道和定时任务 | 八阶段 Runtime、AgentScope、技能、工作区检查点 |
| [DeepSeek Harness](https://github.com/njuyaolinxia-design/deepseek-harness) | 怎样把 Agent 的组成能力拆开并重新组合 | profile、Web、headless、SDK、ACP | Cordis 插件上下文，连 agent-loop 也可以作为插件替换 |

可以把它们记作四种取向：**本地编程助手、完整编程产品、个人助手、可组装运行框架**。它们不是“谁更智能”的排名，而是对产品边界和扩展方式的不同选择。

## 用同一个任务观察它们

假设用户要求：“找到处理配置的函数，修复一个边界错误，并运行对应测试。”

Codex CLI 从当前终端目录接收任务。CLI 负责解析默认交互模式或 exec 等子命令；Rust core 管会话轮次、模型交互和工具调用；命令执行和补丁应用会经过权限、安全检查和平台相关沙箱。入口可以从 codex-rs/cli/src/main.rs 开始，随后看 codex-rs/core/src/session/turn.rs。

OpenCode 把这一工作放入项目和持久会话中。CLI、TUI、网页和桌面端可以使用共享的 session runner、模型请求、工具和权限能力；工具执行中的权限判断、会话历史和 Git 快照也能在各自模块中追踪。可以从 packages/core/src/session/runner 和 packages/core/src/session/step.ts 开始。

QwenPaw 把同一任务作为个人助手的一次请求来运行。Runtime 周围有固定阶段钩子，AgentBuilder 准备模型、提示和工具，AgentExecutor 驱动 AgentScope 的回复流；请求可以来自网页或已经配置的聊天频道。可以从 src/qwenpaw/runtime/runtime.py、builder.py 和 executor.py 开始。

DeepSeek Harness 则把运行过程拆在 Cordis 插件和配置组合里。profile 与 bundle 选择要挂载的模型、工具、会话、沙箱和 agent-loop；默认 agent-loop 依据持久会话驱动模型与工具步骤。可以从 docs/architecture.zh.md 和 packages/core/agent-loop/README.zh.md 开始。

## 四种架构取舍

| 观察点 | Codex CLI | OpenCode | QwenPaw | DeepSeek Harness |
|---|---|---|---|---|
| Agent 的主要上下文 | 当前本地项目、配置、会话与指令 | 项目、会话历史、指令和所选 Agent | 工作区、频道消息、提示片段、技能与记忆 | 插件上下文、profile 组合、会话和系统提示 |
| Agent 循环在哪里 | Rust core 的会话轮次和工具处理 | session runner 的模型与步骤处理 | AgentScope 回复循环外包在 Runtime 生命周期中 | Cordis 上可替换的 agent-loop 插件 |
| 工具如何接入 | 内置工具、MCP、插件等能力 | 统一工具定义、插件和 MCP | Toolkit、工作区工具、插件和频道 | 插件注册工具；profile/bundle 选择装配 |
| 状态与恢复侧重点 | 持久会话记录与上下文压缩 | 持久 Session、Git 快照和会话回退 | 独立的工作区 Git 检查点与恢复 | JSONL 会话日志及语义检查点插件 |
| 最适合观察的主题 | 本机工具执行的控制边界 | 产品能力如何由多入口共享 | 个人助手如何编排渠道与 Agent | 插件化架构如何替换整个运行环节 |

“持久会话记录”“文件快照”和“上下文压缩”不是一回事。前者保存对话或运行事件，快照用于回看或恢复工作区文件，压缩用于控制模型输入长度。后面的 Session 文章会专门拆开比较。

## 从代码结构和使用入口做选择

| 仓库 | 主要代码栈与入口 | 顺着源码读的一条主线 | 适合先研究的问题 |
|---|---|---|---|
| Codex CLI | Rust workspace；CLI、TUI、`codex-rs/core` 与平台沙箱 crate | CLI 参数 → `session/turn.rs` → 模型客户端 → 工具与执行策略 | 本地编程 Agent 怎样组织一次 turn，并限制工具执行？ |
| OpenCode | TypeScript monorepo；CLI、TUI、server、web 和 desktop 共用 packages/core | session runner → model/step → tool runtime → permission | 多个产品入口怎样共用会话、模型、工具与权限？ |
| QwenPaw | Python 服务与 TypeScript 前端；CLI、Web、Runtime、Agent、providers、channels | Runtime 阶段 → AgentBuilder → AgentScope ReActAgent → 响应事件 | 同一助手怎样接收不同渠道请求并构造 Agent？ |
| DeepSeek Harness | TypeScript workspace；CLI/boot、bundle、core 与能力包 | profile 和 patch → Cordis 插件上下文 → agent-loop → 工具调度 | 模型、会话、Agent loop 和安全能力怎样作为插件组合？ |

四个项目的规模和切分方法不同，目录名不能直接拿来比较。更稳妥的做法是从同一条请求开始：先看用户输入在哪个入口转换成内部任务，再跟到模型请求、工具执行和结果返回。这样可以避免只从 README 的功能列表推断架构。

如果目标是理解项目能力的扩展方式，也可逐个对比：Codex CLI 会在已有工具与执行边界内增加能力；OpenCode 围绕共享 core 扩展产品入口和工具；QwenPaw 通过 Agent、渠道、技能与插件组合个人助手；DeepSeek Harness 则把更大一部分运行时本身设计成可替换插件。**“能扩展”指向不同的扩展边界，不代表四者拥有相同的插件模型。**

## 应该怎样读这个系列

如果你关心编程 Agent，先看 Codex CLI 和 OpenCode；如果关心 Python 服务与聊天接入，先看 QwenPaw；如果想理解插件组合和运行时替换，先读 DeepSeek Harness。四篇源码导读的顺序不代表技术优劣，只是从直观产品入口逐渐走向更模块化的运行框架。

如果你还不熟悉代码仓库，可以先从已有发布版本完成一次小任务，再沿着对应入口读代码；如果你已经会编程，就从最熟悉的语言开始。读 Rust 的 Codex CLI 时会遇到 Cargo workspace、trait 和异步任务；OpenCode 与 DeepSeek Harness 可从 TypeScript 包依赖和 async 流程入手；QwenPaw 可从 FastAPI 路由、Runtime 和 AgentBuilder 开始。初读不必通读仓库，只要能回答“请求从哪来、模型在哪里调用、工具在哪里执行、结果怎样回到用户”就已经建立了代码地图。

后续文章依次讨论 Agent Loop、Context Engineering、工具与权限、Session 与恢复，最后把观察到的设计整理成一个最小可行 Harness。每篇都会标明所读提交，避免代码持续更新后把不同版本的实现混在一起。

## 源码快照

本文对应的默认分支提交：Codex CLI 6b99197、OpenCode 4397ee4、QwenPaw 5c56644、DeepSeek Harness 5719020。以下链接固定到这些提交。

- [Codex CLI README](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/README.md)、[CLI 入口](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/cli/src/main.rs)、[core 会话轮次](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/session/turn.rs)
- [OpenCode README](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/README.zh.md)、[Session runner](https://github.com/njuyaolinxia-design/opencode/tree/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/session/runner)、[工具运行时](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/tool/runtime.ts)
- [QwenPaw Runtime](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime/runtime.py)、[Agent 实现](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/agents/react_agent.py)、[渠道目录](https://github.com/njuyaolinxia-design/QwenPaw/tree/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/channels)
- [DeepSeek Harness 架构文档](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/docs/architecture.zh.md)、[默认 Agent Loop 说明](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/agent-loop/README.zh.md)、[插件包地图](https://github.com/njuyaolinxia-design/deepseek-harness/tree/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages)

### 系列导航

下一篇：[02｜Codex CLI 源码拆解：从终端输入到工具执行](/blog/codex-cli-code-tour/)
