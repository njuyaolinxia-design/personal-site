---
layout: ../../layouts/PostLayout.astro
title: 10｜从零搭一个 Agent Harness：先让任务可控、可恢复
description: 从四个开源项目提炼一条务实的实现路线：先定义任务边界，再逐步加入模型、工具、权限、会话记录和恢复能力。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Agent Harness, Agent Engineering, Architecture, Tutorial]
---

读完 Codex、OpenCode、QwenPaw 和 DeepSeek Harness 的源码，很容易产生一个错觉：Agent 一定要有插件市场、多渠道接入、复杂沙箱、长时记忆和丰富 UI 才算完整。实际上，学习和验证 Agent 工程时，更好的起点是一个窄任务：让程序接收输入、构造一次模型请求，在清楚的边界内调用一个工具，并留下足够的信息供人检查。

本文把 Harness 当作工程总称，给出一个从小到大的实现顺序。它借鉴四个仓库里可观察到的模式，不试图复刻任何一个完整产品。

## 先定义任务成功的样子

在写循环之前，先选一个具体任务，例如“在指定工作区搜索配置项，并根据用户确认修改一个文件”。把成功条件写清楚：目标路径在工作区内；读取操作可直接执行；写入前等待用户确认；修改后展示差异；失败时保留原因而不伪报成功。

任务边界决定工具和权限设计。若第一版只需要读取文件与搜索，就暂时不要暴露任意 Shell；如果任务必须改文件，就只提供受限的编辑工具和明确的确认流程。工具越宽，模型一次错误决定可能造成的影响越大。

## 最小架构的七个部件

| 部件 | 第一版要解决的问题 | 可借鉴的源码思路 |
|---|---|---|
| 输入入口 | 如何接收任务、工作区和身份信息？ | Codex CLI 将命令行入口交给 core；QwenPaw 将不同入口汇入 Runtime |
| Session / Turn | 一次任务和多轮交互如何关联？ | Codex 的 turn 协调一次模型与工具往返；OpenCode 将多个入口连接到持久 Session |
| Context Builder | 哪些项目指令、历史和工具说明会送给模型？ | Codex 的 AGENTS.md 发现、OpenCode 的 instruction discovery、QwenPaw 的 PromptContributor |
| Model Adapter | 如何将通用消息与工具描述转换成模型 API 请求？ | Codex 长生命周期 ModelClient 配合每轮 Session；DeepSeek Harness 将模型适配能力插件化 |
| Tool Registry | 模型可请求哪些有 schema 的动作？ | OpenCode 的工具运行时校验输入；QwenPaw 用 GuardedFunctionTool 包装工具调用 |
| Policy / Executor | 哪些动作允许、要审批或被隔离？ | Codex 分开执行策略与平台沙箱；DeepSeek Harness 用共享 sandbox policy 约束多类工具 |
| Event Store / Recovery | 如何知道任务发生过什么、能否恢复？ | DeepSeek Harness 的追加日志与检查点策略；OpenCode 的会话历史与 Git snapshot |

初版可以把这些部件放在一个进程里，但保持清楚的接口：模型层只提出请求，策略层作出允许/拒绝/等待审批的决定，执行层才真正产生副作用。不要让 prompt 里的“请谨慎操作”代替程序检查。

## 用一个清晰的主循环串起来

第一版的控制流程可以写成下面的样子：

```text
接收用户任务
  └─ 创建或恢复 Session
      └─ 构造 Context（项目指令、对话历史、可用工具）
          └─ 请求模型
              ├─ 返回文本 → 展示结果并结束本轮
              └─ 返回工具调用
                  └─ 校验 schema 与参数范围
                      ├─ 需要审批 → 展示动作和目标，等待用户决定
                      ├─ 拒绝 → 记录拒绝原因并返回模型或用户
                      └─ 允许 → 在受限环境执行并记录结果
                          └─ 将工具结果加入历史，继续请求模型
```

循环还需要明确的停止条件：最大模型轮数、总时间或 token 上限、用户取消和工具失败处理。并行执行工具是后续优化；先保证单工具调用顺序正确，再引入并行安全标记、并发上限和中断规则。DeepSeek Harness 的工具调度器值得进一步研究，因为它将可并行工具与需要独占执行的工具区分开来。

## 按阶段增加能力

**阶段一：只读 CLI。** 接收用户任务，附上固定项目上下文，请求模型并展示回复。允许模型调用一个只读搜索工具。记录请求与响应，能从命令行中止任务。

**阶段二：受控写入。** 添加一个有 schema 的文件编辑工具，只允许目标工作区内的路径。先生成差异预览，用户确认后再应用；每次执行都记录开始、结果和错误。需要运行命令时，先采用命令白名单或受限执行环境，不要直接开放无限制 Shell。

**阶段三：可继续任务。** 将 Session 与消息写入追加日志，给工作区建立 Git 检查点。启动时读取任务状态；如果一个可能造成外部副作用的调用中断，标成结果未知，要求显式处理，不要盲目重试。日志和文件快照承担不同职责。

**阶段四：改善长任务体验。** 做上下文预算，保留最近交互与重要决策；历史很长时才加入压缩。加入工具耗时、错误类别和人工等待状态等日志。每一步都先用真实失败案例证明有必要，再扩展插件、多 Agent、聊天渠道或桌面界面。

## 先写契约测试，再扩展产品面

测试应围绕可观察的边界，而不是复制某个函数实现：

- 越界路径、无效参数和未注册工具不能进入执行器；
- 需要审批的动作在批准前不会产生文件或外部副作用；
- 模型请求失败、用户取消和工具超时都能形成明确状态；
- Session 重启后可以恢复已完成的历史，不会把未知结果默认为成功；
- 快照回退只影响预期的工作区文件；
- 超过轮数或上下文预算时会按规则停止或压缩。

每次新增一个能力，验证“调用者能提出什么、系统允许什么、执行器实际做了什么、失败后留下什么证据”这四件事。这样测试能够覆盖真实控制边界，而不只是确认主循环走过某条路径。

## 哪些复杂度先不要带进来

在单个用例和边界尚未稳定时，暂缓任意插件热加载、多个 Agent 协作、通用浏览器控制、全局长期记忆和多渠道帐号管理。这些会引入权限、隔离、状态同步和运维问题。QwenPaw 的 Runtime hooks 与渠道体系、DeepSeek Harness 的插件化架构都很值得学习，但它们服务于更大的产品范围，不能直接视为最小实现模板。

## 本系列回顾

四份源码提供了不同观察窗口：Codex 适合追踪本地编码任务从 CLI 到执行安全边界的链路；OpenCode 展示多入口产品怎样共享会话、工具与权限；QwenPaw 把个人助手的渠道与八阶段 Runtime 连接起来；DeepSeek Harness 展示将模型、工具、Agent loop、会话和策略拆成可组合插件的方式。

自建 Harness 可以从这些设计中挑选所需部分，但应始终回到自己的任务：**哪些信息需要进入模型，哪些动作允许它请求，程序如何执行和记录，出错以后怎样安全继续？** 先把这条链做对，再决定是否需要更大的框架。

### 系列导航

上一篇：[09｜Session、Checkpoint 与 Recovery：Agent 如何保存并恢复工作](/blog/agent-session-checkpoint-recovery/)

返回：[01｜Agent Harness 全景：四个开源项目各自负责什么](/blog/agent-harness-landscape/)

### 本系列源码入口

- [Codex CLI](https://github.com/njuyaolinxia-design/codex/tree/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src)
- [OpenCode session runner](https://github.com/njuyaolinxia-design/opencode/tree/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/session/runner)
- [QwenPaw Runtime](https://github.com/njuyaolinxia-design/QwenPaw/tree/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime)
- [DeepSeek Harness agent-loop](https://github.com/njuyaolinxia-design/deepseek-harness/tree/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/agent-loop)
