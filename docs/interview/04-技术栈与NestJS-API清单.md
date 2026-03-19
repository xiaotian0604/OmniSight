# OmniSight 技术栈与 NestJS / 浏览器 API 清单

## 1. 技术栈总览

### Monorepo 与构建

- `pnpm workspace`
- `Turbo`
- `TypeScript`

### SDK 侧

- `Rollup`
- `rrweb`
- `web-vitals`
- 浏览器原生 API：
  - `window.onerror`
  - `unhandledrejection`
  - `fetch`
  - `XMLHttpRequest`
  - `PerformanceObserver`
  - `MutationObserver`
  - `history.pushState / replaceState`
  - `beforeunload`
  - `localStorage`

### Gateway 侧

- `NestJS`
- `Bull`
- `Redis / ioredis`
- `PostgreSQL`
- `TimescaleDB`
- `class-validator`
- `class-transformer`
- `Swagger`

### Console 侧

- `React 18`
- `React Router`
- `@tanstack/react-query`
- `Zustand`
- `Axios`
- `ECharts`
- `rrweb-player`

## 2. 这个项目里用到的 NestJS 核心能力

下面这些不是“知道名字”，而是你在项目里真的能说出用途的。

### `@Module`

用途：

- 组织根模块和子模块
- 划分 `Ingest / Query / Replay / Sourcemap / Alert`

你可以说：

> 我按业务边界拆模块，而不是把所有 Controller / Service 放在一个目录里，方便职责隔离和后续扩展。

### `@Controller`

用途：

- 暴露 HTTP 接口
- 如 `/v1/ingest/batch`、`/v1/errors`、`/v1/replay`

### `@Injectable`

用途：

- 声明 Service / Worker / Channel 为可注入 Provider

### `@Inject`

用途：

- 注入自定义 token
- 例如 `PG_POOL`、`REDIS`、`ALERT_CHANNELS`

### `@UseGuards`

用途：

- 给 ingest / replay / sourcemap 上传接口加 `ApiKeyGuard`

### `ValidationPipe`

用途：

- 全局请求体校验
- 对 SDK 上报事件和 SourceMap 上传 DTO 做字段校验

### `ParseArrayPipe`

用途：

- 校验 `/v1/ingest/batch` 的数组 body
- 因为 SDK 批量上报直接发的是事件数组，不是对象包裹结构

### `@Cron`

用途：

- 定时扫描高频错误
- 当前代码用来触发告警 Worker

### `@Processor` / `@Process`

用途：

- Bull Queue 消费者
- 把“快速接收”和“慢处理”拆开

### `ConfigModule` / `ConfigService`

用途：

- 读取 `.env`
- 管理告警阈值、Redis URL、飞书配置等

### `SwaggerModule` / `DocumentBuilder`

用途：

- 自动生成 API 文档
- 本地开发和演示时更直观

## 3. PostgreSQL / TimescaleDB 在项目里的实际用法

### 普通 PostgreSQL 能力

- `JSONB`：统一存储多类型事件 payload
- `ON CONFLICT DO UPDATE`：用于 replay / sourcemap upsert
- `percentile_cont()`：计算 API P50 / P75 / P99
- `COUNT(DISTINCT ...)`：计算去重 audience

### TimescaleDB 能力

- `create_hypertable('events', 'ts')`
- `time_bucket()`：做时序聚合
- `add_retention_policy()`：控制历史数据保留期

你可以这样回答为什么用 TimescaleDB：

> 因为这个项目的核心数据是前端事件流，本质就是时序数据。用普通 PostgreSQL 也能做，但 `time_bucket` 和 retention policy 能明显降低时序查询和数据生命周期管理的复杂度。

## 4. Redis 在项目里的两个用途

### 用途 1：Bull 的底层队列存储

- 支撑异步接入
- 支撑重试和任务持久化

### 用途 2：业务级控制

- Ingest Worker 的事件级幂等去重
- AlertService 的告警冷却控制

## 5. 浏览器 API 你要会讲到什么程度

### `window.onerror` / `unhandledrejection`

讲法：

- 一个抓同步异常
- 一个抓未捕获 Promise 异常
- 二者结合才能覆盖主流前端错误面

### `fetch` / `XMLHttpRequest` 劫持

讲法：

- 采集接口 URL、method、status、duration
- 对性能页和面包屑都很有价值

### `PerformanceObserver`

讲法：

- 既能采集 `resource`，也能服务于部分性能指标
- 对资源性能分析和优化方向有帮助

### `rrweb`

讲法：

- 录制 DOM 快照和增量变更
- 回放时在 iframe 中重建现场
- 通过隐私配置控制输入框脱敏和敏感区域屏蔽

## 6. 面试官可能会追问的技术点

### Q1：为什么 `JSONB` 不会把查询都搞慢？

因为不是所有字段都在 JSONB 里。高频过滤字段像 `app_id/type/ts/fingerprint/session_id` 都在结构化列里，JSONB 主要存事件的个性化内容。

### Q2：为什么控制台不用服务端渲染？

因为这是内部可观测性控制台，重点是查询和交互，不是 SEO。纯 SPA 更简单，也足够满足场景。

### Q3：为什么 SDK 要同时产出 ESM / CJS / IIFE？

因为接入方式不一样：

- 现代工程化项目更适合 ESM / CJS
- 测试页或非构建场景可以直接 `<script>` 挂 IIFE

### Q4：这个项目里最能体现工程能力的是哪个点？

建议回答：

- `occurrences` 真实次数恢复
- 异步接入链路
- 错误详情把堆栈、行为面包屑和 replay 串起来

这三个点比“我用了很多库”更能体现能力。
