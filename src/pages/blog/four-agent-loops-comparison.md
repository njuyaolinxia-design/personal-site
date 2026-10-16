---
layout: ../../layouts/PostLayout.astro
title: 06｜四种 Agent Loop 对比：模型、工具与运行时各自做什么
description: 沿着 Codex、OpenCode、QwenPaw 和 DeepSeek Harness 的源码，比较一次 Agent 任务的循环边界、工具调度和中断处理。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Agent Loop, Codex, OpenCode, QwenPaw, DeepSeek Harness]
---

Agent Loop 常被概括成“模型思考—调用工具—继续思考”，但真实仓库里通常不止一层循环。外围 Runtime 还要处理请求分发、初始化、事件流、异常和清理；内部 Agent 循环才负责模型请求、工具执行和下一步判断。

本文沿用系列的代码快照：Codex 6b99197、OpenCode 4397ee4、QwenPaw 5c56644、DeepSeek Harness 5719020。

## 先把循环拆成两层

外围生命周期大致是：

**收请求 → 建立会话与运行环境 → 执行 Agent → 保存结果 → 清理资源**

模型与工具的循环则大致是：

**准备上下文 → 请求模型 → 得到文本或工具调用 → 执行工具 → 把结果交回模型 → 继续或结束**

两个循环可能在不同模块里。读代码时，如果把“Runtime 的八个阶段”和“模型调用工具的重复循环”统称成一个 loop，就会把职责混在一起。

## 四个项目分别把循环放在哪里

| 项目 | 外围生命周期 | 模型与工具循环 | 值得关注的源码 |
|---|---|---|---|
| Codex CLI | CLI 和 TUI 建立交互；core 接收一次 Thread 的 Turn | Rust core 在 Turn 中请求模型、消费响应事件并处理工具步骤 | core/src/session/turn.rs、core/src/client.rs、tools/src/tool_executor.rs |
| OpenCode | 持久 Session runner 从已记录的工作中继续推进 | runner 的 LLM 与 step 模块处理模型流、工具结果、重试和后续步骤 | packages/core/src/session/runner/ |
| QwenPaw | Runtime 用八个生命周期阶段围住一次 workspace 请求 | 固定的 Builder 与 Executor 准备并运行 AgentScope ReActAgent | src/qwenpaw/runtime/runtime.py、builder.py、executor.py、agents/react_agent.py |
| DeepSeek Harness | 启动器装配 Cordis 插件和 Agent；队列处理 Turn 输入 | 默认 ReactLoopAgent 推进 session 的 turn/step；工具调度器处理并行与独占调用 | packages/core/agent-loop/src/agent.ts、tool-calls.ts |

QwenPaw 的 Runtime 文档明确把生命周期钩子和 AgentScope middleware 分开：前者围绕一次请求，后者包装 Agent 回复循环。这是理解“有两个循环层次”的好例子。

DeepSeek Harness 则把默认 agent-loop 也做成插件。文档说明，默认实现通过模型请求、流式响应、工具执行和持久会话历史驱动轮次；如果默认生命周期不合适，profile 可以选择其他实现。

## 工具调用的调度并不相同

Codex 和 OpenCode 都把工具请求放回会话步骤中处理。模型输出工具调用只是一个待处理动作，程序还要解析调用、评估权限、实际执行，并把工具结果变成下一轮上下文。两者的关键细节应分别沿 Codex core 的 Turn 和 OpenCode session runner 阅读。

QwenPaw 在 AgentScope ReActAgent 的回复循环之外，用 AgentBuilder 组装每个请求的模型、提示和工具，再让 AgentExecutor 推动回复流。Runtime 还处理 slash command、短路钩子、错误响应和结束清理；所以不要把整个 runtime.py 简化成单个 while 循环。

DeepSeek Harness 的工具调度文档有一个值得单独观察的设计：并行安全的调用可以进入有上限的并发池；独占调用形成屏障；调度可并发执行，但权限、结果和结果上下文仍保持模型要求的顺序。取消时，未启动的调用会记录合成结果，已经启动的调用会被收尾。

这说明“能并行”不只取决于模型一次返回几个工具调用，还要看工具副作用、权限分类、结果顺序和失败恢复。

## 中断、错误和重新进入也是循环的一部分

Agent 代码不能只考虑“模型正常回答”。模型请求失败时，程序可能重试、让用户处理、停止任务，或将状态留给下一次恢复。工具取消时，需要区分尚未启动、正在运行和已经产生外部副作用的操作。流式文本已交付后再取消，也不能假设用户从未看到它。

读每个实现时，建议找三类边界：

1. **步骤边界**：什么时候一条工具结果算完成，什么时候继续请求模型？
2. **取消边界**：取消会停止哪些任务，哪些已开始的调用仍需要收尾？
3. **持久化边界**：在模型请求或工具副作用之前，哪些状态已写入日志？

不要只看 happy path。OpenCode 的 runner 有重试和上下文溢出分支；QwenPaw Runtime 有错误与 finally 清理；DeepSeek 的工具调度器对取消和未派发调用有明确处理；Codex Turn 则与会话历史和自动压缩相连。

## 自己读 Agent Loop 的步骤

拿一条简单任务逐层追踪：

- 先找到入口：哪个函数接收用户请求？
- 找到一次模型请求：传给模型的消息和工具定义从哪里来？
- 找到工具分发点：模型请求如何映射到本地实现？
- 找到结果回填点：工具输出怎样进入会话？
- 找到循环停止条件：模型结束、达到限制、被取消还是遇到错误？
- 再读外围 Runtime：它何时保存、重试、恢复和清理？

## 本篇小结

四个项目都有“请求模型和执行工具”的共同形状，但循环放置的位置各不相同：Codex 以 Turn 组织本地代码任务；OpenCode 的 Session runner 推进持久工作；QwenPaw 用 Runtime 包装 AgentScope；DeepSeek Harness 让 loop 本身成为插件。**比较 Agent Loop 时，先分清外围生命周期与模型—工具闭环，再讨论调度和恢复。**

### 系列导航

上一篇：[05｜OpenCode 源码拆解：AI 编程助手怎样从请求走到代码修改](/blog/opencode-code-tour/)

下一篇：[07｜Context Engineering 对比：Agent 怎样挑选要看的信息](/blog/context-engineering-for-agents/)

### 本文源码

- [Codex Turn](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/session/turn.rs)、[工具执行器](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/tools/src/tool_executor.rs)
- [OpenCode runner](https://github.com/njuyaolinxia-design/opencode/tree/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/session/runner)
- [QwenPaw Runtime](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime/runtime.py)、[AgentExecutor](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime/executor.py)
- [DeepSeek 默认 Agent Loop](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/agent-loop/README.zh.md)、[工具调用调度](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/agent-loop/src/tool-calls.ts)