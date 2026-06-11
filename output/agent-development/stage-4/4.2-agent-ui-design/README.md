# 4.2 Agent UI 设计 — 设计优秀的 Agent 交互界面

> 🎯 **学习目标**：设计优秀的 Agent 交互界面
> ⏱️ **预计学习时间**：7-9 小时

## 🗺️ 章节导航

| 章节 | 标题 |
|------|------|
| [第1章](./chapters/01-interaction-patterns.md) | Agent 交互模式设计 |
| [第2章](./chapters/02-status-display.md) | Agent 状态展示 |
| [第3章](./chapters/03-tool-visualization.md) | 工具调用可视化 |
| [第4章](./chapters/04-human-in-loop-ui.md) | 人机协作界面 |
| [第5章](./chapters/05-capstone-dashboard.md) | 综合实战：Agent 控制台 |

### 关键设计模式

```
1. 思考中 → 加载动画 + 推理过程文字流
2. 执行中 → 工具调用卡片 + 进度条
3. 等待确认 → 确认对话框 + 操作预览
4. 完成 → 结果展示 + 后续操作按钮
5. 错误 → 错误信息 + 重试/降级选项
```

### 工具调用可视化组件

```vue
<template>
  <div class="tool-call-card">
    <div class="tool-header">
      <span class="tool-icon">🔧</span>
      <span class="tool-name">{{ toolCall.name }}</span>
      <span class="tool-status" :class="status">{{ statusText }}</span>
    </div>
    <div class="tool-input">
      <pre>{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
    </div>
    <div v-if="toolCall.result" class="tool-result">
      <pre>{{ toolCall.result }}</pre>
    </div>
  </div>
</template>
```
