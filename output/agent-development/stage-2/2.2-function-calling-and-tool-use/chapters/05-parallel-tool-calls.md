# 第5章：并行与顺序工具调用

> 预计学习时间：70-90 分钟

## 🎯 本章目标

掌握并行和顺序工具调用的区别及实现。

## 💡 核心概念

### 并行调用 vs 顺序调用

```
并行调用（Parallel）：
  LLM 一次返回多个 tool_use block
  → 你同时执行所有工具
  → 将所有结果一次性返回

  适合：多个独立的查询（查天气 + 查汇率 + 查新闻）

顺序调用（Sequential）：
  LLM 一次返回一个 tool_use block
  → 你执行工具
  → 返回结果
  → LLM 决定下一步（可能调用另一个工具）

  适合：有依赖关系的操作（先查用户 → 根据用户ID查订单）
```

### Claude 并行工具调用实现

```typescript
// 处理并行工具调用
async function handleToolCalls(response: Anthropic.Message): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
  
  // 并行执行所有工具
  const results = await Promise.all(
    toolUseBlocks.map(async (block) => {
      if (block.type !== 'tool_use') return null;
      
      try {
        const result = await executeTool(block.name, block.input);
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: result,
        };
      } catch (error) {
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: `错误: ${(error as Error).message}`,
          is_error: true,
        };
      }
    })
  );

  return results.filter(Boolean) as Anthropic.ToolResultBlockParam[];
}
```

---

## 📝 本章小结

- ✅ **并行调用** — 独立任务同时执行，减少等待时间
- ✅ **顺序调用** — 有依赖的任务按步骤执行
- ✅ **Claude 支持** — 一次响应可包含多个 tool_use block

## ➡️ 下一章预告

> [第6章：综合实战 — 多工具智能助手](./06-capstone-tool-assistant.md)
