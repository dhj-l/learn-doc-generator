# 🚀 AI 驱动的前端 — API 速查表

> 按使用频率排序，每个 API 附带一行最简示例

---

## 浏览器端 AI（Transformers.js）

| API / 概念 | 最简示例 |
|-----------|---------|
| 情感分析 | `const clf = await pipeline('sentiment-analysis'); const r = await clf('good!');` |
| 文本分类 | `const clf = await pipeline('text-classification', undefined, { topk: 3 });` |
| 特征提取 | `const ext = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');` |
| 问答系统 | `const qa = await pipeline('question-answering'); const a = await qa({ question, context });` |
| 文本生成 | `const gen = await pipeline('text-generation'); const t = await gen('prompt', { max_new_tokens: 50 });` |
| 量化模型 | `await pipeline('...', undefined, { quantized: true });` — 体积缩小 4 倍 |
| 下载进度回调 | `await pipeline('...', undefined, { progress_callback: p => console.log(p.progress) });` |

## AI-Native UI 模式

| 模式 | 核心思路 | 适用场景 |
|------|---------|---------|
| Chat Interface | 对话式交互，用户与 AI 一问一答 | 通用问答、代码生成 |
| Copilot | 嵌入工作流的 AI 建议 | 代码补全、内容编辑 |
| Agent Dashboard | 展示 Agent 的执行过程 | 复杂多步任务 |

## AI 状态管理

| 状态 | 描述 | 转换规则 |
|------|------|---------|
| `idle` | 空闲，等待输入 | → `loading` |
| `loading` | AI 处理中 | → `streaming` / `error` / `idle` |
| `streaming` | 流式输出中 | → `idle` / `error` |
| `error` | 出错 | → `loading` / `idle` |

```typescript
type AiState =
  | { status: 'idle' }
  | { status: 'loading'; message?: string }
  | { status: 'streaming'; content: string }
  | { status: 'error'; error: string }
```

## 边缘 AI

| 平台 | 关键 API |
|------|---------|
| Vercel Edge | `import { Hono } from 'hono'` + `import { streamText } from 'ai'` |
| Cloudflare Workers | `import { Ai } from '@cloudflare/ai'` — 内置 Workers AI |

## 前端安全

| 规则 | 说明 |
|------|------|
| API Key 永不暴露在前端 | 使用后端代理 `/api/chat` |
| Prompt 注入防御 | 前端限制输入长度 + 后端用系统 prompt 约束 |
| 输入净化 | `msg.content.slice(0, 10000)` + 速率限制 |
| 数据隐私 | 传递前对敏感字段脱敏 |

## 流式 SSE 消费

```typescript
// fetch 方式（POST，更灵活）
const res = await fetch('/api/chat/stream', { method: 'POST', body: JSON.stringify({ messages }) });
const reader = res.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value, { stream: true });
  // 按行解析 `data: ` 前缀
}
```
