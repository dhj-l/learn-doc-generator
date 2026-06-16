# 第7章 后端系统详解

> 预计学习时间：50 分钟

## 🎯 本章目标

学习完本章，你将能够：
- 理解 CompositeBackend 架构的设计理念和优势
- 掌握 4 种存储后端的适用场景和配置方式
- 根据应用需求选择合适的后端组合
- 理解 ACP Server 如何实现远程后端访问
- 在 Browser 和 Node.js 环境中使用不同的后端策略

## 📋 前置知识

> 如果你还没有学习以下内容，建议先完成：
> - [第2章 核心概念与架构](./02-core-concepts.md) —— 了解 Agent Harness 的架构分层
> - [第3章 工具系统详解](./03-tool-system.md) —— 了解工具如何与外部系统交互

---

## 💡 核心概念

### 7.1 什么是后端（Backend）？

**用一个类比来理解：**

> 想象你开了一家云存储公司。不同的客户需要不同的存储方案：
> - **个人用户**：直接用本地硬盘（简单、快速、成本低）
> - **企业用户**：需要分布式 NAS 存储系统（可靠、大容量、支持多并发）
> - **跨国集团**：需要全球 CDN 加速 + 异地容灾备份（高性能、高可用、数据不丢失）
>
> 但你的软件对外只需要一个统一的"保存文件"接口。至于文件具体存在哪里、怎么存、怎么同步、怎么做备份——这些底层细节都是 **Backend（后端）** 负责处理的。你的业务代码完全不需要关心这些。
>
> 在 Deep Agents 中，**Backend（后端）** 就是 Agent 的"存储层"。它向上提供统一的文件读写接口（readFile、writeFile、ls 等），向下对接不同的存储实现。这意味着同样的 Agent 代码，可以无缝切换存储方式——在开发时用内存存储以便快速迭代，在生产时用磁盘存储确保数据持久化。

**为什么需要后端抽象层？**

如果没有后端抽象，你的代码可能会写成这样：

```typescript
// ❌ 没有后端抽象——代码和存储实现耦合在一起
async function saveToDisk(filename: string, content: string) {
  // 如果以后要换到 S3，这段代码全得重写
  fs.writeFileSync(`./data/${filename}`, content);
}

async function saveToMemory(filename: string, content: string) {
  memoryStore[filename] = content;  // 换了存储，接口也得改
}
```

有了后端抽象层，Agent 的代码与存储实现彻底解耦：

```typescript
// ✅ 有后端抽象——不管底层是什么存储，调用方式完全一样
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  // 切换后端只需改这一行，Agent 的代码完全不用动
  backend: new FilesystemBackend({ basePath: "./data" }),
  // backend: new ACPServerBackend({ serverUrl: "..." }),  ← 换到远程
  // 不加 backend 则默认使用 StateBackend（内存）
});
```

> **💡 为什么这样做？**
> 后端抽象层遵循"依赖倒置"原则——高层模块（Agent）不依赖低层模块（具体存储实现），而是依赖抽象接口（Backend）。这让你可以在不修改 Agent 核心逻辑的前提下，自由切换和组合不同的存储方案。

**Backend 的接口概览：**

```
┌─────────────────────────────────────┐
│        Agent（不关心底层存储）         │
│  调用 readFile / writeFile / ls 等   │
└────────────────┬────────────────────┘
                 │ 统一的存储接口（readFile/writeFile/listFiles 等）
┌────────────────▼────────────────────┐
│          Backend 抽象层              │
│  ├─ StateBackend      （内存/临时）  │
│  ├─ FilesystemBackend （本地磁盘）    │
│  ├─ ACPServerBackend  （远程服务）    │
│  └─ CompositeBackend  （组合模式）    │
└─────────────────────────────────────┘
```

### 7.2 4 种存储后端详解

Deep Agents 根据不同的运行环境和需求，提供了 4 种后端实现。每种后端解决不同的问题，适用于不同的场景：

#### 7.2.1 StateBackend（内存后端）

**工作原理：** 数据直接存储在 JavaScript 进程的内存中，读写操作实际上是操作内存中的对象。这是所有后端中速度最快的一种，因为没有磁盘 IO 也没有网络请求。

```typescript
// StateBackend 是默认后端
// 不指定 backend 时自动使用 StateBackend
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  // 未指定 backend → 自动使用 StateBackend
});

// 特点：
// ✅ 速度最快（纯内存操作，没有磁盘 IO）
// ✅ 零配置，开箱即用
// ❌ 进程重启后所有数据消失
// ❌ 无法跨进程共享数据
// 适用：开发测试、Browser 环境、临时的非持久化数据
```

> **💡 什么时候用 StateBackend？**
> - **开发调试阶段**：快速迭代，不需要持久化，重启后数据丢失也无所谓
> - **Browser 环境**：浏览器没有文件系统 API，StateBackend 是唯一选择
> - **临时缓存**：存储不需要长期保存的中间数据

#### 7.2.2 FilesystemBackend（本地文件后端）

**工作原理：** 数据以文件形式存储在磁盘上，每个文件对应一个实际的文件系统条目。这是生产环境中最常用的后端，因为数据在进程重启后不会丢失。

```typescript
import { FilesystemBackend } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  backend: new FilesystemBackend({
    basePath: "./agent-data",  // 所有文件都存储在此目录下
  }),
});

// 特点：
// ✅ 数据持久化 —— 进程重启后数据依然存在
// ✅ 可以直接在文件系统中查看和修改数据（方便调试和手动干预）
// ❌ 受限于单机磁盘容量和 IO 性能
// ❌ Browser 环境不可用（浏览器没有文件系统 API）
// 适用：Node.js 生产环境、本地开发、单机部署
```

> **💡 什么时候用 FilesystemBackend？**
> - **生产部署**：需要保证数据不丢失
> - **本地开发**：需要查看和调试写入的文件内容
> - **单机应用**：不需要跨机器共享数据

#### 7.2.3 ACPServerBackend（远程后端）

**工作原理：** 通过网络协议（ACP，Agent Communication Protocol）访问远程服务器。Agent 的所有文件操作都被转换为网络请求，发送到远程 ACP 服务器执行。

```typescript
import { ACPServerBackend } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  backend: new ACPServerBackend({
    serverUrl: "https://acp.example.com",  // ACP 服务器地址
    apiKey: process.env.ACP_API_KEY,       // 认证 Key（通过环境变量传入）
  }),
});

// 特点：
// ✅ 跨机器共享数据 —— 多台服务器访问同一个后端存储
// ✅ 集中管理 —— 数据统一存储，便于备份和监控
// ❌ 需要额外的 ACP 服务器 —— 增加了架构复杂度
// ❌ 网络延迟影响性能 —— 每次读写都有网络开销
// 适用：多 Agent 协作、分布式部署、Browser 环境需要持久化
```

> **💡 ACP 协议是什么？**
> ACP（Agent Communication Protocol）是 Deep Agents 用于 Agent 之间通信和远程文件访问的协议。它定义了客户端（Agent）和服务器（ACP Server）之间的通信规范，包括文件读写、目录列表、状态同步等操作。

#### 7.2.4 CompositeBackend（组合后端）

**工作原理：** 这是最灵活的后端模式。它不自己存储数据，而是将多个后端组合在一起，根据文件路径的前缀（prefix）将请求路由到不同的后端处理。

```typescript
import { CompositeBackend, FilesystemBackend, StateBackend } from "deepagents";

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  backend: new CompositeBackend({
    backends: [
      // 配置文件持久化到本地磁盘，路径以 /config/ 开头的操作走这里
      { backend: new FilesystemBackend({ basePath: "./data/config" }), prefix: "/config/" },
      // 临时文件使用内存（速度更快），路径以 /tmp/ 开头的操作走这里
      { backend: new StateBackend(), prefix: "/tmp/" },
      // 其余文件（不匹配任何 prefix）默认使用主磁盘存储
      { backend: new FilesystemBackend({ basePath: "./data/main" }) },
    ],
  }),
});
```

**为什么需要 CompositeBackend？**

> 在实际项目中，你不会把所有数据存在同一个地方：
> - **配置文件**（/config/settings.json）需要持久化到磁盘，且需要人工可读
> - **临时缓存**（/tmp/cache-*.json）用内存存储最快，重启后自动清除
> - **用户数据**（/data/users/*）需要持久化且可能要大容量存储
> - **静态资源**（/assets/*）可能需要 CDN 或对象存储
>
> CompositeBackend 让你用"路由规则"根据不同路径前缀把数据分发到不同的后端，而 Agent 的代码完全不需要知道这些细节。它甚至不需要知道自己正在使用组合后端。

### 7.3 Browser 与 Node.js 选择指南

不同的运行环境对后端的支持不同。理解这些限制可以帮助你避免在错误的平台上使用不支持的后端：

| 后端类型 | Browser | Node.js | 说明 |
|---------|:-------:|:-------:|------|
| StateBackend | ✅ 推荐 | ✅ 开发用 | 内存存储，Browser 环境唯一默认支持的后端 |
| FilesystemBackend | ❌ 不支持 | ✅ 推荐 | 依赖 Node.js 的 fs 模块，浏览器没有这个 API |
| ACPServerBackend | ✅ 可用 | ✅ 可用 | 需要网络连接和远程 ACP 服务器 |
| CompositeBackend | ❌ 不支持 | ✅ 可用 | 内部依赖 FilesystemBackend，浏览器不支持 |

> **💡 选择建议：**
> - 如果你在 **Node.js** 上开发，默认选择 **FilesystemBackend**（持久化优先）
> - 如果你在 **Browser** 上开发，默认选择 **StateBackend**（唯一可用选项），需要持久化时连接 **ACPServerBackend**
> - 如果你在 **开发调试** 阶段，可以用 **StateBackend**（重启即清零，方便反复测试）

### 7.4 Backend 与工具如何协作？

Backend 并不直接暴露给用户，而是作为 Agent 的存储层为内置文件工具提供底层支持。理解它们的协作关系有助于你在配置后端时做出正确的选择：

```typescript
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  backend: new FilesystemBackend({ basePath: "./data" }),
  // write_file 工具 → 写入 ./data/xxx
  // read_file  工具 → 从 ./data/xxx 读取
  // ls         工具 → 列出 ./data/xxx 目录内容
  // grep       工具 → 在 ./data/xxx 中搜索
});

// 无论后端是内存还是磁盘，工具的调用方式完全一致
// 工具代码不需要关心底层存储实现
// 这意味着你可以在不改动 Agent 逻辑的前提下，随时切换后端
```

**后端对不同工具行为的影响：**

| 后端类型 | read_file | write_file | ls（列出目录） | 进程间共享 |
|---------|-----------|-----------|---------------|-----------|
| StateBackend | 从内存对象中读取 | 写入内存对象 | 列出内存中的键 | ❌ 不共享 |
| FilesystemBackend | 从磁盘文件读取 | 写入磁盘文件 | 读取真实文件目录 | ✅ 通过共享路径 |
| ACPServerBackend | 从远程服务器读取 | 发送到远程写入 | 远程服务器目录列表 | ✅ 通过网络 |

---

## 🔨 实战演练

### 练习：配置多环境后端

**场景描述：**
假设你正在开发一个需要部署到不同环境的 Agent 应用。开发时你希望数据不持久化（方便反复测试），测试时使用临时目录，生产时数据必须安全持久化到指定目录。你需要在代码中根据 `NODE_ENV` 环境变量自动选择正确的后端配置。

**你的任务：**
1. 编写一个 `createBackend()` 函数，根据 `NODE_ENV` 返回不同的后端
2. 开发环境使用默认的 StateBackend
3. 测试环境使用 FilesystemBackend 写入 `./test-data`
4. 生产环境使用 FilesystemBackend 写入 `/var/data/agent`

<details>
<summary>🧑‍💻 先自己写，写完再展开看参考答案</summary>

```typescript
import { createDeepAgent } from "deepagents";
import { FilesystemBackend } from "deepagents";

// 根据环境选择后端
function createBackend() {
  const env = process.env.NODE_ENV || "development";

  switch (env) {
    case "production":
      // 生产环境：数据持久化到固定目录
      console.log("🔧 使用生产环境后端：FilesystemBackend (/var/data/agent)");
      return new FilesystemBackend({
        basePath: "/var/data/agent",  // 生产环境使用固定路径
      });
    case "test":
      // 测试环境：使用临时目录，测试结束后可以手动清理
      console.log("🔧 使用测试环境后端：FilesystemBackend (./test-data)");
      return new FilesystemBackend({
        basePath: "./test-data",  // 测试环境使用临时目录
      });
    default:
      // 开发环境：不指定 backend，使用默认的 StateBackend
      // 数据存在内存中，进程重启后自动清空，方便反复测试
      console.log("🔧 使用开发环境后端：StateBackend (内存)");
      return undefined;
  }
}

const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",
  backend: createBackend(),
  systemPrompt: "你是一个助手。回答要简洁。",
});

console.log(`当前环境: ${process.env.NODE_ENV || "development"}`);
const result = await agent.invoke({
  messages: [{ role: "user", content: "你好！" }],
});
console.log(`Agent: ${result.messages.at(-1)?.content}`);
```

**预期输出：**
```
🔧 使用开发环境后端：StateBackend (内存)
当前环境: development
Agent: 你好！有什么可以帮你的吗？
```

如果设置 `NODE_ENV=production`：
```
🔧 使用生产环境后端：FilesystemBackend (/var/data/agent)
当前环境: production
Agent: 你好！有什么可以帮你的吗？
```

</details>

---

## ⚡ 进阶技巧

### 技巧一：自定义后端适配器

如果内置的 4 种后端都无法满足你的需求（比如你需要将数据存储到阿里云 OSS、AWS S3 或 MongoDB），你可以实现 Backend 接口来自定义后端：

```typescript
import { Backend } from "deepagents";

class S3Backend implements Backend {
  private bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

  async readFile(path: string): Promise<Uint8Array> {
    // 从 S3 读取文件
    // 实际开发中请使用 AWS SDK
    const response = await fetch(`https://${this.bucket}.s3.amazonaws.com${path}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async writeFile(path: string, data: Uint8Array): Promise<void> {
    // 写入 S3
    // 实际开发中请使用 AWS SDK
    console.log(`📤 写入 S3: ${this.bucket}${path}, 大小: ${data.length} bytes`);
  }

  async listFiles(path: string): Promise<string[]> {
    // 列出 S3 对象
    console.log(`📂 列出目录: ${this.bucket}${path}`);
    return [];
  }

  // 其他接口方法...
}
```

> **💡 自定义后端的关键：**
> 你只需要实现 Backend 接口中的几个核心方法（readFile、writeFile、listFiles 等），剩下的代理逻辑由 Deep Agents 自动处理。

### 技巧二：后端性能对比

了解不同后端的性能特征，有助于你在性能和数据持久化之间做出权衡：

| 操作类型 | StateBackend | FilesystemBackend | ACPServerBackend |
|---------|-------------|------------------|-----------------|
| 100 次小文件写入 | ~0.5ms | ~15ms | ~800ms（含网络） |
| 100 次小文件读取 | ~0.3ms | ~10ms | ~600ms（含网络） |
| 数据持久化 | ❌ 不持久 | ✅ 持久化 | ✅ 持久化 |
| 跨进程共享 | ❌ 不共享 | ✅ 文件系统共享 | ✅ 网络共享 |
| 适用场景 | 开发测试 | 单机生产 | 分布式生产 |

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：Deep Agents 的 4 种后端类型分别是什么？各自的核心特点是什么？**
> A：StateBackend（内存存储，速度最快但不持久）、FilesystemBackend（本地磁盘，持久化且可人工查看）、ACPServerBackend（远程 ACP 服务器，跨机器共享）、CompositeBackend（组合多个后端，按前缀路由）。

**Q2：Browser 环境支持哪些后端？不支持哪些？为什么？**
> A：Browser 支持 StateBackend（内存）和 ACPServerBackend（远程 ACP 服务器）。不支持 FilesystemBackend，因为浏览器没有 Node.js 的 fs 文件系统模块。CompositeBackend 也因其依赖 FilesystemBackend 而不可用。

**Q3：CompositeBackend 解决了什么实际问题？**
> A：让不同文件使用不同的存储后端——配置文件存磁盘保证持久化、临时缓存存内存追求速度、静态资源存对象存储便于分发。Agent 代码无需感知这些差异。

**Q4：生产环境应该使用哪种后端？为什么？**
> A：FilesystemBackend（数据持久化到磁盘，进程重启后不丢失）。如果需要多机器共享数据，则使用 ACPServerBackend 连接远程存储。开发调试阶段则用 StateBackend。

**Q5：Backend 和 Tool 之间是什么关系？**
> A：Backend 为内置文件工具（read_file、write_file、ls 等）提供底层存储能力。工具调用时自动通过 Backend 读写数据，工具代码无需关心底层存储实现。

</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 数据丢失 | 开发环境使用 StateBackend，进程重启后数据消失 | 生产环境切换为 FilesystemBackend |
| Browser 中 FilesystemBackend 报错 | Browser 不支持 Node.js 文件系统 API | 使用 StateBackend 或 ACPServerBackend |
| ACPServerBackend 连接超时 | ACP 服务器地址或端口配置错误 | 检查 serverUrl 和网络连通性 |
| CompositeBackend 路由不生效 | prefix 路径格式不正确（缺少斜杠） | 确保 prefix 以 `/` 开头和结尾 |
| 文件权限错误 | FilesystemBackend 的 basePath 目录无写入权限 | 检查目录权限或使用有写入权限的路径 |

---

## 📝 本章小结

- ✅ Backend 是 Agent 的存储层抽象，统一文件读写接口，实现存储与业务解耦
- ✅ StateBackend：内存存储，速度最快但数据不持久化
- ✅ FilesystemBackend：磁盘持久化，适合生产环境和本地开发
- ✅ ACPServerBackend：远程存储，支持跨机器共享和浏览器持久化
- ✅ CompositeBackend：组合多个后端，按路径前缀路由请求
- ✅ Browser 只能使用 StateBackend 或 ACPServerBackend
- ✅ 通过自定义 Backend 接口可以对接任意存储系统

## ➡️ 下一章预告

> 在下一章中，我们将学习 Sandbox（沙箱）机制——如何在隔离环境中安全执行代码，支持 Daytona 和 Deno 两种沙箱方案，以及沙箱的适用场景和配置方法。
>
> [第8章 沙箱（Sandbox）系统](./08-sandbox.md)
