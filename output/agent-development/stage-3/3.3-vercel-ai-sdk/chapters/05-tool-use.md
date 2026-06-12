# 第5章：工具调用集成 — 让 AI 操作真实世界

> 预计学习时间：70–100 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **使用 `tool()` 定义工具** — 参数 Schema、描述、execute 执行函数
- **实现多步工具调用链** — `maxSteps` 参数让模型自动执行多轮工具交互
- **在前端展示工具调用过程** — 实时显示工具调用状态和结果
- **掌握常见工具模式** — 搜索、计算、API 调用、数据库查询
- **处理工具调用错误** — 超时、重试、优雅降级

---

## 💡 核心概念

### 概念一：为什么工具调用是 AI 应用的灵魂？

**生活类比：** 一个没有工具的 AI 就像一个只会纸上谈兵的顾问——他能给你建议，但无法帮你执行任何实际操作。给 AI 配备工具，就像给顾问配上双手：他不仅能说"你应该查一下天气"，还能真的拿起手机帮你查到天气数据。

**技术本质：** 工具调用（Function Calling / Tool Use）让 LLM 能够：
1. **感知外部世界** — 获取实时数据（天气、股票、新闻）
2. **执行副作用操作** — 发送邮件、创建工单、更新数据库
3. **增强推理能力** — 通过计算器、代码解释器进行精确计算
4. **构建多 Agent 协作** — 工具调用是 Agent 架构的基石

```
无工具模式：
  用户：北京今天冷吗？
  AI：我建议你查一下天气预报（AI 无法获取实时数据，只能给泛泛的建议）

有工具模式：
  用户：北京今天冷吗？
  AI：让我查一下 👉 调用 getWeather("北京")
  👉 得到结果：温度 -2°C，体感温度 -6°C
  AI：北京今天最高 -2°C，体感 -6°C，建议穿羽绒服！🧥
```

### 概念二：tool() 函数定义

AI SDK 的 `tool()` 函数是定义工具的核心 API：

```typescript
// src/01-tool-definition.ts
import { tool } from 'ai';
import { z } from 'zod';

/**
 * tool() 函数签名：
 *
 * tool({
 *   description: string,           // 向 LLM 描述工具用途（重要！）
 *   parameters: z.ZodTypeAny,      // Zod Schema 定义参数结构
 *   execute: (args, options) => any, // 实际的执行函数
 * })
 */

// ============================================
// 示例 1：简单查询工具
// ============================================
const getWeather = tool({
  description: '获取指定城市的实时天气信息，包括温度、湿度、风力等',
  parameters: z.object({
    city: z.string().describe('城市名称，如"北京"、"上海"'),
    unit: z.enum(['celsius', 'fahrenheit']).optional()
      .describe('温度单位，默认摄氏度'),
  }),
  execute: async ({ city, unit = 'celsius' }) => {
    const weatherData = {
      '北京': { temperature: 25, humidity: 60, wind: '3级', condition: '晴' },
      '上海': { temperature: 28, humidity: 75, wind: '4级', condition: '多云' },
      '广州': { temperature: 32, humidity: 80, wind: '2级', condition: '阵雨' },
      '深圳': { temperature: 30, humidity: 78, wind: '3级', condition: '阴' },
    };

    const data = weatherData[city as keyof typeof weatherData] || {
      temperature: 20, humidity: 50, wind: '2级', condition: '未知',
    };

    const temp = unit === 'fahrenheit'
      ? `${(data.temperature * 9/5 + 32).toFixed(1)}°F`
      : `${data.temperature}°C`;

    return {
      city, temperature: temp, humidity: `${data.humidity}%`,
      wind: data.wind, condition: data.condition,
      suggestion: data.temperature >= 30 ? '炎热 🥵' :
                   data.temperature >= 20 ? '舒适 😊' :
                   data.temperature >= 10 ? '凉爽 🍂' : '寒冷 🥶',
    };
  },
});

// ============================================
// 示例 2：带验证的复杂工具
// ============================================
const sendEmail = tool({
  description: '发送电子邮件。支持 SMTP 协议，可用于通知、报告等场景。',
  parameters: z.object({
    to: z.array(z.string().email()).describe('收件人邮箱地址列表'),
    subject: z.string().min(1).max(200).describe('邮件主题'),
    body: z.string().min(1).describe('邮件正文，支持纯文本格式'),
    priority: z.enum(['low', 'normal', 'high']).optional()
      .describe('邮件优先级'),
  }),
  execute: async ({ to, subject, body, priority = 'normal' }) => {
    console.log(`📧 发送邮件:`);
    console.log(`   收件人: ${to.join(', ')}`);
    console.log(`   主题: ${subject}`);
    console.log(`   优先级: ${priority}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      sentTo: to,
      timestamp: new Date().toISOString(),
    };
  },
});

// ============================================
// 使用工具
// ============================================
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

async function main() {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个智能助手，可以使用工具帮助用户。使用工具时请说明你在做什么。',
    prompt: '北京和上海今天天气怎么样？哪个更适合户外活动？',
    tools: { getWeather, sendEmail },
    maxSteps: 5,
  });

  console.log('🤖 AI 回答:', result.text);
  console.log('\n🔧 工具调用详情:');
  for (const call of result.toolCalls || []) {
    console.log(`  - ${call.toolName}: ${JSON.stringify(call.args)}`);
  }
  console.log('\n📋 工具结果:');
  for (const res of result.toolResults || []) {
    console.log(`  - ${res.toolName}: ${JSON.stringify(res.result).slice(0, 100)}...`);
  }
}

main().catch(console.error);
```

### 概念三：maxSteps 多步工具调用

`maxSteps` 是 AI SDK 最强大的特性之一。它让模型能够自动执行多轮"思考→调用→观察"的循环：

```typescript
// src/02-max-steps.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

/**
 * maxSteps 工作流程：
 *
 * Step 1: 用户提问 → AI 决定调用工具 A
 * Step 2: 工具 A 返回结果 → AI 分析结果，决定调用工具 B
 * Step 3: 工具 B 返回结果 → AI 决定需要工具 A 的更多信息
 * Step 4: 工具 A 再次返回 → AI 整合所有信息，生成最终回答
 *
 * 每个 step 就是一次"LLM 推理 + 可选的工具调用"的完整循环
 */

const getStockPrice = tool({
  description: '获取指定公司的当前股票价格',
  parameters: z.object({
    symbol: z.string().describe('股票代码，如 AAPL、GOOGL、BABA'),
  }),
  execute: async ({ symbol }) => {
    const prices: Record<string, { price: number; change: number }> = {
      'AAPL': { price: 178.5, change: 1.2 },
      'GOOGL': { price: 141.3, change: -0.5 },
      'BABA': { price: 85.6, change: 2.1 },
      'MSFT': { price: 378.9, change: 0.8 },
    };
    return prices[symbol] || { price: 100, change: 0 };
  },
});

const convertCurrency = tool({
  description: '货币汇率转换，支持 USD、CNY、EUR、JPY 等主流货币',
  parameters: z.object({
    amount: z.number().describe('转换金额'),
    from: z.string().describe('源货币代码，如 USD'),
    to: z.string().describe('目标货币代码，如 CNY'),
  }),
  execute: async ({ amount, from, to }) => {
    const rates: Record<string, number> = {
      'USD_CNY': 7.24, 'USD_EUR': 0.92,
      'EUR_CNY': 7.87, 'USD_JPY': 149.5,
    };
    const rate = rates[`${from}_${to}`];
    if (!rate) throw new Error(`不支持的货币对: ${from}_${to}`);
    return { amount, from, to, rate, result: amount * rate };
  },
});

async function main() {
  console.log('=== 多步工具调用演示 ===\n');

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个金融分析师，使用工具分析数据并给出投资建议。',
    prompt: '苹果公司（AAPL）的股价是多少？帮我换算成人民币。另外，如果我有 1000 美元想投资，能买多少股微软（MSFT）？',
    tools: { getStockPrice, convertCurrency },
    maxSteps: 5,
  });

  console.log('\n🤖 最终回答:', result.text);
  console.log('\n📊 调用链分析:');
  console.log(`总工具调用数: ${result.toolCalls?.length || 0}`);

  if (result.toolCalls) {
    result.toolCalls.forEach((call, i) => {
      console.log(`\n  第 ${i + 1} 次调用: 工具=${call.toolName}, 参数=${JSON.stringify(call.args)}`);
    });
  }
}

main().catch(console.error);

/**
 * 预期执行流程：
 * Step 1: AI 调用 getStockPrice("AAPL") → { price: 178.5 }
 * Step 2: AI 调用 convertCurrency(178.5, "USD", "CNY") → { result: 1292.34 }
 * Step 3: AI 调用 getStockPrice("MSFT") → { price: 378.9 }
 * Step 4: AI 计算 1000/378.9 ≈ 2.64 股 → 生成最终建议
 * 整个流程只需 1 次 generateText 调用！
 */
```

### 概念四：多工具并行调用

模型在同一个 step 中可以**同时调用多个工具**，显著提升效率：

```typescript
// src/03-parallel-tools.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const searchWeb = tool({
  description: '搜索互联网信息，返回相关网页摘要',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    count: z.number().min(1).max(10).optional().describe('返回结果数量'),
  }),
  execute: async ({ query, count = 3 }) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      results: Array.from({ length: count }, (_, i) => ({
        title: `${query} - 结果 ${i + 1}`,
        url: `https://example.com/${query}/${i}`,
        snippet: `这是关于"${query}"的第 ${i + 1} 条搜索结果摘要...`,
      })),
      totalResults: 100,
    };
  },
});

const getNews = tool({
  description: '获取最新的新闻头条',
  parameters: z.object({
    category: z.enum(['tech', 'finance', 'sports', 'world']).optional(),
    limit: z.number().min(1).max(10).optional(),
  }),
  execute: async ({ category = 'tech', limit = 5 }) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const headlines: Record<string, string[]> = {
      tech: ['AI 模型突破新里程碑', '量子计算芯片发布', '下一代互联网协议'],
      finance: ['股市创历史新高', '央行调整利率', '数字货币监管新规'],
    };
    return {
      category,
      headlines: (headlines[category] || []).slice(0, limit),
      updatedAt: new Date().toISOString(),
    };
  },
});

async function main() {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个研究助手，使用工具收集信息。',
    prompt: '帮我查一下"TypeScript 5.0"的最新信息，同时看看今天科技圈有什么新闻',
    tools: { searchWeb, getNews },
    maxSteps: 3,
  });
  console.log(result.text);
}

main().catch(console.error);
```

### 概念五：前端展示工具调用

在 React 前端中展示工具调用的过程，让用户看到 AI 正在做什么：

```tsx
// src/04-tool-display.tsx
'use client';
import { useChat } from 'ai/react';
import { useState, useEffect } from 'react';

interface ToolCallInfo {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime: number;
  endTime?: number;
}

export function ChatWithTools() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  const [toolCalls, setToolCalls] = useState<Map<string, ToolCallInfo>>(new Map());

  useEffect(() => {
    const newToolCalls = new Map<string, ToolCallInfo>();

    for (const msg of messages) {
      if (msg.role === 'assistant' && 'toolCalls' in msg) {
        const calls = (msg as any).toolCalls || [];
        for (const call of calls) {
          newToolCalls.set(call.toolCallId || call.id, {
            id: call.toolCallId || call.id,
            name: call.toolName,
            args: call.args,
            status: 'completed',
            startTime: Date.now(),
          });
        }
      }
      if (msg.role === 'tool') {
        const existing = newToolCalls.get(msg.toolCallId || '');
        if (existing) {
          existing.result = msg.content;
          existing.status = 'completed';
          existing.endTime = Date.now();
        }
      }
    }
    setToolCalls(newToolCalls);
  }, [messages]);

  const toolIcons: Record<string, string> = {
    getWeather: '🌤️', searchWeb: '🔍', sendEmail: '📧',
    getStockPrice: '📈', default: '🔧',
  };

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="space-y-4 mb-4">
        {messages.map(msg => (
          <div key={msg.id} className={`p-3 rounded-lg ${
            msg.role === 'user' ? 'bg-blue-100 ml-20' : 'bg-gray-100 mr-20'
          }`}>
            <div className="font-bold text-sm mb-1">
              {msg.role === 'user' ? '👤 你' : '🤖 AI'}
            </div>
            <div className="whitespace-pre-wrap">{msg.content}</div>

            {msg.role === 'assistant' && (msg as any).toolCalls?.length > 0 && (
              <div className="mt-2 space-y-1">
                {(msg as any).toolCalls.map((call: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm
                    bg-yellow-50 border border-yellow-200 rounded p-2">
                    <span>{toolIcons[call.toolName] || toolIcons.default}</span>
                    <span className="font-medium">{call.toolName}</span>
                    <span className="text-gray-500">
                      ({JSON.stringify(call.args).slice(0, 50)})
                    </span>
                    <span className="ml-auto text-green-600">✅ 完成</span>
                  </div>
                ))}
              </div>
            )}

            {msg.role === 'tool' && (
              <div className="mt-1 text-xs text-gray-500">
                📋 工具结果: {typeof msg.content === 'string'
                  ? msg.content.slice(0, 100)
                  : JSON.stringify(msg.content).slice(0, 100)}
              </div>
            )}
          </div>
        ))}
      </div>

      {toolCalls.size > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
          <h3 className="text-sm font-bold mb-2">🔧 工具调用记录</h3>
          <div className="space-y-1">
            {Array.from(toolCalls.values()).map(call => (
              <div key={call.id} className="flex items-center gap-2 text-xs">
                <span>{toolIcons[call.name] || toolIcons.default}</span>
                <span className="font-medium">{call.name}</span>
                <span className="text-gray-400">
                  {JSON.stringify(call.args).slice(0, 40)}
                </span>
                {call.status === 'completed' && (
                  <span className="text-green-500">
                    ✅ {call.endTime ? `${call.endTime - call.startTime}ms` : ''}
                  </span>
                )}
                {call.status === 'running' && (
                  <span className="text-blue-500 animate-pulse">⏳ 执行中...</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入消息..."
          className="flex-1 p-2 border rounded"
          disabled={isLoading}
        />
        <button type="submit" disabled={!input.trim() || isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300">
          {isLoading ? '⏳' : '发送'}
        </button>
      </form>
    </div>
  );
}
```

### 概念六：常见工具模式

```typescript
// src/05-common-patterns.ts
import { tool } from 'ai';
import { z } from 'zod';

// 模式 1：缓存型工具
const cachedWeather = (() => {
  const cache = new Map<string, { data: any; expiresAt: number }>();
  return tool({
    description: '获取天气（带缓存，5 分钟内相同城市不重复请求）',
    parameters: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      const cached = cache.get(city);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
      }
      const data = { city, temperature: 25 + Math.random() * 10 };
      cache.set(city, { data, expiresAt: Date.now() + 5 * 60 * 1000 });
      return data;
    },
  });
})();

// 模式 2：分页型工具
const searchUsers = tool({
  description: '搜索用户列表，支持分页',
  parameters: z.object({
    keyword: z.string(), page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(50).default(20),
  }),
  execute: async ({ keyword, page = 1, pageSize = 20 }) => {
    const allUsers = [
      { id: 1, name: '张三', email: 'zhangsan@example.com' },
      { id: 2, name: '李四', email: 'lisi@example.com' },
    ];
    const filtered = allUsers.filter(u => u.name.includes(keyword));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
    return { items: paginated, total: filtered.length, page, pageSize,
      hasMore: page * pageSize < filtered.length };
  },
});

// 模式 3：确认型工具
const deleteUser = tool({
  description: '⚠️ 删除用户。需要先确认用户存在。此操作不可逆！',
  parameters: z.object({
    userId: z.number(), confirmed: z.boolean(),
  }),
  execute: async ({ userId, confirmed }) => {
    if (!confirmed) {
      return { success: false, message: '删除操作已取消，需要确认后才能执行' };
    }
    return { success: true, message: `用户 ${userId} 已删除` };
  },
});

// 模式 4：组合型工具
const analyzeRepository = tool({
  description: '综合分析一个 GitHub 仓库',
  parameters: z.object({ owner: z.string(), repo: z.string() }),
  execute: async ({ owner, repo }) => {
    const [repoData, issuesData] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`).then(r => r.json()),
      fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open`).then(r => r.json()),
    ]);
    return {
      name: `${owner}/${repo}`,
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      openIssues: Array.isArray(issuesData) ? issuesData.length : 0,
      description: repoData.description,
      language: repoData.language,
    };
  },
});
```

### 概念七：工具调用错误处理

```typescript
// src/06-tool-errors.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`操作超时 (${ms}ms)`)), ms)
    ),
  ]);
}

const safeSearch = tool({
  description: '安全搜索，带超时和重试',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => {
    const MAX_RETRIES = 2;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await withTimeout(
          fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`)
            .then(r => r.json()),
          3000
        );
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          return { error: true, message: '搜索服务暂时不可用', fallback: true };
        }
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  },
});

async function main() {
  try {
    const result = await generateText({
      model: anthropic('claude-sonnet-4-5-20241022'),
      prompt: '搜索一下最新的人工智能新闻',
      tools: { safeSearch },
      maxSteps: 3,
    });
    console.log(result.text);
  } catch (error) {
    console.log('🤖 抱歉，暂时无法获取最新信息，请稍后再试。');
  }
}

main().catch(console.error);
```

---

## 🔨 实战演练

### 练习：构建一个 GitHub 助手

```typescript
// src/07-github-assistant.ts
import { generateText, tool } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const githubTools = {
  getRepo: tool({
    description: '获取 GitHub 仓库信息',
    parameters: z.object({ owner: z.string(), repo: z.string() }),
    execute: async ({ owner, repo }) => {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if (!res.ok) throw new Error(`仓库不存在: ${owner}/${repo}`);
      return res.json();
    },
  }),
  listIssues: tool({
    description: '列出仓库的 Issues',
    parameters: z.object({
      owner: z.string(), repo: z.string(),
      state: z.enum(['open', 'closed', 'all']).default('open'),
    }),
    execute: async ({ owner, repo, state }) => {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=5`);
      return res.json();
    },
  }),
  searchCode: tool({
    description: '在仓库中搜索代码',
    parameters: z.object({ owner: z.string(), repo: z.string(), query: z.string() }),
    execute: async ({ owner, repo, query }) => {
      const res = await fetch(
        `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}`
      );
      return res.json();
    },
  }),
};

async function main() {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    system: '你是一个 GitHub 分析助手。',
    prompt: '分析 vercel/ai 仓库：它有多少 Star？最近有 open issue 吗？',
    tools: githubTools,
    maxSteps: 5,
  });
  console.log(result.text);
}

main().catch(console.error);
```

---

## ⚡ 进阶技巧

### 技巧一：工具间依赖注入

```typescript
function createToolSet(db: any) {
  return {
    queryUsers: tool({
      description: '查询用户',
      parameters: z.object({ id: z.number() }),
      execute: async ({ id }) => db.users.findUnique({ where: { id } }),
    }),
    updateUser: tool({
      description: '更新用户信息',
      parameters: z.object({ id: z.number(), name: z.string() }),
      execute: async ({ id, name }) => db.users.update({ where: { id }, data: { name } }),
    }),
  };
}
```

### 技巧二：动态工具注册

```typescript
async function executeWithTools(prompt: string, enabledTools: string[]) {
  const allTools: Record<string, any> = {
    weather: weatherTool, search: searchTool,
    email: emailTool, calc: calcTool,
  };
  const activeTools = Object.fromEntries(
    Object.entries(allTools).filter(([key]) => enabledTools.includes(key))
  );
  return generateText({
    model: anthropic('claude-sonnet-4-5-20241022'),
    prompt, tools: activeTools, maxSteps: 5,
  });
}
```

---

## 🧠 知识检查点

<details>
<summary>点击展开答案</summary>

**Q1：tool() 的三个核心参数是什么？**

> A：`description`（向 LLM 描述工具用途，影响模型是否调用此工具）、`parameters`（Zod Schema 定义参数结构）、`execute`（实际执行函数，接收解析后的参数，返回结果给 LLM）。

**Q2：maxSteps 参数如何工作？**

> A：`maxSteps` 控制"LLM 推理→工具调用→观察结果"的最大循环次数。每轮循环称为一个 step。例如 `maxSteps: 5` 允许模型最多进行 5 轮工具交互，适合需要多步推理的复杂任务。

**Q3：工具调用失败时如何优雅处理？**

> A：三层策略：1) 工具内部 try-catch 捕获异常并返回友好错误信息；2) 使用 `withTimeout` 包装工具执行防止无限挂起；3) 实现重试逻辑（指数退避），最后一次失败时返回降级结果而非抛出异常。

</details>

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| 工具函数的 `parameters` Schema 与 LLM 实际传入的参数类型不匹配 | Zod Schema 定义过于严格或字段类型错误 | 使用 `z.object()` 明确定义参数结构，并设置合理的默认值和可选项 |
| `maxSteps` 设置过大导致 Token 消耗失控 | Agent 在复杂任务中反复调用工具，产生大量冗余轮次 | 根据任务复杂程度设置合理的 `maxSteps`（通常 5~15 步），并监控 Token 消耗 |
| 并行工具调用中存在数据依赖导致结果错误 | 工具 B 的输入依赖工具 A 的输出，但并行执行时工具 B 未等 A 完成 | 对有依赖关系的工具使用串行调用，无依赖的工具使用并行调用 |
| 前端未正确处理工具调用的中间状态 | 工具调用较长时间前端一直显示 loading | 使用 `useChat` 的 `onToolCall` 回调实时更新 UI，展示工具调用进度和部分结果 |

---

## 📝 本章小结

- ✅ **tool() 定义** — description + parameters + execute 三要素
- ✅ **maxSteps 多步调用** — 自动执行多轮工具交互循环
- ✅ **并行工具调用** — 无依赖工具同时执行提升效率
- ✅ **前端展示** — 实时显示工具调用状态和结果
- ✅ **常见模式** — 缓存、分页、确认、组合、错误处理

## ➡️ 下一章预告

> [第6章：综合实战 Capstone](./06-capstone-ai-app.md) — 构建完整 Next.js 全栈 AI 编程助手。
