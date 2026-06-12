# 第4章：部署与验收 — 上线 Checklist

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **将 Agent 项目部署到生产环境** — 配置 Vercel + Docker 部署流水线
- **编写完整的项目文档** — README、API 文档、使用说明一应俱全
- **配置 CI/CD 自动化部署** — GitHub Actions 实现 Push-to-Deploy
- **对照验收清单自检项目质量** — 确保满足所有评估标准

## 📋 前置知识

> 建议先完成 [第3章：核心功能实现](./03-implementation.md)，确保 Agent 核心功能已开发完成。
>
> 部署前需要准备：
> - 一个 GitHub 账号（用于 CI/CD 和代码托管）
> - 一个 Vercel 账号（前端部署）
> - 一个 Docker Hub 账号（后端容器化）
> - LLM API Key（Anthropic / OpenAI）

---

## 💡 核心概念

### 概念一：部署策略选择

**生活类比：** 部署就像开餐厅的"试营业"到"正式营业"的过程。你不可能第一天就接待 1000 个客人。先在家里做给朋友吃（本地开发）→ 邀请小范围用户试吃（预发布环境）→ 正式对外营业（生产环境）。每个阶段解决不同的问题。

```
部署阶段路线图：

本地开发 (localhost:5173)
    │
    ▼
预览部署 (Vercel Preview URL)
    │ git push → 自动生成
    ▼
预发布环境 (staging.your-app.com)
    │ 合并到 staging 分支
    ▼
生产环境 (your-app.com)
    │ 合并到 main 分支 → CI/CD 自动部署
```

```typescript
// 环境配置示例
const config = {
  development: {
    apiUrl: 'http://localhost:3000',
    logLevel: 'debug',
    mockLLM: true,        // 开发环境使用 mock LLM 节省费用
  },
  staging: {
    apiUrl: 'https://staging-api.your-app.com',
    logLevel: 'info',
    mockLLM: false,
  },
  production: {
    apiUrl: 'https://api.your-app.com',
    logLevel: 'warn',       // 生产环境只记录警告和错误
    mockLLM: false,
  },
};
```

**💡 为什么需要多环境部署？** 在实际部署中直接上生产环境是灾难性的。一个简单的错误（比如 API Key 没配置好）就会导致所有用户无法使用。通过 staging 环境验证后，再发布到生产环境，可以提前发现 90% 的部署问题。

---

### 概念二：前端部署 — Vercel 完整流程

**生活类比：** Vercel 就像一家"杂志印刷+发行"的一站式服务商。你把设计稿（代码）交给他们，他们会自动排版（构建）、印刷（部署）、分发到全国报刊亭（CDN）。你只需要关注内容质量，发行的事情交给他们。

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录（需要浏览器验证）
vercel login

# 3. 在项目根目录初始化（Vercel 会自动检测框架）
vercel init
# 选择: Vue.js / Next.js / 其他

# 4. 本地预览生产构建
vercel build
vercel dev  # 模拟生产环境

# 5. 部署到预览环境
vercel

# 6. 配置环境变量
vercel env add ANTHROPIC_API_KEY
vercel env add API_KEY
vercel env add DATABASE_URL

# 7. 部署到生产环境
vercel --prod
```

#### vercel.json 配置

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "functions": {
    "api/**/*.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" }
  ]
}
```

#### 前端部署配置

对于前端项目（如 Vue 3），确保 `vite.config.ts` 的配置正确：

```typescript
// vite.config.ts — Vercel 部署配置
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Vercel 会自动处理 base path，通常不需要额外配置
  // 但如果部署在子路径下，需要设置 base
  base: '/',
  build: {
    // 生成 sourcemap 用于调试（生产环境建议关掉）
    sourcemap: process.env.NODE_ENV !== 'production',
    // 块大小警告阈值
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // 代理 API 请求到后端（开发环境）
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
```

---

### 概念三：后端部署 — Docker + 云平台

**生活类比：** Docker 就像一个"集装箱标准化系统"。不管你的货物（应用）是什么形状（编程语言），只要装进标准尺寸的集装箱（Docker 镜像），就可以用同样的卡车（Docker 引擎）、轮船（容器编排平台）来运输。

```dockerfile
# Dockerfile — 生产级多阶段构建
FROM node:20-alpine AS builder

WORKDIR /app

# 利用 Docker 缓存：先复制 package.json，安装依赖
# 这样只有依赖变更时才重新安装
COPY package*.json ./
RUN npm ci --only=production

# 复制源码并构建
COPY . .
RUN npm run build

# ── 运行阶段 ──
FROM node:20-alpine AS runner

# 安全：使用非 root 用户
RUN addgroup --system app && adduser --system --ingroup app app
USER app

WORKDIR /app

# 只复制构建产物和必要文件
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml — 完整后端服务
version: '3.8'

services:
  agent-api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - API_KEY=${API_KEY}
      - DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@postgres:5432/agent_db
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=warn
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    restart: unless-stopped
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: agent_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 512M

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s

volumes:
  pgdata:
  redis_data:
```

---

### 概念四：CI/CD 自动化部署

**生活类比：** CI/CD 就像一家快餐店的"自动烹饪流水线"。厨师（开发者）把食材（代码）放到传送带上（git push），机器会自动清洗、切菜、烹饪、装盘、送到取餐口（部署上线）。整个过程不需要人工干预，而且每次用的都是同样的流程，保证出品一致。

```yaml
# .github/workflows/deploy.yml — 完整 CI/CD 流水线
name: Deploy Agent Project

on:
  push:
    branches:
      - main        # 推送到 main 分支时自动部署
      - staging     # 推送到 staging 时部署到预发布环境
  pull_request:
    branches:
      - main        # PR 到 main 时运行测试

jobs:
  # 任务 1: 代码质量检查
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit  # TypeScript 类型检查

  # 任务 2: 运行测试
  test:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci

      - name: Run unit tests
        run: npm test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Run integration tests
        run: npm run test:integration

  # 任务 3: 构建 Docker 镜像
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t agent-api:${{ github.sha }} .

      - name: Save image as artifact
        uses: actions/upload-artifact@v4
        with:
          name: docker-image
          path: /tmp/agent-api.tar

  # 任务 4: 部署到生产环境
  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy Frontend to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'

      - name: Deploy Backend to Fly.io
        uses: superfly/flyctl-actions@master
        with:
          args: 'deploy --image agent-api:${{ github.sha }}'

      - name: Notify deployment success
        run: |
          echo "✅ 部署完成！"
          echo "前端: https://your-app.vercel.app"
          echo "后端: https://api.your-app.com"
```

---

### 概念五：监控与可观测性

```typescript
// api/src/monitoring.ts — 部署后的监控配置
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  defaultMeta: {
    service: 'agent-api',
    version: process.env.VERSION || 'unknown',
    environment: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console(),
    // 生产环境可以添加文件或外部日志服务
    ...(process.env.NODE_ENV === 'production'
      ? [new winston.transports.File({ filename: 'logs/error.log', level: 'error' })]
      : []),
  ],
});

// 关键指标追踪
interface Metrics {
  requestCount: number;
  averageLatency: number;
  errorRate: number;
  tokenUsage: number;
  activeUsers: number;
}

// 指标记录
const metrics: Metrics = {
  requestCount: 0,
  averageLatency: 0,
  errorRate: 0,
  tokenUsage: 0,
  activeUsers: 0,
};

// 请求耗时中间件
app.use('*', async (c, next) => {
  const start = Date.now();
  metrics.requestCount++;

  try {
    await next();
  } finally {
    const latency = Date.now() - start;
    metrics.averageLatency = (metrics.averageLatency * (metrics.requestCount - 1) + latency) / metrics.requestCount;
  }
});
```

---

## 🔨 实战演练

<details>
<summary>🧑‍💻 先自己完成部署，再展开看完整流程</summary>

**场景描述：** 你的智能代码助手已经开发完成，现在需要：
1. 部署前端到 Vercel
2. 部署后端到 Docker
3. 配置自定义域名
4. 设置 CI/CD 自动部署
5. 编写项目 README 文档

**你的任务：**

1. 在 Vercel 中导入你的前端项目并部署
2. 为后端创建 Dockerfile 和 docker-compose.yml
3. 配置 GitHub Actions 实现自动部署
4. 编写完整的项目 README
5. 通过验收清单自检

<details>
<summary>📖 完整参考实现</summary>

### 1. Vercel 前端部署

```bash
# 创建 Vercel 项目
vercel project create code-assistant-frontend

# 关联本地项目
vercel link

# 设置环境变量（所有必需的变量都设置在生产环境中）
vercel env add ANTHROPIC_API_KEY production
vercel env add API_KEY production
vercel env add VITE_APP_NAME "Code Assistant"

# 拉取环境变量到本地
vercel env pull

# 部署到生产环境
vercel --prod
```

### 2. Docker 后端部署

```bash
# 构建镜像
docker build -t code-assistant-api:latest .

# 启动服务
docker compose up -d

# 检查服务状态
docker compose ps
docker compose logs agent-api

# 测试 API
curl http://localhost:3000/api/health
# 预期: {"status":"ok","timestamp":1718000000000}
```

### 3. 部署到 Fly.io

```bash
# 安装 flyctl
curl -L https://fly.io/install.sh | sh

# 登录
fly auth login

# 创建应用
fly launch --name code-assistant-api

# 设置环境变量
fly secrets set ANTHROPIC_API_KEY=sk-ant-xxx
fly secrets set API_KEY=your-api-key

# 部署
fly deploy
```

### 4. 项目 README 模板

```markdown
# 🤖 智能代码助手

> 基于 AI Agent 的智能代码分析与辅助工具

## 📋 功能特性

- 🧠 **智能代码分析** — 自动检测 Bug、安全漏洞和代码异味
- ✍️ **代码生成** — 根据自然语言描述生成代码
- 🔍 **语义搜索** — 搜索代码库中的函数和类
- 🛠️ **自动修复** — 一键应用 AI 生成的修复方案
- ⚡ **流式输出** — 实时显示 AI 的思考和生成过程

## 🚀 快速开始

### 前置要求

- Node.js 20+
- Docker（后端部署）
- Anthropic API Key

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/code-assistant.git
cd code-assistant

# 安装依赖
cd frontend && npm install
cd ../api && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动开发服务
cd frontend && npm run dev  # http://localhost:5173
cd api && npm run dev       # http://localhost:3000
```

### 生产部署

```bash
# 前端（Vercel）
cd frontend
vercel --prod

# 后端（Docker）
cd api
docker compose up -d
```

## 🏗️ 技术栈

| 组件 | 技术 |
|------|------|
| 前端框架 | Vue 3 + TypeScript |
| UI 组件 | Naive UI |
| 状态管理 | Pinia |
| Agent 框架 | LangGraph |
| LLM | Claude Sonnet 4.5 |
| 部署 | Vercel + Docker |

## 📚 API 文档

### POST /api/chat

发送消息给 AI Agent。

**请求体：**
```json
{
  "message": "分析这个文件中的潜在问题",
  "history": [
    {"role": "user", "content": "之前的问题"}
  ]
}
```

**响应：**
```json
{
  "success": true,
  "data": {
    "content": "分析结果...",
    "iterations": 3
  }
}
```

## 🧪 测试

```bash
npm test          # 单元测试
npm run test:e2e  # 端到端测试
```

## 📄 许可证

MIT
```

</details>
</details>

---

## ⚡ 进阶技巧

### 技巧一：自动 HTTPS 与自定义域名

```bash
# Vercel 自定义域名
vercel domains add your-app.com

# DNS 配置
# 添加 CNAME 记录: your-app.com → cname.vercel-dns.com

# Fly.io 自定义域名
fly certs create api.your-app.com
# 添加 CNAME 记录: api.your-app.com → your-app.fly.dev
```

### 技巧二：数据库备份与迁移

```yaml
# docker-compose 中添加自动备份
services:
  backup:
    image: postgres:16-alpine
    command: |
      sh -c 'while true; do
        pg_dump $DATABASE_URL > /backups/db-$(date +%Y%m%d).sql;
        find /backups -name "*.sql" -mtime +7 -delete;
        sleep 86400;
      done'
    volumes:
      - ./backups:/backups
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/agent_db
```

### 技巧三：使用 Sentry 监控错误

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.2, // 20% 的请求记录追踪
});

// 手动上报 Agent 错误
app.onError((err, c) => {
  Sentry.captureException(err, {
    extra: { path: c.req.path, method: c.req.method },
  });
  return c.json({ error: 'Internal error' }, 500);
});
```

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：部署到 Vercel 后，API 请求 404 是什么原因？</summary>

常见原因：
1. **路由文件放置错误** — API 路由必须在 `app/api/[route]/route.ts` 结构中
2. **构建输出目录不正确** — `vercel.json` 中的 `outputDirectory` 与构建工具的输出不匹配
3. **环境变量未设置** — 在 Vercel Dashboard 或 CLI 中设置环境变量

排查方法：查看 Vercel Deployment Logs，确认构建和函数注册是否正常。
</details>

<details>
<summary>🧠 Q2：Docker 部署时，数据库连接失败如何处理？</summary>

1. 检查 Docker Compose 中服务名称是否正确（使用服务名而非 `localhost`）
2. 检查 `depends_on` 是否配置了 `condition: service_healthy`
3. 检查数据库的健康检查配置是否正确
4. 查看 Docker 日志：`docker compose logs postgres`

```bash
# 快速诊断
docker compose exec agent-api curl http://postgres:5432
docker compose exec agent-api env | grep DATABASE_URL
```
</details>

<details>
<summary>🧠 Q3：为什么需要 CI/CD？小项目也需要吗？</summary>

CI/CD 的价值不在于项目大小，而在于**消除人为错误**。即使是小项目，手动部署也可能忘记设置环境变量、忘记运行测试、或者使用了不同的 Node 版本。

CI/CD 确保每次部署都经过相同的流程：
- 相同的构建环境（Node 20）
- 相同的测试流程（lint + type check + unit test）
- 相同的部署步骤（构建 → 上传 → 发布）

设置一次，永久受益。
</details>

<details>
<summary>🧠 Q4：上线后如何确保 API Key 的安全？</summary>

多层保护策略：
1. **服务端存储** — API Key 只存在于服务端环境变量中，永远不在前端代码中出现
2. **使用 API Gateway** — 用户的请求先经过你的 API，再由 API 调用 LLM
3. **密钥轮换** — 定期更换 API Key，生产环境和开发环境使用不同的 Key
4. **用量告警** — 在 LLM 提供商的控制台中设置用量上限和告警
5. **审计日志** — 记录每次 LLM 调用的使用者和用量
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Vercel 部署后白屏 | `base` 路径配置不正确或构建输出目录错误 | 检查 `vite.config.ts` 中的 `base` 和 `vercel.json` 中的 `outputDirectory` |
| Docker 容器反复重启 | 健康检查路径错误或应用启动超时 | 调整 `HEALTHCHECK` 的 `start-period` 为 40s+ |
| 环境变量缺失 | 设置了 `.env` 但未在 Vercel/Fly.io 中配置 | 使用平台提供的 CLI 工具设置环境变量 |
| API 返回 CORS 错误 | 前端域名和后端域名不一致 | 在 Hono/Express 中配置具体的前端域名 |
| Docker 内存不足 | 未设置内存限制，并发请求耗尽内存 | 在 docker-compose 中设置 `deploy.resources.limits.memory` |
| CI/CD 构建失败 | package-lock.json 冲突或 Node 版本不一致 | 在 CI 中指定 `node-version: 20` 并缓存 `node_modules` |
| SSL 证书问题 | 自定义域名未配置 SSL | 使用 Vercel/Fly.io 的自动 SSL 或配置 Let's Encrypt |
| 部署后 Agent 变慢 | 生产环境的 LLM 模型与开发环境不同 | 检查环境变量中的模型名称配置 |
| 日志量过大超预算 | 生产环境使用了 `debug` 日志级别 | 生产环境设为 `warn` 级别，仅记录错误和警告 |
| 滚动更新时服务中断 | 新版本启动后未通过健康检查 | 配置 `update_config.order: start-first` 先启动新容器再停旧容器 |

---

## 📝 本章小结

- ✅ **部署策略** — 本地 → 预览 → 预发布 → 生产，四阶段渐进式部署
- ✅ **Vercel 前端部署** — 一键部署 + 环境变量管理 + 自定义域名
- ✅ **Docker 后端部署** — 多阶段构建 + docker-compose 全栈编排 + 健康检查
- ✅ **CI/CD 自动化** — GitHub Actions 实现 Push-to-Deploy，测试+构建+部署一条龙
- ✅ **监控与日志** — 结构化日志 + 关键指标追踪 + 错误告警
- ✅ **项目文档** — 完整的 README 包含快速开始、API 文档、测试说明

## ✅ 项目验收清单

在提交你的 Capstone 项目之前，逐项检查以下内容：

| 维度 | 检查项 | 完成 |
|------|--------|------|
| 🎯 功能完整性 | 所有 P0 功能正常运行 | ☐ |
| 🎯 功能完整性 | 至少集成了 3 个 MCP 工具 | ☐ |
| 🎯 功能完整性 | Agent 能完成一个完整的 ReAct 循环 | ☐ |
| 🧪 代码质量 | TypeScript 严格模式编译通过 | ☐ |
| 🧪 代码质量 | 核心函数有单元测试 | ☐ |
| 🧪 代码质量 | 代码中有中文注释 | ☐ |
| 🛡️ 安全 | API Key 只存在于服务端 | ☐ |
| 🛡️ 安全 | 输入使用 Zod 或类似库验证 | ☐ |
| 🛡️ 安全 | API 有认证保护 | ☐ |
| 🎨 用户体验 | 流式输出显示正常 | ☐ |
| 🎨 用户体验 | 加载状态和错误提示清晰 | ☐ |
| 🎨 用户体验 | UI 美观、响应式 | ☐ |
| 📦 部署 | 前端部署到 Vercel | ☐ |
| 📦 部署 | 后端使用 Docker 部署 | ☐ |
| 📦 部署 | .env.example 包含所有必需变量 | ☐ |
| 📄 文档 | README 包含安装、配置、使用说明 | ☐ |
| 📄 文档 | API 文档清晰完整 | ☐ |
| 📄 文档 | 项目有 MIT 或其他开源许可证 | ☐ |

> 🎉 恭喜你完成了整个 AI Agent 开发体系的学习！从 Prompt Engineering 到 Capstone 项目，你已经掌握了构建生产级 AI Agent 产品的完整技能链。
