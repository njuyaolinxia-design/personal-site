---
layout: ../../layouts/PostLayout.astro
title: 07｜Context Engineering 对比：Agent 怎样挑选要看的信息
description: 从项目指令、工作区、技能、对话历史和工具结果入手，比较四个 Agent 仓库怎样组装模型上下文。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [Context Engineering, AGENTS.md, Agent, Codex, Prompt]
---

Context Engineering 不只是“把提示词写得更好”。Agent 还要决定从哪里读项目规则、带入多少会话历史、何时加载技能、怎样描述可用工具，以及工具结果保留多久。上下文太少，模型容易漏掉约束；上下文太多，重要信息会被噪声和长度挤压。

本文比较 Codex CLI、OpenCode、QwenPaw 和 DeepSeek Harness 在源码快照中的上下文入口。四者都能组成模型请求，但没有一个单一字符串能代表全部上下文。

## 先把上下文分成几类

| 信息来源 | 例子 | 常见作用 |
|---|---|---|
| 全局与项目指令 | 用户设置、AGENTS.md、仓库约定 | 告诉 Agent 怎样工作、哪些约束优先 |
| 当前任务 | 用户请求、当前目录、提及的文件 | 界定本轮要完成的目标 |
| 会话历史 | 之前的用户与模型消息、工具结果 | 保持任务连续性 |
| 能力说明 | 工具 schema、MCP、插件、技能 | 让模型知道可以请求哪些操作 |
| 执行观察 | 文件内容、命令输出、错误 | 为下一步决策提供新证据 |

不同项目在“信息由谁提供、按什么顺序组合、何时更新”上的差别，比提示词措辞本身更能体现架构。

## Codex CLI：沿项目目录发现指令，再加入当前 Turn

Codex 的 agents_md.rs 说明，程序从当前目录向上寻找项目根标记，再从项目根到当前目录收集 AGENTS.md，并按这个顺序拼接。Turn 的上下文还会结合当前输入、会话历史、环境和工具能力，再由 core 请求模型。

阅读 codex-rs/core/src/agents_md.rs、core/src/session/turn_context.rs 和 core/src/context/。要留意：AGENTS.md 是项目指令来源之一，不等于全部的 system prompt，也不等于用户的当前问题。

**值得验证的问题：** 子目录的 AGENTS.md 如何与仓库根规则共同生效？项目根标记如何影响发现范围？

## OpenCode：把 instruction discovery 作为独立服务

OpenCode 有专门的 instruction-discovery.ts。其源码注释说明，配置中的全局指令与项目文件按全局到近端、再到远端的顺序维护，插入顺序会影响渲染顺序。Session runner 会把指令、历史、当前工作区和工具能力组合到模型请求中。

可从 packages/core/src/instruction-discovery.ts、packages/core/src/session/instructions.ts、packages/core/src/session/context.ts 和 packages/core/src/session/runner/llm.ts 开始。它把“发现指令文件”和“在具体请求中使用指令”分开，便于观察配置发现与运行时组装的边界。

## QwenPaw：由 PromptContributor 逐段提供信息

QwenPaw 的 PromptManager 通过多个 PromptContributor 组合 system prompt。源码中列出的默认系统文件包括 AGENTS.md、SOUL.md 和 PROFILE.md；贡献者还可以读取工作区、Agent 配置、环境信息和预加载的 Skills。AgentBuilder 在每次请求时取得提示、模型和工具，再注入 Agent。

读 src/qwenpaw/runtime/prompt_contributors.py、prompt_manager.py、builder.py，以及 agents/prompt_builder.py。后者的插件 prompt builder 按 workspace、multimodal、env_context 等锚点插入插件片段。QwenPaw 同时有多种 prompt 构建路径，阅读时先分清 Runtime Agent 与插件系统的边界。

## DeepSeek Harness：先装配插件，再投影为 Prompt

DeepSeek Harness 的 Context 与 System Prompt 能力由插件提供，profile 和 bundle 决定启动时挂载哪些插件。默认 agent-loop 使用上下文组装和 system-prompt 渲染模块生成请求所需内容；更换 profile 或 patch，可能改变被装入的上下文能力。

可从 docs/architecture.zh.md、packages/core/agent-loop/src/agent.ts、packages/context/ 和 packages/core/system-prompt/ 开始。这里值得看的不只是“提示词长什么样”，还包括“哪些插件有机会参与构造，以及它们如何被组合”。

## 四种上下文设计放在一起看

| 项目 | 指令或片段从哪里来 | 主要组装思路 | 学习时重点 |
|---|---|---|---|
| Codex CLI | 项目路径上的 AGENTS.md、配置、Turn 与历史 | 由 core 为一轮请求准备上下文 | 指令发现范围、优先级和历史压缩 |
| OpenCode | 全局及项目 instruction 文件、Session 状态 | 发现与 Session runner 的请求组装分开 | 全局到项目的顺序、位置变化后的更新 |
| QwenPaw | 工作区文件、PromptContributor、Skills、环境与 Agent 配置 | PromptManager 和 AgentBuilder 在每次请求前组合 | 插件提示片段怎样插入宿主锚点 |
| DeepSeek Harness | Context / system-prompt 插件、profile 和 bundle | 插件贡献内容并由默认 loop 渲染 | 插件组合如何改变上下文能力 |

## 一个实用的 Context Engineering 检查表

给某个 Agent 增加上下文时，可以依次问：

1. **来源是谁控制的？** 用户、项目、插件还是外部工具？
2. **边界是什么？** 只对当前工作区有效，还是会影响所有项目？
3. **顺序是什么？** 冲突指令出现时，哪一条覆盖哪一条？
4. **何时加载？** 进程启动时、每次请求前，还是模型需要时？
5. **如何控制长度？** 是否按需检索、裁剪输出或压缩历史？
6. **如何保持安全？** 文件内容和工具输出只是数据，不能无条件升级为指令。

最后一点尤其重要：读到仓库里的文本，不代表程序应该把其中任何一句都当作更高优先级的命令。指令来源需要由程序定义清楚。

## 本篇小结

四个仓库的上下文不是简单的一段 prompt：Codex 依路径收集项目指令；OpenCode 独立发现并排序 instruction 文件；QwenPaw 用贡献者和 AgentBuilder 组装多段提示；DeepSeek Harness 把上下文提供能力放入插件组合。读源码时，追踪“来源—顺序—注入点—更新时机”，比只复制最终提示词更有价值。

### 系列导航

上一篇：[06｜四种 Agent Loop 对比：模型、工具与运行时各自做什么](/blog/four-agent-loops-comparison/)

下一篇：[08｜Tool、Permission 与 Sandbox：Agent 怎样安全地动手](/blog/tools-permissions-sandbox-comparison/)

### 本文源码

- [Codex 项目指令发现](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/agents_md.rs)、[Turn 上下文](https://github.com/njuyaolinxia-design/codex/blob/6b991972c5b539198dcea9bac4fc14e57559c3af/codex-rs/core/src/session/turn_context.rs)
- [OpenCode instruction discovery](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/instruction-discovery.ts)、[Session context](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src/session/context.ts)
- [QwenPaw prompt contributors](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/runtime/prompt_contributors.py)、[Agent prompt builder](https://github.com/njuyaolinxia-design/QwenPaw/blob/5c56644a6e130762a236f8c946103e95a0a1eec8/src/qwenpaw/agents/prompt_builder.py)
- [DeepSeek 架构说明](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/docs/architecture.zh.md)、[Agent loop 上下文装配](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/agent-loop/src/agent.ts)