# Vercel AI SDK 速查表

## 🚀 安装
```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai
```

## 📦 核心函数

| 函数 | 用途 |
|------|------|
| `generateText` | 一次性生成 |
| `streamText` | 流式生成 |
| `generateObject` | 结构化输出 |
| `streamObject` | 流式结构化输出 |

## 🔧 前端 Hooks

| Hook | 用途 |
|------|------|
| `useChat` | 对话式交互 |
| `useCompletion` | 文本补全 |

## 🔌 Provider

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
```
