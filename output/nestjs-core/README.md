# NestJS 核心原理深度解析 —— 从使用到底层

> 🎯 **适合人群**：已会写 NestJS CRUD 和拦截器，希望深入理解底层原理并准备面试的开发者
>
> 📌 **版本**：基于 NestJS **v11.1.28**（2026-07-08）
>
> 📦 **信息来源**：🟢 满配模式（基于官方最新文档）
>
> 📝 **总字数**：约 35,000+ 字 | **代码示例**：80+ | **面试题**：15 道

---

## 🗺️ 学习路线

```
第1章 ── IoC 容器与依赖注入原理
  │       └─ DI 容器内部机制、@Injectable、自动注入、循环依赖
  │
第2章 ── 模块系统深入
  │       └─ 静态模块、动态模块、全局模块、模块引用
  │
第3章 ── Provider 高级用法
  │       └─ useClass/useValue/useFactory、自定义 Provider、作用域
  │
第4章 ── 应用生命周期
  │       └─ 启动过程、生命周期钩子、NestFactory 内部机制
  │
第5章 ── 请求生命周期
  │       └─ Middleware → Guard → Interceptor → Pipe → Handler → ExceptionFilter
  │
第6章 ── 元数据反射与自定义装饰器
  │       └─ Reflector、SetMetadata、createParamDecorator、ExecutionContext
  │
第7章 ── 面试高频问题与深度解析
          └─ 15 道面试题 + 答案 + 追问策略
```

---

## 📑 章节导航

### 基础篇（原理深挖）

| 章节 | 内容 | 预计阅读 |
|------|------|----------|
| [第1章 IoC 容器与依赖注入](./chapters/01-ioc-and-di.md) | DI 容器原理、`@Injectable` 机制、构造函数注入、循环依赖、自定义 Provider Token | 45 min |
| [第2章 模块系统](./chapters/02-module-system.md) | `@Module` 装饰器、模块导入导出、动态模块 `forRoot/forFeature`、全局模块、ModuleRef | 45 min |
| [第3章 Provider 高级](./chapters/03-providers-in-depth.md) | useClass/useValue/useFactory、自定义 Provider、可选 Provider、作用域 Scope（DEFAULT/REQUEST/TRANSIENT） | 40 min |

### 进阶篇（运行机制）

| 章节 | 内容 | 预计阅读 |
|------|------|----------|
| [第4章 应用生命周期](./chapters/04-lifecycle-and-bootstrap.md) | NestFactory 启动流程、IoC 容器初始化、生命周期钩子序列、优雅关闭 | 35 min |
| [第5章 请求生命周期](./chapters/05-request-lifecycle.md) | Middleware→Guard→Interceptor→Pipe→Handler→Interceptor(response)→Filter 完整链路 | 45 min |
| [第6章 元数据反射与自定义装饰器](./chapters/06-metadata-and-reflector.md) | Reflector、SetMetadata、ExecutionContext、createParamDecorator、装饰器组合 | 40 min |

### 实战篇

| 章节 | 内容 | 预计阅读 |
|------|------|----------|
| [第7章 面试高频问题与深度解析](./chapters/07-interview-questions.md) | DI 原理、生命周期、装饰器、异常过滤、15 道面试题 + 追问 + 源码级解析 | 60 min |

### 附录

| 文件 | 内容 |
|------|------|
| [API 速查表](./appendix/cheatsheet.md) | 最常用 API 卡片速查（按使用频率排序） |
| [常见误区与排错](./appendix/troubleshooting.md) | 15+ 个常见错误的诊断和修复 |

---

## 💡 学习建议与计划

### 适合你的学习路径

鉴于你已经会写 CRUD 接口和拦截器，建议按以下方式学习：

1. **先通读第1-3章**：这些是 NestJS 最核心的理念，面试必问。虽然你可能已经在用，但底层机制你未必清楚
2. **第5章优先看**：你写过拦截器，请求生命周期这一章最贴近你的实际代码，容易产生共鸣
3. **第7章面试前集中看**：专门针对 AI 全栈岗位面试整理的高频问题
4. **附录随查随用**：备查工具，不需要通读

### 配套代码建议

```
在学习过程中，建议你：
✅ 打开自己写的 NestJS 项目，对照文档中的原理逐行理解
✅ 每学完一个概念，在项目中尝试改动验证
✅ 第7章的面试题可以自己模拟回答一遍
```

---

## ⚙️ 如何使用本文档

### 方式一：直接阅读 Markdown（推荐学习）

```
VS Code / Typora / Obsidian 直接打开 .md 文件
```

### 方式二：启动 Docsify 站点（沉浸式阅读）

```bash
cd output/nestjs-core
npx docsify-cli serve .
# 浏览器访问 http://localhost:8080
```

---

> 📢 **统一说明**：本文档中的代码示例基于 NestJS v11.x。API 名称（如 `@Injectable`、`@Module`、`NestFactory` 等）保留英文原文，讲解和注释使用中文。所有代码片段均为完整示例，可直接运行。
