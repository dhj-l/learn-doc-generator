# Prompt Engineering 速查表

> 最常用的提示技巧速查，按使用频率排序

---

## 🏆 最高频技巧

### 1. 四要素 Prompt 框架

```
角色：你是 [专业身份]
任务：请 [具体任务描述]
约束：要求 [条件] / 不要 [限制]
格式：按 [指定格式] 输出
```

### 2. Chain-of-Thought（思维链）

```
请一步一步思考：
1. 首先...
2. 然后...
3. 最后...
```

### 3. Few-shot 示例

```typescript
// Messages API 实现
messages: [
  { role: 'user', content: '输入示例 1' },
  { role: 'assistant', content: '输出示例 1' },
  { role: 'user', content: '输入示例 2' },
  { role: 'assistant', content: '输出示例 2' },
  { role: 'user', content: '实际输入' },
]
```

### 4. 输出格式控制

```
输出 JSON 格式：
{"key": "value", "items": [...]}

不要输出任何额外文字。
```

---

## 📋 常用 Prompt 模板

### 代码审查

```
你是资深 [语言] 工程师。审查以下代码，按严重程度排序：
🔴 严重 / 🟡 建议 / 🟢 提示
每个问题附修复代码，总结不超过 8 个问题。
```

### 文本分类

```
将以下文本分类为 [类别列表]。

示例：
文本："xxx" → 类别
文本："yyy" → 类别

文本："{{input}}" →
```

### 数据提取

```
从以下文本提取结构化信息，输出 JSON：
{
  "field1": "提取值",
  "field2": "提取值"
}

文本：{{text}}
```

### 翻译

```
翻译成 [目标语言]。
规则：
- 技术术语首次出现用「中文（English）」格式
- 代码块不翻译
- 保持原文格式
```

### 摘要

```
用不超过 [N] 字总结以下内容。
保留关键数据和结论。
不要添加原文中没有的信息。
```

---

## ⚙️ 模型参数速查

| 参数 | 范围 | 推荐值 | 场景 |
|------|------|--------|------|
| `temperature` | 0-2 | 0-0.3（确定性任务）/ 0.7-1.0（创意） | 控制随机性 |
| `max_tokens` | 1-200K | 按需设置 | 限制输出长度 |
| `top_p` | 0-1 | 0.9-1.0 | 核采样 |
| `stop_sequences` | 字符串数组 | 按需 | 指定停止条件 |

---

## 🔧 XML 标签速查

```xml
<role>角色定义</role>
<context>背景信息</context>
<instructions>任务指令</instructions>
<constraints>约束条件</constraints>
<examples>示例</examples>
<output_format>输出格式</output_format>
<thinking>推理过程（CoT）</thinking>
<answer>最终答案</answer>
```

---

## 📊 技巧选择指南

| 任务类型 | 推荐技巧 | Temperature |
|----------|----------|-------------|
| 代码生成 | Zero-shot + 结构化格式 | 0-0.2 |
| 文本分类 | Few-shot | 0 |
| 逻辑推理 | CoT | 0-0.3 |
| 数据提取 | Few-shot + JSON 格式 | 0 |
| 创意写作 | Zero-shot | 1.0-1.5 |
| 文档翻译 | 规则约束 + 术语表 | 0.2-0.5 |
| 复杂分析 | CoT + 结构化输出 | 0.3-0.5 |
| Agent 任务 | ReAct | 0.3-0.7 |
| 关键决策 | Self-Consistency | 0.7（多次） |

---

## 💰 Token 优化速查

| 策略 | 节省比例 | 适用场景 |
|------|----------|----------|
| 精简 System Prompt | 30-50% | 所有场景 |
| Prompt Caching | 90%（缓存部分） | 重复 System Prompt |
| 降低 max_tokens | 按设定 | 输出不需要太长时 |
| Few-shot 精选示例 | 20-30% | 减少冗余示例 |
| 使用更短的模型名称 | 微小 | 累积有效果 |
