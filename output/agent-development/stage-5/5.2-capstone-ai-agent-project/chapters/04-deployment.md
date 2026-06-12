# 第4章：部署与验收 — 上线 Checklist

> 预计学习时间：120-150 分钟

## 🎯 本章目标

学习完本章，你将能够：
- **将 Agent 项目部署到生产环境**
- **配置 CI/CD 自动化部署**
- **通过验收清单自检项目质量**

## 📋 前置知识

> 建议先完成 [第3章：核心功能实现](./03-implementation.md)。

---

## 💡 核心概念

### 概念一：部署阶段路线图

```
本地开发 (localhost:5173) → Vercel Preview → Staging → 生产环境
```

### 概念二：Vercel 前端部署

```bash
vercel --prod
vercel env add ANTHROPIC_API_KEY
```

### 概念三：Docker 后端部署

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./ && npm ci && COPY . . && npm run build

FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S app && adduser -S app -u 1001 -G app
USER app
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 概念四：CI/CD 自动化

```yaml
name: Deploy
on: push to main
jobs:
  test: npm ci && npm test
  deploy: vercel --prod --token=$VERCEL_TOKEN
```

### 概念五：监控与可观测性

```typescript
import winston from 'winston';
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});
```

---

## 🔨 实战演练

**场景描述：** 将开发的代码助手部署上线。

**你的任务：** Vercel 部署前端 → Docker 部署后端 → CI/CD 配置 → 编写 README

<details>
<summary>📖 参考实现</summary>

```bash
# Vercel
vercel --prod

# Docker
docker compose up -d
docker compose ps
curl http://localhost:3000/api/health

# CI/CD — GitHub Actions
# .github/workflows/deploy.yml
```
</details>

---

## ⚡ 进阶技巧

### 技巧一：自定义域名 + 自动 HTTPS
### 技巧二：数据库自动备份
### 技巧三：Sentry 错误监控

---

## 🧠 知识检查点

<details>
<summary>🧠 Q1：Vercel 部署后 API 404 的原因？</summary>
路由文件放置错误、构建输出目录不对、环境变量未设置。
</details>
<details>
<summary>🧠 Q2：Docker 中数据库连接失败如何处理？</summary>
检查服务名（用服务名非 localhost）、健康检查配置。
</details>
<details>
<summary>🧠 Q3：为什么需要 CI/CD？</summary>
消除人为错误，确保每次部署流程一致。
</details>
<details>
<summary>🧠 Q4：如何确保 API Key 安全？</summary>
服务端存储、API Gateway 转发、密钥轮换、用量告警。
</details>

---

## 🐛 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| Vercel 白屏 | base 路径或构建输出目录错误 | 检查 vite.config.ts |
| Docker 反复重启 | 健康检查失败 | 调整 start-period 为 40s+ |
| 环境变量缺失 | 未在平台配置 | 使用 CLI 设置 |
| CORS 错误 | 前后端域名不一致 | 配置具体的前端域名 |
| 日志量过大 | 生产环境使用 debug 级别 | 生产用 warn 级别 |

---

## 📝 本章小结

- ✅ **部署策略** — 本地 → 预览 → 预发布 → 生产
- ✅ **Vercel 部署** — 一键部署 + 环境变量 + 自定义域名
- ✅ **Docker 部署** — 多阶段构建 + docker-compose + 健康检查
- ✅ **CI/CD** — GitHub Actions 自动化
- ✅ **监控** — 结构化日志 + 错误告警

## ✅ 项目验收清单

| 维度 | 检查项 |
|------|--------|
| 功能 | P0 功能全部正常运行、≥ 3 个 MCP 工具 |
| 代码 | TypeScript 严格模式通过、有单元测试、中文注释 |
| 安全 | API Key 仅服务端、Zod 输入验证、API 认证 |
| 体验 | 流式输出正常、加载/错误提示清晰 |
| 部署 | 前端 Vercel、后端 Docker、.env.example |
| 文档 | README 完整、API 文档清晰 |
