---
layout: ../../layouts/PostLayout.astro
title: 05｜OpenCode 源码拆解：AI 编程助手怎样从请求走到代码修改
description: 面向零基础读者，从入口命令、服务端、核心能力和界面几层拆解 OpenCode，并说明依赖与上手方法。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [OpenCode, AI 编程, TypeScript, 代码阅读]
---

如果你第一次打开 OpenCode 仓库，可能会被几十个目录吓到。先记住一件事：**OpenCode 不是一个单独的聊天页面，而是一套围绕代码工作的 AI 编程产品**。它有命令行、终端界面、网页界面和桌面外壳；这些入口最终要把项目、模型、工具和会话连起来。

本文根据你的 [OpenCode 仓库](https://github.com/njuyaolinxia-design/opencode)默认分支 `dev` 阅读。核对日期为 2026-10-15，提交为 [`4397ee4`](https://github.com/njuyaolinxia-design/opencode/commit/4397ee44d038a5f17bf6ac161431673d93e563b5)。当时这个提交与上游 `anomalyco/opencode` 的 `dev` 分支头部一致，因此下文介绍的是该版本的上游代码结构，不把它说成你的独立原创实现。

## 先把几个词说清楚

- **仓库**：保存项目代码和说明文件的地方。
- **单体仓库（monorepo）**：很多相互配合的小项目放在同一个仓库里。OpenCode 的根目录把多个子项目作为 workspace 管理。
- **依赖**：项目借用的现成工具库。比如界面不必从零实现按钮，服务器也不必自己发明 HTTP 协议。
- **前端 / 后端**：前端负责把页面显示给人并接收操作；后端负责处理请求、访问模型和执行工具。
- **CLI**：命令行界面。你在终端输入 `opencode`，就是在启动 CLI。

## 它解决什么问题

普通聊天机器人只看见你粘贴给它的文字。编程助手还要了解当前代码目录，读取文件，提出修改，必要时运行命令，并把结果展示给你。OpenCode 把这些动作组织在一个项目会话里。

仓库说明了两种常用工作模式：`build` 是动手开发模式；`plan` 用来先读代码和规划，默认更偏只读，执行命令可能需要确认。可以把它们理解成“开始施工”和“先勘察方案”。项目仍然需要你配置一个可用的模型服务；OpenCode 本身提供调用和工具编排，不等于它内置了所有模型。

## 从目录看代码分工

根目录的 [`package.json`](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/package.json) 是一张项目地图：它列出 workspace、依赖和常用命令。比如 `bun run dev` 会把开发启动交给 `packages/cli`。

| 目录 | 用日常语言理解它的工作 |
|---|---|
| `packages/cli` | 命令入口和命令分发。`src/index.ts` 根据输入装载 `run`、`serve`、`auth`、`session` 等具体处理代码。它像前台接待：先听清用户要做什么，再把请求交给合适的模块。 |
| `packages/server` | HTTP 服务和 API 路由。`src/routes.ts` 把数据库、项目、会话、工作区、PTY 等服务装配起来；路由负责接收界面请求、校验并转交处理。 |
| `packages/core` | 产品的主要业务能力：模型和供应商、会话、项目、工具、文件系统、权限、插件、MCP 等。可以把它看成真正干活的“发动机和工具箱”。 |
| `packages/app` | SolidJS 网页应用。负责会话页面、输入框、项目和设置等可视界面。它通过共享的 client/schema 与服务端沟通。 |
| `packages/tui` | 终端里的交互界面。适合在命令行窗口中浏览对话、输入任务和查看工具过程。 |
| `packages/desktop` | Electron 桌面外壳。Electron 让网页技术构成的界面能够作为桌面程序运行，并接上本机能力。 |
| `packages/client`、`packages/schema`、`packages/protocol`、`packages/sdk` | 前后端共同遵守的“接口说明书”和客户端工具。这样页面知道该发什么请求，服务端也知道请求和返回值长什么样。 |
| `packages/web`、`packages/console`、`services/www` | 文档、官网、账户或控制台相关的网页部分。不要把它们和 `packages/app` 里的主要编码工作界面混为一谈。 |

这里说“模块”，就是按职责划分的一组代码。一个模块通常会有自己的目录、配置和依赖；它仍然可以调用其他模块。

## 一条消息怎样变成代码工作

以网页或终端界面中的一次提问为例，简化后的过程是：

**界面收集问题 → CLI 或本机服务接收 → core 找到项目、会话和模型 → 模型决定回答或请求工具 → 工具读取文件、运行命令或提出修改 → 结果写入会话并流回界面。**

`packages/cli/src/index.ts` 是命令入口；[`packages/server/src/routes.ts`](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/server/src/routes.ts) 展示了服务如何把会话、项目、数据库等能力组合起来；core 中的 `session`、`provider`、`tool`、`filesystem` 等目录分别管理会话、模型接入、工具和文件操作。不同界面复用这些核心能力，所以终端版和网页端不必各自重新实现模型调用。

“模型调用工具”并不是模型直接接管电脑。程序会把可用工具的说明交给模型；模型提出工具调用后，OpenCode 的本地代码检查权限，再执行对应动作，并把结果交回模型。像 `permission`、`tool` 和 `filesystem` 这样的模块，就是这条链路的重要部分。

## 技术栈和依赖怎么理解

- **TypeScript**：给 JavaScript 加上类型说明。类型像数据标签，帮助开发者和编辑器尽早发现“这里应该是文件路径，却传进来一个数字”一类问题。
- **Bun 1.4.2**：运行 JavaScript/TypeScript，也负责安装依赖和执行开发命令。根目录锁定它作为包管理器。
- **workspace + Turbo**：让很多子包共用同一份依赖，并安排哪些包需要先构建。`workspace:*` 表示一个包直接依赖同仓库里的另一个包。
- **Effect、SQLite、Drizzle**：在核心和服务代码中用于组织异步服务、保存本地结构化数据以及描述数据库操作。SQLite 是嵌入应用的轻量数据库，Drizzle 是和数据库交互的工具。
- **AI SDK、模型适配器、MCP**：分别帮助接入模型、适配不同模型供应商，以及连接外部工具服务。具体能力取决于项目中的配置。
- **SolidJS、Vite、OpenTUI、Electron**：分别服务于网页界面、前端开发构建、终端界面和桌面应用。

依赖声明不是“这些库无条件全部在每个界面运行”。它们分布在不同子包里：桌面才需要 Electron，网页应用才需要 SolidJS 相关依赖。初学者可以先看根 `package.json` 和当前模块自己的 `package.json`，而不是一次读完整个锁文件。

## 怎样试用

如果只想使用已发布的程序，可以按仓库 README 的安装方式安装；Windows 文档列有 Scoop 和 Chocolatey 选项。安装后在一个**你信任的代码目录**打开终端，输入 `opencode`，再选择或配置模型供应商。开始时可先使用 `plan` 阅读仓库，熟悉后再让 `build` 模式执行修改。

如果目的是读你这个分支的源代码，根目录脚本给出了开发入口。需要安装 Bun 后：

```bash
git clone https://github.com/njuyaolinxia-design/opencode.git
cd opencode
bun install
bun run dev
```

`git clone` 是下载仓库，`cd` 是进入目录，`bun install` 是按锁文件安装依赖，`bun run dev` 是启动开发版 CLI。具体模型凭据和权限设置按 [OpenCode 文档](https://opencode.ai/docs)完成；密钥应只放在本机配置中，不要粘到公开文件或聊天里。

## 零基础读代码的顺序

1. 先读根 `README.zh.md`，知道产品提供什么入口。
2. 看根 `package.json` 的 `workspaces` 和 `scripts`，理解项目怎样启动。
3. 看 `packages/cli/src/index.ts`，认出命令是如何分发的。
4. 看 `packages/server/src/routes.ts` 和 `packages/core/src/session`，理解请求如何到达会话能力。
5. 最后看 `packages/app/src` 或 `packages/tui/src`，观察界面怎样调用共享能力。

读 TypeScript 时，`import` 可以先理解成“把另一处定义的工具拿来用”；`export` 是“允许其他模块使用这里的东西”；`async` / `await` 表示某一步要等待网络或磁盘操作完成。先看文件和函数的名字，再顺着输入、输出和调用方向读，不必一开始就掌握全部语法。

## 一句话总结

OpenCode 的特点是**产品入口丰富，核心能力集中复用**：CLI、终端、网页和桌面都围绕同一套项目、会话、模型、工具和权限能力工作。想学 AI 编程产品怎样连接“界面—模型—代码工具”，它是一个很好的实战样本；但其 workspace 很大，建议按入口和调用链逐步读。

### 系列导航

上一篇：[04｜DeepSeek Harness 源码拆解：把 Agent 能力组装成可替换插件](/blog/deepseek-harness-code-tour/)

下一篇：[06｜四种 Agent Loop 对比：模型、工具与运行时各自做什么](/blog/four-agent-loops-comparison/)

### 主要源码

- [OpenCode README（简体中文）](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/README.zh.md)
- [根 package.json](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/package.json)
- [CLI 入口](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/cli/src/index.ts)
- [服务路由与能力装配](https://github.com/njuyaolinxia-design/opencode/blob/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/server/src/routes.ts)
- [core 目录](https://github.com/njuyaolinxia-design/opencode/tree/4397ee44d038a5f17bf6ac161431673d93e563b5/packages/core/src)
