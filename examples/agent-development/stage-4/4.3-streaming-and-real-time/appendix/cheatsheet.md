# 🚀 流式传输与实时通信 — API 速查表

> 按使用频率排序，每个 API 附带一行最简示例

---

## SSE (Server-Sent Events)

| API / 概念 | 最简示例 |
|-----------|---------|
| 后端 SSE 响应头 | `res.setHeader('Content-Type', 'text/event-stream')` |
| 发送数据块 | `res.write(\`data: \${JSON.stringify({ text: chunk })}\n\n\`)` |
| 发送完成信号 | `res.write(\`data: \${JSON.stringify({ type: 'done' })}\n\n\`)` |
| 处理客户端断开 | `req.on('close', () => { /* 清理 */ })` |
| 禁用 Nginx 缓冲 | `res.setHeader('X-Accel-Buffering', 'no')` |
| 前端 EventSource | `const es = new EventSource('/api/stream'); es.onmessage = e => {...}` |
| 前端 fetch 方式 | `fetch(url, { method: 'POST', body }).then(r => r.body.getReader())` |

## 流式响应头标准配置

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no');
```

## SSE 数据格式

```
data: {"type":"text","content":"Hello"}

data: {"type":"done"}

```

## WebSocket

| API / 概念 | 最简示例 |
|-----------|---------|
| 服务端创建 | `const wss = new WebSocketServer({ port: 8080 })` |
| 监听连接 | `wss.on('connection', (ws) => {...})` |
| 接收消息 | `ws.on('message', (data) => { const { type, payload } = JSON.parse(data) })` |
| 发送消息 | `ws.send(JSON.stringify({ type: 'token', payload: '...' }))` |
| 处理断开 | `ws.on('close', () => { /* 清理 */ })` |

## 流式 JSON 解析

```typescript
class IncrementalJsonParser {
  private buffer = '';
  private depth = 0;
  feed(chunk: string) {
    this.buffer += chunk;
    for (const c of chunk) { if (c === '{') this.depth++; if (c === '}') this.depth--; }
    if (this.depth === 0 && this.buffer.trim().startsWith('{')) {
      const result = JSON.parse(this.buffer);
      this.buffer = '';
      return result;
    }
    return null;
  }
}
```

## 前端流式渲染

| 技巧 | 说明 |
|------|------|
| `requestAnimationFrame` 节流 | 用 rAF 降低渲染频率，避免卡顿 |
| 代码块完整后再渲染 | 检测 ``` 开始/结束，不渲染不完整的代码块 |
| 虚拟滚动 | 超长输出只渲染可视区域 |
| 打字机效果 | 用 `setInterval` 逐字显示内容 |

## 断线重连策略

```typescript
// 指数退避：1s → 2s → 4s → 8s → ... → 30s max
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
```
