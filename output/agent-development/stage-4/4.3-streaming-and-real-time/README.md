# 4.3 流式传输与实时通信 — AI 应用的实时体验

> 🎯 **学习目标**：掌握 AI 应用中的流式传输和实时通信
> ⏱️ **预计学习时间**：8-10 小时

## 🗺️ 章节导航

| 章节 | 标题 |
|------|------|
| [第1章](./chapters/01-sse.md) | SSE（Server-Sent Events） |
| [第2章](./chapters/02-websocket.md) | WebSocket 双向通信 |
| [第3章](./chapters/03-streaming-json.md) | 流式 JSON 解析 |
| [第4章](./chapters/04-frontend-rendering.md) | 前端流式渲染 |
| [第5章](./chapters/05-reconnection.md) | 断线重连与状态恢复 |

### SSE 基础

```typescript
// 后端：Express + SSE
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = ai.streamText({ prompt: req.query.q });
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

// 前端：EventSource
const es = new EventSource('/api/stream?q=hello');
es.onmessage = (event) => {
  if (event.data === '[DONE]') { es.close(); return; }
  const { text } = JSON.parse(event.data);
  appendToUI(text);
};
```
