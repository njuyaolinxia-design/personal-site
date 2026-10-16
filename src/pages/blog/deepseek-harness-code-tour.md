---
layout: ../../layouts/PostLayout.astro
title: 04｜DeepSeek Harness 源码拆解：把 Agent 能力组装成可替换插件
description: 用简单语言解释 DeepSeek Harness 的 Cordis、插件、profile 和组合包，并从入口代码追到 Agent 循环与工具执行。
pubDate: 2026-10-16
category: Agent 工程系列
tags: [DeepSeek Harness, Agent, 插件架构, TypeScript]
---

DeepSeek Harness（命令名 `dsh`）可以用来运行 AI Agent（智能体），也可以作为开发者组装 Agent 的基础。它和一个单纯的聊天网页不太一样：代码把模型、工具、会话、权限、网页界面等拆成许多可以组合的插件，再用配置决定启动时装入哪些部分。

本文根据你的 [deepseek-harness 仓库](https://github.com/njuyaolinxia-design/deepseek-harness)默认分支 `master` 阅读。核对日期为 2026-10-15，提交为 [`5719020`](https://github.com/njuyaolinxia-design/deepseek-harness/commit/571902028a75c64c1d767f4ae5fd099485f0ddf0)。当时它与上游 `deepseek-ai/deepseek-harness` 的 `master` 分支头部一致。README 标注该版本处于**开发者预览**阶段，未来可能有不兼容改动。

## “Harness”在这里是什么意思

Harness 可以先理解为“运行框架”：它负责安排模型、工具、会话、权限和界面的协作。模型像负责判断的部分；文件读写、Shell、浏览器等工具像可调用的手脚；Harness 决定它们怎样接上、每一步怎样记录、什么时候需要用户许可。

本项目的关键底层是 Cordis。用初学者能懂的话说，Cordis 提供一个共享的运行上下文，插件可以往里面注册服务、监听事件，也可以在卸载时撤销自己注册的内容。项目文档强调“所有部分都可以是插件”，连模型适配器、工具注册表、会话日志和 Agent 循环都能够替换。

## 先认识三个配置词

- **插件（plugin）**：一个独立功能模块，可以注册服务、工具或事件处理逻辑。
- **组合包（bundle）**：一组插件的可分发集合。它决定一起安装或使用哪些能力。
- **Profile**：启动时采用的具名配置方案。比如 `web`、`headless`、`sdk`、`acp` 各自装配出不同的运行形态。
- **Patch**：对插件清单做定向修改的配置。可以理解为“在基础配方上替换或补上几项”。项目按顺序叠加 bundle、profile 配置、用户配置和命令行额外 patch，后面的层可以覆盖前面的同名设置。

这有点像搭积木：bundle 提供积木包，profile 选择基础搭法，patch 是用户在这套搭法上再作调整。用户不需要从空目录重新造一个完整 Agent。

## 从仓库目录找主线

| 路径 | 主要职责 |
|---|---|
| `apps/cli` | `dsh` 命令行入口。`src/bin.ts` 判断用户要启动某个 profile、管理插件，还是打印配置。 |
| `packages/boot` | 启动和装配逻辑，包括 profile 读取、插件加载、配置 patch、热更新和关闭过程。 |
| `packages/bundle` | 官方组合包，例如 `base`、`web-app`、`headless`、`sdk-app`。它们把底层能力组合成可运行 profile。 |
| `packages/core` | Agent 的共享骨架：会话日志、系统提示词、工具注册表、Agent 接口和默认 Agent loop（循环）。 |
| `packages/llm` | 模型调用能力和不同模型供应商的适配器。 |
| `packages/fs`、`packages/shell`、`packages/browser-use`、`packages/sandbox` 等 | 文件、命令行、浏览器和安全限制等具体能力。每一组通常会有自己的包说明。 |
| `apps/web` | 网页前端构建入口。 |
| `packages/client` | 浏览器这一侧的界面、状态、连接和 UI 功能组件。 |
| `packages/host` | 本地 Web 服务、静态文件和主机能力。 |
| `apps/desktop` | Electron 桌面外壳和随包运行时。 |
| `python/sdk`、`python/sdk-runtime` | Python SDK 与它调用的同版本运行时包装。Python 侧也沿用 profile 选择和 patch，而不是复制一套完全不同的插件引擎。 |
| `docs/` | 架构、开发、子系统、API 和用户使用说明。对初学者来说，它也是理解包目录的地图。 |

`packages/` 不是一个单一功能，而是一组可被多个应用复用的模块。`apps/` 则更像可执行产品入口。这个区分帮助我们判断：代码是在定义某种能力，还是把能力组合成用户真正能启动的应用。

## 一次启动会发生什么

`apps/cli/src/bin.ts` 先解析命令。若用户启动 profile，它会调用 `profile-boot.ts`。该文件按顺序读取 profile 的组合包、profile 自己的 `cordis.patch.yml`、用户 home 目录的 patch 和命令行 `--patch`，再把插件树挂到 Cordis 上。

之后，启动好的 profile 才接收它自己的参数并运行 Web、headless 或 SDK 等应用。架构文档把一次 Agent 工作描述成轮次和步骤：先准备提示词与工具说明，向模型请求；模型可以回答，也可以请求工具；工具流水线执行并把结果送回；循环直到当前任务结束。关键源码地图在 [架构文档](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/docs/architecture.zh.md)和 [`packages/core` 说明](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/README.zh.md)。

在基础组合包里，项目说明提供模型连接、文件编辑、Shell、Web 搜索与抓取、子 Agent、持久会话和默认权限策略。文件写入默认围绕工作区的沙箱策略，危险动作可能需要审批。安全边界取决于实际启用的 profile 和配置；第一次运行源码前，应先阅读仓库的 [安全说明](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/SAFETY.zh.md)。

## 技术栈和依赖

- **TypeScript + Node.js**：主要 CLI、运行时、包和网页应用代码的语言与运行环境。根 `package.json` 要求 Node.js `^22.19.0` 或 `>=24.0.0`。
- **pnpm 11.28.5**：管理 monorepo 内多个 Node 包及其依赖。workspace 清单会让本地包互相引用。
- **Cordis**：插件上下文和事件机制，是项目组合能力的底层框架。
- **React 18、Vite、TypeScript**：构建 Web UI。`apps/web` 是构建入口，实际界面组件分布在 `packages/client`。
- **Electron**：桌面版本外壳。桌面包还负责随应用准备并匹配本地运行时。
- **Vitest 和 Node 测试工具**：验证不同包、用户流程和构建产物。仓库还含平台相关的系统构建代码。
- **Python SDK**：面向 Python 项目提供另一种调用方式；底层仍通过 `dsh` profile 运行，另有平台对应的 SDK runtime 包。

根目录的 `package.json` 负责版本、命令和常用工具；每个子包的 `package.json` 再列出自己的依赖。看到很多 `@deepseek-ai/dsh-*` 时，可以先把它们看成“这个仓库自己拆出来的功能包”，而不是几十个互不相关的外部系统。

## 怎样启动

最省事的官方快速开始是先装好受支持的 Node.js，再执行：

```bash
npx @deepseek-ai/dsh web
```

本机默认在 `http://127.0.0.1:3080` 提供 Web UI。使用时还要按界面配置可用模型。想从源代码运行你的仓库，README 给出的步骤是：

```bash
git clone https://github.com/njuyaolinxia-design/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm install` 安装 monorepo 依赖；`pnpm run build` 准备运行产物；`pnpm dsh web` 使用构建好的产物启动 Web profile。源码版的构建比普通 npm 包安装复杂，初次学习可以先用 `npx` 体验，再逐步阅读仓库。

## 零基础阅读顺序

1. 从 `README.zh.md` 认识项目定位、命令和安全提示。
2. 看根 `package.json` 与 `pnpm-workspace.yaml`，理解版本和目录如何组成一个 workspace。
3. 阅读 `apps/cli/src/bin.ts` 和 `args.ts`，找到命令分流规则。
4. 阅读 `apps/cli/src/profile-boot.ts`，理解 bundle 和 patch 怎样装配。
5. 阅读 `docs/architecture.zh.md`，再看 `packages/core/README.zh.md` 和 `packages/bundle/base/README.zh.md`。
6. 最后挑一个小插件，例如具体的工具包，追踪它怎样注册、被 Agent 调用、返回结果。

`interface` 是模块之间约定的“插头形状”；`event` 是程序广播的一件事；`profile` 是配置组合；`loop` 是重复执行“问模型—用工具—再问模型”的循环。先把这些概念对应到目录，再读具体 TypeScript 语法会容易很多。

## 一句话总结

DeepSeek Harness 的核心特色是**按 profile 组装、按插件扩展**。它很适合学习怎样把 Agent 的模型、工具、会话和权限拆成可替换模块；对只想马上用聊天机器人的人来说，内部概念和包数量偏多，先运行默认 Web profile，再读 architecture 和 base bundle 会更顺。

### 系列导航

上一篇：[03｜QwenPaw 源码拆解：个人助手怎样接入多个聊天渠道](/blog/qwenpaw-code-tour/)

下一篇：[05｜OpenCode 源码拆解：AI 编程助手怎样从请求走到代码修改](/blog/opencode-code-tour/)

### 主要源码

- [DeepSeek Harness README（中文）](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/README.zh.md)
- [架构文档](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/docs/architecture.zh.md)
- [CLI 命令入口](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/apps/cli/src/bin.ts)
- [参数解析](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/apps/cli/src/args.ts)
- [profile 装配](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/apps/cli/src/profile-boot.ts)
- [core 包地图](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/core/README.zh.md)
- [基础组合包](https://github.com/njuyaolinxia-design/deepseek-harness/blob/571902028a75c64c1d767f4ae5fd099485f0ddf0/packages/bundle/base/README.zh.md)
