# 🔧 流式传输与实时通信 — 常见问题排查

> 收集了 17 个流式传输开发中的常见错误及解决方案

---

## 1. SSE 连接始终不触发 onmessage

**错误信息：** EventSource 连接成功（onopen 触发），但 onmessage 从未被调用

**原因分析：** 服务端未正确设置 `Content-Type: text/event-stream`，或数据格式不正确

**解决方案：** 确保响应头和 SSE 数据格式完全正确：

```typescript
// ❌ 错误：缺少响应头
res.write(`data: ${JSON.stringify({ text: 'hello' })}\n\n`);

// ✅ 正确：完整响应头 + SSE 格式
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.write(`data: ${JSON.stringify({ text: 'hello' })}\n\n`);
// 注意：必须以 \n\n 结尾
```

---

## 2. EventSource 收不到 POST 请求的响应

**错误信息：** EventSource 连接返回 405 Method Not Allowed

**原因分析：** EventSource 原生只支持 GET 请求，不支持 POST

**解决方案：** 使用 `fetch` + `ReadableStream` 代替：

```typescript
const response = await fetch('/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages }),
});
const reader = response.body!.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  parseSSELines(decoder.decode(value, { stream: true }));
}
```

---

## 3. SSE 数据被 Nginx 缓冲，无法实时到达

**错误信息：** 前端等几秒后一次性收到大量数据，而非逐块到达

**原因分析：** Nginx 缓冲了 SSE 响应，等缓冲区满了才转发

**解决方案：** 在响应头和 Nginx 配置中禁用缓冲：

```typescript
// 后端设置
res.setHeader('X-Accel-Buffering', 'no');
```

```nginx
# Nginx 配置
proxy_buffering off;
proxy_cache off;
```

---

## 4. WebSocket 连接后立刻断开

**错误信息：** WebSocket 的 `onclose` 在 `onopen` 后立即触发

**原因分析：** 服务端 WebSocket 握手失败，或协议版本不匹配

**解决方案：** 检查服务端 WebSocket 库配置：

```typescript
// Node.js ws 库 — 默认支持所有主流浏览器
const wss = new WebSocketServer({ port: 8080 });
wss.on('connection', (ws, req) => {
  console.log('客户端连接:', req.socket.remoteAddress);
  // 立即发送一个欢迎消息确认连接
  ws.send(JSON.stringify({ type: 'connected' }));
});
```

---

## 5. 流式 JSON 解析报错

**错误信息：** `SyntaxError: Unexpected token ... in JSON at position ...`

**原因分析：** JSON 数据是分块到达的，尝试解析不完整的 JSON

**解决方案：** 使用括号深度追踪的增量解析器：

```typescript
let buffer = '';
let depth = 0;
function feed(chunk: string): any {
  buffer += chunk;
  for (const c of chunk) { if (c === '{') depth++; if (c === '}') depth--; }
  if (depth === 0 && buffer.trim()) {
    const result = JSON.parse(buffer);
    buffer = '';
    return result;
  }
  return null; // 还未完整
}
```

---

## 6. 流式渲染导致内存泄漏

**错误信息：** 长时间流式对话后页面内存占用持续增长

**原因分析：** 所有历史消息都存在内存中，从未清理

**解决方案：** 设置消息上限或使用虚拟滚动：

```typescript
const MAX_MESSAGES = 100;
messages.value.push(newMsg);
if (messages.value.length > MAX_MESSAGES) {
  messages.value.splice(0, messages.value.length - MAX_MESSAGES);
}
```

---

## 7. WebSocket 自动重连导致连接风暴

**错误信息：** 服务断开后，客户端每秒创建几十个连接

**原因分析：** 多个组件各自独立实现重连逻辑，没有任何协调

**解决方案：** 全局单例管理 WebSocket 连接：

```typescript
// 全局共享一个 WebSocket 实例
let globalWs: WebSocket | null = null;
export function getWebSocket(): WebSocket {
  if (!globalWs || globalWs.readyState === WebSocket.CLOSED) {
    globalWs = new WebSocket('ws://...');
  }
  return globalWs;
}
```

---

## 8. 指数退避重连仍然导致服务器过载

**错误信息：** 大量客户端同时断开后同时尝试重连

**原因分析：** 所有客户端的退避时间相同（1s, 2s, 4s...）

**解决方案：** 加入随机抖动：

```typescript
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
const jitter = delay * (0.5 + Math.random() * 0.5); // 50%-100% 随机
setTimeout(() => connect(), jitter);
```

---

## 9. SSE 连接数达到浏览器上限

**错误信息：** 新开的 SSE 连接不触发任何事件

**原因分析：** 浏览器对同一域名的并发连接数有限制（通常 6 个）

**解决方案：** 复用连接或使用 HTTP/2：

```typescript
// 使用单一 SSE 连接处理多个数据流
const es = new EventSource('/api/events');
es.addEventListener('chat', (e) => { /* 处理聊天事件 */ });
es.addEventListener('notification', (e) => { /* 处理通知事件 */ });
```

---

## 10. 流式输出中代码块的中间状态混乱

**错误信息：** 用户看到半截代码块，UI 渲染错乱

**原因分析：** 代码块未闭合时已经开始渲染 Markdown

**解决方案：** 检测代码块边界，暂停渲染：

```typescript
const codeBlockCount = (content.match(/```/g) || []).length;
if (codeBlockCount % 2 === 0) {
  // 代码块已闭合或没有代码块，可以渲染
  renderedHtml.value = marked(content);
}
// 否则等待更多数据
```

---

## 11. 断线后对话状态丢失

**错误信息：** 重连后之前的对话全部消失

**原因分析：** 前端未持久化消息历史，重连后未恢复

**解决方案：** 使用 sessionId + 服务端状态恢复：

```typescript
async function restoreSession(sessionId: string) {
  const res = await fetch(`/api/session/${sessionId}`);
  const { messages, agentState } = await res.json();
  messages.value = messages;
  agentStatus.value = agentState;
}
```

---

## 12. WebSocket 发送大量小数据包导致性能问题

**错误信息：** 每收到一个字就发一个 WebSocket 消息，CPU 飙升

**原因分析：** 未做数据聚合，高频小消息导致资源浪费

**解决方案：** 合并多个数据块为一个消息：

```typescript
let sendBuffer = '';
let sendTimer: number | null = null;
function queueSend(data: string) {
  sendBuffer += data;
  if (!sendTimer) {
    sendTimer = setTimeout(() => {
      ws.send(sendBuffer);
      sendBuffer = '';
      sendTimer = null;
    }, 50);
  }
}
```

---

## 13. 前端在组件卸载后继续收到流式数据

**错误信息：** 切换页面后控制台仍有 fetch/SSE 日志

**原因分析：** 组件销毁时未关闭流式连接

**解决方案：** 在 `onUnmounted` 中清理：

```typescript
onUnmounted(() => {
  controller?.abort();  // 取消 fetch
  reader?.cancel();     // 关闭 reader
});
```

---

## 14. fetch 流式读取时 body 为 null

**错误信息：** `response.body` 为 `null`，无法获取 reader

**原因分析：** 请求返回非流式响应（响应头缺少 `Content-Type` 或服务端未启用流）

**解决方案：** 确保服务端返回流式格式，前端检查 response body：

```typescript
const response = await fetch(url);
if (!response.body) {
  throw new Error('服务端未返回流式响应，请检查 Content-Type');
}
const reader = response.body.getReader();
```

---

## 15. 前端流式渲染时 Vue 响应式性能瓶颈

**错误信息：** 输入中文时 UI 卡顿明显

**原因分析：** `streamContent` 频繁更新导致 Vue 大量 DOM diff 计算

**解决方案：** 使用 `shallowRef` 或 `markRaw` 减少响应式开销：

```typescript
import { shallowRef } from 'vue';
const displayContent = shallowRef(''); // 浅层响应式，不追踪内部变化

// 更新时整体替换
function appendContent(text: string) {
  displayContent.value = displayContent.value + text;
}
```

---

## 16. 流式输出停止但未收到完成信号

**错误信息：** UI 一直显示「正在生成...」，但内容已 10 秒未更新

**原因分析：** 服务端异常退出未发送完成事件

**解决方案：** 前端设置超时保底：

```typescript
let lastChunkTime = Date.now();
const STREAM_TIMEOUT = 15000; // 15 秒无数据视为超时
setInterval(() => {
  if (isStreaming.value && Date.now() - lastChunkTime > STREAM_TIMEOUT) {
    isStreaming.value = false;
    showWarning('连接可能已断开，请检查网络');
  }
}, 5000);
```

---

## 17. 开发环境 HTTP 使用 WebSocket 报错

**错误信息：** `Browser security policy: ws://...` 被阻止

**原因分析：** 安全策略不允许在 HTTPS 页面中混用 ws:// 连接

**解决方案：** 开发环境使用 `localhost` 或统一协议：

```typescript
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/ws`);
```
