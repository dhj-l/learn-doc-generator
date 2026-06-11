# Claude API 常见错误排错指南

---

## 1. API Key 无效 (401)

**错误：** `AuthenticationError: Invalid API Key`

**解决方案：**
```bash
# 检查环境变量
echo $ANTHROPIC_API_KEY

# 确认 Key 格式（应以 sk-ant- 开头）
# 重新获取 Key：https://console.anthropic.com/
```

---

## 2. 速率限制 (429)

**错误：** `RateLimitError: Rate limit exceeded`

**解决方案：**
```typescript
// 方案 1：使用 SDK 内置重试
const client = new Anthropic({ maxRetries: 5 });

// 方案 2：手动指数退避
await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));

// 方案 3：降低并发，增加请求间隔
```

---

## 3. Token 超限

**错误：** `BadRequestError: max_tokens exceeds model limit`

**解决方案：**
```typescript
// 检查 max_tokens 是否超过模型限制
// Claude 3.5/4 系列：max_tokens 最大 8192（标准）或 16000+（thinking）
// 减少输入 Token 或增大 max_tokens
```

---

## 4. 输出被截断

**现象：** `stop_reason === 'max_tokens'`

**解决方案：**
```typescript
// 增大 max_tokens
max_tokens: 4096

// 或检查 stop_reason
if (response.stop_reason === 'max_tokens') {
  console.warn('输出被截断');
}
```

---

## 5. 图片分析失败

**错误：** `BadRequestError: Invalid image format`

**解决方案：**
```typescript
// 确认图片格式：JPEG、PNG、GIF、WebP
// 确认 Base64 编码正确
// 确认图片大小 < 5MB
// 检查 media_type 与实际格式匹配
```

---

## 6. 流式输出中断

**现象：** 流式输出突然停止，无错误

**解决方案：**
```typescript
// 检查是否有未处理的 abort 信号
// 检查网络连接稳定性
// 添加重连逻辑
```

---

## 7. 缓存未命中

**现象：** `cache_read_input_tokens` 始终为 0

**解决方案：**
```typescript
// 确保缓存内容 >= 1024 Token（缓存最小阈值）
// 确保 cache_control 标记正确
system: [{
  type: 'text',
  text: LONG_PROMPT,  // 必须够长
  cache_control: { type: 'ephemeral' },
}]
// 缓存有 5 分钟 TTL，超过后需要重新创建
```

---

## 8. Extended Thinking 无 thinking 块

**现象：** 响应中只有 text 没有 thinking

**解决方案：**
```typescript
// 确保 budget_tokens 设置合理（至少 1024）
thinking: { type: 'enabled', budget_tokens: 5000 }
// 注意：thinking 块会消耗 output tokens
```

---

## 9. 多轮对话上下文丢失

**现象：** Claude 不记得之前的对话

**解决方案：**
```typescript
// 确保每次请求都携带完整的 messages 历史
// 检查 messages 数组中是否有遗漏
// 确保 user/assistant 消息交替出现
```

---

## 10. 批处理长时间不完成

**现象：** Batch API 状态一直是 `in_progress`

**解决方案：**
```typescript
// 批处理可能需要数小时
// 使用 webhook 回调代替轮询
// 检查请求是否有语法错误导致失败
```
