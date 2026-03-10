# OmniSight 全链路可观测性系统

> 自研全链路前端可观测性平台，覆盖 JS 错误监控、性能采集、用户行为录制与回放。

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| Monorepo | Turborepo + pnpm | 统一构建、依赖管理 |
| SDK | TypeScript + Rollup | 手写采集（< 15KB gzip），ESM/CJS/IIFE 三格式 |
| Gateway | NestJS + Bull Queue | 数据接入网关，异步队列解耦 |
| 存储 | PostgreSQL + TimescaleDB | 时序事件存储，自动分区 |
| 缓存 | Redis | 布隆过滤器去重、会话缓存、API Key 缓存 |
| Console | React 18 + ECharts + rrweb-player | 可视化控制台，行为回放 |

## 目录结构

```
omnisight/
├── apps/
│   ├── sdk/              # 前端采集 SDK（核心，注释最详细）
│   ├── gateway/          # NestJS 数据接入网关
│   └── console/          # React 可视化控制台
├── packages/
│   ├── shared-types/     # 全链路共用 TypeScript 类型
│   └── ui-components/    # 控制台公共 UI 组件
├── infra/scripts/        # 数据库初始化 SQL
├── docker-compose.yml    # PostgreSQL(TimescaleDB) + Redis
├── turbo.json            # Turborepo 任务管道
└── .env.example          # 环境变量模板
```

## 环境要求

- **Node.js >= 18**（推荐 20+）
- **pnpm 9**（`corepack enable && corepack prepare pnpm@latest --activate`）
- **Docker**（用于 PostgreSQL + Redis）

## 本地启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动数据库和 Redis
docker-compose up -d

# 3. 配置环境变量
cp .env.example .env

# 4. 构建共享包（首次必须）
pnpm --filter @omnisight/shared-types build
pnpm --filter @omnisight/ui-components build

# 5. 启动所有服务（Turborepo 并行）
pnpm dev

# 或单独启动
pnpm --filter @omnisight/gateway dev     # http://localhost:3000
pnpm --filter @omnisight/console dev     # http://localhost:5173
pnpm --filter @omnisight/sdk build:watch # SDK 监听构建
```

## 接口文档

Gateway 启动后访问 `http://localhost:3000/api-docs` 查看 Swagger 文档。

| 接口 | 说明 |
|------|------|
| `POST /v1/ingest/batch` | SDK 批量上报（需 x-api-key） |
| `POST /v1/replay` | rrweb 录像上传 |
| `POST /v1/sourcemap` | SourceMap 上传 |
| `GET /v1/errors` | 错误聚合列表 |
| `GET /v1/errors/:id` | 错误详情 |
| `GET /v1/metrics/error-rate` | 错误率时序 |
| `GET /v1/metrics/api` | 接口耗时 P50/P99 |
| `GET /v1/metrics/vitals` | Web Vitals 时序 |
| `GET /v1/replay/:sessionId` | 拉取录像数据 |
| `GET /health` | 健康检查 |

## SDK 接入示例

```html
<script src="path/to/omnisight.iife.js"></script>
<script>
  OmniSight.init({
    appId: 'default',
    dsn: 'http://localhost:3000',
    sampleRate: 0.1,
    enableReplay: true,
    debug: true
  });
</script>
```

默认 API Key：`dev-api-key-omnisight`（本地开发用）

## 学习指南

本项目每个文件都有详细的中文注释，适合逐文件学习：

1. **从 SDK 开始**：`apps/sdk/src/` — 理解采集、采样、去重、上报的完整链路
2. **看 Gateway**：`apps/gateway/src/` — 理解 NestJS 模块化、Bull Queue 异步、DI 注入
3. **看 Console**：`apps/console/src/` — 理解 React Query 数据流、Zustand 状态管理、ECharts 可视化

## 开发路线图

- [x] Phase 1 — SDK（采集/采样/去重/上报/录像/脱敏/测试）
- [x] Phase 2 — Gateway（上报/队列/Worker/查询/鉴权/SourceMap）
- [x] Phase 3 — Console（概览/错误/回放/性能/设置）
- [ ] Phase 4 — 加分项（SourceMap 堆栈还原、邮件告警）
