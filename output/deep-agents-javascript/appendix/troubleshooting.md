# 附录B：常见错误排错指南

> 收集 Deep Agents 开发中最高频的 20 个错误及解决方案。

---

## 一、安装与环境问题

### E1. `Cannot find module 'deepagents'`

**原因：** 未安装 `deepagents` 包

**解决方案：**
```bash
npm install deepagents langchain @langchain/core
```

### E2. `Node.js version >= 20 required`

**原因：** Node.js 版本过旧

**解决方案：**
```bash
# 使用 nvm 升级
nvm install 22
nvm use 22
```

### E3. `deepagents-acp not found`

**原因：** 未安装 ACP 服务端

**解决方案：**
```bash
npm install -g deepagents-acp
# 或使用 npx
npx deepagents-acp
```

---

## 二、模型与 API 问题

### E4. `Model not found: ...`

**原因：** 模型名称格式错误或不存在

**解决方案：**
```typescript
// 使用正确的 provider:model_id 格式
model: "anthropic:claude-sonnet-4-6"  // ✅
model: "claude-sonnet-4-6"           // ❌ 缺少前缀
```

### E5. `API key not configured for provider`

**原因：** 未设置对应模型提供商的环境变量

**解决方案：**
```bash
# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google Gemini
export GOOGLE_API_KEY=...
```

### E6. `Insufficient quota`

**原因：** API Key 配额不足或已超限

**解决方案：**
- 检查 API 提供商的控制台
- 升级套餐或等待配额重置
- 考虑使用 OpenRouter 做负载均衡

### E7. `Ollama: connection refused`

**原因：** Ollama 服务未启动

**解决方案：**
```bash
# 启动 Ollama 服务
ollama serve

# 确认模型已下载
ollama pull devstral-2
```

---

## 三、工具与调用问题

### E8. `Tool 'xxx' not found`

**原因：** 工具未注册到 Agent 的 tools 数组中

**解决方案：**
```typescript
// 确保在 createDeepAgent 中注册
const agent = createDeepAgent({
  tools: [myTool],  // ✅ 注册工具
});
```

### E9. `ZodError: Validation failed`

**原因：** 工具调用参数不匹配 Schema

**解决方案：**
```typescript
// 使用 .describe() 给 LLM 清晰的参数说明
schema: z.object({
  city: z.string().describe("City name, e.g. Tokyo, London"),  // ✅
})
```

### E10. `Tool execution timed out`

**原因：** 工具执行时间超过默认超时

**解决方案：**
```typescript
// 在沙箱创建时增加超时
const sandbox = await DaytonaSandbox.create({
  timeout: 600,  // 增加到 10 分钟
});
```

### E11. 工具循环不停

**原因：** Agent 不断调用工具，无法结束

**解决方案：**
```typescript
// 在系统提示中添加约束
systemPrompt: "你最多调用 3 次工具就给出最终答案。"
```

---

## 四、子代理问题

### E12. 主 Agent 不委派任务

**原因：** 系统提示中未明确引导委派

**解决方案：**
```typescript
systemPrompt: `对于复杂任务，使用 task() 工具委派给子代理。
这是示例：
task(query="研究主题A", subagent_type="research-agent")`,
```

### E13. 子代理输出过长

**原因：** 未限制子代理输出长度

**解决方案：**
```typescript
const subagent = {
  systemPrompt: "保持回答在 300 字以内。",  // ✅ 加长度限制
};
```

### E14. `task is not a function`

**原因：** 声明的子代理名称与调用时不匹配

**解决方案：**
```typescript
// 检查名称一致
subagents: [{ name: "research-agent", ... }]  // 声明
// 调用时 task(subagent_type="research-agent")  // 匹配
```

---

## 五、文件系统与 Backend 问题

### E15. `ENOENT: no such file`

**原因：** 文件路径不存在

**解决方案：**
```typescript
// 先用 ls 确认路径
systemPrompt: "在读取文件前先用 ls 确认路径。"
```

### E16. `EACCES: permission denied`

**原因：** 权限规则阻止了访问

**解决方案：**
```typescript
// 检查权限规则
permissions: [
  { operations: ["read"], paths: ["/workspace/**"], mode: "allow" },
  // ...
]
```

### E17. `Store is required for StoreBackend`

**原因：** 使用 StoreBackend 但未传入 store

**解决方案：**
```typescript
import { InMemoryStore } from "@langchain/langgraph";

const store = new InMemoryStore();
const agent = createDeepAgent({
  store,  // ✅ 传入 store
  backend: new StoreBackend({ store, namespace: () => ["my-ns"] }),
});
```

### E18. 文件写入不持久化

**原因：** 使用了 StateBackend（默认），文件在内存中

**解决方案：**
```typescript
// 改用 FilesystemBackend
const agent = createDeepAgent({
  backend: new FilesystemBackend({ rootDir: "./data" }),  // ✅
});
```

---

## 六、部署与运行时问题

### E19. `Graph 'agent' not exported`

**原因：** `langgraph.json` 中引用的变量未导出

**解决方案：**
```typescript
// src/agent.ts
export const agent = createDeepAgent({ ... });  // ✅ 必须 export

// langgraph.json
{
  "graphs": {
    "agent": "./src/agent.ts:agent"  // ✅ 匹配导出名
  }
}
```

### E20. `Deployment not found`

**原因：** LangSmith Deployment 名称或配置错误

**解决方案：**
- 在 LangSmith 控制台确认 Deployment 名称
- 检查 `langgraph.json` 格式
- 确认 API Key 有效

---

## 七、快速诊断流程

遇到问题时按以下顺序排查：

```
1. 检查环境
   ├── Node.js 版本 ≥ 20?
   └── 所有依赖已安装?

2. 检查配置
   ├── model 格式正确?
   ├── API Key 已设置?
   └── 工具已注册?

3. 检查运行时
   ├── 查看错误日志
   ├── 启用 debug 模式
   └── 用简单测试用例验证

4. 检查权限
   ├── 文件路径可访问?
   ├── 权限规则正确排序?
   └── Sandbox 已创建/未关闭?
```

---

> 💡 **提示：** 遇到未知错误时，先尝试 `--debug` 模式运行，获取更详细的错误信息。
>
> ```bash
> npx deepagents-acp --debug
> ```
