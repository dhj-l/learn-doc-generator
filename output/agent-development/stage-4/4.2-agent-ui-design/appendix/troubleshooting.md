# 🔧 Agent UI 设计 — 常见问题排查

> 收集了 16 个 Agent UI 开发中的常见错误及解决方案

---

## 1. Agent 状态与 UI 不一致

**错误信息：** UI 显示「思考中」但 Agent 实际已完成

**原因分析：** 前端状态未随 WebSocket/SSE 消息及时更新

**解决方案：** 使用统一的状态管理，由服务端消息驱动状态变更：

```typescript
ws.onmessage = (event) => {
  const { type, payload } = JSON.parse(event.data);
  if (type === 'status') {
    agentStatus.value = payload; // 服务端是唯一真实来源
  }
};
```

---

## 2. Agent 思考过程显示为空白

**错误信息：** 思考区域无内容，只有动画在转

**原因分析：** 服务端未发送 thinking 事件，或前端未正确解析嵌套内容

**解决方案：** 确保服务端发送结构化 thinking 事件：

```typescript
ws.send(JSON.stringify({ type: 'thinking', payload: { step: '分析需求', detail: '...' } }));
```

---

## 3. 工具调用卡片状态不更新

**错误信息：** 工具卡片一直显示「执行中」，即使已完成

**原因分析：** 前端未处理工具完成的回调消息

**解决方案：** 监听完整的工具生命周期事件：

```typescript
// 工具调用事件流
{ type: 'tool_start',  payload: { id: '1', name: 'search' } }
{ type: 'tool_progress', payload: { id: '1', progress: 0.5 } }
{ type: 'tool_complete', payload: { id: '1', result: '...' } }
{ type: 'tool_error',   payload: { id: '1', error: 'timeout' } }
```

---

## 4. 确认对话框出现后无法响应

**错误信息：** 点击「确认」或「拒绝」后无反应

**原因分析：** WebSocket 连接已断开，或消息格式不匹配

**解决方案：** 检查连接状态并重试：

```typescript
async function sendConfirmation(decision: 'approve' | 'reject') {
  if (ws.readyState !== WebSocket.OPEN) {
    await reconnect();
  }
  ws.send(JSON.stringify({ type: 'user_decision', payload: decision }));
}
```

---

## 5. 任务面板进度条跳跃

**错误信息：** 进度从 10% 突然跳到 90%

**原因分析：** 后端未发送中间进度事件，只在完成时一次性更新

**解决方案：** 后端拆分进度粒度，前端平滑过渡：

```typescript
// 后端按步骤报告进度
for (const step of steps) {
  ws.send(JSON.stringify({ type: 'progress', payload: { current: step, total: steps.length } }));
  await executeStep(step);
}
```

---

## 6. Agent 工作流图节点布局混乱

**错误信息：** 节点重叠或连线交叉

**原因分析：** 未使用布局算法，仅凭绝对坐标放置

**解决方案：** 使用 dagre 或 elkjs 自动布局：

```typescript
import dagre from 'dagre';
const g = new dagre.graphlib.Graph();
g.setGraph({ rankdir: 'LR' });
nodes.forEach(n => g.setNode(n.id, { width: 150, height: 50 }));
edges.forEach(e => g.setEdge(e.from, e.to));
dagre.layout(g);
// 从 g 中读取布局后的坐标
```

---

## 7. 流式文本打字机效果卡顿

**错误信息：** 文字一次性出现，完全没有打字机效果

**原因分析：** 前端一次性渲染所有收到的内容，未做逐字展示

**解决方案：** 使用 buffer 实现逐字追加：

```typescript
let displayBuffer = '';
let displayIndex = 0;
setInterval(() => {
  if (displayIndex < displayBuffer.length) {
    displayedText.value += displayBuffer[displayIndex++];
  }
}, 30); // 每 30ms 显示一个字
```

---

## 8. 多人协作时 Agent 状态冲突

**错误信息：** 两个用户同时操作导致 Agent 状态错乱

**原因分析：** Agent 状态是全局的，未做操作隔离

**解决方案：** 使用 sessionId 隔离每个用户的 Agent 实例：

```typescript
const sessionId = crypto.randomUUID();
ws.send(JSON.stringify({ type: 'create_session', payload: { sessionId } }));
// 后续所有操作都带上 sessionId
```

---

## 9. Agent 结果展示区滚动位置丢失

**错误信息：** 新内容到达时页面自动滚回顶部

**原因分析：** 内容更新触发了 DOM 重新渲染，滚动位置被重置

**解决方案：** 使用智能滚动策略：

```typescript
watch(streamContent, async () => {
  await nextTick();
  const el = outputRef.value;
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
    el.scrollTop = el.scrollHeight; // 用户靠近底部时才自动滚动
  }
});
```

---

## 10. 工具调用超时未处理

**错误信息：** 工具调用卡片一直显示「进行中」，用户无法操作

**原因分析：** 后端工具调用超时后未发送失败事件

**解决方案：** 设置前端超时兜底：

```typescript
const TOOL_TIMEOUT = 30000; // 30 秒
const toolTimer = setTimeout(() => {
  tool.status = 'error';
  tool.error = '工具调用超时';
}, TOOL_TIMEOUT);
// 工具完成或出错时 clearTimeout(toolTimer)
```

---

## 11. Human-in-the-Loop 操作不可逆

**错误信息：** 用户误点了「确认执行」，无法撤回

**原因分析：** 确认后立即执行，未提供撤销窗口

**解决方案：** 实现「执行前倒计时」：

```typescript
let countdown = 5;
const timer = setInterval(() => {
  countdown--;
  if (countdown === 0) { clearInterval(timer); executeAction(); }
});
// 用户可在倒计时结束前点击「撤销」
```

---

## 12. Agent 状态动画导致性能问题

**错误信息：** 页面帧率下降，CPU 占用高

**原因分析：** 使用了过多 CSS 动画（如脉冲、旋转、闪烁）

**解决方案：** 减少动画数量，使用 `will-change` 和 `transform` 优化：

```css
.agent-status {
  will-change: transform;
  animation: pulse 2s ease-in-out infinite;
}
/* 优先使用 transform/opacity 而非 width/height/top/left */
```

---

## 13. 工作流视图中长文本溢出

**错误信息：** 节点中的文本超出边界

**原因分析：** 节点宽度固定，未处理文本溢出

**解决方案：** 文本截断 + tooltip：

```vue
<div class="node-label" :title="fullText">{{ truncatedText }}</div>
```

---

## 14. 用户中断操作后资源未释放

**错误信息：** 取消任务后，后端仍在处理

**原因分析：** 前端发送 cancel 后，后端未清理正在进行的操作

**解决方案：** 使用 AbortController：

```typescript
const controller = new AbortController();
function cancelTask() {
  controller.abort();
  ws.send(JSON.stringify({ type: 'cancel' }));
}
```

---

## 15. 移动端 Agent UI 布局错乱

**错误信息：** 对话和任务面板在手机上显示不全

**原因分析：** 混合模式在小屏幕上未做响应式适配

**解决方案：** 使用抽屉式布局，移动端默认只显示对话：

```vue
<div class="container">
  <ChatPanel v-if="isMobile && activeTab === 'chat'" />
  <TaskPanel v-if="isMobile && activeTab === 'task'" class="drawer" />
  <!-- 桌面端并排显示 -->
  <ChatPanel v-if="!isMobile" />
  <TaskPanel v-if="!isMobile" />
</div>
```

---

## 16. Agent 错误信息不友好

**错误信息：** 用户看到「500 Internal Server Error」或原始堆栈

**原因分析：** 后端错误未做转换，直接透传到前端

**解决方案：** 后端统一包装错误：

```typescript
try { await process(); }
catch (e) {
  ws.send(JSON.stringify({
    type: 'error',
    payload: {
      code: 'TOOL_TIMEOUT',
      message: '搜索工具响应超时，请稍后重试',
      canRetry: true,
    }
  }));
}
```
