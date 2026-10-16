---
layout: ../../layouts/PostLayout.astro
title: 02｜Codex CLI 源码拆解：从终端输入到工具执行
description: 顺着 Codex Rust CLI 的一次任务，读懂命令入口、会话轮次、模型请求、工具调用、审批与本地历史。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Codex CLI, Rust, Agent Loop, 源码阅读]
---

这是 Agent 工程系列的第二篇。我们用一个贯穿例子：**“找到配置解析函数，修复一个边界条件，并运行对应测试。”** 目标不是读完 Codex 的所有 crate，而是追踪一条任务怎样进入程序、怎样变成模型请求、工具在哪里运行，以及结果如何返回。

本文固定阅读你 fork 的 main 快照 **6b99197**。Codex CLI 使用 Rust workspace，核心代码集中在 codex-rs；仓库里还有 App Server、SDK、各平台沙箱和许多配套 crate。

## 先分清 CLI、TUI 和 core

- **CLI** 负责解析命令行参数，并选择交互模式或子命令。
- **TUI** 是终端内的交互界面，负责收集输入并显示事件。
- **core** 管理会话、上下文、模型请求、工具调用和运行策略。
- **tools / sandboxing** 提供工具执行、文件操作和隔离能力。

这些部分是职责边界，不代表一次任务只会调用一个函数。Rust workspace 把它们拆到多个 crate 中，通过类型和接口连接。

## 1. 命令从哪里进入

从 codex-rs/cli/src/main.rs 的 MultitoolCli 开始。它声明了交互式默认入口，也列出 exec、review、login、mcp、plugin、app-server、sandbox、resume 等子命令。README 的快速开始是运行 codex；如果没有给子命令，参数会转到交互式 CLI。

接着读 codex-rs/tui/src/app.rs 和 codex-rs/tui/src/cli.rs，观察界面如何收集用户输入、当前目录和选项。想看脚本化调用则看 codex-rs/exec/src/main.rs：exec 面向非交互式任务，适合管道和自动化场景。

**阅读问题：** 用户输入是在 CLI 解析阶段变成会话消息，还是先由 TUI 组织后交给 core？检查相邻模块间传递的结构体和事件，比按文件名猜答案可靠。

## 2. 一次任务如何变成会话轮次

Codex 用 Thread 保存可继续的会话，并将一次用户任务作为 Turn 处理。turn_input.rs 负责提交、排队或恢复轮次输入；turn.rs 统筹单轮运行所需的上下文、模型客户端、工具步骤、钩子与停止条件。

阅读时要区分三个层次：

- Thread：可以跨多轮继续的会话。
- Turn：从一条用户输入开始，到 Agent 完成或停止为止的一轮工作。
- Step：一轮中与模型交互、处理工具等内部步骤。

同一轮可能不止一次调用模型：模型提出工具调用后，程序执行工具并把结果加回上下文，再发起下一步。

## 3. 上下文怎样进入模型请求

先读 codex-rs/core/src/agents_md.rs。源码说明它沿当前目录向上寻找项目根标记，再按根目录到当前目录的顺序收集 AGENTS.md。文件内容会成为项目指令的一部分。然后看 core/src/session/turn_context.rs、core/src/context/ 和 core/src/context_manager/，了解一次轮次会组合哪些环境、用户指令、历史和工具信息。

模型通信可以从 core/src/client.rs 开始。ModelClient 持有会话生命周期内较稳定的供应商、认证和传输状态；ModelClientSession 则按 Turn 创建，负责该轮的流式或普通请求。它们通过 Responses API 与配置的模型服务通信。不要把 core/src/model_request.rs 误读成整个模型请求器：这个文件当前主要组合扩展提供的请求贡献者和响应拦截器。

**阅读问题：** 当前项目的指令、会话历史和工具定义各由哪些模块提供？把这些信息分组，比把整个提示词看成一个字符串更容易理解。

## 4. 模型提出的工具调用如何执行

在 codex-rs/core/src/session/turn.rs 中继续追踪模型响应处理。模型可能返回文字，也可能提出调用工具。调用不会直接交给系统执行：core 先识别工具、准备输入和权限条件，再交给工具实现。通用执行能力可从 codex-rs/tools/src/tool_executor.rs 开始。

以补丁为例，codex-rs/core/src/apply_patch.rs 会调用安全评估逻辑，并计算需要的执行审批。Shell 命令和其他本地操作还会经过 exec policy、sandboxing crate 和平台对应的隔离机制。工具运行完成后，Codex 将执行结果作为后续上下文发回模型，直到一轮任务结束。

可以把这个过程记成：

**模型提出动作 → Codex 校验参数与权限 → 本地程序执行 → 结果加入会话 → 模型继续或结束**

这条链路解释了为什么 Agent 不等于模型：模型生成的是决策或工具请求，真正访问文件和启动进程的是本地程序。

## 5. 历史、恢复和压缩各自负责什么

core/src/rollout.rs 对会话记录能力作统一导出；底层 rollout crate 记录可恢复的线程历史。用户可以继续之前的会话，而不是每次都从空白对话开始。

当上下文接近模型可处理的长度时，core/src/compact.rs 相关流程可以压缩旧上下文并保留摘要。**压缩对话历史不是还原工作区文件**：前者控制后续请求带入多少历史；要恢复已改动的文件，还需看工具、补丁或版本控制层。

## 建议的阅读顺序

1. codex-rs/cli/src/main.rs：找命令入口和默认交互分支。
2. codex-rs/tui/src/app.rs：看用户输入怎样进入交互程序。
3. codex-rs/core/src/session/turn_input.rs、turn.rs：追一轮任务生命周期。
4. codex-rs/core/src/agents_md.rs、core/src/session/turn_context.rs：看项目上下文。
5. codex-rs/core/src/client.rs、codex-rs/tools/src/tool_executor.rs：追模型和工具边界。
6. codex-rs/core/src/apply_patch.rs、codex-rs/sandboxing/src/manager.rs：看写入保护和隔离。
7. codex-rs/core/src/rollout.rs、compact.rs：看历史与上下文压缩。

Rust 初学者遇到 Arc、trait、Result 或 async 时，可以先把它们理解为共享所有权、模块接口、可恢复的成功/错误结果和异步等待；本篇重点是数据怎样沿调用链流动，不要求先掌握 Rust 全部语法。

## 本篇小结

Codex CLI 把终端、会话轮次、模型通信、工具执行和权限策略分成不同模块。理解 Agent 的关键不是寻找一个叫 Agent 的类，而是把“输入如何进入、上下文如何组成、工具如何执行、结果如何保存”串起来。

### 系列导航

上一篇：[01｜Agent Harness 全景：四个开源项目各自负责什么](/blog/agent-harness-landscape/)

下一篇：[03｜QwenPaw 源码拆解：个人助手怎样接入多个聊天渠道](/blog/qwenpaw-code-tour/)

### 本文源码

- [CLI 命令入口](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/cli/src/main.rs)
- [Turn 输入](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/session/turn_input.rs)
- [Turn 编排](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/session/turn.rs)
- [项目指令发现](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/agents_md.rs)
- [模型客户端](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/client.rs)
- [补丁安全处理](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/apply_patch.rs)
- [工具执行器](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/tools/src/tool_executor.rs)
