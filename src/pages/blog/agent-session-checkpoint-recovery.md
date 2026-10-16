---
layout: ../../layouts/PostLayout.astro
title: 09｜Session、Checkpoint 与 Recovery：Agent 如何保存并恢复工作
description: 对照四个 Agent 项目的会话日志、Git 快照、上下文压缩和检查点策略，拆清持久化与恢复各自能解决的问题。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Agent, Session, Checkpoint, Recovery, Codex]
---

Agent 跑到一半可能遇到进程退出、网络断开、工具失败，也可能因为对话太长而需要压缩上下文。要让任务可继续，不能只把聊天记录存下来；还要明确哪些工作已经发生、文件变了什么、哪些动作可以安全重试。

先把四个容易混在一起的概念分开：

- **Session / 日志**记录用户、模型和工具之间发生过什么，便于续聊、审计或重建上下文。
- **Checkpoint / 快照**保存某个时刻的工作区或任务状态，便于比较和恢复。
- **Context compaction / 上下文压缩**把较长历史整理成后续模型可继续使用的内容，目标是缩短请求，而不是回滚文件。
- **Recovery / 恢复**是故障后决定从哪里继续、要不要重做动作的流程；它可能同时依赖日志、快照和工具状态。

因此，“有聊天记录”不等于“能恢复工作”，“能还原文件”也不等于“知道外部操作是否已经成功”。

## 四个项目怎样保存状态

| 项目 | 持久化记录 | 恢复相关机制 | 要注意的边界 |
|---|---|---|---|
| Codex CLI | Rollout 会话记录保存交互过程 | 会话续接与 compact 处理长历史 | compact 管理模型上下文，不是工作区 Git 回滚 |
| OpenCode | 持久化 Session 与消息历史 | Git snapshot 和 session revert 将消息边界与文件恢复联系起来 | Snapshot 回退文件状态，不自动撤销网络、数据库等外部副作用 |
| QwenPaw | 会话数据与运行状态由相应模块管理 | 独立 shadow Git 仓库记录工作区 checkpoint，可查看时间线并恢复 | checkpoint 受 Git 与排除规则影响，不代表所有运行状态都被保存 |
| DeepSeek Harness | JSONL append-only 会话日志，默认使用 Zstd，并能处理尾部不完整记录 | checkpoint policy 在模型请求和可能产生副作用的顶层工具前创建检查点 | 中断的工具调用会标记为结果未知，不会直接假定可以安全重试 |

这些设计选择反映了不同的数据模型：Codex 持久化一条交互 rollout；OpenCode 把 Session 历史和 Git 快照配合起来；QwenPaw 用 shadow 仓库管理工作区时间线；DeepSeek Harness 则将会话追加日志与语义检查点策略拆成插件。它们都不应被简单概括成“自动保存所有东西”。

## 恢复的难点是“工具到底做了没有”

假设 Agent 调用一个会向外部系统提交数据的工具。请求发出后，进程立即断线。重启时只有两种简单做法：重试，或者放弃；两者都可能出错。请求可能没有到达服务端，也可能已成功执行，只是成功响应没能返回。

因此恢复逻辑要表达 **unknown（结果未知）** 这种状态。DeepSeek Harness 的 checkpoint policy 文档明确说明，被中断的工具调用会按未知结果恢复，并且不会自动重试。这样做把决定交还给调用方或用户，避免一次网络故障造成重复副作用。

对于纯读取、可幂等写入、不可逆外部动作，系统可以有不同恢复策略。工具 schema 或执行记录至少应能关联 session、调用 ID、参数摘要、开始/结束状态和错误；如果外部服务支持幂等键，还可以将它与恢复流程结合。不能把模型重新生成了相同工具调用，视为同一动作已安全续跑。

## 上下文压缩与工作区回滚解决不同问题

对话历史太长时，Codex 的 compact 逻辑处理的是下一次模型请求能携带什么信息。即使压缩后保留了任务摘要，它也不会自动把文件还原到之前状态。相反，Git snapshot 可以比较或恢复文件，却不能告诉模型此前讨论的决策，也不能撤回已经发送的邮件或 API 请求。

一个更清楚的恢复点可以同时保存多种引用：

1. 会话或事件日志的位置，说明任务进行到了哪里；
2. 工作区快照标识，说明当时文件是什么状态；
3. 工具调用状态，说明动作尚未开始、已完成、失败，或结果未知；
4. 恢复后需要重新装配的上下文摘要。

这几项可以独立演进。比如保存文件快照不必复制完整聊天，压缩聊天也不必重写事件日志。

## 为自己的 Agent 选恢复策略

先列出数据和副作用，再决定保存方式。一个本地代码 Agent 可以从会话追加日志和 Git 工作树检查点开始；一个会操作工单、发消息或调用支付接口的 Agent，还需要幂等键、调用状态机和人工处理未知结果的路径。若工具不能安全重试，进程崩溃后的恢复不能假装“一切照常继续”。

可用以下问题审查实现：

- 日志是否能区分模型提出动作、程序批准动作、工具开始执行和工具返回结果？
- 保存点是在副作用发生前创建，还是完成后才记录？两者之间崩溃会怎样？
- 文件快照是否涵盖未跟踪文件、忽略文件和外部工作目录？
- 压缩后的上下文能否追溯到原始记录？
- 重启后遇到未完成工具调用，程序如何确定它是否安全重试？

没有一种机制覆盖所有问题。日志给出历史，快照给出可恢复状态，压缩提供有限长度的上下文，幂等和状态判断则控制副作用是否可以重放。

## 本篇小结

读这四个仓库时，可以沿“事件如何记录 → 检查点何时建立 → 故障后如何判定动作状态 → 哪些内容重新进入模型上下文”这条线追踪。**Session、Checkpoint、Compaction 和 Recovery 是一组协作机制，不是同一个功能的不同名字。**

### 系列导航

上一篇：[08｜Tool、Permission 与 Sandbox：Agent 怎样安全地动手](/blog/tools-permissions-sandbox-comparison/)

下一篇：[10｜从零搭一个 Agent Harness：先让任务可控、可恢复](/blog/build-agent-harness/)

### 本文源码

- [Codex rollout 记录](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/rollout.rs)、[上下文压缩](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/compact.rs)
- [OpenCode 快照](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/snapshot.ts)、[会话回退](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/session/revert.ts)
- [QwenPaw checkpoints 模块](https://github.com/njuyaolinxia-design/QwenPaw/tree/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/checkpoints)
- [DeepSeek JSONL 会话持久化](https://github.com/njuyaolinxia-design/deepseek-harness/tree/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/session/session-persistence-jsonl)、[会话检查点策略](https://github.com/njuyaolinxia-design/deepseek-harness/tree/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/session/session-checkpoint-policy)
